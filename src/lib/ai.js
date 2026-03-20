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
        // 🟢 v14.5.0: 隨機打亂金鑰順序，平均每日配額負載
        this.keys.sort(() => Math.random() - 0.5);
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
        // 🟢 v14.5.0: 支援長效冷卻 (Circuit Breaker)
        const displayKey = key.substring(0, 8);
        if (seconds > 3600) {
            console.error(`🚨 [Circuit Breaker] Key [${displayKey}...] 觸發每日限額熔斷，冷卻 ${Math.round(seconds / 3600)} 小時。`);
        } else {
            console.warn(`💊 Key [${displayKey}...] entering cooldown for ${seconds}s`);
        }
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
    let usingCustomKey = !!customKey;

    // 🟢 v13.7.16: 分段嘗試。如果有自訂金鑰，先試自訂金鑰；失敗後再試金鑰池。
    const maxPhases = usingCustomKey ? 2 : 1;

    for (let phase = 1; phase <= maxPhases; phase++) {
        const currentCustomKey = phase === 1 && usingCustomKey ? customKey : null;

        if (phase === 2) {
            console.warn(`\n[Fallback] ⚠️ 專屬金鑰 (Strategic) 失敗達 ${retryCount} 次，正在降級使用【常規金鑰池 (Key Pool)】進行最後備援重試...`);
            lastError = null; // 重置錯誤，避免混淆兩個階段的報錯
        }

        for (let attempt = 1; attempt <= retryCount; attempt++) {
            // 🟢 優先選用當前階段的金鑰
            const activeKey = currentCustomKey || keyManager.getNextAvailableKey();
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
                    const isServerOverloaded = e.message && (e.message.includes("503") || e.message.includes("Service Unavailable") || e.message.includes("500"));

                    if (isRateLimit) {
                        const isDailyLimit = e.message && e.message.includes("PerDay");
                        const cooldownTime = isDailyLimit ? 43200 : 60; // 每日限額給予 12 小時冷卻

                        if (isDailyLimit) {
                            console.error(`🚨 ${modelName} 偵測到「每日限額 (Daily Quota)」已耗盡！`);
                        } else {
                            console.warn(`⏳ ${modelName} 觸發 Rate Limit (429) 限流保護。`);
                        }

                        if (!currentCustomKey) {
                            keyManager.markCooldown(activeKey, cooldownTime); // 標記該金鑰冷卻
                            break; // 換下一個金鑰重試 (跳出 modelCandidates 迴圈)
                        } else {
                            // 🟢 v14.4.0: 專屬金鑰 (Strategic) 觸發 429 時，等待時間加長 (30s)，給予配額更多恢復時間
                            const customWait = attempt * 30000;
                            console.log(`💊 [Strategic Key] 限流中，等待 ${customWait / 1000}s 後重試...`);
                            await sleep(customWait);
                            if (isDailyLimit) break; // 如果是每日限額，別在 Strategic Key 浪費時間了，直接 fallback
                        }
                    } else if (isServerOverloaded) {
                        console.warn(`🔥 ${modelName} 伺服器高負載 (503/500): ${e.message.substring(0, 100)}...`);
                    } else {
                        console.warn(`⚠️ ${modelName} 未知錯誤: ${e.message.substring(0, 100)}...`);
                    }
                }
            }

            if (attempt < retryCount) {
                // 🟢 v13.7.16: 加入指數退避 (Exponential Backoff)，避免在 503 時連續狂敲 api
                const waitTime = attempt === 1 ? 2000 : attempt === 2 ? 5000 : 10000;
                console.log(` API Retry Phase[${phase}/${maxPhases}] 嘗試[${attempt}/${retryCount}] (Wait ${waitTime / 1000}s)...`);
                await sleep(waitTime);
            }
        }
    }

    const errorContext = usingCustomKey ? "專屬金鑰與金鑰池皆已" : "金鑰池";
    const finalErrorMsg = `AI 模型全數失敗 (${errorContext}耗盡)\nLast Error: ${lastError ? lastError.message : "Unknown"}`;
    console.error(`❌ ${finalErrorMsg}`);
    await sendDiscordError(finalErrorMsg);
    throw new Error(finalErrorMsg);
}

