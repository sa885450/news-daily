require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const axios = require('axios');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');
const cron = require('node-cron'); 
const { execSync } = require('child_process'); 

// 引入模組
const config = require('./lib/config'); // 假設你有 config，若無則維持原樣
const { generateHTMLReport } = require('./lib/ui'); 

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {});

// 1. 初始化資料庫
const db = new Database('news_bot.db');
db.exec(`CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, title TEXT, source TEXT, category TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

// SQL 預編譯
const checkUrlStmt = db.prepare('SELECT id FROM articles WHERE url = ?');
const insertArticleStmt = db.prepare('INSERT INTO articles (title, url, source, category) VALUES (?, ?, ?, ?)');

// 2. 設定區
const CONFIG = {
    geminiKey: process.env.GEMINI_API_KEY,
    discordWebhook: process.env.DISCORD_WEBHOOK_URL,
    sources: process.env.NEWS_SOURCES ? JSON.parse(process.env.NEWS_SOURCES) : [],
    // 這裡我們保留原始關鍵字字串陣列，方便後續統計
    rawKeywords: (process.env.KEYWORDS || "").split(',').map(k => k.trim()).filter(k => k),
    includeRegex: (process.env.KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),
    excludeRegex: (process.env.EXCLUDE_KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== "(?:)"),
    modelCandidates: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"],
    similarityThreshold: 0.6,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' }
};

const genAI = new GoogleGenerativeAI(CONFIG.geminiKey);
const parser = new Parser();

// --- Log 工具 ---
function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

// --- 資料庫與工具 ---
function isAlreadyRead(url) { return !!checkUrlStmt.get(url); }

function saveArticle(title, url, source, category = '其他') { 
    try { insertArticleStmt.run(title, url, source, category); } catch (e) {}
}

function matchesAny(text, regexArray) { return regexArray.length === 0 ? false : regexArray.some(re => re.test(text)); }

async function fetchRSS(url) {
    try {
        const response = await axios.get(url, { headers: CONFIG.headers, timeout: 15000 });
        return await parser.parseString(response.data);
    } catch (e) { 
        log('⚠️', `RSS 讀取失敗: ${url}`);
        return { items: [] }; 
    }
}

async function fetchContent(url) {
    try {
        await new Promise(r => setTimeout(r, 800));
        const { data } = await axios.get(url, { timeout: 15000, headers: CONFIG.headers });
        const dom = new JSDOM(data, { url, virtualConsole });
        const article = new Readability(dom.window.document).parse();
        return (article && article.textContent) ? article.textContent.trim().substring(0, 2500) : null;
    } catch (e) { return null; }
}

async function fetchCnyesAPI(pagesToFetch = 2) {
    const categories = ['tw_stock', 'wd_stock', 'tech'];
    const limit = 30; 
    let allNews = [];
    let fetchedIds = new Set(); 

    log('🔍', `準備抓取鉅亨網 API...`);

    for (const cat of categories) {
        for (let page = 1; page <= pagesToFetch; page++) {
            const url = `https://api.cnyes.com/media/api/v1/newslist/category/${cat}?page=${page}&limit=${limit}`;
            try {
                const response = await axios.get(url, {
                    headers: { ...CONFIG.headers, 'Origin': 'https://news.cnyes.com/', 'Referer': 'https://news.cnyes.com/' },
                    timeout: 15000
                });
                if (response.data?.items?.data) {
                    for (const news of response.data.items.data) {
                        if (!fetchedIds.has(news.newsId)) {
                            fetchedIds.add(news.newsId);
                            allNews.push({
                                title: news.title,
                                link: `https://news.cnyes.com/news/id/${news.newsId}`,
                                contentSnippet: news.summary, 
                                content: news.content ? news.content.replace(/<[^>]*>?/gm, '').substring(0, 2500) : '', 
                                pubDate: new Date(news.publishAt * 1000).toISOString(),
                                source: `鉅亨網(${cat})` 
                            });
                        }
                    }
                }
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) { log('⚠️', `鉅亨網 API 失敗: ${e.message}`); }
        }
    }
    return allNews;
}

