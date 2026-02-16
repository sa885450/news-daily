const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { geminiKey, geminiWeeklyKey, modelCandidates } = require('./config');
const { sleep } = require('./utils');

// 🟢 安全設定：放寬限制以避免新聞被誤擋
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * 通用 AI 呼叫函式
 * @param {string} customKey - 指定使用的 API Key，若無則使用預設
 */
async function callGemini(prompt, isJson = true, customKey = null, retryCount = 3) {
    // 決定要用哪把鑰匙
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

                if (!text) throw new Error("回應為空 (Safety Blocked)");
                return isJson ? JSON.parse(text) : text;

            } catch (e) {
                // 最後一次嘗試才拋出錯誤
                if (attempt === retryCount && modelName === modelCandidates[modelCandidates.length - 1]) {
                    // console.error(`❌ ${modelName} 最終失敗: ${e.message}`);
                }
            }
        }
        
        // 指數退避重試 (2s, 4s, 8s)
        if (attempt < retryCount) {
            const waitTime = 2000 * Math.pow(2, attempt - 1);
            console.log(`⏳ API 忙碌，等待 ${waitTime}ms 後重試...`);
            await sleep(waitTime);
        }
    }
    throw new Error("AI 模型全數失敗 (已達重試上限)");
}

/**
 * 日報用：單次分析
 */
async function getSummary(newsData, lastSummary = null) {
    const blob = newsData.map((n, i) => {
        const content = n.content || n.title || "無內文詳情";
        return `[ID:${i}] [來源: ${n.source}] ${n.title}\n${content.substring(0, 200)}...`;
    }).join('\n\n---\n\n');
    
    const contextPrompt = lastSummary 
        ? `🔍 **增量分析模式**：昨日重點為「${lastSummary.substring(0, 300)}...」。請比較今日變化。` 
        : `🔍 **初始分析模式**：建立基準。`;

    const prompt = `你是一位避險基金經理人。請閱讀新聞並產出深度決策報告。
${contextPrompt}
請直接輸出 JSON 格式：
{
  "sentiment_score": 0.5, 
  "dimensions": { "policy": 0.5, "market": 0.5, "industry": 0.5, "international": 0.5, "technical": 0.5 },
  "entities": ["台積電", "Fed", "黃仁勳"], 
  "summary": "HTML格式的分析報告...",
  "categories": [{"id": 0, "category": "科技"}, ...]
}
新聞資料：
${blob}`;

    // 日報使用預設 Key
    return await callGemini(prompt, true);
}

/**
 * 🟢 週報專用：階層式總結 (Map-Reduce)
 * 使用 geminiWeeklyKey，並增加批次間隔
 */
async function getWeeklySummary(newsData) {
    // 如果新聞很少，直接用單次分析 (也使用週報 Key)
    if (newsData.length <= 40) {
        return await callGemini(`請總結以下新聞為週報 JSON：\n${newsData.map(n=>n.title).join('\n')}`, true, geminiWeeklyKey);
    }

    console.log(`📊 啟動階層式總結 (專用金鑰版)：共 ${newsData.length} 則新聞，分批處理中...`);

    const batchSize = 30;
    const summaries = [];
    
    for (let i = 0; i < newsData.length; i += batchSize) {
        const batch = newsData.slice(i, i + batchSize);
        console.log(`  - 正在處理第 ${Math.floor(i/batchSize) + 1} 批次...`);
        
        const batchBlob = batch.map(n => `- ${n.title}`).join('\n');
        const prompt = `請閱讀以下新聞標題，條列出 3 個最重要的市場關鍵事件 (純文字)：\n${batchBlob}`;

        try {
            // 🟢 使用 geminiWeeklyKey
            const batchSummary = await callGemini(prompt, false, geminiWeeklyKey); 
            summaries.push(batchSummary);
            
            // 🟢 強制冷卻 4 秒，保護 API 額度
            await sleep(4000); 
            
        } catch (e) {
            console.warn(`  ⚠️ 此批次失敗，跳過: ${e.message}`);
        }
    }

    if (summaries.length === 0) throw new Error("所有批次摘要皆失敗");

    console.log(`🔄 正在合併 ${summaries.length} 個分批摘要...`);
    const finalBlob = summaries.join('\n\n=== 下一組 ===\n\n');
    
    const finalPrompt = `你是一位專業投資分析師。請整合以下「分批摘要」，產出完整的「AI 投資週報」。

分批摘要：
${finalBlob}

請直接輸出 JSON 格式：
{
  "sentiment_score": 0.5, 
  "entities": ["關鍵詞1", "關鍵詞2", "關鍵詞3"], 
  "summary": "請用條列式總結本週 3-5 個市場重磅事件（支援 Discord 格式，如 **粗體**）。",
  "dimensions": { "policy": 0.5, "market": 0.5, "industry": 0.5, "international": 0.5, "technical": 0.5 }
}`;

    // Reduce 階段也使用週報 Key
    return await callGemini(finalPrompt, true, geminiWeeklyKey);
}

module.exports = { getSummary, getWeeklySummary };