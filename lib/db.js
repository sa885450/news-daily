const Database = require('better-sqlite3');
const { dbPath } = require('./config');

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    url TEXT UNIQUE, 
    title TEXT, 
    source TEXT, 
    category TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY, 
    sentiment_score REAL,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const checkUrlStmt = db.prepare('SELECT id FROM articles WHERE url = ?');
const insertArticleStmt = db.prepare('INSERT INTO articles (title, url, source, category) VALUES (?, ?, ?, ?)');
const insertStatsStmt = db.prepare(`INSERT INTO daily_stats (date, sentiment_score, summary) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET sentiment_score = excluded.sentiment_score, summary = excluded.summary`);
const getRecentStatsStmt = db.prepare('SELECT date, sentiment_score FROM daily_stats ORDER BY date ASC LIMIT ?');
const getLastSummaryStmt = db.prepare('SELECT summary, sentiment_score FROM daily_stats ORDER BY date DESC LIMIT 1'); // 🟢 多撈一個 sentiment_score

// 週報去重
const getWeeklyArticlesStmt = db.prepare(`
    SELECT * FROM articles 
    WHERE created_at >= date('now', '-7 days') 
    GROUP BY SUBSTR(title, 1, 12) 
    ORDER BY created_at DESC
`);

// 🟢 新增：生命週期分析 (統計某關鍵字過去 7 天的每日出現次數)
const getKeywordLifecycleStmt = db.prepare(`
    SELECT date(created_at) as day, count(*) as count 
    FROM articles 
    WHERE (title LIKE ? OR category LIKE ?) 
      AND created_at >= date('now', '-7 days')
    GROUP BY day 
    ORDER BY day ASC
`);

module.exports = {
    isAlreadyRead: (url) => !!checkUrlStmt.get(url),
    saveArticle: (title, url, source, category = '其他') => {
        try { insertArticleStmt.run(title, url, source, category); } catch (e) {}
    },
    saveDailyStats: (score, summary) => {
        const today = new Date().toISOString().split('T')[0];
        insertStatsStmt.run(today, score, summary);
    },
    getRecentStats: (days = 7) => getRecentStatsStmt.all(days),
    // 🟢 修改：回傳整個 row (含分數)
    getLastStats: () => getLastSummaryStmt.get(), 
    getLastSummary: () => { // 為了相容舊版，還是保留這個只回傳字串的 helper
        const row = getLastSummaryStmt.get();
        return row ? row.summary : null;
    },
    cleanupOldArticles: () => {
        return db.prepare("DELETE FROM articles WHERE created_at < date('now', '-30 days')").run();
    },
    getWeeklyArticles: () => getWeeklyArticlesStmt.all(),
    
    // 🟢 新增導出
    getKeywordLifecycle: (keyword) => getKeywordLifecycleStmt.all(`%${keyword}%`, `%${keyword}%`)
};