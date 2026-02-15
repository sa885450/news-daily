require('dotenv').config();
const { getSummary } = require('./lib/ai');
const { fetchRSS, fetchContent, fetchCnyesAPI } = require('./lib/crawler');
const { generateHTMLReport } = require('./lib/ui');
const { log } = require('./lib/utils');
const { pushToGitHub } = require('./lib/git');
const db = require('./lib/db'); // 🟢 引入更新後的 db
const config = require('./lib/config');
const stringSimilarity = require('string-similarity');
const cron = require('node-cron');

function matchesAny(text, regexArray) { return regexArray.length === 0 ? false : regexArray.some(re => re.test(text)); }

// 計算關鍵字熱度 (保持原樣)
function calculateKeywordStats(newsData) {
    let stats = {};
    config.rawKeywords.forEach(k => stats[k] = 0);
    newsData.forEach(news => {
        const fullText = (news.title + " " + news.content).toLowerCase();
        config.rawKeywords.forEach(keyword => {
            if (fullText.includes(keyword.toLowerCase())) stats[keyword]++;
        });
    });
    let filteredStats = {};
    for (const [key, value] of Object.entries(stats)) {
        if (value > 0) filteredStats[key] = value;
    }
    return filteredStats;
}

async function runTask() {
    log('🚀', `啟動排程任務 (v2.3.0)...`);
    
    // 清理舊資料
    try {
        const result = db.cleanupOldArticles();
        if (result.changes > 0) log('🗄️', `資料庫瘦身完成，刪除 ${result.changes} 筆。`);
    } catch (e) {}

    let allMatchedNews = [];
    let fetchedUrls = new Set(); // 用來避免本次執行重複抓取

    // 1. 抓取鉅亨網
    const cnyesNews = await fetchCnyesAPI(2);
    for (const item of cnyesNews) {
        if (db.isAlreadyRead(item.link)) continue;
        const targetText = `${item.title} ${item.contentSnippet || ""}`;
        if (matchesAny(targetText, config.excludeRegex)) { db.saveArticle(item.title, item.link, item.source); continue; }
        
        if ((!process.env.KEYWORDS) || matchesAny(targetText, config.includeRegex)) {
            allMatchedNews.push({ source: item.source, title: item.title, content: item.content, url: item.link });
            fetchedUrls.add(item.link);
        }
        db.saveArticle(item.title, item.link, item.source);
    }

    // 2. 抓取 RSS
    for (const source of config.sources) {
        if (source.name === "鉅亨網") continue;
        const feed = await fetchRSS(source.url);
        for (const item of feed.items) {
            if (db.isAlreadyRead(item.link) || fetchedUrls.has(item.link)) continue;
            
            const targetText = `${item.title} ${item.contentSnippet || ""}`;
            if (matchesAny(targetText, config.excludeRegex)) { db.saveArticle(item.title, item.link, source.name); continue; }
            
            if ((!process.env.KEYWORDS) || matchesAny(targetText, config.includeRegex)) {
                // 簡易標題比對去重
                let isDuplicate = false;
                for (let existing of allMatchedNews) {
                    if (stringSimilarity.compareTwoStrings(item.title, existing.title) > config.similarityThreshold) {
                        isDuplicate = true; break;
                    }
                }
                if (!isDuplicate) {
                    const text = await fetchContent(item.link);
                    if (text) {
                        allMatchedNews.push({ source: source.name, title: item.title, content: text, url: item.link });
                        fetchedUrls.add(item.link);
                    }
                }
            }
            db.saveArticle(item.title, item.link, source.name);
        }
    }

    log('📊', `新增符合關鍵字新聞: ${allMatchedNews.length} 則`);

    if (allMatchedNews.length > 0) {
        try {
            // 🟢 步驟 1: 取得昨日總結 (增量分析用)
            const lastSummary = db.getLastSummary();

            // 🟢 步驟 2: AI 分析 (回傳 JSON: { summary, sentiment_score, categories })
            const aiResult = await getSummary(allMatchedNews.slice(0, 50), lastSummary);
            
            log('🧠', `AI 分析完成。今日情緒指數: ${aiResult.sentiment_score}`);

            // 🟢 步驟 3: 更新分類
            const catMap = {};
            if (aiResult.categories) {
                aiResult.categories.forEach(c => { if (c.id !== undefined) catMap[c.id] = c.category; });
                allMatchedNews.forEach((n, i) => { n.category = catMap[i] || "其他"; });
            }

            // 🟢 步驟 4: 儲存今日統計數據 (供明日比較與畫圖)
            db.saveDailyStats(aiResult.sentiment_score, aiResult.summary);

            // 🟢 步驟 5: 取得歷史數據 (畫圖用)
            const recentStats = db.getRecentStats(7);

            // 步驟 6: 生成報表
            const keywordStats = calculateKeywordStats(allMatchedNews);
            generateHTMLReport(aiResult, allMatchedNews, keywordStats, recentStats);
            
            // 部署
            pushToGitHub();
            log('✅', "任務圓滿完成！");

        } catch (err) { log('❌', `處理失敗: ${err.message}`); }
    } else {
        log('💤', "無新新聞。");
    }
}

log('🕰️', "新聞機器人啟動 v2.3");
cron.schedule('0 * * * *', () => runTask());