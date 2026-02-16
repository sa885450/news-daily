const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { geminiKey, geminiWeeklyKey, modelCandidates } = require('./config');
const { sleep } = require('./utils');

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

async function callGemini(prompt, isJson = true, customKey = null, retryCount = 3) {
    const activeKey = customKey || geminiKey;
    const genAI = new GoogleGenerativeAI(activeKey);

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
                if (!text) throw new Error("Safety Blocked");
                return isJson ? JSON.parse(text) : text;
            } catch (e) {
                if (attempt === retryCount && modelName === modelCandidates[modelCandidates.length - 1]) {
                    // console.error(`❌ ${modelName} 最終失敗: ${e.message}`);
                }
            }
        }
        if (attempt < retryCount) {
            const waitTime = 2000 * Math.pow(2, attempt - 1);
            console.log(`⏳ API 忙碌，等待 ${waitTime}ms 後重試...`);
            await sleep(waitTime);
        }
    }
    throw new Error("AI 模型全數失敗");
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
  "categories": [{"id": 0, "category": "科技"}, ...]
}

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
        console.log(`  - 處理第 ${Math.floor(i/batchSize) + 1} 批次...`);
        const batchBlob = batch.map(n => `- ${n.title}`).join('\n');
        
        // Map 階段只做摘要，不浪費 Token 做代碼化
        const prompt = `請條列總結出 3 個最重要的市場事件 (純文字)：\n${batchBlob}`;

        try {
            const batchSummary = await callGemini(prompt, false, geminiWeeklyKey); 
            summaries.push(batchSummary);
            await sleep(4000); 
        } catch (e) {
            console.warn(`  ⚠️ 批次失敗: ${e.message}`);
        }
    }

    if (summaries.length === 0) throw new Error("所有批次失敗");

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
  "dimensions": { "policy": 0.5, "market": 0.5, "industry": 0.5, "international": 0.5, "technical": 0.5 }
}`;

    return await callGemini(finalPrompt, true, geminiWeeklyKey);
}

module.exports = { getSummary, getWeeklySummary };