const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai"); // 🟢 引入 OpenAI
const { geminiKey, openaiKey, modelCandidates, openaiModel } = require('./config');

const genAI = new GoogleGenerativeAI(geminiKey);

// 🟢 初始化 OpenAI Client (如果沒有 Key 則為 undefined)
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

/**
 * Gemini AI 分析 (維持原樣，給日報用)
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

請直接輸出以下 **JSON 格式** (不要 Markdown)：
{
  "sentiment_score": 0.5, 
  "dimensions": { "policy": 0.5, "market": 0.5, "industry": 0.5, "international": 0.5, "technical": 0.5 },
  "entities": ["台積電", "Fed", "黃仁勳"], 
  "summary": "HTML格式的分析報告...",
  "categories": [{"id": 0, "category": "科技"}, ...]
}

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

/**
 * 🟢 新增：OpenAI 週報分析
 * 專門用於 Weekly Task，穩定性較高
 */
async function getOpenAISummary(newsData) {
    if (!openai) throw new Error("未設定 OPENAI_API_KEY");

    const blob = newsData.map((n, i) => {
        const content = n.content || n.title || "無內文詳情";
        return `[ID:${i}] ${n.title}`; // 週報只餵標題以節省 Token，效果通常足夠
    }).join('\n');

    const prompt = `你是一位專業的投資分析師。請根據以下本週新聞標題清單，撰寫一份「AI 投資週報」。

請直接輸出 JSON 格式 (不要 Markdown code block)：
{
  "sentiment_score": 0.5,
  "summary": "請用條列式總結本週 3-5 個市場重磅事件（支援 Discord 格式，如 **粗體**）。",
  "entities": ["關鍵詞1", "關鍵詞2", "關鍵詞3"]
}

新聞清單：
${blob}`;

    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "You are a helpful financial analyst." }, { role: "user", content: prompt }],
            model: openaiModel || "gpt-4o",
            response_format: { type: "json_object" }, // 強制 JSON 模式
        });

        return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
        throw new Error(`OpenAI 分析失敗: ${e.message}`);
    }
}

module.exports = { getSummary, getOpenAISummary };