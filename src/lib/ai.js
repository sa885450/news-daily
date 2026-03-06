const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } = require("@google/generative-ai");
const { geminiKey, geminiKeys, geminiStrategicKey, geminiWeeklyKey, modelCandidates } = require('./config');
const { sleep, sendDiscordError } = require('./utils');

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * 定義 AI 回傳的結構化 Schema
 */
const reportSchema = {
    type: SchemaType.OBJECT,
    properties: {
        sentiment_score: { type: SchemaType.NUMBER, description: "整體情緒分數 -1.0(恐慌) ~ 1.0(貪婪)" },
        dimensions: {
            type: SchemaType.OBJECT,
            properties: {
                policy: { type: SchemaType.NUMBER },
                market: { type: SchemaType.NUMBER },
                industry: { type: SchemaType.NUMBER },
                international: { type: SchemaType.NUMBER },
                technical: { type: SchemaType.NUMBER }
            },
            required: ["policy", "market", "industry", "international", "technical"]
        },
        entities: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    name: { type: SchemaType.STRING },
                    ticker: { type: SchemaType.STRING, nullable: true },
                    sentiment: { type: SchemaType.STRING }
                },
                required: ["name", "sentiment"]
            }
        },
        summary: { type: SchemaType.STRING, description: "HTML 格式的分析報告內容" },
        categories: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    id: { type: SchemaType.NUMBER },
                    category: { type: SchemaType.STRING }
                },
                required: ["id", "category"]
            }
        },
        sector_stats: {
            type: SchemaType.OBJECT,
            properties: {
                tech: { type: SchemaType.NUMBER },
                finance: { type: SchemaType.NUMBER },
                manufacturing: { type: SchemaType.NUMBER },
                service: { type: SchemaType.NUMBER }
            },
            required: ["tech", "finance", "manufacturing", "service"]
        },
        events: {
            type: SchemaType.ARRAY,
            description: "今日重大延伸事件聚類",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    title: { type: SchemaType.STRING, description: "事件標題 (如: 川普關稅風暴)" },
                    summary: { type: SchemaType.STRING, description: "一句話核心解析" },
                    impact: { type: SchemaType.STRING, description: "市場影響 (正面/負面/中性)" },
                    related_news_ids: {
                        type: SchemaType.ARRAY,
                        items: { type: SchemaType.NUMBER },
                        description: "關聯新聞的 ID 列表"
                    }
                },
                required: ["title", "summary", "impact", "related_news_ids"]
            }
        },
        relations: {
            type: SchemaType.ARRAY,
            description: "實體之間的關聯對 (用於知識圖譜)",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    from: { type: SchemaType.STRING, description: "來源實體 (如: NVIDIA)" },
                    to: { type: SchemaType.STRING, description: "目標實體 (如: TSMC)" },
                    type: { type: SchemaType.STRING, description: "關聯類型 (如: 供應鏈, 競爭, 政策影響)" }
                },
                required: ["from", "to", "type"]
            }
        },
        tactical_advice: {
            type: SchemaType.OBJECT,
            description: "戰術執行建議 (v9.1.0)",
            properties: {
                action: { type: SchemaType.STRING, description: "建議行動 (強力買入/分批加碼/觀望/分批減碼/強力賣出)" },
                confidence: { type: SchemaType.NUMBER, description: "信賴程度 (0-100)" },
                position_size: { type: SchemaType.STRING, description: "建議投入倉位比例 (如: 5-10% 總資金)" },
                rationale: { type: SchemaType.STRING, description: "戰術一句話摘要" }
            },
            required: ["action", "confidence", "position_size", "rationale"]
        }
    },
    required: ["sentiment_score", "dimensions", "entities", "summary", "categories", "sector_stats", "events", "relations", "tactical_advice"]
};
/**
 * 🟢 v10.0.0: 多金鑰管理員 (Key Manager)
 * 負責金鑰輪詢、冷卻管理與任務路由
 */
class KeyManager {
    constructor(keys) {
        this.keys = keys.length > 0 ? keys : [geminiKey];
        this.currentIndex = 0;
        this.cooldowns = new Map(); // key -> resumeTime
    }

