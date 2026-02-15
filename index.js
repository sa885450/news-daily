const cron = require('node-cron'); 
const stringSimilarity = require('string-similarity');

// 模組導入
const config = require('./lib/config');
const { log, matchesAny, sendDiscord } = require('./lib/utils');
const { isAlreadyRead, saveArticle, pruneOldRecords } = require('./lib/db');
const { fetchRSS, fetchContent, fetchCnyesAPI } = require('./lib/crawler');
const { getSummary } = require('./lib/ai');
const { generateHTMLReport } = require('./lib/ui');
const { pushToGitHub } = require('./lib/git');

async function runTask() {
    log('🚀', `啟動排程任務...`);
    
    // 1. 維護
    pruneOldRecords();
    
    let allMatchedNews = [];
    let scanCount = 0; 
    let newCount = 0;  

    if (config.sources.length === 0) {
        log('⚠️', "警告：未設定 NEWS_SOURCES，請檢查 .env 檔案。");
    }

    // 2. 爬取鉅亨網 API
    const cnyesNews = await fetchCnyesAPI(2); 
    scanCount += cnyesNews.length;

    for (const item of cnyesNews) {
        if (isAlreadyRead(item.link)) continue;
        
        const targetText = `${item.title} ${item.contentSnippet || ""}`;
        if (matchesAny(targetText, config.excludeRegex)) {
            saveArticle(item.title, item.link, item.source);
            continue;
        }

        if ((!process.env.KEYWORDS) || matchesAny(targetText, config.includeRegex)) {
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

    // 3. 爬取 RSS
    for (const source of config.sources) {
        if (source.name === "鉅亨網") continue;
        
        const feed = await fetchRSS(source.url);
        scanCount += feed.items.length;
        
        for (const item of feed.items) {
            if (isAlreadyRead(item.link)) continue;
            
            const targetText = `${item.title} ${item.contentSnippet || ""}`;
            if (matchesAny(targetText, config.excludeRegex)) {
                saveArticle(item.title, item.link, source.name);
                continue;
            }
            
            if ((!process.env.KEYWORDS) || matchesAny(targetText, config.includeRegex)) {
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
                        newCount++;
                    }
                }
            }
            saveArticle(item.title, item.link, source.name);
        }
    }
    
    log('📊', `掃描統計: 掃描 ${scanCount} 則 / 新增 ${newCount} 則`);

    // 4. AI 分析與生成
    if (allMatchedNews.length > 0) {
        try {
            const fullSummary = await getSummary(allMatchedNews.slice(0, 50));
            
            // JSON 解析與分類填入
            let summaryToShow = fullSummary;
            try {
                const jsonMatch = fullSummary.match(/```json([\s\S]*?)```/) || fullSummary.match(/\[\s*\{.*\}\s*\]/s);
                if (jsonMatch) {
                    const jsonStr = jsonMatch[1] || jsonMatch[0];
                    const categories = JSON.parse(jsonStr);
                    const catMap = {};
                    categories.forEach(c => { if (c.id !== undefined) catMap[c.id] = c.category; });

                    allMatchedNews.forEach((n, i) => { n.category = catMap[i] || "其他"; });
                    
                    summaryToShow = fullSummary.replace(jsonMatch[0], "").trim()
                        .replace(/```json/g, "").replace(/```/g, "").trim();
                } else {
                    allMatchedNews.forEach(n => n.category = "其他");
                }
            } catch (e) {
                log('❌', `JSON 解析失敗: ${e.message}`);
                allMatchedNews.forEach(n => n.category = "其他");
            }

            // 生成報表 (輸出到 public/index.html)
            const { fileName } = generateHTMLReport(summaryToShow, allMatchedNews);
            
            pushToGitHub();

            const cloudUrl = `https://${config.githubUser}.github.io/${config.repoName}/public/`; 

            await sendDiscord(config.discordWebhook, `**📅 本機排程報告 (${new Date().toLocaleTimeString()})**\n\n${summaryToShow}\n\n🌐 **儀表板連結**: ${cloudUrl}`);
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

// 排程設定
log('🕰️', "新聞機器人主程式已啟動 (Modular Version)");
log('📅', "排程設定：每小時 00 分執行一次");

cron.schedule('*/10 * * * *', () => {
    log('💓', '系統待命運作中 (Heartbeat)...');
});

cron.schedule('0 * * * *', () => {
    runTask();
});

 //runTask(); // 測試用