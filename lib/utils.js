const axios = require('axios');
const { discordWebhook } = require('./config'); // 記得確認 config.js 有導出 discordWebhook

function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 🟢 新增：共用的 Discord 發送函式
async function sendDiscord(content) {
    if (!discordWebhook) return;
    try {
        // Discord 有 2000 字限制，這裡做簡單的分段處理
        const chunks = content.match(/[\s\S]{1,1900}/g) || [];
        for (const chunk of chunks) {
            await axios.post(discordWebhook, { content: chunk });
            await sleep(1000); // 避免觸發 Rate Limit
        }
    } catch (e) {
        log('⚠️', `Discord 發送失敗: ${e.message}`);
    }
}

module.exports = { log, sleep, sendDiscord };