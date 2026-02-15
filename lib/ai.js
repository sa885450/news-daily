const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiKey, modelCandidates } = require('./config');

const genAI = new GoogleGenerativeAI(geminiKey);

/**
 * 執行 AI 分析
 * @param {Array} newsData 新聞陣列
 * @param {string} lastSummary 昨日總結 (用於增量分析)
 * @returns {Promise<Object>} 回傳 { summary, sentiment, categories }
 */
async function getSummary(newsData, lastSummary = null) {
    // 將新聞陣列轉換為文字塊
    const blob = newsData.map((n, i) => `[ID:${i}] [來源: ${n.source}] ${n.title}\n${n.content.substring(0, 200)}...`).join('\n\n---\n\n');
    
    // 🟢 增量分析提示詞
    const contextPrompt = lastSummary 
        ? `🔍 **增量分析模式啟動**：\n昨日市場重點為：「${lastSummary.substring(0, 300)}...」。\n請比較今日新聞，明確指出**「與昨天相比的變化」**（例如：事件惡化/緩解、新變數出現）。` 
        : `🔍 **初始分析模式**：這是第一天的分析，請建立基準。`;

    const prompt = `你是一位避險基金經理人。請閱讀以下新聞並產出投資決策報告。

${contextPrompt}

請依照以下 JSON 格式輸出（不要包含 Markdown 標記，直接輸出 JSON）：
{
  "sentiment_score": 0.5, 
  "summary": "這裡填寫你的深度分析報告 (支援 HTML 格式，如 <b>重點</b>)...",
  "categories": [{"id": 0, "category": "科技"}, {"id": 1, "category": "金融"}...]
}

**欄位說明**：
1. **sentiment_score**：市場情緒指數，範圍 -1.0 (極度恐慌) 到 1.0 (極度貪婪)。
2. **summary**：
   - 第一段：**市場情緒溫度計**（解釋給定分數的原因）。
   - 第二段：**增量變化分析**（呼應昨天的重點，說明今日新進展）。
   - 第三段：**關鍵事件掃描**（條列 3-5 個影響最大的新聞）。
   - 第四段：**操作建議**。
3. **categories**：新聞 ID 對應的分類（科技、金融、社會、其他）。

新聞資料：
${blob}`;

    for (const modelName of modelCandidates) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            // 嘗試解析 JSON
            return JSON.parse(responseText);
        } catch (e) {
            console.warn(`⚠️ ${modelName} 分析失敗或格式錯誤: ${e.message}`);
        }
    }
    throw new Error("所有 AI 模型皆無法完成分析");
}

module.exports = { getSummary };