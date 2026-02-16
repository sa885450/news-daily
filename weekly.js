require('dotenv').config();
const cron = require('node-cron');
const db = require('./lib/db');
const { getOpenAISummary } = require('./lib/ai'); // 🟢 改用 OpenAI 函式
const { sendDiscord, log } = require('./lib/utils');

async function runWeeklyTask() {
    log('📅', '開始執行週報任務 (OpenAI 版)...');

    try {
        // 1. 從資料庫撈取本週新聞
        const articles = db.getWeeklyArticles();
        
        if (!articles || articles.length === 0) {
            log('💤', '過去 7 天無新聞資料，跳過週報。');
            return;
        }

        log('📊', `本週累積新聞: ${articles.length} 則，準備進行 AI 濃縮...`);

        // 2. 只取最近的 80 則代表性新聞 (OpenAI 處理能力較強，可以餵多一點標題)
        const selectedArticles = articles.slice(0, 80);

        // 3. 呼叫 OpenAI 進行分析
        const aiResult = await getOpenAISummary(selectedArticles);

        // 4. 格式化週報內容
        const weeklyReport = `
# 📅 **AI 投資週報 (Weekly Insight)**
---
**本週情緒指數**: ${aiResult.sentiment_score > 0 ? '🔥' : '❄️'} ${aiResult.sentiment_score}

## 📝 **一週重點回顧**
${aiResult.summary}

## 🤖 **本週關鍵實體**
${aiResult.entities ? aiResult.entities.map(e => `#${e}`).join(' ') : '無'}

---
*Powered by OpenAI ${process.env.OPENAI_MODEL || 'GPT-4o'}*
        `.trim();

        // 5. 發送
        await sendDiscord(weeklyReport);
        log('✅', '週報發送完成！');

    } catch (e) {
        log('❌', `週報執行失敗: ${e.message}`);
        console.error(e);
    }
}

// 設定排程：每週五 下午 5:00 執行
log('🕰️', '週報機器人已就緒 (每週五 17:00)');
cron.schedule('0 17 * * 5', () => runWeeklyTask());

// 測試用：重啟後馬上跑一次
// runWeeklyTask();