async function sendDiscord(content) {
    if (!CONFIG.discordWebhook) return;
    const chunks = content.match(/[\s\S]{1,1900}/g) || [];
    for (const chunk of chunks) {
        await axios.post(CONFIG.discordWebhook, { content: chunk });
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function getSummary(newsData) {
    log('🧠', `正在執行深度金融分析 (${newsData.length} 則新聞)...`);
    const blob = newsData.map((n, i) => `[ID:${i}] [來源: ${n.source}] ${n.title}\n${n.content}`).join('\n\n---\n\n');
    
    const prompt = `你是一位頂尖的避險基金經理人與首席分析師。請針對以下新聞進行「高權重市場掃描」：

1. **市場總體情緒**：給予一個精準的情緒分數（-1.0 到 +1.0），配上圖示（🟢 利多 / 🔴 利空 / ⚪ 中立）。
2. **核心事件深度分析**：
   - 請挑選 **5-10 個關鍵事件**，優先挑選影響「大型權值股」、「貨幣政策」或「產業鏈」的新聞。
   - 嚴禁出現 [ID:x] 標記。
3. **💡 投資建議與策略**：
   - 提供 3 點具體的觀察方向或操作策略建議。
4. **新聞分類標記**：請務必為每一則新聞打上分類標籤（科技、金融、社會、其他）。

**最後輸出要求**：
請在摘要最後輸出 JSON 分類區塊：
\`\`\`json
[{"id": 0, "category": "科技"}, ...]
\`\`\`

新聞資料內容：
${blob}`;

    for (const modelName of CONFIG.modelCandidates) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return (await result.response).text();
        } catch (e) { console.warn(`⚠️ ${modelName} 失敗: ${e.message}`); }
    }
    throw new Error("金融分析失敗");
}

function cleanupOldReports() {
    const reportsDir = './public'; // 注意：你已經改為 public 了
    if (fs.existsSync(reportsDir)) {
        // ... 清理舊 HTML 邏輯保持原樣，或依照你的需求修改 ...
    }
    try {
        const result = db.prepare("DELETE FROM articles WHERE created_at < date('now', '-30 days')").run();
        if (result.changes > 0) log('🗄️', `資料庫瘦身完成，刪除 ${result.changes} 筆。`);
    } catch (e) { log('⚠️', `資料庫清理失敗: ${e.message}`); }
}

function pushToGitHub() {
    log('📤', "正在執行 Git Push...");
    const gitPath = process.env.GIT_EXECUTABLE_PATH ? `"${process.env.GIT_EXECUTABLE_PATH}"` : '"C:\\Program Files\\Git\\cmd\\git.exe"';
    try {
        execSync(`${gitPath} add news_bot.db public/`); // 注意：這裡改為 public
        execSync(`${gitPath} commit -m "🤖 Local Bot Update: ${new Date().toLocaleString()}"`);
        execSync(`${gitPath} push origin main`);
        log('✅', 'Git Push 成功！');
    } catch (error) {
        log('💤', '資料庫無變動或是 Push 失敗。');
    }
}

// 🟢 新增功能：計算關鍵字熱度
function calculateKeywordStats(newsData) {
    let stats = {};
    // 初始化計數器
    CONFIG.rawKeywords.forEach(k => stats[k] = 0);

    newsData.forEach(news => {
        const fullText = (news.title + " " + news.content).toLowerCase();
        CONFIG.rawKeywords.forEach(keyword => {
            if (fullText.includes(keyword.toLowerCase())) {
                stats[keyword]++;
            }
        });
    });

    // 排除次數為 0 的關鍵字 (根據需求：有觸發才顯示)
    let filteredStats = {};
    for (const [key, value] of Object.entries(stats)) {
        if (value > 0) filteredStats[key] = value;
    }
    return filteredStats;
}

