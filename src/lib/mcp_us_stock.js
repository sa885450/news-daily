const { getUSMarketSnapshot, formatUSSnapshotForAI } = require('./crawler_us');
const db = require('./db');

/**
 * 取得晨間摘要所需的所有原始數據 (MCP Tool 端點)
 * 這隻 API 返回結構化的 JSON 以供其他 AI 代理人讀取與分析
 */
async function getMorningBriefingData() {
    // 1. 取得美股量化快照
    const snapshot = await getUSMarketSnapshot();
    const formattedSnapshot = formatUSSnapshotForAI(snapshot);

    // 2. 從資料庫撈出最近 12 小時內的新聞與情報
    // 包含昨夜所有金十快訊與重要 RSS 新聞
    const overnightNews = db.getRecentArticles(12, 100);

    return {
        timestamp: new Date().toISOString(),
        market_snapshot: snapshot,
        market_snapshot_formatted: formattedSnapshot,
        overnight_news_count: overnightNews.length,
        overnight_news: overnightNews.map(n => ({
            title: n.title,
            source: n.source,
            category: n.category,
            time: n.created_at
        }))
    };
}

module.exports = {
    getMorningBriefingData
};
