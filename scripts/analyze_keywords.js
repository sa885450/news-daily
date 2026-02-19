const Segment = require('segment');
const db = require('../src/lib/db');
const segment = new Segment();

// 載入預設辭典 (包含盤古分詞等)
segment.useDefault();

// 自定義停用詞表 (可依需求擴充)
const STOP_WORDS = new Set([
    '的', '了', '和', '是', '就', '都', '而', '及', '與', '著', '或', '一個', '沒有',
    '我們', '你們', '他們', '這個', '那個', '這些', '那些', '因為', '所以', '如果',
    '但是', '雖然', '並', '很', '這', '那', '你', '我', '他', '她', '它', '在', '有',
    '也', '不', '去', '到', '對', '將', '讓', '被', '給', '此', '由', '為', '從', '向',
    '上', '下', '中', '前', '後', '左', '右', '內', '外', '新', '舊', '高', '低',
    '大', '小', '多', '少', '好', '壞', '長', '短', '早', '晚', '美', '醜', '真', '假',
    '年', '月', '日', '時', '分', '秒', '天', '週', '周', '季', '元',
    '公司', '報導', '表示', '指出', '認為', '以及', '除了', '不過', '目前', '持續',
    '進行', '相關', '主要', '部分', '可能', '可以', '能夠', '需要', '開始', '結束',
    '根據', '包含', '包括', '之一', '其中', '透過', '關於', '由於', '看到', '幅度',
    'coming', 'going', 'having', 'been', 'being', 'http', 'https', 'com', 'www',
    '鉅亨速報', 'Factset', '修至', '目標價為', '目標價調', '升至', '降至', '維持',
    '評等', '買進', '持有', '賣出', '重申', '最新', '公布', '預估', '市場', '成長',
    '因為', '所以', '如果', '但是', '雖然', '並', '很', '這', '那', '你', '我', '他',
    '她', '它', '在', '有', '也', '不', '去', '到', '對', '將', '讓', '被', '給',
    '此', '由', '為', '從', '向', '上', '下', '中', '前', '後', '左', '右', '內',
    '外', '新', '舊', '高', '低', '大', '小', '多', '少', '好', '壞', '長', '短',
    '早', '晚', '美', '醜', '真', '假', 'Inc', 'Ltd', 'Corp', 'Co', '不是', '一次',
    '今年', '明年', '去年', '今日', '昨日', '明日', '未來', '過去', '現在'
]);

// 1. 取得資料
const days = 7;
console.log(`📊 正在分析最近 ${days} 天的新聞關鍵字...`);

const recentStats = db.getRecentStats(days); // 取得最近 N 天的統計數據 (這裡我們需要原始文章，所以改用 raw query)

// 直接查詢 articles 表 (因為 db.js 可能沒有直接回傳所有文章內容的函式)
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../data/news_bot.db');
const sqlite = new Database(dbPath);

const timeLimit = new Date();
timeLimit.setDate(timeLimit.getDate() - days);

const articles = sqlite.prepare(`
    SELECT title FROM articles 
    WHERE created_at > ?
`).all(timeLimit.toISOString());

console.log(`📚 共有 ${articles.length} 篇文章納入分析。`);

// 2. 斷詞與統計
const wordCounts = {};

articles.forEach(article => {
    // 僅分析標題 (資料庫無內文)
    const text = article.title;
    const result = segment.doSegment(text, {
        simple: true, // 不返回詞性，只返回字串
        stripPunctuation: true // 去除標點符號
    });

    result.forEach(word => {
        const w = word.trim();
        // 過濾條件：
        // 1. 長度 >= 2 (排除單字)
        // 2. 不是停用詞
        // 3. 排除純數字或日期格式 (簡單過濾)
        if (w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)) {
            wordCounts[w] = (wordCounts[w] || 0) + 1;
        }
    });
});

// 3. 排序與輸出
const sortedKeywords = Object.entries(wordCounts)
    .sort(([, a], [, b]) => b - a) // 降序排列
    .slice(0, 50); // 取 Top 50

console.log('\n🔥 熱門關鍵字 Top 50：');
console.log('--------------------------------');
sortedKeywords.forEach(([word, count], index) => {
    console.log(`${(index + 1).toString().padStart(2, ' ')}. ${word} (${count})`);
});
console.log('--------------------------------');

// (選用) 寫入 JSON 供前端使用
const fs = require('fs');
const publicPath = path.join(__dirname, '../public/data');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });

const outputData = sortedKeywords.map(([word, count]) => ({ word, count }));
// fs.writeFileSync(path.join(publicPath, 'analysis_keywords.json'), JSON.stringify(outputData, null, 2));
// console.log(`💾 結果已儲存至 public/data/analysis_keywords.json`);