function getPersona(lastScore) {
    return "你是一位【首席市場情報分析師】 (Chief Intelligence Analyst)。你的語氣冷靜、專業、資訊密度高。你的任務是從大量雜亂的新聞流中提煉出關鍵的「情報價值」，幫助決策者掌握全球市場動向。嚴禁使用投顧老師的花哨術語。";
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

    const prompt = `${persona}
${taskTypePrompt}
請讀取資料產出報告。請務必依據 schema 格式回傳。

${emergencyPrompt}
${technicalPrompt}
${marketData ? marketData : ""}
${contextPrompt}

**核心任務 (優先順序)**：
1. **summary (情報精華)**：
   - 請以 **HTML 格式** 撰寫一份結構化的情報摘要。
   - **重中之重**：你不再只是回報買賣點，而是要歸納出昨夜/今日的「關鍵敘事」與「情報內涵」。
   - 請區分為以下結構：
     - <h3>🌍 宏觀政經脈動</h3>：歸納聯準會、地緣政治、核心經濟數據 (CPI/PCE) 等。
     - <h3>🏢 產業/財報掃描</h3>：歸納科技股動向、半導體供應鏈、核心企業 (AAPL/NVDA/TSMC) 異動。
     - <h3>📊 核心數據摘要</h3>：列出報告內提到的具體數據點。
   - 摘要中需引用具體公司 Ticker。
2. **events**: 歸納出「重大市場趨勢事件」。
3. **tactical_advice (行動附錄)**:
   - 針對 \`0050.TW\` 與 \`2330.TW\` 給予戰術指引。
   - **注意**：這僅作為報告的「執行參考」，不應在 summary 中佔據主導篇幅。
4. **relations**: 識別實體間的動態關聯。

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

async function getMorningSummary(briefingData) {
    const persona = getPersona(0);
    const { market_snapshot_formatted, overnight_news } = briefingData;

    // 將隔夜新聞格式化
    const newsBlob = overnight_news.map((n, i) => `[ID:${i}] [${n.time.substring(11, 16)}] [${n.source}] ${n.title}`).join('\n');

    const prompt = `${persona}
🚨 **盤前晨報任務 (Morning Briefing)**：此為每日 06:30 提供給交易員的盤前摘要。
請融合「美股盤後快照」與「隔夜重大新聞」，產出極簡、具高度戰術指導意義的報告。

特別注意市場連動邏輯：
- **風險先行指標**：分析比特幣 (BTC) 與以太幣 (ETH) 的表現。若幣圈在清晨時段出現顯著下跌，通常預示今日美股及台股電子盤的風險偏好收縮，請在戰術建議中提出警示。
- **總經環境**：觀察美元指數 (DXY) 是否強彈（通常對股市壓力較大）以及黃金、原油的避險/通膨信號。

請務必依據 schema 格式回傳 JSON。

${market_snapshot_formatted}

**隔夜市場情報 (過去 12 小時)**：
${newsBlob}

**分析重點與欄位要求**：
1. **summary**: 請以 HTML 格式簡短總結昨夜美股表現主軸（如：科技股領跌、通膨數據激勵等），並明確指出對今日「台股開盤」的可能影響（對照 TSM ADR 表現）。
2. **sentiment_score**: 結合 VIX 漲跌與新聞情緒，給出今日開盤的恐慌/貪婪分數 (-1.0 ~ 1.0)。
3. **events**: 條列 2-3 個昨夜最關鍵的總經或個股事件。
4. **tactical_advice**: 針對今日台股開盤給予明確的「開盤戰術」（如：開低走高機率大可分批承接、建議開盤先觀望避險等）。

嚴禁廢話，字字珠璣。
`;

    // 晨報任務對精準度要求高，強制使用 Strategic Key (深思模式)
    return await callGemini(prompt, true, geminiStrategicKey);
}

module.exports = { getSummary, getWeeklySummary, getMorningSummary };