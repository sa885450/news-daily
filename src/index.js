require('dotenv').config();
const { getSummary } = require('./lib/ai');
const { fetchRSS, fetchContent, fetchCnyesAPI } = require('./lib/crawler');
const { generateHTMLReport } = require('./lib/ui');
const { log, sendDiscord } = require('./lib/utils');
const { pushToGitHub } = require('./lib/git');
const db = require('./lib/db');
const config = require('./lib/config');
const { analyze7DayKeywords } = require('./lib/keywords');
const stringSimilarity = require('string-similarity');
const cron = require('node-cron');
const { version } = require('../package.json');

function matchesAny(text, regexArray) { return regexArray.length === 0 ? false : regexArray.some(re => re.test(text)); }

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
    log('🚀', `啟動排程任務 (v${version})...`);

    try {
        db.cleanupOldArticles();
    } catch (e) { }

    let allMatchedNews = [];
    let fetchedUrls = new Set();

    // 1. 抓取鉅亨網
    const cnyesNews = await fetchCnyesAPI(2);
    let skipCount = 0;
    let excludeCount = 0;

    for (const item of cnyesNews) {
        if (db.isAlreadyRead(item.link)) { skipCount++; continue; }
        const targetText = `${item.title} ${item.contentSnippet || ""}`;
        if (matchesAny(targetText, config.excludeRegex)) {
            excludeCount++;
            db.saveArticle(item.title, item.link, item.source);
            continue;
        }

        if ((!process.env.KEYWORDS) || matchesAny(targetText, config.includeRegex)) {
            allMatchedNews.push({
                source: item.source,
                title: item.title,
                content: item.content,
                url: item.link,
                thumbnail: item.thumbnail // 🟢 v7.0.1
            });
            fetchedUrls.add(item.link);
        }
        db.saveArticle(item.title, item.link, item.source, '其他', item.content || item.contentSnippet, item.thumbnail);
    }
    log('📊', `鉅亨網過濾完成: 新增 ${allMatchedNews.length} 則, 跳過已讀 ${skipCount} 則, 排除關鍵字 ${excludeCount} 則`);

    // 2. 抓取 RSS (並發執行)
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(5); // 限制同時 5 個請求

    const rssSources = config.sources.filter(s => s.name !== "鉅亨網");
    const fetchTasks = rssSources.map(source => limit(async () => {
        const feed = await fetchRSS(source.url);
        return { sourceName: source.name, items: feed.items || [] };
    }));

    const feeds = await Promise.all(fetchTasks);

    let rssCandidates = [];

    // 2.1 過濾與預處理
    let rssSkipCount = 0;
    let rssExcludeCount = 0;

    for (const feed of feeds) {
        for (const item of feed.items) {
            // 嘗試寫入資料庫記錄 (不論是否選用)
            db.saveArticle(item.title, item.link, feed.sourceName, '其他', item.content || item.contentSnippet);

            if (db.isAlreadyRead(item.link) || fetchedUrls.has(item.link)) { rssSkipCount++; continue; }

            const targetText = `${item.title} ${item.contentSnippet || ""}`;
            if (matchesAny(targetText, config.excludeRegex)) { rssExcludeCount++; continue; }

            if ((!process.env.KEYWORDS) || matchesAny(targetText, config.includeRegex)) {
                let isDuplicate = false;
                for (let existing of allMatchedNews) {
                    if (stringSimilarity.compareTwoStrings(item.title, existing.title) > config.similarityThreshold) {
                        isDuplicate = true; break;
                    }
                }
                if (!isDuplicate) {
                    rssCandidates.push({ source: feed.sourceName, title: item.title, url: item.link, item });
                    fetchedUrls.add(item.link);
                }
            }
        }
    }
    log('📊', `RSS 過濾完成: 待抓取內文 ${rssCandidates.length} 則, 跳過已讀/重複 ${rssSkipCount} 則, 排除關鍵字 ${rssExcludeCount} 則`);

    // 2.2 並發抓取內文
    const contentTasks = rssCandidates.map(cand => limit(async () => {
        const result = await fetchContent(cand.url);
        if (result && result.textContent) {
            return {
                source: cand.source,
                title: cand.title,
                content: result.textContent,
                url: cand.url,
                thumbnail: result.thumbnail // 🟢 v7.0.1
            };
        }
        return null;
    }));

    const results = await Promise.all(contentTasks);
    results.filter(r => r !== null).forEach(r => {
        allMatchedNews.push(r);
        // 🟢 確保抓取到的完整內文與縮圖寫入資料庫 (UPSERT)
        db.saveArticle(r.title, r.url, r.source, '其他', r.content, r.thumbnail);
    });

    log('📊', `新增符合關鍵字新聞: ${allMatchedNews.length} 則`);

    if (allMatchedNews.length > 0) {
        try {
            // 🟢 取得昨日數據 (含分數)
            const lastStats = db.getLastStats();
            const lastSummary = lastStats ? lastStats.summary : null;
            const lastScore = lastStats ? lastStats.sentiment_score : 0;

            // 🟢 AI 分析 (傳入 lastScore 觸發自適應 Persona)
            const aiResult = await getSummary(allMatchedNews.slice(0, 50), lastSummary, lastScore);
            log('🧠', `AI 分析完成。今日情緒指數: ${aiResult.sentiment_score}`);

            // 更新分類
            const catMap = {};
            if (aiResult.categories) {
                aiResult.categories.forEach(c => { if (c.id !== undefined) catMap[c.id] = c.category; });
                allMatchedNews.forEach((n, i) => { n.category = catMap[i] || "其他"; });
            }

            db.saveDailyStats(aiResult.sentiment_score, aiResult.summary);
            const recentStats = db.getRecentStats(7);
            const keywords7d = analyze7DayKeywords(7);

            const keywordStats = calculateKeywordStats(allMatchedNews);

            // 🟢 v5.0.0: 新聞聚類與去重 (Clustering)
            const clusteredNews = [];
            const processedIndices = new Set();

            for (let i = 0; i < allMatchedNews.length; i++) {
                if (processedIndices.has(i)) continue;

                const mainNews = { ...allMatchedNews[i], relatedArticles: [] };
                processedIndices.add(i);

                // 🟢 v5.1.0: 反向指標標記 (8zz / 巴逆逆)
                const contrarianRegex = /8zz|巴逆逆/i;
                if (contrarianRegex.test(mainNews.title) || contrarianRegex.test(mainNews.content || "")) {
                    mainNews.is_contrarian = true;
                }

                for (let j = i + 1; j < allMatchedNews.length; j++) {
                    if (processedIndices.has(j)) continue;

                    const similarity = stringSimilarity.compareTwoStrings(allMatchedNews[i].title, allMatchedNews[j].title);
                    if (similarity > 0.7) {
                        mainNews.relatedArticles.push({
                            title: allMatchedNews[j].title,
                            url: allMatchedNews[j].url,
                            source: allMatchedNews[j].source,
                            content: allMatchedNews[j].content,
                            thumbnail: allMatchedNews[j].thumbnail // 🟢 v7.0.1
                        });
                        processedIndices.add(j);
                    }
                }
                clusteredNews.push(mainNews);
            }

            generateHTMLReport(aiResult, clusteredNews, keywordStats, recentStats, keywords7d, aiResult.events);

            // 發送 Discord
            try {
                const dateStr = new Date().toLocaleDateString('zh-TW');
                const sentimentIcon = aiResult.sentiment_score > 0 ? '🔥' : '❄️';
                const cleanSummary = (aiResult.summary || "無摘要").replace(/<[^>]*>/g, '').substring(0, 800) + '...';
                const reportUrl = `https://${config.githubUser}.github.io/${config.repoName}/public/`;

                // 🟢 在 Discord 訊息加入關鍵實體代碼
                const entityTags = (aiResult.entities || [])
                    .map(e => e.ticker ? `**${e.name}(${e.ticker})**` : e.name)
                    .join(', ');

                const discordMsg = `
# 📅 **AI 每日新聞快報** (${dateStr})
---
**今日情緒**: ${sentimentIcon} ${aiResult.sentiment_score}
**關注焦點**: ${entityTags || '無'}

## 📝 **重點摘要**
${cleanSummary}

🔗 [查看完整圖表與五力分析](${reportUrl})
                `.trim();

                log('📤', '正在發送 Discord 通知...');
                await sendDiscord(discordMsg);
            } catch (discordErr) {
                log('⚠️', `Discord 通知發送失敗: ${discordErr.message}`);
            }

            pushToGitHub();
            log('✅', "任務圓滿完成！");

        } catch (err) { log('❌', `處理失敗: ${err.message}`); }
    } else {
        log('💤', "無新新聞。");
    }
}

log('🕰️', `新聞機器人啟動 v${version}`);
cron.schedule('0 * * * *', () => runTask());