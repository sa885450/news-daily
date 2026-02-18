const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { geminiKey, geminiWeeklyKey, modelCandidates } = require('./config');
const { sleep, sendDiscordError } = require('./utils');

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

async function callGemini(prompt, isJson = true, customKey = null, retryCount = 3) {
    const activeKey = customKey || geminiKey;
    const genAI = new GoogleGenerativeAI(activeKey);
    let lastError = null;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        for (const modelName of modelCandidates) {
            try {
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    safetySettings,
                    generationConfig: { responseMimeType: isJson ? "application/json" : "text/plain" }
                });

                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                if (!text) throw new Error("Safety Blocked (Empty Response)");

                return isJson ? JSON.parse(text) : text;
            } catch (e) {
                lastError = e;
                const isSafety = e.message && (e.message.includes("Safety") || e.message.includes("blocked"));
                const isRateLimit = e.message && (e.message.includes("429") || e.message.includes("Too Many Requests"));

                // 🟢 降級策略：若 JSON 模式因安全原因被擋，嘗試純文字模式並手動提取 JSON
                if (isJson && isSafety) {
                    console.warn(`⚠️ ${modelName} JSON Mode Blocked, trying Text Mode fallback...`);
                    try {
                        const textModel = genAI.getGenerativeModel({
                            model: modelName,
                            safetySettings,
                            generationConfig: { responseMimeType: "text/plain" }
                        });
                        const txtResult = await textModel.generateContent(prompt);
                        const txtResponse = await txtResult.response;
                        const rawText = txtResponse.text();

                        // 嘗試尋找 JSON區塊
                        const jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                        if (jsonMatch) {
                            return JSON.parse(jsonMatch[0]);
                        }
                    } catch (e2) {
                        console.warn(`  ↳ Fallback failed: ${e2.message}`);
                    }
                }

                if (isRateLimit) {
                    console.warn(`⏳ ${modelName} Rate Limit (429). Waiting 10s...`);
                    await sleep(10000);
                } else {
                    console.warn(`⚠️ ${modelName} Error: ${e.message}`);
                }
            }
        }

        if (attempt < retryCount) {
            const waitTime = 3000 * Math.pow(2, attempt - 1); // Exponential Backoff: 3s, 6s, 12s...
            console.log(`⏳ API Retry ${attempt}/${retryCount}, waiting ${waitTime}ms...`);
            await sleep(waitTime);
        }
    }

    // 🔴 最終失敗，發送 Discord 通知
    const finalErrorMsg = `AI 模型全數失敗 (Retry: ${retryCount})\nLast Error: ${lastError ? lastError.message : "Unknown"}`;
    console.error(`❌ ${finalErrorMsg}`);
    await sendDiscordError(finalErrorMsg);
    throw new Error(finalErrorMsg);
}

/**
 * 🟢 輔助函式：根據昨日情緒決定今日 Persona
 */
function getPersona(lastScore) {
    if (lastScore <= -0.5) return "你是一位【逆勢價值投資大師】。市場極度恐慌，請專注於尋找被錯殺的績優股，並強調長期持有的安全邊際。";
    if (lastScore >= 0.5) return "你是一位【風險控管專家】。市場極度貪婪，請警告潛在的泡沫風險，建議適度獲利了結，並關注防禦性資產。";
    return "你是一位【宏觀避險基金經理人】。市場情緒中性，請平衡分析多空因素，尋找結構性的成長機會。";
}

/**
 * 日報用：單次分析 (加入 Persona 與 Ticker)
 */
