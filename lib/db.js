const Database = require('better-sqlite3');
const { dbPath } = require('./config');

const db = new Database(dbPath);

// 初始化 (維持原樣)
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

// 既有 Stmts ...
const checkUrlStmt = db.prepare('SELECT id FROM articles WHERE url = ?');
const insertArticleStmt = db.prepare('INSERT INTO articles (title, url, source, category) VALUES (?, ?, ?, ?)');
const insertStatsStmt = db.prepare(`INSERT INTO daily_stats (date, sentiment_score, summary) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET sentiment_score = excluded.sentiment_score, summary = excluded.summary`);
const getRecentStatsStmt = db.prepare('SELECT date, sentiment_score FROM daily_stats ORDER BY date ASC LIMIT ?');
const getLastSummaryStmt = db.prepare('SELECT summary FROM daily_stats ORDER BY date DESC LIMIT 1');

// 🟢 強化版週報演算法：標題指紋去重 (取前 12 字)
// 這能將重複轉載的新聞（2500則）在資料庫端就壓縮到剩下的 100-200 則
const getWeeklyArticlesStmt = db.prepare(`
    SELECT * FROM articles 
    WHERE created_at >= date('now', '-7 days') 
    GROUP BY SUBSTR(title, 1, 12) 
    ORDER BY created_at DESC
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
    getLastSummary: () => {
        const row = getLastSummaryStmt.get();
        return row ? row.summary : null;
    },
    cleanupOldArticles: () => {
        return db.prepare("DELETE FROM articles WHERE created_at < date('now', '-30 days')").run();
    },
    getWeeklyArticles: () => getWeeklyArticlesStmt.all()
};