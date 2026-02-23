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
    content TEXT, 
    thumbnail TEXT, -- 🟢 v7.0.1 新增：縮圖 URL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_stats (
    ...
  );
`);

// 🟢 Migration: Add thumbnail column to articles (for existing DB)
try {
  db.prepare('ALTER TABLE articles ADD COLUMN thumbnail TEXT').run();
} catch (e) { }

// ... (省略中間遷移代碼)

const checkUrlStmt = db.prepare('SELECT id FROM articles WHERE url = ?');
const insertArticleStmt = db.prepare(`
  INSERT INTO articles (title, url, source, category, content, thumbnail) 
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    content = CASE 
      WHEN length(excluded.content) > length(articles.content) OR articles.content IS NULL 
      THEN excluded.content 
      ELSE articles.content 
    END,
    thumbnail = CASE WHEN excluded.thumbnail IS NOT NULL THEN excluded.thumbnail ELSE articles.thumbnail END,
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
  saveArticle: (title, url, source, category = '其他', content = null, thumbnail = null) => {
    try { insertArticleStmt.run(title, url, source, category, content, thumbnail); } catch (e) { }
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