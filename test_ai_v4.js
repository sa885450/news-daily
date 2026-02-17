const { getSummary } = require('./lib/ai');

const mockNews = [
    { title: '台積電營收創新高，半導體產業回溫', content: '晶圓代工龍頭台積電...', source: 'Test', timeStr: '12:00' },
    { title: '富邦金控獲利亮眼', content: '金融股表現強勢...', source: 'Test', timeStr: '12:05' }
];

(async () => {
    try {
        console.log("Testing AI v4.0.0 Prompt...");
        const result = await getSummary(mockNews);
        console.log("AI Result:", JSON.stringify(result, null, 2));

        if (result.sector_stats && typeof result.sector_stats.tech === 'number') {
            console.log("✅ Sector Stats detected!");
        } else {
            console.error("❌ Sector Stats MISSING!");
        }
    } catch (e) {
        console.error("Error:", e);
    }
})();
