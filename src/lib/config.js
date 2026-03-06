require('dotenv').config();
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');

module.exports = {
    // API Keys
    geminiKey: process.env.GEMINI_API_KEY,
    geminiKeys: (process.env.GEMINI_KEY_POOL || process.env.GEMINI_API_KEY || "").split(/[,,;]/).map(k => k.trim()).filter(k => k),
    // 🟢 v10.0.0: 深度戰略專用金鑰 (Deep Mode)
    geminiStrategicKey: process.env.GEMINI_STRATEGIC_KEY || process.env.GEMINI_API_KEY,
    // 🟢 新增：週報專用金鑰 (若未設定，則 fallback 回主金鑰)
    geminiWeeklyKey: process.env.GEMINI_WEEKLY_API_KEY || process.env.GEMINI_API_KEY,
    // 🟢 v11.1.0: 戰術報告標的配置 (從環境變數讀取，或使用預設)
    tacticalSymbols: (process.env.TACTICAL_SYMBOLS || '2330.TW,0050.TW,BTC-USD,GC=F'),
    // 🟢 v11.3.0: 持倉成本配置 (格式: "2330.TW:980,0050.TW:185")
    myCosts: (process.env.MY_COSTS || "").split(',').reduce((acc, item) => {
        const [symbol, cost] = item.split(':');
        if (symbol && cost) acc[symbol.trim()] = parseFloat(cost);
        return acc;
    }, {}),
    discordWebhook: process.env.DISCORD_WEBHOOK_URL,
    discordAlertWebhook: process.env.DISCORD_ALERT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL,

    // 新聞來源與關鍵字
    sources: process.env.NEWS_SOURCES ? JSON.parse(process.env.NEWS_SOURCES) : [],
    rawKeywords: (process.env.KEYWORDS || "").split(',').map(k => k.trim()).filter(k => k),
    includeRegex: (process.env.KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),
    excludeRegex: (process.env.EXCLUDE_KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),

    // AI 模型設定
    modelCandidates: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"],
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.8,

    // 爬蟲偽裝 Headers
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
    dbPath: path.join(rootDir, 'data', 'news_bot.db'),
    crawlerDbPath: path.join(rootDir, 'data', 'crawler.db'),
    publicDir: path.join(rootDir, 'public'),

    // GitHub Pages
    githubUser: "sa885450",
    repoName: "news-daily"
};