const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/news_bot.db');
const db = new Database(dbPath);

console.log('🔍 Inspection: articles table schema');
const schema = db.prepare("PRAGMA table_info(articles)").all();
console.table(schema);

console.log('🔍 Sample row:');
const row = db.prepare("SELECT * FROM articles LIMIT 1").get();
console.log(row);
