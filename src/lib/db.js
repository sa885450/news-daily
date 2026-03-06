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
    date TEXT PRIMARY KEY, 
    sentiment_score REAL,
    summary TEXT,
    sector_stats TEXT, -- JSON format
    dimensions TEXT,   -- 🟢 v13.3.0 新增: 五力分析 JSON
    events TEXT,       -- 🟢 v13.3.0 新增: 重大事件 JSON
    relations TEXT,    -- 🟢 v13.3.0 新增: 知識圖譜 JSON
    tactical_advice TEXT, -- 🟢 v13.3.0 新增: 戰術建議 JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 🟢 Migration: v13.3.0 新增數據持久化欄位
['sector_stats', 'dimensions', 'events', 'relations', 'tactical_advice'].forEach(col => {
  try { db.prepare(`ALTER TABLE daily_stats ADD COLUMN ${col} TEXT`).run(); } catch (e) { }
});

// 🟢 Migration: Add content column (v5.x legacy)
try {
  db.prepare('ALTER TABLE articles ADD COLUMN content TEXT').run();
} catch (e) { }

// 🟢 Migration: Add thumbnail column to articles (v7.0.1)
try {
  db.prepare('ALTER TABLE articles ADD COLUMN thumbnail TEXT').run();
} catch (e) { }

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
const insertStatsStmt = db.prepare(`
  INSERT INTO daily_stats (date, sentiment_score, summary, sector_stats, dimensions, events, relations, tactical_advice) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
  ON CONFLICT(date) DO UPDATE SET 
    sentiment_score = excluded.sentiment_score, 
    summary = excluded.summary, 
    sector_stats = excluded.sector_stats,
    dimensions = excluded.dimensions,
    events = excluded.events,
    relations = excluded.relations,
    tactical_advice = excluded.tactical_advice
`);
const getRecentStatsStmt = db.prepare('SELECT date, sentiment_score, sector_stats FROM daily_stats ORDER BY date ASC LIMIT ?');
const getLastSummaryStmt = db.prepare('SELECT * FROM daily_stats ORDER BY date DESC LIMIT 1');

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
    // 🟢 v13.3.1: 防禦性檢查 - 拒絕存入無意義的 javascript 偽連結
    if (!url || url.startsWith('javascript:')) return;
    try { insertArticleStmt.run(title, url, source, category, content, thumbnail); } catch (e) { }
  },
  saveDailyStats: (score, summary, sectorStats = null, dimensions = null, events = null, relations = null, tacticalAdvice = null) => {
    const today = new Date().toISOString().split('T')[0];
    insertStatsStmt.run(
      today,
      score,
      summary,
      sectorStats ? JSON.stringify(sectorStats) : null,
      dimensions ? JSON.stringify(dimensions) : null,
      events ? JSON.stringify(events) : null,
      relations ? JSON.stringify(relations) : null,
      tacticalAdvice ? JSON.stringify(tacticalAdvice) : null
    );
  },
  getRecentStats: (days = 7) => getRecentStatsStmt.all(days).map(r => ({
    ...r,
    sector_stats: r.sector_stats ? JSON.parse(r.sector_stats) : null
  })),
  getLastStats: () => {
    const row = getLastSummaryStmt.get();
    if (!row) return null;
    return {
      ...row,
      sector_stats: row.sector_stats ? JSON.parse(row.sector_stats) : null,
      dimensions: row.dimensions ? JSON.parse(row.dimensions) : null,
      events: row.events ? JSON.parse(row.events) : null,
      relations: row.relations ? JSON.parse(row.relations) : null,
      tactical_advice: row.tactical_advice ? JSON.parse(row.tactical_advice) : null
    };
  },
  getLastSummary: () => {
    const row = getLastSummaryStmt.get();
    return row ? row.summary : null;
  },
  cleanupOldArticles: () => {
    return db.prepare("DELETE FROM articles WHERE created_at < date('now', '-30 days')").run();
  },
  getWeeklyArticles: () => getWeeklyArticlesStmt.all(),

  // 🟢 v13.1.0: 前端多元化顯示支援
  getRecentArticles: (hours, limit) => {
    try {
      return db.prepare(`SELECT * FROM articles WHERE created_at >= datetime('now', '-${hours} hours') ORDER BY created_at DESC LIMIT ?`).all(limit);
    } catch (e) {
      return [];
    }
  },
  updateArticleCategory: (url, category) => {
    try { db.prepare(`UPDATE articles SET category = ? WHERE url = ?`).run(category, url); } catch (e) { }
  },

  // 🟢 導出：關鍵字歷史
  getKeywordHistory: (keyword) => getKeywordHistoryStmt.all(`%${keyword}%`, `%${keyword}%`),
  getKeywordLifecycle: (keyword) => getKeywordHistoryStmt.all(`%${keyword}%`, `%${keyword}%`), // Alias for compatibility

  // 🟢 v13.3.1: 清理舊世代殘留垃圾數據
  cleanTrashData: () => {
    const r = db.prepare("DELETE FROM articles WHERE url LIKE 'javascript:%' OR url IS NULL OR url = ''").run();
    return r.changes;
  }
};