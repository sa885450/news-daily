require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Database = require('better-sqlite3');
const axios = require('axios');
const cron = require('node-cron'); // 🟢 新增：排程控制套件

const db = new Database('news_bot.db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 建議把 flash 放前面省配額，避免 429 報錯
const modelCandidates = [
    "gemini-1.5-flash",        
    "gemini-2.0-flash",        
    "gemini-1.5-pro"
];

// --- 🟢 新增：Log 輔助小工具 ---
function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

// 輔助函式：延遲執行
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getWeeklyDeepDive(articles) {
    const contentBlob = articles.map(a => `[${a.source}] ${a.title}`).join('\n');
    const prompt = `你是一位資深戰略分析師。以下是過去一週累積的 ${articles.length} 則新聞標題：\n\n${contentBlob}\n\n請進行「每週深度趨勢複盤」：\n1. 本週三大主題\n2. 潛在關聯性分析\n3. 下週關注建議\n\n請使用專業繁體中文 Markdown 格式。`;

    for (const modelName of modelCandidates) {
        try {
            log('🧠', `嘗試使用模型: ${modelName} ...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return (await result.response).text();
        } catch (e) {
            log('⚠️', `${modelName} 失敗: ${e.message}`);
            if (e.message.includes("429") || e.message.includes("quota")) {
                log('⏳', "觸發配額限制，等待 10 秒後嘗試下一個模型...");
                await sleep(10000); 
            }
        }
    }
    throw new Error("所有模型皆無法使用，請檢查 Google AI Studio 配額。");
}

async function runWeeklyTask() {
    log('📅', `啟動週報生成任務...`);
    
    // 抓取過去 7 天的資料，稍微放寬到 100 筆，讓 AI 總結更全面
    const last7Days = db.prepare(`
        SELECT title, source FROM articles 
        WHERE created_at >= date('now', '-7 days')
        ORDER BY created_at DESC LIMIT 100
    `).all();

    if (last7Days.length === 0) {
        log('⚠️', "無資料，跳過本次週報。");
        return; // 🔴 移除 db.close()，讓程式繼續活著
    }

    try {
        const deepDive = await getWeeklyDeepDive(last7Days);
        
        if (!process.env.DISCORD_WEBHOOK_URL) {
            log('❌', "未設定 DISCORD_WEBHOOK_URL，無法發送 Discord。");
            return;
        }

        await axios.post(process.env.DISCORD_WEBHOOK_URL, {
            content: `## 🏆 本週深度趨勢回顧 (共分析 ${last7Days.length} 則)\n\n${deepDive}`
        });
        log('✅', "週報發送成功！");
    } catch (err) {
        log('❌', `最終失敗: ${err.message}`);
    }
}

// --- 🟢 排程設定 ---
log('🕰️', "週報機器人已啟動 (PM2 Mode)，正在背景待命...");
log('📅', "排程設定：每週日早上 9:00 執行");

// 預設排程：每週日早上 9:00 執行
// Cron 格式：分 時 日 月 星期 (0 代表星期日)
cron.schedule('0 9 * * 0', () => {
    runWeeklyTask();
});

// 心跳檢查 (每天中午 12 點印一行，證明它還活著就好)
cron.schedule('0 12 * * *', () => {
    log('💓', '週報系統待命運作中 (Heartbeat)...');
});

// 💡 測試用：取消下面這行的註解，存檔重啟後就會馬上發送一篇週報
// runWeeklyTask();