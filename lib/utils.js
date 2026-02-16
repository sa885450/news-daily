const axios = require('axios');
const fs = require('fs');
const { discordWebhook } = require('./config');

function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

async function sendDiscord(content) {
    // 🟢 檢查點 1: Webhook URL 是否存在
    if (!discordWebhook) {
        log('⚠️', '未設定 DISCORD_WEBHOOK_URL，跳過發送通知。');
        return;
    }

    try {
        // Discord 限制每則訊息 2000 字，稍微留點緩衝設為 1900
        const chunks = content.match(/[\s\S]{1,1900}/g) || [];
        
        for (const [index, chunk] of chunks.entries()) {
            // 🟢 檢查點 2: 印出正在發送的進度
            // log('📨', `正在發送 Discord 訊息 (片段 ${index + 1}/${chunks.length})...`);
            
            await axios.post(discordWebhook, { content: chunk });
            await sleep(1000); // 避免 Rate Limit
        }
        // log('✅', 'Discord 訊息發送成功！');

    } catch (e) {
        // 🟢 檢查點 3: 詳細錯誤輸出
        if (e.response) {
            // 伺服器有回應，但狀態碼不是 2xx
            log('❌', `Discord 發送失敗 [Status ${e.response.status}]: ${JSON.stringify(e.response.data)}`);
        } else if (e.request) {
            // 請求已發出但沒收到回應
            log('❌', 'Discord 發送失敗: 無法連線到 Discord 伺服器 (Timeout/Network Error)');
        } else {
            // 其他錯誤
            log('❌', `Discord 發送失敗: ${e.message}`);
        }
    }
}

module.exports = { log, sleep, ensureDir, sendDiscord };