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
        }
    },
    required: ["sentiment_score", "dimensions", "entities", "summary", "categories", "sector_stats"]
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
        return `[ID:${i}] [來源: ${n.source}] ${n.title}\n${content.substring(0, 400)}...`;
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

新聞資料：
${blob}`;

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