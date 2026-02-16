const axios = require('axios');
const fs = require('fs'); // 🟢 引入 fs
const { discordWebhook } = require('./config');

function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 🟢 補回這個遺失的函式
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

async function sendDiscord(content) {
    if (!discordWebhook) return;
    try {
        const chunks = content.match(/[\s\S]{1,1900}/g) || [];
        for (const chunk of chunks) {
            await axios.post(discordWebhook, { content: chunk });
            await sleep(1000);
        }
    } catch (e) {
        log('⚠️', `Discord 發送失敗: ${e.message}`);
    }
}

// 🟢 記得導出
module.exports = { log, sleep, ensureDir, sendDiscord };