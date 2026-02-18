const { generateHTMLReport } = require('./lib/ui');

const mockAiResult = {
    summary: '測試摘要',
    sentiment_score: 0.5,
    dimensions: { policy: 0.1, market: 0.2, industry: 0.3, international: 0.4, technical: 0.5 },
    sector_stats: { tech: 0.8, finance: 0.5, manufacturing: 0.2, service: -0.2 },
    entities: [{ name: '台積電', ticker: '2330.TW', sentiment: 'Positive' }]
};

const mockNews = [
    { title: '測試新聞標題', content: '內容', url: '#', source: 'Test', timeStr: '12:00', category: '科技' }
];

const mockKeywords = { '測試': 10 };
const mockChartData = [];

(async () => {
    try {
        console.log("Generating report...");
        const result = await generateHTMLReport(mockAiResult, mockNews, mockKeywords, mockChartData);
        console.log("Report generated at:", result.filePath);
    } catch (e) {
        console.error("Error:", e);
    }
})();
