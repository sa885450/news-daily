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
    content TEXT, -- 🟢 新增：儲存全文以利後續分析
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY, 
    sentiment_score REAL,
    summary TEXT,
    sector_stats TEXT, -- JSON format: { "tech": 0.5, "finance": 0.2 ... }
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 🟢 Migration: Add sector_stats column if not exists (for existing DB)
try {
  db.prepare('ALTER TABLE daily_stats ADD COLUMN sector_stats TEXT').run();
} catch (e) {
  // Column likely exists
}

// 🟢 Migration: Add content column to articles (for existing DB)
try {
  db.prepare('ALTER TABLE articles ADD COLUMN content TEXT').run();
} catch (e) { }

const checkUrlStmt = db.prepare('SELECT id FROM articles WHERE url = ?');
const insertArticleStmt = db.prepare(`
  INSERT INTO articles (title, url, source, category, content) 
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    content = CASE 
      WHEN length(excluded.content) > length(articles.content) OR articles.content IS NULL 
      THEN excluded.content 
      ELSE articles.content 
    END,
    category = CASE WHEN excluded.category != '其他' THEN excluded.category ELSE articles.category END
`);
const insertStatsStmt = db.prepare(`INSERT INTO daily_stats (date, sentiment_score, summary, sector_stats) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET sentiment_score = excluded.sentiment_score, summary = excluded.summary, sector_stats = excluded.sector_stats`);
const getRecentStatsStmt = db.prepare('SELECT date, sentiment_score, sector_stats FROM daily_stats ORDER BY date ASC LIMIT ?');
const getLastSummaryStmt = db.prepare('SELECT summary, sentiment_score FROM daily_stats ORDER BY date DESC LIMIT 1');

// ... (Rest of existing statements)

// 🟢 新增：取得關鍵字歷史熱度 (過去 30 天)
const getKeywordHistoryStmt = db.prepare(`
    SELECT date(created_at) as date, count(*) as count 
    FROM articles 
    WHERE (title LIKE ? OR category LIKE ?) 
      AND created_at >= date('now', '-30 days')
    GROUP BY date 
    ORDER BY date ASC
`);

module.exports = {
  isAlreadyRead: (url) => !!checkUrlStmt.get(url),
  saveArticle: (title, url, source, category = '其他', content = null) => {
    try { insertArticleStmt.run(title, url, source, category, content); } catch (e) { }
  },
  saveDailyStats: (score, summary, sectorStats = null) => {
    const today = new Date().toISOString().split('T')[0];
    insertStatsStmt.run(today, score, summary, sectorStats ? JSON.stringify(sectorStats) : null);
  },
  getRecentStats: (days = 7) => getRecentStatsStmt.all(days).map(r => ({
    ...r,
    sector_stats: r.sector_stats ? JSON.parse(r.sector_stats) : null
  })),
  getLastStats: () => getLastSummaryStmt.get(),
  getLastSummary: () => {
    const row = getLastSummaryStmt.get();
    return row ? row.summary : null;
  },
  cleanupOldArticles: () => {
    return db.prepare("DELETE FROM articles WHERE created_at < date('now', '-30 days')").run();
  },
  getWeeklyArticles: () => getWeeklyArticlesStmt.all(),

  // 🟢 導出：關鍵字歷史
  getKeywordHistory: (keyword) => getKeywordHistoryStmt.all(`%${keyword}%`, `%${keyword}%`),
  getKeywordLifecycle: (keyword) => getKeywordHistoryStmt.all(`%${keyword}%`, `%${keyword}%`) // Alias for compatibility
};