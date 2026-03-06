const db = require('better-sqlite3')('./data/news_bot.db');
const r = db.prepare("DELETE FROM articles WHERE source = '金十數據'").run();
console.log('已清除金十舊廢棄數據:', r.changes, '筆');