    getNextAvailableKey() {
        const now = Date.now();
        let checkedCount = 0;

        while (checkedCount < this.keys.length) {
            const key = this.keys[this.currentIndex];
            const resumeTime = this.cooldowns.get(key) || 0;

            if (now >= resumeTime) {
                return key;
            }

            // 嘗試下一個
            this.currentIndex = (this.currentIndex + 1) % this.keys.length;
            checkedCount++;
        }

        // 若全部都在冷卻，回傳當前這個並等待
        return this.keys[this.currentIndex];
    }

    markCooldown(key, seconds = 60) {
        console.warn(`💊 Key [${key.substring(0, 8)}...] entering cooldown for ${seconds}s`);
        this.cooldowns.set(key, Date.now() + seconds * 1000);
        this.rotate();
    }

    rotate() {
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    }
}

const keyManager = new KeyManager(geminiKeys);

async function callGemini(prompt, isJson = true, customKey = null, retryCount = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        // 🟢 優先選用可用金鑰
        const activeKey = customKey || keyManager.getNextAvailableKey();
        const genAI = new GoogleGenerativeAI(activeKey);

        for (const modelName of modelCandidates) {
            try {
                const config = {
                    model: modelName,
                    safetySettings,
                    generationConfig: {
                        responseMimeType: isJson ? "application/json" : "text/plain",
                    }
                };

                if (isJson) {
                    config.generationConfig.responseSchema = reportSchema;
                }

                const model = genAI.getGenerativeModel(config);
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                if (!text) throw new Error("Safety Blocked (Empty Response)");
                return isJson ? JSON.parse(text) : text;

            } catch (e) {
                lastError = e;
                const isRateLimit = e.message && (e.message.includes("429") || e.message.includes("Too Many Requests"));

                if (isRateLimit) {
                    console.warn(`⏳ ${modelName} Rate Limit (429) detected.`);
                    if (!customKey) {
                        keyManager.markCooldown(activeKey, 60); // 標記該金鑰冷卻
                        break; // 換下一個金鑰重試 (跳出 modelCandidates 迴圈)
                    } else {
                        await sleep(10000);
                    }
                } else {
                    console.warn(`⚠️ ${modelName} Error: ${e.message}`);
                }
            }
        }

        if (attempt < retryCount) {
            const waitTime = 2000;
            console.log(` API Retry ${attempt}/${retryCount}...`);
            await sleep(waitTime);
        }
    }

    const finalErrorMsg = `AI 模型全數失敗 (使用金鑰池仍無法完成任務)\nLast Error: ${lastError ? lastError.message : "Unknown"}`;
    console.error(`❌ ${finalErrorMsg}`);
    await sendDiscordError(finalErrorMsg);
    throw new Error(finalErrorMsg);
}

function getPersona(lastScore) {
    return "你是一位【AI 戰術執行官】(AI Tactical Operator)。你的語氣冷靜、極簡、數據導向。嚴禁使用任何「投資顧問」或「投顧老師」的花哨術語（如：穩健獲利、入袋為安、帶你上天堂等）。你只提供冷酷的戰術指令與風險解析。";
}

