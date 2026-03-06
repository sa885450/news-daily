const stringSimilarity = require('string-similarity');

const POSITIVE_KEYWORDS = {
    '台積電': 30, '2330': 30, '輝達': 25, 'NVIDIA': 25, '聯準會': 20, 'FED': 20,
    '降息': 15, '升息': 15, '財報': 15, '營收': 10, '突破': 10, '暴跌': 15,
    '半導體': 10, 'AI': 10, '避險': 20, '黃金': 15, '比特幣': 15, 'BTC': 15
};

const NEGATIVE_KEYWORDS = {
    '業配': -100, '行銷': -50, '活動': -30, '贈獎': -100, '特賣': -50,
    '快訊': -5, '報導': -5, '紀錄': -20
};

/**
 * 給單則新聞評分
 */
function calculateScore(article) {
    let score = 0;
    const text = (article.title + (article.content || "")).toLowerCase();

    // 正向加分
    for (const [word, weight] of Object.entries(POSITIVE_KEYWORDS)) {
        if (text.includes(word.toLowerCase())) score += weight;
    }

    // 負面扣分
    for (const [word, weight] of Object.entries(NEGATIVE_KEYWORDS)) {
        if (text.includes(word.toLowerCase())) score += weight;
    }

    // 內容長度獎勵 (有內文的比沒內文的分數高)
    if (article.content && article.content.length > 200) score += 10;

    return score;
}

/**
 * 智慧篩選與去重
 * @param {Array} articles 原始新聞列表
 * @param {number} limit 最終交給 AI 的數量上限
 */
function rankAndFilter(articles, limit = 15) {
    if (!articles || articles.length === 0) return [];

    // 1. 給每則新聞標記分數
    const scoredList = articles.map(a => ({
        ...a,
        _score: calculateScore(a)
    }));

    // 2. 排序 (分數高者在前)
    scoredList.sort((a, b) => b._score - a._score);

    // 3. 語意去重 (在高分群中移除太像的新聞)
    const uniqueList = [];
    for (const item of scoredList) {
        let isTooSimilar = false;
        for (const existing of uniqueList) {
            const sim = stringSimilarity.compareTwoStrings(item.title, existing.title);
            if (sim > 0.6) { // 相似度超過 60% 就視為重複
                isTooSimilar = true;
                // 保留內容較長或分數較高的那一個 (這裡因為已排序，existing 分數較高)
                break;
            }
        }
        if (!isTooSimilar) uniqueList.push(item);
        if (uniqueList.length >= limit) break;
    }

    return uniqueList;
}

module.exports = { rankAndFilter };
