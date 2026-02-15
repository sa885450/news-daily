const Database = require('better-sqlite3');
const { dbPath } = require('./config');
const { log } = require('./utils');

const db = new Database(dbPath);

// 初始化表格
db.exec(`CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, title TEXT, source TEXT, category TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

// 預編譯語句 (效能優化)
const checkUrlStmt = db.prepare('SELECT id FROM articles WHERE url = ?');
const insertArticleStmt = db.prepare('INSERT INTO articles (title, url, source, category) VALUES (?, ?, ?, ?)');
const pruneStmt = db.prepare("DELETE FROM articles WHERE created_at < date('now', '-30 days')");
const weeklyQueryStmt = db.prepare("SELECT title, source FROM articles WHERE created_at >= date('now', '-7 days') ORDER BY created_at DESC LIMIT 100");

module.exports = {
    isAlreadyRead: (url) => !!checkUrlStmt.get(url),
    
    saveArticle: (title, url, source, category = '其他') => {
        try {
            insertArticleStmt.run(title, url, source, category);
        } catch (e) {
            // 忽略重複鍵值錯誤
        }
    },
    
    pruneOldRecords: () => {
        try {
            const result = pruneStmt.run();
            if (result.changes > 0) {
                log('🗄️', `資料庫瘦身完成，已刪除 ${result.changes} 筆過期紀錄。`);
            }
        } catch (e) {
            log('⚠️', `資料庫清理失敗: ${e.message}`);
        }
    },

    getWeeklyArticles: () => {
        return weeklyQueryStmt.all();
    }
};