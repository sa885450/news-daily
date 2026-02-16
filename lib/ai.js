const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { geminiKey, modelCandidates } = require('./config');
const { sleep, log } = require('./utils'); // 🟢 引入工具

const genAI = new GoogleGenerativeAI(geminiKey);

// 🟢 安全設定：盡量不擋新聞內容 (新聞常包含負面詞彙)
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * 🟢 強化版 AI 呼叫函式 (具備重試機制)
 */
async function callGemini(prompt, isJson = true, retryCount = 3) {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        // 嘗試不同的模型 (輪詢)
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

                if (!text) throw new Error("回應為空 (可能被 Safety Filter 阻擋)");

                return isJson ? JSON.parse(text) : text;

            } catch (e) {
                // 如果是 JSON 解析錯誤，通常是 AI 沒吐出正確 JSON，這不算連線錯誤，直接拋出
                if (e instanceof SyntaxError && isJson) {
                    console.warn(`⚠️ ${modelName} 格式錯誤: ${e.message}`);
                    continue; 
                }

                // 如果是最後一次嘗試，才印出錯誤
                if (attempt === retryCount && modelName === modelCandidates[modelCandidates.length - 1]) {
                    console.error(`❌ AI 請求最終失敗: ${e.message}`);
                } else {
                    // console.warn(`⚠️ ${modelName} 失敗 (嘗試 ${attempt}/${retryCount}): ${e.message}`);
                }
            }
        }
        
        // 如果所有模型這輪都失敗，休息一下再重試 (指數退避: 2s, 4s, 8s)
        if (attempt < retryCount) {
            const waitTime = 2000 * Math.pow(2, attempt - 1);
            console.log(`⏳ 等待 ${waitTime}ms 後重試...`);
            await sleep(waitTime);
        }
    }
    throw new Error("AI 模型全數失敗，已達重試上限");
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

    return await callGemini(prompt, true);
}

/**
 * 🟢 週報專用 - 階層式總結 (Map-Reduce)
 * 增加了批次間的延遲，避免 429 錯誤
 */
async function getWeeklySummary(newsData) {
    if (newsData.length <= 40) {
        return await getSummary(newsData, null);
    }

    console.log(`📊 啟動階層式總結：共 ${newsData.length} 則新聞，將分批處理...`);

    // 1. Map 階段：分批產生小摘要 (每 30 則一組)
    const batchSize = 30;
    const summaries = [];
    
    for (let i = 0; i < newsData.length; i += batchSize) {
        const batch = newsData.slice(i, i + batchSize);
        console.log(`  - 正在處理第 ${Math.floor(i/batchSize) + 1} 批次 (${batch.length} 則)...`);
        
        const batchBlob = batch.map(n => `- ${n.title}`).join('\n');
        // Prompt 簡化，降低 AI 負擔
        const prompt = `請閱讀以下新聞標題，條列出 3 個最重要的市場關鍵事件。
新聞：
${batchBlob}
請輸出純文字總結。`;

        try {
            const batchSummary = await callGemini(prompt, false); 
            summaries.push(batchSummary);
            
            // 🟢 關鍵：每批次處理完後，強制休息 3 秒，避免觸發 Rate Limit
            await sleep(3000); 
            
        } catch (e) {
            console.warn(`  ⚠️ 此批次總結失敗，跳過: ${e.message}`);
        }
    }

    if (summaries.length === 0) throw new Error("所有批次摘要皆失敗，無法生成週報");

    // 2. Reduce 階段：合併所有小摘要
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

    // Reduce 階段也需要重試機制
    return await callGemini(finalPrompt, true);
}

module.exports = { getSummary, getWeeklySummary };