async function getSummary(newsData, lastSummary = null, lastScore = 0, marketData = null, isEmergency = false, targetName = '', techData = null, mode = 'deep') {
    // 🟢 v10.0.0: 分流處理邏輯
    const isLite = mode === 'lite';

    const blob = newsData.slice(0, isLite ? 10 : 50).map((n, i) => {
        // Lite 模式只傳標題與來源，省下大量 Token
        if (isLite) return `[ID:${i}] [來源: ${n.source}] ${n.title}`;

        const content = n.content || n.title || "無內文";
        return `[ID:${i}] [來源: ${n.source}] ${n.title}\n${content.substring(0, 1000)}...`;
    }).join('\n\n---\n\n');

    const persona = getPersona(lastScore);

    // 🟢 技術指標注入
    let technicalPrompt = "";
    if (techData && techData.symbol) {
        technicalPrompt = `📊 **技術面快照 [${techData.symbol}]**：
- **當前價格**: ${techData.price}
- **RSI (14)**: ${techData.rsi} (${techData.rsi < 30 ? '🔥超賣/買進信號' : techData.rsi > 70 ? '❄️超買/賣出信號' : '中性'})
- **均線**: MA5: ${techData.ma5}, MA20: ${techData.ma20} (${techData.trend === 'BULL' ? '🟢多頭趨勢' : '🔴空頭趨勢'})
- **策略指令**: 請結合以上技術指標與新聞情緒，在報告中給予具體的應對建議（如：建議觀望、分批加碼、減碼）。`;
    }

    const taskTypePrompt = isLite
        ? `⚡ **輕量任務 (Lite Mode)**：目前的分析重點在於「快節奏行情快照」。請快速掃描標題與指標，給出精簡的當前情緒與戰術判斷，摘要部分可保留適中長度。`
        : `🧠 **深度任務 (Deep Mode)**：此為正式日報分析。請進行全方位的深度挖掘，分析新聞脈絡、實體關聯與長期戰略影響。`;

    // 🟢 緊急模式與技術分析聯動指令
    const emergencyPrompt = isEmergency
        ? `🚨 **緊急報警追蹤**：目前系統監測到 **${targetName}** 出現重大異動！請從以下新聞中，特別針對該標的進行深度挖掘。`
        : "";

    const contextPrompt = lastSummary
        ? `🔍 **增量分析**：昨日重點為「${lastSummary.substring(0, 300)}...」。`
        : `🔍 **初始分析**：建立基準。`;

    // 注入行情數據
    const marketPrompt = marketData ? marketData : "";

    const prompt = `${persona}
${taskTypePrompt}
請讀取資料產出報告。請務必依據 schema 格式回傳。

${emergencyPrompt}
${technicalPrompt}
${marketData ? marketData : ""}
${contextPrompt}

**欄位說明補充**：
- sector_stats: 評估四大板塊情緒 (-1.0 ~ 1.0)。
- entities: 提取 5-8 個關鍵實體，並嘗試附上 ticker (如 2330.TW)。
- summary: 請使用 HTML 格式，包含重點標註與行情對齊分析。

**核心任務**：
1. **events**: 歸納出「重大市場趨勢事件」。
2. **relations**: 識別實體間的動態關聯。
3. **tactical_advice (v10.0.0 分流版)**:
   - **長期核心資產方針**: 標的 \`0050.TW\` 與 \`2330.TW\` 為「10年長期持有」。
   - **危機處理**: 當 RSI < 30 或情緒極度悲觀時，評估「戰術性加碼」。
   - **避險指令**: 若風險爆發，偵測黃金期貨 (GC=F) 走勢。
   - **禁用話術**: 絕對禁止使用投顧老師語氣。
   - **position_size**: 請給出具體的比例建議 (如：建議動用 20% 現金儲備進場/轉入黃金)。
   - **confidence**: 必須綜合基本面與技術面的背離情況給分。

新聞資料 (${isLite ? '標題模式' : '內文模式'})：
${blob}
`;

    const finalKey = isLite ? null : geminiStrategicKey;
    return await callGemini(prompt, true, finalKey);
}

async function getWeeklySummary(newsData) {
    if (newsData.length <= 40) {
        return await getSummary(newsData, null, 0);
    }

    console.log(`📊 啟動階層式總結 (專用金鑰版)：共 ${newsData.length} 則新聞...`);
    const batchSize = 30;
    const summaries = [];

    for (let i = 0; i < newsData.length; i += batchSize) {
        const batch = newsData.slice(i, i + batchSize);
        const batchBlob = batch.map(n => `- ${n.title}`).join('\n');
        const prompt = `請條列總結出 3 個最重要的市場事件 (純文字)：\n${batchBlob}`;

        try {
            const batchSummary = await callGemini(prompt, false, geminiWeeklyKey);
            summaries.push(batchSummary);
            await sleep(4000);
        } catch (e) {
            console.error(`  ❌ 批次失敗: ${e.message}`);
        }
    }

    if (summaries.length === 0) throw new Error("週報生成失敗：所有批次均失敗");

    const finalBlob = summaries.join('\n\n=== 下一組 ===\n\n');
    const finalPrompt = `你是一位專業投資分析師。請整合以下摘要，產出「AI 投資週報」。
請務必依據 schema 格式回傳 JSON。

分批摘要：
${finalBlob}`;

    return await callGemini(finalPrompt, true, geminiWeeklyKey);
}

module.exports = { getSummary, getWeeklySummary };