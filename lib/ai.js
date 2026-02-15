const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiKey, modelCandidates } = require('./config');
const { log } = require('./utils');

const genAI = new GoogleGenerativeAI(geminiKey);

async function getSummary(newsData) {
    log('🧠', `正在執行深度金融分析 (${newsData.length} 則新聞)...`);
    const blob = newsData.map((n, i) => `[ID:${i}] [來源: ${n.source}] ${n.title}\n${n.content}`).join('\n\n---\n\n');
    
    const prompt = `你是一位頂尖的避險基金經理人與首席分析師。請針對以下新聞進行「高權重市場掃描」：

1. **市場總體情緒**：給予一個精準的情緒分數（-1.0 到 +1.0），配上圖示（🟢 利多 / 🔴 利空 / ⚪ 中立）。
2. **核心事件深度分析 (擴充版)**：
   - 請挑選 **5-10 個關鍵事件**。
   - **權重機制**：請優先挑選影響「大型權值股」、「貨幣政策」或「產業鏈結構變動」的新聞。
   - 請用專業、嚴謹的敘述風格，**嚴禁在文中出現 [ID:x] 標記**。
3. **💡 投資建議與策略 (新)**：
   - 根據今日新聞，為投資者提供 3 點具體的觀察方向或操作策略建議（例如：板塊輪動、避險資產配置等）。
4. **新聞分類標記**：請務必為每一則新聞打上分類標籤，僅限從【科技、金融、社會、其他】這四個選項中選一個。

**最後輸出要求**：
請在摘要最後輸出 JSON 分類區塊：
\`\`\`json
[
  {"id": 0, "category": "科技"},
  ...
]
\`\`\`

新聞資料內容：
${blob}`;

    for (const modelName of modelCandidates) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return (await result.response).text();
        } catch (e) { console.warn(`⚠️ ${modelName} 失敗: ${e.message}`); }
    }
    throw new Error("金融分析失敗");
}

module.exports = { getSummary };