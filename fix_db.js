const Database = require('better-sqlite3');
const db = new Database('news_bot.db');

try {
    console.log("正在嘗試新增 category 欄位...");
    db.exec("ALTER TABLE articles ADD COLUMN category TEXT");
    console.log("✅ 成功！資料庫已升級。");
} catch (e) {
    console.log("⚠️ 操作失敗 (可能欄位已存在):", e.message);
}