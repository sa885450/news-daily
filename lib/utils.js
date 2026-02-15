const axios = require('axios');
const fs = require('fs');

function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

function matchesAny(text, regexArray) {
    return regexArray.length === 0 ? false : regexArray.some(re => re.test(text));
}

async function sendDiscord(webhookUrl, content) {
    if (!webhookUrl) return;
    const chunks = content.match(/[\s\S]{1,1900}/g) || [];
    for (const chunk of chunks) {
        await axios.post(webhookUrl, { content: chunk });
        await new Promise(r => setTimeout(r, 1000));
    }
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { log, matchesAny, sendDiscord, ensureDir, sleep };