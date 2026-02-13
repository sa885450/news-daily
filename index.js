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
const shell = require('shelljs');

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

// --- 🟢 新增：Log 輔助小工具 ---
function log(icon, message) {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    console.log(`[${time}] ${icon} ${message}`);
}

// --- 工具功能 ---
function isAlreadyRead(url) { return !!db.prepare('SELECT id FROM articles WHERE url = ?').get(url); }
function saveArticle(title, url, source) { db.prepare('INSERT INTO articles (title, url, source) VALUES (?, ?, ?)').run(title, url, source); }
function matchesAny(text, regexArray) { return regexArray.length === 0 ? false : regexArray.some(re => re.test(text)); }

async function fetchRSS(url) {
    try {
        const response = await axios.get(url, { headers: CONFIG.headers, timeout: 15000 });
        return await parser.parseString(response.data);
    } catch (e) { 
        log('⚠️', `RSS 讀取失敗: ${url}`); // 使用新的 log 格式
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

async function sendDiscord(content) {
    if (!CONFIG.discordWebhook) return;
    const chunks = content.match(/[\s\S]{1,1900}/g) || [];
    for (const chunk of chunks) {
        await axios.post(CONFIG.discordWebhook, { content: chunk });
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function getSummary(newsData) {
    log('🧠', `正在分析 ${newsData.length} 則新聞...`);
    const blob = newsData.map((n, i) => `[ID:${i}] [來源: ${n.source}] ${n.title}\n${n.content}`).join('\n\n---\n\n');
    
    const prompt = `你是一位資深金融分析師與網站編輯。請執行以下任務：
1. **市場總體情緒**：給予一個總結性的情緒分數（範圍 -1.0 到 +1.0），並配上圖示（🟢 利多 / 🔴 利空 / ⚪ 中立）。
2. **核心事件分析**：挑選 3-5 個關鍵事件。
3. **新聞分類標記**：請務必為每一則新聞打上分類標籤，僅限從【科技、金融、社會、其他】這四個選項中選一個。
   **格式嚴格要求**：請在摘要最後一行輸出分類區塊：
   CATEGORIES_START [ID:0]:分類, [ID:1]:分類, [ID:2]:分類 CATEGORIES_END

內容如下：
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
        if (now - stats.mtimeMs > expiry) {
            fs.unlinkSync(filePath);
            log('🧹', `已清理過期報表: ${file}`);
        }
    });
}

function pushToGitHub() {
    log('📤', "正在執行 Git Push...");
    if (!shell.which('git')) {
        log('❌', '系統未安裝 git，無法上傳！');
        return;
    }
    shell.exec('git add news_bot.db reports/');
    shell.exec(`git commit -m "🤖 Local Bot Update: ${new Date().toLocaleString()}"`);
    const pushResult = shell.exec('git push');

    if (pushResult.code !== 0) {
        log('❌', 'Git Push 失敗，請檢查網路或權限。');
    } else {
        log('✅', 'Git Push 成功！網站已更新。');
    }
}

// --- 核心任務函式 ---
async function runTask() {
    log('🚀', `啟動排程任務...`);
    cleanupOldReports(); 
    
    let allMatchedNews = [];
    let scanCount = 0; // 統計用
    let newCount = 0;  // 統計用

    if (CONFIG.sources.length === 0) {
        log('⚠️', "警告：未設定 NEWS_SOURCES，請檢查 .env 檔案。");
    }

    for (const source of CONFIG.sources) {
        // log('📦', `掃描來源: ${source.name}`); // 這行可以註解掉以免 log 太多
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
            
            const catMatch = fullSummary.match(/CATEGORIES_START (.*?) CATEGORIES_END/s);
            let summaryToShow = fullSummary;
            
            if (catMatch) {
                summaryToShow = fullSummary.replace(/CATEGORIES_START .*? CATEGORIES_END/s, "").trim();
                const catMap = {};
                catMatch[1].split(',').forEach(pair => {
                    const [idPart, cat] = pair.split(':');
                    if (idPart && cat) {
                        const id = idPart.match(/\d+/);
                        if (id) catMap[id[0]] = cat.trim();
                    }
                });
                allMatchedNews.forEach((n, i) => { n.category = catMap[i] || "其他"; });
            } else {
                allMatchedNews.forEach(n => n.category = "其他");
            }

            const { fileName } = generateHTMLReport(summaryToShow, allMatchedNews);
            
            pushToGitHub();

            const githubUser = "sa885450";
            const repoName = "news-daily";
            const cloudUrl = `https://${githubUser}.github.io/${repoName}/reports/${fileName}`;

            await sendDiscord(`**📅 本機排程報告 (${new Date().toLocaleTimeString()})**\n\n${summaryToShow}\n\n🌐 **儀表板連結**: ${cloudUrl}`);
            log('✅', "任務圓滿完成！");
        } catch (err) { log('❌', `處理失敗: ${err.message}`); }
    } else {
        log('💤', "無新符合關鍵字的新聞，跳過處理。");
    }

    // 🟢 顯示下次執行時間
    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + 1);
    nextRun.setMinutes(13);
    nextRun.setSeconds(0);
    log('🔜', `等待下一次排程... (預計 ${nextRun.toLocaleTimeString()})`);
}

// --- 排程設定 ---
log('🕰️', "新聞機器人主程式已啟動 (PM2 Mode)");
log('📅', "排程設定：每小時 13 分執行一次");

// 🟢 心跳檢查：每 30 分鐘印出一行 Log，證明程式沒死
cron.schedule('*/10 * * * *', () => {
    log('💓', '系統待命運作中 (Heartbeat)...');
});

// 主排程
cron.schedule('13 * * * *', () => {
    runTask();
});

// 啟動時立即跑一次測試 (想測的話把下面這行的 // 拿掉)
// runTask();