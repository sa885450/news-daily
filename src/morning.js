require('dotenv').config();
const { getMorningBriefingData } = require('./lib/mcp_us_stock');
const { getMorningSummary } = require('./lib/ai');
const { discordMorningWebhook } = require('./lib/config');
const { log, sendDiscord } = require('./lib/utils');
const cron = require('node-cron');
const { version } = require('../package.json');

let isTaskRunning = false;

async function runMorningTask() {
    if (isTaskRunning) {
        log('⚠️', '晨報任務正在執行中，跳過重複觸發。');
        return;
    }
    isTaskRunning = true;
    log('🌅', `啟動美股晨報任務 (v${version})`);

    try {
        // 1. 獲取所有需要的情報資料 (透過 MCP 介面)
        const briefingData = await getMorningBriefingData();
        log('📊', `已取得晨報數據：新聞 ${briefingData.overnight_news_count} 則`);

        // 2. 呼叫 AI 產生專屬晨報
        log('🧠', 'AI 分析中...');
        const aiResult = await getMorningSummary(briefingData);

        // 3. 組合並發送 Discord 訊息
        const dateStr = new Date().toLocaleDateString('zh-TW');
        const icon = aiResult.sentiment_score > 0 ? '🔥' : (aiResult.sentiment_score < -0.3 ? '❄️' : '⚖️');
        
        let discordMsg = `# 🌅 **美股晨報與台股開盤戰略** (${dateStr})
---
**市場情緒**: ${icon} ${aiResult.sentiment_score}

## 📝 **隔夜摘要與台股影響**
${aiResult.summary.replace(/<[^>]*>?/gm, '')} // 移除 HTML 標籤讓 Discord 顯示更乾淨

## 🎯 **今日戰術建議**
- **行動**: **${aiResult.tactical_advice.action}** (信心: ${aiResult.tactical_advice.confidence}%)
- **指引**: ${aiResult.tactical_advice.rationale}

## ⚡ **重大市場事件**
`;
        
        if (aiResult.events && aiResult.events.length > 0) {
            aiResult.events.forEach(e => {
                const impactIcon = e.impact === '正面' ? '🟢' : (e.impact === '負面' ? '🔴' : '⚪');
                discordMsg += `- ${impactIcon} **${e.title}**: ${e.summary}\n`;
            });
        }

        // 發送到專屬頻道 (或預設 webhook)
        log('📤', '發送晨報至頻道...');
        await sendDiscord(discordMsg, discordMorningWebhook);
        log('✅', '晨報發送完成');

    } catch (e) {
        log('❌', `晨報產生失敗: ${e.message}`);
    } finally {
        isTaskRunning = false;
    }
}

// 預設為每日 06:30 觸發
const cronSchedule = process.env.MORNING_CRON_SCHEDULE || '30 6 * * 1-5';
log('🌅', `晨報系統啟動 (排程: ${cronSchedule})`);
cron.schedule(cronSchedule, () => runMorningTask());

// 支援命令列強制觸發
if (process.argv.includes('--now')) {
    log('⚡', '手動觸發晨報...');
    runMorningTask();
}