async function runTask() {
    log('🚀', `啟動排程任務...`);
    cleanupOldReports(); 
    
    let allMatchedNews = [];
    let scanCount = 0; 
    let newCount = 0;  

    if (CONFIG.sources.length === 0) log('⚠️', "警告：未設定 NEWS_SOURCES");

    // 1. 鉅亨網 API
    const cnyesNews = await fetchCnyesAPI(2); 
    scanCount += cnyesNews.length;
    for (const item of cnyesNews) {
        if (isAlreadyRead(item.link)) continue;
        const targetText = `${item.title} ${item.contentSnippet || ""}`;
        if (matchesAny(targetText, CONFIG.excludeRegex)) {
            saveArticle(item.title, item.link, item.source); continue;
        }
        if ((!process.env.KEYWORDS) || matchesAny(targetText, CONFIG.includeRegex)) {
            allMatchedNews.push({ source: item.source, title: item.title, content: item.content, url: item.link });
            newCount++;
        }
        saveArticle(item.title, item.link, item.source);
    }

    // 2. RSS
    for (const source of CONFIG.sources) {
        if (source.name === "鉅亨網") continue;
        const feed = await fetchRSS(source.url);
        scanCount += feed.items.length;
        for (const item of feed.items) {
            if (isAlreadyRead(item.link)) continue;
            const targetText = `${item.title} ${item.contentSnippet || ""}`;
            if (matchesAny(targetText, CONFIG.excludeRegex)) {
                saveArticle(item.title, item.link, source.name); continue;
            }
            if ((!process.env.KEYWORDS) || matchesAny(targetText, CONFIG.includeRegex)) {
                let isDuplicate = false;
                for (let existing of allMatchedNews) {
                    if (stringSimilarity.compareTwoStrings(item.title, existing.title) > CONFIG.similarityThreshold) {
                        isDuplicate = true; break;
                    }
                }
                if (!isDuplicate) {
                    const text = await fetchContent(item.link);
                    if (text) {
                        allMatchedNews.push({ source: source.name, title: item.title, content: text, url: item.link });
                        newCount++;
                    }
                }
            }
            saveArticle(item.title, item.link, source.name);
        }
    }
    
    log('📊', `掃描統計: 掃描 ${scanCount} 則 / 新增 ${newCount} 則`);

    if (allMatchedNews.length > 0) {
        try {
            const fullSummary = await getSummary(allMatchedNews.slice(0, 50));
            
            // JSON 解析與移除
            let summaryToShow = fullSummary;
            try {
                const jsonMatch = fullSummary.match(/```json([\s\S]*?)```/) || fullSummary.match(/\[\s*\{.*\}\s*\]/s);
                if (jsonMatch) {
                    const categories = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                    const catMap = {};
                    categories.forEach(c => { if (c.id !== undefined) catMap[c.id] = c.category; });
                    allMatchedNews.forEach((n, i) => { n.category = catMap[i] || "其他"; });
                    summaryToShow = fullSummary.replace(jsonMatch[0], "").replace(/```json/g, "").replace(/```/g, "").trim();
                } else {
                    allMatchedNews.forEach(n => n.category = "其他");
                }
            } catch (e) {
                log('❌', `JSON 解析失敗: ${e.message}`);
                allMatchedNews.forEach(n => n.category = "其他");
            }

            // 🟢 計算關鍵字熱度
            const keywordStats = calculateKeywordStats(allMatchedNews);

            // 🟢 傳入 keywordStats 給 UI 生成器
            const { fileName } = generateHTMLReport(summaryToShow, allMatchedNews, keywordStats);
            
            pushToGitHub();

            const githubUser = "sa885450"; // 修改為你的帳號
            const repoName = "news-daily";
            const cloudUrl = `https://${githubUser}.github.io/${repoName}/public/`; 

            await sendDiscord(`**📅 本機排程報告**\n\n${summaryToShow}\n\n🌐 **儀表板連結**: ${cloudUrl}`);
            log('✅', "任務圓滿完成！");
        } catch (err) { log('❌', `處理失敗: ${err.message}`); }
    } else {
        log('💤', "無新新聞。");
    }

    log('🔜', `等待下一次排程...`);
}

log('🕰️', "新聞機器人啟動");
cron.schedule('*/10 * * * *', () => log('💓', 'Heartbeat...'));
cron.schedule('0 * * * *', () => runTask());