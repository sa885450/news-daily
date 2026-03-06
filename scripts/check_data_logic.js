const fs = require('fs');
try {
    const raw = fs.readFileSync('public/data.json', 'utf8');
    const data = JSON.parse(raw);

    console.log('Update Time:', data.updateTime);

    // 檢查市場摘要
    if (data.market_snapshot && data.market_snapshot.traditional) {
        for (const [key, val] of Object.entries(data.market_snapshot.traditional)) {
            if (val.price === null || val.change === null) {
                console.warn(`⚠️ Warning: ${key} has null values. Price: ${val.price}, Change: ${val.change}`);
            }
        }
    }

    // 檢查新聞數據
    if (data.newsData) {
        console.log('News Count:', data.newsData.length);
        const brokenNews = data.newsData.filter(n => !n.title || !n.url);
        if (brokenNews.length > 0) {
            console.warn(`⚠️ Warning: ${brokenNews.length} news items are missing title or URL.`);
        }
    }
} catch (e) {
    console.error('Diagnostic failed:', e.message);
}
