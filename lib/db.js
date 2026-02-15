const Database = require('better-sqlite3');
const { dbPath } = require('./config');

const db = new Database(dbPath);

// 初始化資料庫
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    url TEXT UNIQUE, 
    title TEXT, 
    source TEXT, 
    category TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  -- 🟢 新增：每日統計表 (用於繪製趨勢圖與 AI 增量分析)
  CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY, -- 格式 YYYY-MM-DD
    sentiment_score REAL,  -- 情緒分數 -1.0 ~ 1.0
    summary TEXT,          -- 當日 AI 總結 (作為明天的 context)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// SQL 預編譯
const checkUrlStmt = db.prepare('SELECT id FROM articles WHERE url = ?');
const insertArticleStmt = db.prepare('INSERT INTO articles (title, url, source, category) VALUES (?, ?, ?, ?)');

// 🟢 新增：儲存每日統計
const insertStatsStmt = db.prepare(`
    INSERT INTO daily_stats (date, sentiment_score, summary) 
    VALUES (?, ?, ?) 
    ON CONFLICT(date) DO UPDATE SET 
    sentiment_score = excluded.sentiment_score, 
    summary = excluded.summary
`);

// 🟢 新增：取得最近 N 天的統計數據 (畫圖用)
const getRecentStatsStmt = db.prepare('SELECT date, sentiment_score FROM daily_stats ORDER BY date ASC LIMIT ?');

// 🟢 新增：取得最新的一筆總結 (給 AI 做增量分析用)
const getLastSummaryStmt = db.prepare('SELECT summary FROM daily_stats ORDER BY date DESC LIMIT 1');

module.exports = {
    isAlreadyRead: (url) => !!checkUrlStmt.get(url),
    saveArticle: (title, url, source, category = '其他') => {
        try { insertArticleStmt.run(title, url, source, category); } catch (e) {}
    },
    // 新增對外函式
    saveDailyStats: (score, summary) => {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        insertStatsStmt.run(today, score, summary);
    },
    getRecentStats: (days = 7) => getRecentStatsStmt.all(days),
    getLastSummary: () => {
        const row = getLastSummaryStmt.get();
        return row ? row.summary : null;
    },
    cleanupOldArticles: () => {
        return db.prepare("DELETE FROM articles WHERE created_at < date('now', '-30 days')").run();
    }
};