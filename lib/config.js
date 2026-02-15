require('dotenv').config();
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

module.exports = {
    // API Keys & Webhooks
    geminiKey: process.env.GEMINI_API_KEY,
    discordWebhook: process.env.DISCORD_WEBHOOK_URL,
    
    // 新聞來源與關鍵字
    sources: process.env.NEWS_SOURCES ? JSON.parse(process.env.NEWS_SOURCES) : [],
    includeRegex: (process.env.KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),
    excludeRegex: (process.env.EXCLUDE_KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),
    
    // AI 模型設定
    modelCandidates: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"],
    similarityThreshold: 0.6,
    
    // 爬蟲設定
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' },
    
    // 路徑設定
    gitPath: process.env.GIT_EXECUTABLE_PATH || '"C:\\Program Files\\Git\\cmd\\git.exe"',
    dbPath: path.join(rootDir, 'news_bot.db'),
    publicDir: path.join(rootDir, 'public'),
    
    // GitHub Pages 設定 (用於 Discord 通知)
    githubUser: "sa885450",
    repoName: "news-daily"
};