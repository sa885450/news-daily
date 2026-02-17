const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { publicDir } = require('./config');
const { ensureDir } = require('./utils');

/**
 * 生成 HTML 報表
 */
async function generateHTMLReport(aiResult, newsData, keywordStats = {}, chartData = []) {
    const dateObj = new Date();
    const dateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const timeStr = dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    const fullDateStr = `${dateStr} · 更新於 ${timeStr}`;

    const summary = aiResult.summary || "無摘要資料";
    const todayScore = aiResult.sentiment_score || 0;

    // 準備 Chart.js 數據
    const chartLabels = chartData.map(d => d.date.slice(5));
    const chartScores = chartData.map(d => d.sentiment_score);
    const chartColor = todayScore >= 0.3 ? '#dc2626' : (todayScore <= -0.3 ? '#16a34a' : '#64748b');

    // 準備雷達圖數據
    const dim = aiResult.dimensions || { policy: 0.5, market: 0.5, industry: 0.5, international: 0.5, technical: 0.5 };
    const radarData = [dim.policy, dim.market, dim.industry, dim.international, dim.technical];

    // 準備實體 (Entities)
    const entities = (aiResult.entities || []).map(e => {
        if (typeof e === 'string') return { name: e, ticker: null, colorClass: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
        return {
            name: e.name,
            ticker: e.ticker,
            colorClass: e.sentiment === 'Positive' ? 'text-red-600 bg-red-50 border-red-200' : 'text-indigo-700 bg-indigo-50 border-indigo-200'
        };
    });

    // 準備歷史報表列表
    let historyFiles = [];
    const todayFileName = `report_${dateObj.toISOString().split('T')[0]}.html`;
    try {
        if (fs.existsSync(publicDir)) {
            historyFiles = fs.readdirSync(publicDir)
                .filter(f => f.startsWith('report_') && f.endsWith('.html'))
                .sort().reverse()
                .map(f => ({
                    filename: f,
                    label: f.replace('report_', '').replace('.html', ''),
                    isToday: (f === todayFileName)
                }));

            // 確保今天的文件也在列表中
            if (!historyFiles.some(f => f.filename === todayFileName)) {
                historyFiles.unshift({
                    filename: todayFileName,
                    label: dateObj.toISOString().split('T')[0],
                    isToday: true
                });
            }
        }
    } catch (e) { }

    // 準備關鍵字
    const sortedKeywords = Object.entries(keywordStats)
        .sort((a, b) => b[1] - a[1])
        .map(([word, count]) => ({ word, count }));

    // 準備新聞數據
    const formattedNews = newsData.map(n => ({
        ...n,
        timeStr: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    }));

    const categories = ["全部", "科技", "金融", "社會", "其他"];

    // 渲染 EJS
    const templatePath = path.join(__dirname, '../views/index.ejs');
    const html = await ejs.renderFile(templatePath, {
        fullDateStr,
        summary,
        todayScore,
        chartLabels,
        chartScores,
        chartColor,
        radarData,
        entities,
        historyFiles,
        sortedKeywords,
        newsData: formattedNews,
        categories
    });

    ensureDir(publicDir);
    const fileName = 'index.html';
    fs.writeFileSync(path.join(publicDir, fileName), html);
    fs.writeFileSync(path.join(publicDir, todayFileName), html);

    return { filePath: path.join(publicDir, fileName), fileName };
}

module.exports = { generateHTMLReport };