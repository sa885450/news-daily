require('dotenv').config();
const { getMarketSnapshot, formatSnapshotForAI } = require('./lib/mcp');
const { getSummary } = require('./lib/ai');
const { getTechnicalIndicators } = require('./lib/indicators');
const { fetchRSS, fetchContent, fetchCnyesAPI } = require('./lib/crawler');
const { generateHTMLReport } = require('./lib/ui');
const { log, sendDiscord, saveReport, sendDiscordEmbed } = require('./lib/utils');
const { pushToGitHub } = require('./lib/git');
const db = require('./lib/db');
const config = require('./lib/config');
const { analyze7DayKeywords } = require('./lib/keywords');
const { rankAndFilter } = require('./lib/filter'); // 🟢 v10.1.0 過濾官
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

let isTaskRunning = false;

async function runTask() {
    if (isTaskRunning) {
        log('⚠️', '任務正在執行中，跳過本次重複觸發。');
        return;
    }
    isTaskRunning = true;
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
            log('🚀', "啟動 News Daily AI Bot...");

            // 🟢 第四階段：緊急模式檢測
            const isEmergency = process.argv.includes('--emergency');
            const targetName = process.argv.find(arg => arg.startsWith('--target='))?.split('=')[1] || '';
            let targetSymbol = '';

            // 找出對應的 Symbol
            if (targetName === '台積電') targetSymbol = '2330.TW';
            else if (targetName === '元大台灣50') targetSymbol = '0050.TW';
            else if (targetName === 'BTC') targetSymbol = 'BTC-USD';
            else if (targetName.includes('KGI') || targetName.includes('Top50')) targetSymbol = '009816.TW';

            if (isEmergency) log('🚨', `啟動緊急追擊模式: 針對標的 ${targetName} (${targetSymbol || '未知'})`);

            // 🟢 第五階段：獲取技術指標 (緊急模式抓目標，一般模式抓台積電)
            let techData = null;
            const techTarget = targetSymbol || '2330.TW';
            log('📊', `正在分析量化指標: ${techTarget}...`);
            techData = await getTechnicalIndicators(techTarget);

            // 🟢 取得昨日數據 (含分數)
            const lastStats = db.getLastStats();
            const lastSummary = lastStats ? lastStats.summary : null;
            const lastScore = lastStats ? lastStats.sentiment_score : 0;

            // 🟢 加入 MCP 市場行情獲取
            const marketSnapshot = await getMarketSnapshot();
            const marketDataStr = formatSnapshotForAI(marketSnapshot);

            // 🟢 v10.1.0: 啟動過濾官模式，從符合關鍵字的新聞中選出最精銳的 15 則餵給 AI
            const eliteNews = rankAndFilter(allMatchedNews, 15);
            log('🕵️', `過濾官已過濾: 共 ${allMatchedNews.length} 則 -> 選出精銳 ${eliteNews.length} 則`);

            // 🟢 AI 分析 (傳入精銳新聞、行情數據、緊急模式參數、技術面數據，明確指定 deep 模式)
            const aiResult = await getSummary(eliteNews, lastSummary, lastScore, marketDataStr, isEmergency, targetName, techData, 'deep');
            log('🧠', `AI 分析完成。今日情緒指數: ${aiResult.sentiment_score}`);

            // 🟢 v13.1.0: 更新分類並回寫資料庫
            const catMap = {};
            if (aiResult.categories) {
                aiResult.categories.forEach(c => { if (c.id !== undefined) catMap[c.id] = c.category; });
                allMatchedNews.forEach((n, i) => {
                    n.category = catMap[i] || "其他";
                    if (n.category !== "其他") {
                        db.updateArticleCategory(n.url, n.category);
                    }
                });
            }

            db.saveDailyStats(aiResult.sentiment_score, aiResult.summary);
            const recentStats = db.getRecentStats(7);
            const keywords7d = analyze7DayKeywords(7);

            // 🟢 v13.1.0: 改為從資料庫撈取過去 2 小時內的歷史庫存，確保前端新聞來源多元化
            let displayNews = db.getRecentArticles(2, 150);
            if (!displayNews || displayNews.length === 0) {
                displayNews = allMatchedNews; // 若資料庫查無資料，退回使用當次增量
            }

            // 使用顯示用的新聞重新計算關鍵字統計，讓畫面標籤正確
            const displayKeywordStats = calculateKeywordStats(displayNews);

            // 🟢 v13.1.0: 新聞聚類與去重改對 displayNews 執行
            const clusteredNews = [];
            const processedIndices = new Set();

            for (let i = 0; i < displayNews.length; i++) {
                if (processedIndices.has(i)) continue;

                const mainNews = { ...displayNews[i], relatedArticles: [] };
                processedIndices.add(i);

                for (let j = i + 1; j < displayNews.length; j++) {
                    if (processedIndices.has(j)) continue;

                    const similarity = stringSimilarity.compareTwoStrings(displayNews[i].title, displayNews[j].title);
                    if (similarity > 0.7) {
                        mainNews.relatedArticles.push({
                            title: displayNews[j].title,
                            url: displayNews[j].url,
                            source: displayNews[j].source,
                            content: displayNews[j].content,
                            thumbnail: displayNews[j].thumbnail
                        });
                        processedIndices.add(j);
                    }
                }
                clusteredNews.push(mainNews);
            }

            generateHTMLReport(aiResult, clusteredNews, displayKeywordStats, recentStats, keywords7d, aiResult.events, aiResult.relations, marketSnapshot);

            // 發送 Discord
            try {
                const dateStr = new Date().toLocaleDateString('zh-TW');
                const sentimentIcon = aiResult.sentiment_score > 0 ? '🔥' : '❄️';
                const cleanSummary = (aiResult.summary || "無摘要").replace(/<[^>]*>/g, '').substring(0, 800) + '...';
                const reportUrl = `https://${config.githubUser}.github.io/${config.repoName}/public/`;
                const title = isEmergency ? `🚨 **緊急異動深度分析** (${targetName})` : `📅 **AI 每日新聞快報** (${dateStr})`;

                // 🟢 在 Discord 訊息加入關鍵實體代碼
                const entityTags = (aiResult.entities || [])
                    .map(e => e.ticker ? `**${e.name}(${e.ticker})**` : e.name)
                    .join(', ');

                const tactical = aiResult.tactical_advice || {};
                const advisoryIcon = tactical.action?.includes('買') ? '💰' : tactical.action?.includes('賣') ? '📦' : '⚖️';

                const discordMsg = `
# ${title}
---
**今日情緒**: ${sentimentIcon} ${aiResult.sentiment_score}
**關注焦點**: ${entityTags || '無'}

## 🎯 **戰術執行建議 (v9.1.0)**
- **建議行動**: ${advisoryIcon} **${tactical.action || '觀望'}** (信心: ${tactical.confidence || 0}%)
- **建議倉位**: **${tactical.position_size || '不建議進場'}**
- **戰術金律**: ${tactical.rationale || '無'}

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
        log('💤', "無新新聞增量。正在整合最新金十與歷史庫存產出全景報表...");
        // 🟢 v13.1.4: 確保空窗期也能發布真實 AI 混合報表
        try {
            const historyNews = db.getRecentArticles(2, 150);
            if (historyNews && historyNews.length > 0) {
                const displayKeywordStats = calculateKeywordStats(historyNews);
                const clusteredNews = [];
                const processedIndices = new Set();
                const stringSimilarity = require('string-similarity');

                for (let i = 0; i < historyNews.length; i++) {
                    if (processedIndices.has(i)) continue;
                    const mainNews = { ...historyNews[i], relatedArticles: [] };
                    processedIndices.add(i);
                    for (let j = i + 1; j < historyNews.length; j++) {
                        if (processedIndices.has(j)) continue;
                        if (stringSimilarity.compareTwoStrings(historyNews[i].title, historyNews[j].title) > 0.7) {
                            mainNews.relatedArticles.push({
                                title: historyNews[j].title,
                                url: historyNews[j].url,
                                source: historyNews[j].source,
                                thumbnail: historyNews[j].thumbnail
                            });
                            processedIndices.add(j);
                        }
                    }
                    clusteredNews.push(mainNews);
                }

                const marketSnapshot = await getMarketSnapshot();
                const lastStats = db.getLastStats();

                // 重建上一把的 AI 狀態，避免圖譜與事件被洗掉
                const aiResult = {
                    sentiment_score: lastStats?.sentiment_score || 0,
                    summary: (lastStats?.summary || "") + `<p><small><i>(註：本時段無新 RSS 新聞，但已匯入最新金十快訊。本報表為前次 AI 戰略分析之延續)</i></small></p>`,
                    events: lastStats?.events ? JSON.parse(lastStats.events) : [],
                    relations: lastStats?.relations ? JSON.parse(lastStats.relations) : [],
                    tactical_advice: lastStats?.tactical_advice ? JSON.parse(lastStats.tactical_advice) : null
                };

                generateHTMLReport(aiResult, clusteredNews, displayKeywordStats, db.getRecentStats(7), analyze7DayKeywords(7), aiResult.events, aiResult.relations, marketSnapshot);
                pushToGitHub();
            }
        } catch (ue) {
            log('⚠️', `空窗期全景報表更新失敗: ${ue.message}`);
        }
    }

    isTaskRunning = false;
}

/**
 * 🟢 v13.1.3: 金十數據獨立特快排程
 * 獨立於 AI 深度日報，負責高頻率同步國際快訊與更新前端報表
 */
async function runJin10Task() {
    // 🟢 v13.2.2: 絕對優先權避讓邏輯
    const now = new Date();
    const min = now.getMinutes();
    const hour = now.getHours();

    // 如果即將進入兩小時一次的主任務(整點)，金十特快主動避讓 2 分鐘（前 1 分 + 整點當刻）
    // 確保主任務啟動時，Playwright 不會佔用 CPU/記憶體或發生 Git 競爭
    if (hour % 2 === 0 && (min === 0 || min === 59)) {
        log('💤', '接近兩小時主任務時間，金十特快主動避讓以釋放資源...');
        return;
    }

    if (isTaskRunning) return; // 避免與主任務衝突

    log('📡', `啟動金十特快同步 (v${version})...`);

    // 1. 金十數據同步
    if (config.enableJin10) {
        try {
            const jin10 = require('./lib/jin10');
            const flashNews = await jin10.fetchFlashNews(10); // 🟢 v13.1.8: 抓取 10 則以擴大覆蓋
            let importantCount = 0;
            let newCount = 0;
            let skipCount = 0;

            // 🟢 v13.1.9: 診斷日誌 - 顯示頁面上最新快訊的時間，確認抓取是否為最新頁面
            if (flashNews.length > 0) {
                const latestTime = flashNews[0].time || '(無時間)';
                log('🕐', `金十頁面最新快訊時間: [${latestTime}] (共 ${flashNews.length} 則)`);
            }

            for (const news of flashNews) {
                const url = news.link || `https://www.jin10.com/${news.id}`;

                // 🟢 v13.1.8: 加入 URL 去重 - 跳過已存在的快訊
                if (db.isAlreadyRead(url)) {
                    skipCount++;
                    continue;
                }

                // 存入資料庫
                db.saveArticle(
                    `[金十] ${news.content.substring(0, 50)}...`,
                    url,
                    '金十數據',
                    '即時快訊',
                    news.content
                );
                newCount++;

                if (news.isImportant) {
                    importantCount++;
                    log('⭐', `[金十重要] ${news.content.substring(0, 100)}`);
                    if (config.discordMonitorWebhook) {
                        await sendDiscordEmbed({
                            title: "🌍 金十全球實時快訊 (重要)",
                            description: news.content,
                            color: 15844367, // 金色
                            footer: { text: `金十數據 | 實時偵測系統 v${version}` },
                            timestamp: new Date().toISOString()
                        }, config.discordMonitorWebhook);
                    }
                }
            }
            // 🟢 v13.1.8: 詳細日誌
            log('✅', `金十同步完成: 抓取 ${flashNews.length} 則 → 新增 ${newCount} 筆 / 跳過重複 ${skipCount} 筆 / 重要 ${importantCount} 筆`);
            await jin10.close();
        } catch (je) {
            log('❌', `金十特快執行失敗: ${je.message}`);
        }
    }
}

// 🕰️ 排程設定
const cronSchedule = process.env.CRON_SCHEDULE || '0 * * * *';
log('🕰️', `新聞機器人啟動 v${version} (主排程: ${cronSchedule})`);
cron.schedule(cronSchedule, () => runTask());

// 🕰️ v13.1.3: 獨立金十特快排程 (每 5 分鐘或依設定)
const jin10Cron = `*/${config.jin10Interval} * * * *`;
log('🕰️', `金十特快線啟動 (排程: ${jin10Cron})`);
cron.schedule(jin10Cron, () => runJin10Task());

// 🟢 支援 CLI 立即觸發
if (process.argv.includes('--now') || process.argv.includes('--emergency')) {
    log('⚡', "偵測到立即執行指令...");
    runTask();
    runJin10Task();
}