async function getSummary(newsData, lastSummary = null, lastScore = 0) {
    const blob = newsData.map((n, i) => {
        const content = n.content || n.title || "無內文";
        return `[ID:${i}] [來源: ${n.source}] ${n.title}\n${content.substring(0, 200)}...`;
    }).join('\n\n---\n\n');

    // 🟢 動態 Persona
    const persona = getPersona(lastScore);

    const contextPrompt = lastSummary
        ? `🔍 **增量分析**：昨日重點為「${lastSummary.substring(0, 300)}...」。請比較今日變化。`
        : `🔍 **初始分析**：建立基準。`;

    const prompt = `${persona}
請閱讀新聞並產出深度決策報告。

${contextPrompt}

請直接輸出 JSON 格式：
{
  "sentiment_score": 0.5, 
  "dimensions": { "policy": 0.5, "market": 0.5, "industry": 0.5, "international": 0.5, "technical": 0.5 },
  "entities": [
    {"name": "台積電", "ticker": "2330.TW", "sentiment": "Positive"},
    {"name": "Fed", "ticker": null, "sentiment": "Neutral"}
  ], 
  "summary": "HTML格式的分析報告...",
  "summary": "HTML格式的分析報告...",
  "categories": [{"id": 0, "category": "科技"}, ...],
  "sector_stats": { "tech": 0.5, "finance": 0.5, "manufacturing": 0.5, "service": 0.5 }
}

**欄位說明**：
- sector_stats: 請評估四大板塊情緒 (-1.0 ~ 1.0)：tech(科技/半導體), finance(金融), manufacturing(傳產/製造), service(服務/消費)。

**欄位說明**：
- entities: 請提取 5-8 個關鍵實體，若為上市公司請嘗試附上台股或美股代號 (ticker)，否則為 null。
- sentiment_score: -1.0(恐慌) ~ 1.0(貪婪)。

新聞資料：
${blob}`;

    return await callGemini(prompt, true);
}

/**
 * 週報用：階層式總結 (Map-Reduce)
 */
async function getWeeklySummary(newsData) {
    if (newsData.length <= 40) {
        // 若新聞少，直接用週報 Key 跑單次分析
        return await getSummary(newsData, null, 0);
    }

    console.log(`📊 啟動階層式總結 (專用金鑰版)：共 ${newsData.length} 則新聞...`);
    const batchSize = 30;
    const summaries = [];

    for (let i = 0; i < newsData.length; i += batchSize) {
        const batch = newsData.slice(i, i + batchSize);
        console.log(`  - 處理第 ${Math.floor(i / batchSize) + 1} 批次...`);
        const batchBlob = batch.map(n => `- ${n.title}`).join('\n');

        // Map 階段只做摘要，不浪費 Token 做代碼化
        const prompt = `請條列總結出 3 個最重要的市場事件 (純文字)：\n${batchBlob}`;

        try {
            const batchSummary = await callGemini(prompt, false, geminiWeeklyKey);
            summaries.push(batchSummary);
            await sleep(4000);
        } catch (e) {
            console.error(`  ❌ 批次失敗 (已跳過): ${e.message}`);
            // 允許部分失敗，不拋出錯誤
        }
    }

    if (summaries.length === 0) {
        const msg = "週報生成失敗：所有批次均失敗";
        await sendDiscordError(msg);
        throw new Error(msg);
    }

    const finalBlob = summaries.join('\n\n=== 下一組 ===\n\n');
    const finalPrompt = `你是一位專業投資分析師。請整合以下摘要，產出「AI 投資週報」。

分批摘要：
${finalBlob}

請直接輸出 JSON 格式：
{
  "sentiment_score": 0.5, 
  "entities": [
    {"name": "輝達", "ticker": "NVDA", "sentiment": "Positive"},
    {"name": "央行", "ticker": null, "sentiment": "Neutral"}
  ],
  "summary": "請用條列式總結本週 3-5 個市場重磅事件（支援 Discord 格式，如 **粗體**）。",
  "summary": "請用條列式總結本週 3-5 個市場重磅事件（支援 Discord 格式，如 **粗體**）。",
  "dimensions": { "policy": 0.5, "market": 0.5, "industry": 0.5, "international": 0.5, "technical": 0.5 },
  "sector_stats": { "tech": 0.5, "finance": 0.5, "manufacturing": 0.5, "service": 0.5 }
}`;

    return await callGemini(finalPrompt, true, geminiWeeklyKey);
}

module.exports = { getSummary, getWeeklySummary };