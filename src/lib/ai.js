const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } = require("@google/generative-ai");
const { geminiKey, geminiWeeklyKey, modelCandidates } = require('./config');
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
        }
    },
    required: ["sentiment_score", "dimensions", "entities", "summary", "categories", "sector_stats", "events", "relations"]
};

async function callGemini(prompt, isJson = true, customKey = null, retryCount = 3) {
    const activeKey = customKey || geminiKey;
    const genAI = new GoogleGenerativeAI(activeKey);
    let lastError = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        for (const modelName of modelCandidates) {
            try {
                const config = {
                    model: modelName,
                    safetySettings,
                    generationConfig: {
                        responseMimeType: isJson ? "application/json" : "text/plain",
                    }
                };

                // 🟢 v4.5.0: 導入原生 JSON Schema
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
                    console.warn(`⏳ ${modelName} Rate Limit (429). Waiting 10s...`);
                    await sleep(10000);
                } else {
                    console.warn(`⚠️ ${modelName} Error: ${e.message}`);
                }
            }
        }

        if (attempt < retryCount) {
            const waitTime = 3000 * Math.pow(2, attempt - 1);
            console.log(`⏳ API Retry ${attempt}/${retryCount}, waiting ${waitTime}ms...`);
            await sleep(waitTime);
        }
    }

    const finalErrorMsg = `AI 模型全數失敗 (Retry: ${retryCount})\nLast Error: ${lastError ? lastError.message : "Unknown"}`;
    console.error(`❌ ${finalErrorMsg}`);
    await sendDiscordError(finalErrorMsg);
    throw new Error(finalErrorMsg);
}

function getPersona(lastScore) {
    if (lastScore <= -0.5) return "你是一位【逆勢價值投資大師】。市場極度恐慌，請專注於尋找被錯殺的績優股，並強調長期持有的安全邊際。";
    if (lastScore >= 0.5) return "你是一位【風險控管專家】。市場極度貪婪，請警告潛在的泡沫風險，建議適度獲利了結，並關注防禦性資產。";
    return "你是一位【宏觀避險基金經理人】。市場情緒中性，請平衡分析多空因素，尋找結構性的成長機會。";
}

async function getSummary(newsData, lastSummary = null, lastScore = 0) {
    const blob = newsData.map((n, i) => {
        const content = n.content || n.title || "無內文";
        return `[ID:${i}] [來源: ${n.source}] ${n.title}\n${content.substring(0, 1000)}...`;
    }).join('\n\n---\n\n');

    const persona = getPersona(lastScore);
    const contextPrompt = lastSummary
        ? `🔍 **增量分析**：昨日重點為「${lastSummary.substring(0, 300)}...」。請比較今日變化。`
        : `🔍 **初始分析**：建立基準。`;

    const prompt = `${persona}
請閱讀新聞並產出深度決策報告。請務必依據 schema 格式精確回傳。

${contextPrompt}

**欄位說明補充**：
- sector_stats: 評估四大板塊情緒 (-1.0 ~ 1.0)。
- entities: 提取 5-8 個關鍵實體，並嘗試附上 ticker (如 2330.TW)。
- summary: 請使用 HTML 格式，包含重點標註。

**特殊任務 (指標觀測)**：
1. **8zz 與 巴逆逆 (核心任務)**: 
   - 這兩位是市場知名的「反向指標」。
   - **若資料中有直接提到**: 嚴格依據其看多/看空立場，產出對應的短線風險提醒（其看多則提醒崩盤風險，其看空則提醒潛在底部）。
   - **若資料中「沒有」提到**: 請根據今日大盤走勢與市場情緒，**「模擬/推演」**這類社群指標此時可能的動作或處境（例如：大盤強勢拉升，這類看空的指標可能正在「嘎空」或「裝死」；大盤暴跌，則可能正在「叫好」或「抄底」）。
   - 請務必在 `summary` 中加入一個 ` < h3 >💡 社群指標觀測(8zz / 巴逆逆)</h3 > ` 專區來呈現此分析。

2. **events**: 
   - 請從所有新聞中歸納出 3-5 個「重大市場趨勢事件」。每個事件需包含一個有力標題、一段核心解析、對市場的影響評估，以及對應的新聞 ID 列表。

3. **relations**: 
   - 請識別出實體間的「動態關聯」(供應鏈、競爭、政策影響等)。格式為 {from, to, type}。

新聞資料：
${blob}
`;

    return await callGemini(prompt, true);
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