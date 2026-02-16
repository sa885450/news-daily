const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiKey, modelCandidates } = require('./config');

const genAI = new GoogleGenerativeAI(geminiKey);

/**
 * 通用 AI 呼叫函式 (處理單次請求)
 */
async function callGemini(prompt, isJson = true) {
    for (const modelName of modelCandidates) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName, 
                generationConfig: { responseMimeType: isJson ? "application/json" : "text/plain" } 
            });
            const result = await model.generateContent(prompt);
            return isJson ? JSON.parse(result.response.text()) : result.response.text();
        } catch (e) {
            console.warn(`⚠️ ${modelName} 失敗: ${e.message}`);
        }
    }
    throw new Error("AI 模型全數失敗");
}

/**
 * 日報用：單次分析 (維持原樣)
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

    return await callGemini(prompt, true);
}

/**
 * 🟢 新增：週報專用 - 階層式總結 (Map-Reduce)
 */
async function getWeeklySummary(newsData) {
    // 如果新聞少於 40 則，直接一次處理
    if (newsData.length <= 40) {
        return await getSummary(newsData, null);
    }

    console.log(`📊 啟動階層式總結：共 ${newsData.length} 則新聞，將分批處理...`);

    // 1. Map 階段：分批產生小摘要 (每 30 則一組)
    const batchSize = 30;
    const summaries = [];
    
    for (let i = 0; i < newsData.length; i += batchSize) {
        const batch = newsData.slice(i, i + batchSize);
        console.log(`  - 正在處理第 ${i/batchSize + 1} 批次...`);
        
        const batchBlob = batch.map(n => `- ${n.title}`).join('\n');
        const prompt = `請快速閱讀以下 30 則新聞標題，並用條列式總結出 3 個最重要的市場關鍵事件。
新聞：
${batchBlob}
請輸出純文字總結。`;

        try {
            const batchSummary = await callGemini(prompt, false); // 這裡只要文字，不用 JSON
            summaries.push(batchSummary);
        } catch (e) {
            console.warn(`  ⚠️ 批次失敗，跳過`);
        }
    }

    // 2. Reduce 階段：合併所有小摘要，產生最終報告
    console.log(`🔄 正在合併 ${summaries.length} 個分批摘要...`);
    const finalBlob = summaries.join('\n\n=== 下一組 ===\n\n');
    
    const finalPrompt = `你是一位專業投資分析師。以下是本週新聞的「分批摘要彙整」。請閱讀這些片段，並整合出一份完整的「AI 投資週報」。

分批摘要：
${finalBlob}

請直接輸出 JSON 格式：
{
  "sentiment_score": 0.5, 
  "entities": ["關鍵詞1", "關鍵詞2", "關鍵詞3"], 
  "summary": "請用條列式總結本週 3-5 個市場重磅事件（支援 Discord 格式，如 **粗體**）。",
  "dimensions": { "policy": 0.5, "market": 0.5, "industry": 0.5, "international": 0.5, "technical": 0.5 }
}`;

    return await callGemini(finalPrompt, true);
}

module.exports = { getSummary, getWeeklySummary };