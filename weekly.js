require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Database = require('better-sqlite3');
const axios = require('axios');

const db = new Database('news_bot.db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 修正後的模型清單
const modelCandidates = [
    "gemini-1.5-pro",          // 最穩定的 Pro 名稱
    "gemini-2.0-flash",        // 2.0 閃電版
    "gemini-1.5-flash"         // 1.5 閃電版
];

// 輔助函式：延遲執行
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getWeeklyDeepDive(articles) {
    const contentBlob = articles.map(a => `[${a.source}] ${a.title}`).join('\n');
    const prompt = `你是一位資深戰略分析師。以下是過去一週累積的 ${articles.length} 則新聞標題：\n\n${contentBlob}\n\n請進行「每週深度趨勢複盤」：\n1. 本週三大主題\n2. 潛在關聯性分析\n3. 下週關注建議\n\n請使用專業繁體中文 Markdown 格式。`;

    for (const modelName of modelCandidates) {
        try {
            console.log(`🧠 嘗試使用模型: ${modelName} ...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return (await result.response).text();
        } catch (e) {
            console.warn(`⚠️ ${modelName} 失敗: ${e.message}`);
            if (e.message.includes("429")) {
                console.log("⏳ 觸發配額限制，等待 10 秒後嘗試下一個模型...");
                await sleep(10000); // 遇到 429 暫停 10 秒
            }
        }
    }
    throw new Error("所有模型皆無法使用，請檢查 Google AI Studio 配額。");
}

async function main() {
    console.log(`📅 啟動週報: ${new Date().toLocaleString()}`);
    
    const last7Days = db.prepare(`
        SELECT title, source FROM articles 
        WHERE created_at >= date('now', '-7 days')
        ORDER BY created_at DESC LIMIT 50
    `).all();

    if (last7Days.length === 0) {
        console.log("⚠️ 無資料，跳過。");
        db.close();
        return;
    }

    try {
        const deepDive = await getWeeklyDeepDive(last7Days);
        await axios.post(process.env.DISCORD_WEBHOOK_URL, {
            content: `## 🏆 本週深度趨勢回顧 (共 ${last7Days.length} 則)\n\n${deepDive}`
        });
        console.log("✅ 週報發送成功！");
    } catch (err) {
        console.error("❌ 最終失敗:", err.message);
    } finally {
        db.close();
    }
}
main();
