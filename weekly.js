const cron = require('node-cron'); 
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('./lib/config');
const { log, sendDiscord, sleep } = require('./lib/utils');
const { getWeeklyArticles } = require('./lib/db');

const genAI = new GoogleGenerativeAI(config.geminiKey);

async function getWeeklyDeepDive(articles) {
    const contentBlob = articles.map(a => `[${a.source}] ${a.title}`).join('\n');
    const prompt = `你是一位資深戰略分析師。以下是過去一週累積的 ${articles.length} 則新聞標題：\n\n${contentBlob}\n\n請進行「每週深度趨勢複盤」：\n1. 本週三大主題\n2. 潛在關聯性分析\n3. 下週關注建議\n\n請使用專業繁體中文 Markdown 格式。`;

    for (const modelName of config.modelCandidates) {
        try {
            log('🧠', `嘗試使用模型: ${modelName} ...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return (await result.response).text();
        } catch (e) {
            log('⚠️', `${modelName} 失敗: ${e.message}`);
            if (e.message.includes("429") || e.message.includes("quota")) {
                await sleep(10000); 
            }
        }
    }
    throw new Error("週報分析失敗");
}

async function runWeeklyTask() {
    log('📅', `啟動週報生成任務...`);
    
    // 使用 DB 模組的查詢功能
    const last7Days = getWeeklyArticles();

    if (last7Days.length === 0) {
        log('⚠️', "無資料，跳過本次週報。");
        return; 
    }

    try {
        const deepDive = await getWeeklyDeepDive(last7Days);
        
        await sendDiscord(config.discordWebhook, `## 🏆 本週深度趨勢回顧 (共分析 ${last7Days.length} 則)\n\n${deepDive}`);
        log('✅', "週報發送成功！");
    } catch (err) {
        log('❌', `最終失敗: ${err.message}`);
    }
}

// 排程
log('🕰️', "週報機器人已啟動 (Modular Version)");
cron.schedule('0 9 * * 0', runWeeklyTask);
cron.schedule('0 12 * * *', () => log('💓', '週報系統待命...'));