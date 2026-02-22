const Segment = require('segment');
const db = require('./db');
const segment = new Segment();

// 載入預設辭典
segment.useDefault();

// 停用詞表
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

/**
 * 分析最近 N 天的熱門關鍵字
 * @param {number} days 
 * @returns {Array<{word: string, count: number}>} Top N keywords
 */
function analyze7DayKeywords(days = 7) {
    // 🟢 新增：讀取環境變數中的黑名單
    if (process.env.KEYWORD_BLACKLIST) {
        const blacklist = process.env.KEYWORD_BLACKLIST.split(/[,\uFF0C]/).map(w => w.trim()).filter(w => w);
        blacklist.forEach(w => STOP_WORDS.add(w));
    }

    const timeLimit = new Date();
    timeLimit.setDate(timeLimit.getDate() - days);

    // 使用 better-sqlite3 查詢 (假設 db.js 暴露了 db instance 或我們需要自己建連線)
    // 由於 lib/db.js 封裝較深，這裡我們暫時自行建立連線以保持獨立性，或者擴充 db.js
    // 為了保持架構一致，我們擴充 db.js 是最好的，但為求快速，這裡直接讀取
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '../../data/news_bot.db'); // lib/ is in src/lib/
    const sqlite = new Database(dbPath);

    const articles = sqlite.prepare(`
        SELECT title, url, source, content FROM articles 
        WHERE created_at > ?
    `).all(timeLimit.toISOString());

    const wordCounts = {};
    const wordArticles = {};

    articles.forEach(article => {
        const text = article.title;
        const result = segment.doSegment(text, {
            simple: true,
            stripPunctuation: true
        });

        result.forEach(word => {
            const w = word.trim();
            if (w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)) {
                wordCounts[w] = (wordCounts[w] || 0) + 1;

                // 記錄相關新聞 (最多保留 10 則)
                if (!wordArticles[w]) wordArticles[w] = [];
                if (wordArticles[w].length < 10) {
                    wordArticles[w].push({
                        title: article.title,
                        url: article.url,
                        source: article.source,
                        content: article.content
                    });
                }
            }
        });
    });

    return Object.entries(wordCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 50)
        .map(([word, count]) => ({
            word,
            count,
            articles: wordArticles[word] || []
        }));
}

module.exports = { analyze7DayKeywords };
