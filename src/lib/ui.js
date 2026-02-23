const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { publicDir } = require('./config');
const { ensureDir } = require('./utils');

const { log } = require('./utils');

/**
 * v6.0.0 CSR 重構：產出數據 JSON 代替 HTML
 */
async function generateHTMLReport(aiResult, newsData, keywordStats = {}, chartData = [], keywords7d = []) {
    ensureDir(publicDir);
    ensureDir(path.join(publicDir, 'data'));

    const dateObj = new Date();
    const dateStr = dateObj.toISOString().split('T')[0];
    const dataPath = path.join(publicDir, 'data.json');
    const historyPath = path.join(publicDir, `report_${dateStr}.json`);

    // 🔍 整合 CSR 數據包
    const dataPackage = {
        updateTime: dateObj.toISOString(),
        fullDateStr: `${dateObj.toLocaleDateString('zh-TW')} · 更新於 ${dateObj.toLocaleTimeString('zh-TW', { hour12: false })}`,
        aiResult: {
            ...aiResult,
            sentiment_score: aiResult.sentiment_score || 0,
            summary: aiResult.summary || "無摘要資料"
        },
        newsData: newsData.map(n => ({
            title: n.title,
            url: n.url,
            source: n.source,
            category: n.category,
            thumbnail: n.thumbnail, // 🟢 v7.0.1
            is_contrarian: n.is_contrarian,
            // 🟢 v7.0.2: 數據脫水 - 列表僅保留摘要，減少傳輸量
            content: (n.content || "").substring(0, 500),
            timeStr: n.timeStr || new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
            relatedArticles: (n.relatedArticles || []).map(r => ({
                title: r.title,
                url: r.url,
                source: r.source,
                thumbnail: r.thumbnail // 🟢 v7.0.1
            }))
        })),
        recentStats: chartData,
        keywords7d: keywords7d || []
    };

    try {
        const jsonStr = JSON.stringify(dataPackage, null, 2);

        // 1. 更新主數據檔案 (data.json)
        fs.writeFileSync(dataPath, jsonStr, 'utf8');

        // 2. 更新歷史數據檔案 (用於未來回溯)
        fs.writeFileSync(historyPath, jsonStr, 'utf8');

        log('📦', `CSR 資料包(v6.0.0) 已產出: public/data.json (Size: ${(jsonStr.length / 1024).toFixed(2)} KB)`);

        return { filePath: dataPath, fileName: 'data.json' };
    } catch (err) {
        log('❌', `資料包寫入失敗: ${err.message}`);
        throw err;
    }
}

module.exports = { generateHTMLReport };
