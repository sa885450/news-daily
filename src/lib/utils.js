const axios = require('axios');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { discordWebhook } = require('./config');

// 🟢 初始化 Winston Logger
const logDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    try { fs.mkdirSync(logDir); } catch (e) { }
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
    ],
});

// 開發環境輸出到 Console
logger.add(new winston.transports.Console({
    format: winston.format.printf(({ level, message, icon }) => {
        const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        const ico = icon || 'ℹ️';
        return `[${time}] ${ico} ${message}`;
    }),
}));

function log(icon, message) {
    // 保持舊版簽章，轉發給 Winston
    logger.info(message, { icon });
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
    if (!discordWebhook) {
        log('⚠️', '未設定 DISCORD_WEBHOOK_URL，跳過發送通知。');
        return;
    }

    try {
        const chunks = content.match(/[\s\S]{1,1900}/g) || [];

        for (const [index, chunk] of chunks.entries()) {
            await axios.post(discordWebhook, { content: chunk });
            await sleep(1000);
        }

    } catch (e) {
        const errMsg = e.response ? `Status ${e.response.status}` : e.message;
        log('❌', `Discord 發送失敗: ${errMsg}`);
        logger.error(`Discord Error: ${errMsg}`, { stack: e.stack });
    }
}

async function sendDiscordError(errorMsg) {
    if (!discordWebhook) return;
    const content = `🚨 **AI 處理嚴重錯誤** 🚨\n\`\`\`\n${errorMsg}\n\`\`\``;
    await sendDiscord(content);
}

module.exports = { log, sleep, ensureDir, sendDiscord, sendDiscordError };