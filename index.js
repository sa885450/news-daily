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

const { generateHTMLReport } = require('./ui'); 

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {});

// 1. 初始化資料庫
const db = new Database('news_bot.db');
db.exec(`CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, title TEXT, source TEXT, category TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

// 2. 設定區
const CONFIG = {
    geminiKey: process.env.GEMINI_API_KEY,
    discordWebhook: process.env.DISCORD_WEBHOOK_URL,
    sources: process.env.NEWS_SOURCES ? JSON.parse(process.env.NEWS_SOURCES) : [],
    includeRegex: (process.env.KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== ""),
    excludeRegex: (process.env.EXCLUDE_KEYWORDS || "").split(',').map(k => new RegExp(k.trim(), 'i')).filter(r => r.source !== ""),
    modelCandidates: ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"],
    similarityThreshold: 0.6,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' }
};

const genAI = new GoogleGenerativeAI(CONFIG.geminiKey);
const parser = new Parser();

// --- Log 輔助小工具 ---
function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

// --- 資料庫與工具功能 ---
function isAlreadyRead(url) { return !!db.prepare('SELECT id FROM articles WHERE url = ?').get(url); }
function saveArticle(title, url, source) { db.prepare('INSERT INTO articles (title, url, source) VALUES (?, ?, ?)').run(title, url, source); }
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

// ==========================================
// 🟢 霸王版：鉅亨網多重分類 API (台股/美股/科技)
// ==========================================
async function fetchCnyesAPI(pagesToFetch = 2) {
    const categories = ['tw_stock', 'wd_stock', 'tech']; // 台股, 國際股, 科技
    const limit = 30; 
    
    let allNews = [];
    let fetchedIds = new Set(); 

    log('🔍', `準備抓取鉅亨網 API：共 ${categories.length} 個分類，每分類 ${pagesToFetch} 頁...`);

    for (const cat of categories) {
        for (let page = 1; page <= pagesToFetch; page++) {
            const url = `https://api.cnyes.com/media/api/v1/newslist/category/${cat}?page=${page}&limit=${limit}`;
            try {
                const response = await axios.get(url, {
                    headers: {
                        'Origin': 'https://news.cnyes.com/',
                        'Referer': 'https://news.cnyes.com/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 15000
                });

                if (response.data && response.data.items && response.data.items.data) {
                    for (const news of response.data.items.data) {
                        // 避免不同分類抓到重複新聞
                        if (!fetchedIds.has(news.newsId)) {
                            fetchedIds.add(news.newsId);
                            allNews.push({
                                title: news.title,
                                link: `https://news.cnyes.com/news/id/${news.newsId}`,
                                contentSnippet: news.summary, 
                                // API 自帶內文，去除 HTML 標籤後截斷
                                content: news.content ? news.content.replace(/<[^>]*>?/gm, '').substring(0, 2500) : '', 
                                pubDate: new Date(news.publishAt * 1000).toISOString(),
                                source: `鉅亨網(${cat})` 
                            });
                        }
                    }
                }
                // 禮貌性延遲
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                log('⚠️', `鉅亨網 API (${cat} 第 ${page} 頁) 抓取失敗: ${e.message}`);
            }
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

// 🟢 修正版 getSummary：強制 JSON 輸出 + 禁止摘要出現 ID
async function getSummary(newsData) {
    log('🧠', `正在分析 ${newsData.length} 則新聞...`);
    const blob = newsData.map((n, i) => `[ID:${i}] [來源: ${n.source}] ${n.title}\n${n.content}`).join('\n\n---\n\n');
    
    const prompt = `你是一位資深金融分析師與網站編輯。請執行以下任務：
1. **市場總體情緒**：給予一個總結性的情緒分數（範圍 -1.0 到 +1.0），並配上圖示（🟢 利多 / 🔴 利空 / ⚪ 中立）。
2. **核心事件分析**：挑選 3-5 個關鍵事件，請用流暢的敘述風格。
   **重要規範**：摘要文本中請勿出現 [ID:x] 的引用標記，直接敘述新聞內容即可。
3. **新聞分類標記**：請務必為每一則新聞打上分類標籤，僅限從【科技、金融、社會、其他】這四個選項中選一個。

**最後輸出要求**：
請在摘要的最後面，輸出一個 JSON 區塊來標記分類，格式如下：
\`\`\`json
[
  {"id": 0, "category": "科技"},
  {"id": 1, "category": "金融"}
]
\`\`\`
請確保 JSON 格式正確，包含所有新聞 ID。

新聞內容如下：
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
    const reportsDir = './reports';
    if (!fs.existsSync(reportsDir)) return;
    const files = fs.readdirSync(reportsDir);
    const now = Date.now();
    const expiry = 7 * 24 * 60 * 60 * 1000;
    files.forEach(file => {
        const filePath = path.join(reportsDir, file);
        const stats = fs.statSync(filePath);
        // 注意：我們不會刪除 index.html，只刪除舊格式的檔案
        if (file !== 'index.html' && now - stats.mtimeMs > expiry) {
            fs.unlinkSync(filePath);
            log('🧹', `已清理過期報表: ${file}`);
        }
    });
}

function pushToGitHub() {
    log('📤', "正在執行 Git Push...");
    // 🟢 絕對路徑：確保 PM2 能找到 Git
    const gitPath = '"C:\\Program Files\\Git\\cmd\\git.exe"'; 

    try {
        execSync(`${gitPath} add news_bot.db reports/`);
        execSync(`${gitPath} commit -m "🤖 Local Bot Update: ${new Date().toLocaleString()}"`);
        execSync(`${gitPath} push origin main`);
        log('✅', 'Git Push 成功！網站已更新。');
    } catch (error) {
        const stdoutMsg = error.stdout ? error.stdout.toString() : '';
        const stderrMsg = error.stderr ? error.stderr.toString() : '';
        const errMsg = stderrMsg || stdoutMsg || error.message;

        if (errMsg.includes('nothing to commit') || stdoutMsg.includes('nothing to commit') || errMsg.includes('沒有變更')) {
            log('💤', '資料庫無變動，跳過上傳。');
        } else {
            log('❌', `Git Push 失敗: ${errMsg.trim()}`);
        }
    }
}

// --- 核心任務函式 ---
async function runTask() {
    log('🚀', `啟動排程任務...`);
    cleanupOldReports(); 
    
    let allMatchedNews = [];
    let scanCount = 0; 
    let newCount = 0;  

    if (CONFIG.sources.length === 0) {
        log('⚠️', "警告：未設定 NEWS_SOURCES，請檢查 .env 檔案。");
    }

    // ==========================================
    // 🟢 1. 處理特殊通道：鉅亨網 API (多分類版)
    // ==========================================
    const cnyesNews = await fetchCnyesAPI(2); // 抓 2 頁
    scanCount += cnyesNews.length;

    for (const item of cnyesNews) {
        if (isAlreadyRead(item.link)) continue;
        
        const targetText = `${item.title} ${item.contentSnippet || ""}`;
        if (matchesAny(targetText, CONFIG.excludeRegex)) {
            saveArticle(item.title, item.link, item.source);
            continue;
        }

        if ((!process.env.KEYWORDS) || matchesAny(targetText, CONFIG.includeRegex)) {
            // API 已有內文，直接使用
            allMatchedNews.push({ 
                source: item.source, 
                title: item.title, 
                content: item.content, 
                url: item.link 
            });
            newCount++;
        }
        saveArticle(item.title, item.link, item.source);
    }

    // ==========================================
    // 🔵 2. 處理常規通道：其他網站的 RSS
    // ==========================================
    for (const source of CONFIG.sources) {
        if (source.name === "鉅亨網") continue; // 避開 RSS 裡的鉅亨網
        
        const feed = await fetchRSS(source.url);
        scanCount += feed.items.length;
        
        for (const item of feed.items) {
            if (isAlreadyRead(item.link)) continue;
            
            const targetText = `${item.title} ${item.contentSnippet || ""}`;
            if (matchesAny(targetText, CONFIG.excludeRegex)) {
                saveArticle(item.title, item.link, source.name);
                continue;
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
            
            // 🟢 修正：使用更穩定的 JSON 解析邏輯 (修復 ID0/ID1 與 其他分類問題)
            let summaryToShow = fullSummary;
            try {
                // 嘗試抓取 JSON 區塊
                const jsonMatch = fullSummary.match(/```json([\s\S]*?)```/) || fullSummary.match(/\[\s*\{.*\}\s*\]/s);
                
                if (jsonMatch) {
                    const jsonStr = jsonMatch[1] || jsonMatch[0];
                    const categories = JSON.parse(jsonStr);
                    
                    // 建立 ID -> Category 的對照表
                    const catMap = {};
                    categories.forEach(c => {
                        if (c.id !== undefined) catMap[c.id] = c.category;
                    });

                    // 填入分類 (若沒對應到則預設為"其他")
                    allMatchedNews.forEach((n, i) => { n.category = catMap[i] || "其他"; });

                    // 將 JSON 從顯示的摘要中移除，避免網頁顯示原始碼
                    summaryToShow = fullSummary.replace(jsonMatch[0], "").trim();
                    summaryToShow = summaryToShow.replace(/```json/g, "").replace(/```/g, "").trim();
                } else {
                    log('⚠️', "AI 未回傳有效的 JSON 分類表，將全部標記為「其他」。");
                    allMatchedNews.forEach(n => n.category = "其他");
                }
            } catch (e) {
                log('❌', `JSON 解析失敗: ${e.message}`);
                allMatchedNews.forEach(n => n.category = "其他");
            }

            // 生成網頁
            const { fileName } = generateHTMLReport(summaryToShow, allMatchedNews);
            
            pushToGitHub();

            const githubUser = "sa885450";
            const repoName = "news-daily";
            const cloudUrl = `https://${githubUser}.github.io/${repoName}/reports/`; 

            await sendDiscord(`**📅 本機排程報告 (${new Date().toLocaleTimeString()})**\n\n${summaryToShow}\n\n🌐 **儀表板連結**: ${cloudUrl}`);
            log('✅', "任務圓滿完成！");
        } catch (err) { log('❌', `處理失敗: ${err.message}`); }
    } else {
        log('💤', "無新符合關鍵字的新聞，跳過處理。");
    }

    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + 1);
    nextRun.setMinutes(0);
    nextRun.setSeconds(0);
    log('🔜', `等待下一次排程... (預計 ${nextRun.toLocaleTimeString()})`);
}

// --- 排程設定 ---
log('🕰️', "新聞機器人主程式已啟動 (PM2 Mode)");
log('📅', "排程設定：每小時 00 分執行一次");

// 心跳檢查：每 10 分鐘
cron.schedule('*/10 * * * *', () => {
    log('💓', '系統待命運作中 (Heartbeat)...');
});

// 主排程：每小時 00 分
cron.schedule('0 * * * *', () => {
    runTask();
});