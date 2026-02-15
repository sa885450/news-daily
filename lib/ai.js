const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiKey, modelCandidates } = require('./config');

const genAI = new GoogleGenerativeAI(geminiKey);

/**
 * 執行 AI 分析
 * @param {Array} newsData 新聞陣列
 * @param {string} lastSummary 昨日總結 (用於增量分析)
 * @returns {Promise<Object>} 回傳 JSON
 */
async function getSummary(newsData, lastSummary = null) {
    const blob = newsData.map((n, i) => `[ID:${i}] [來源: ${n.source}] ${n.title}\n${n.content.substring(0, 200)}...`).join('\n\n---\n\n');
    
    const contextPrompt = lastSummary 
        ? `🔍 **增量分析模式**：昨日重點為「${lastSummary.substring(0, 300)}...」。請比較今日變化。` 
        : `🔍 **初始分析模式**：建立基準。`;

    const prompt = `你是一位避險基金經理人。請閱讀新聞並產出深度決策報告。

${contextPrompt}

請直接輸出以下 **JSON 格式** (不要 Markdown)：
{
  "sentiment_score": 0.5, 
  "dimensions": {
    "policy": 0.5,      
    "market": 0.5,      
    "industry": 0.5,    
    "international": 0.5, 
    "technical": 0.5    
  },
  "entities": ["台積電", "Fed", "黃仁勳"], 
  "summary": "HTML格式的分析報告...",
  "categories": [{"id": 0, "category": "科技"}, ...]
}

**欄位定義**：
1. **sentiment_score**：總體情緒 (-1.0 恐慌 ~ 1.0 貪婪)。
2. **dimensions** (五力分析，範圍 0.0 ~ 1.0，數值越高代表該面向**越強勢/利多**，0.5 為中性)：
   - policy: 政策與法規影響 (如央行利率、政府補助)
   - market: 市場資金與流動性 (如匯率、成交量能)
   - industry: 產業基本面 (如營收、庫存、訂單)
   - international: 國際地緣與總經 (如美股連動、戰爭)
   - technical: 市場信心與技術籌碼
3. **entities**：提取 5-8 個最重要的**關鍵實體** (公司名、人名、機構)。
4. **summary**：含「情緒溫度」、「增量分析」、「關鍵事件」與「操作建議」。

新聞資料：
${blob}`;

    for (const modelName of modelCandidates) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContent(prompt);
            return JSON.parse(result.response.text());
        } catch (e) {
            console.warn(`⚠️ ${modelName} 分析失敗: ${e.message}`);
        }
    }
    throw new Error("AI 模型全數失敗");
}

module.exports = { getSummary };