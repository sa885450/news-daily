require('dotenv').config();
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

module.exports = {
    // API Keys & Webhooks
    geminiKey: process.env.GEMINI_API_KEY,
    discordWebhook: process.env.DISCORD_WEBHOOK_URL,
    
    // 新聞來源與關鍵字
    sources: process.env.NEWS_SOURCES ? JSON.parse(process.env.NEWS_SOURCES) : [],
    // 原始關鍵字陣列 (用於統計熱度)
    rawKeywords: (process.env.KEYWORDS || "").split(',').map(k => k.trim()).filter(k => k),
    // 正規表達式 (用於過濾)
    includeRegex: (process.env.KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),
    excludeRegex: (process.env.EXCLUDE_KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),
    
    // AI 模型設定
    modelCandidates: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"],
    similarityThreshold: 0.6,
    
    // 🟢 修正 1：增強型爬蟲 Headers (解決 technews.tw 阻擋問題)
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.google.com/',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive'
    },
    
    // 路徑設定
    gitPath: process.env.GIT_EXECUTABLE_PATH || '"C:\\Program Files\\Git\\cmd\\git.exe"',
    dbPath: path.join(rootDir, 'news_bot.db'),
    publicDir: path.join(rootDir, 'public'),
    
    // GitHub Pages 設定
    githubUser: "sa885450",
    repoName: "news-daily"
};