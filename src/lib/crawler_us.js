const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

const { log } = require('./utils');

/**
 * 抓取美股晨間快照所需的量化數據
 * 包含：三大指數 (道瓊、標普500、納斯達克)、VIX 恐慌指數、台股 ADR (以 TSMC 為首)
 */
async function getUSMarketSnapshot() {
    log('📈', '正在抓取美股盤後快照 (指數、VIX、ADR)...');
    
    const symbols = [
        '^DJI',    // 道瓊工業指數
        '^GSPC',   // S&P 500
        '^IXIC',   // 納斯達克綜合指數
        '^VIX',    // 恐慌指數
        'TSM',     // 台積電 ADR
        'UMC',     // 聯電 ADR
        'NVDA',    // 輝達 (AI 風向標)
        'BTC-USD', // 比特幣 (風險情緒指標)
    ];

    const snapshot = {};

    try {
        const quotes = await yahooFinance.quote(symbols);
        
        quotes.forEach(q => {
            snapshot[q.symbol] = {
                price: q.regularMarketPrice,
                change: q.regularMarketChange,
                changePercent: q.regularMarketChangePercent,
                name: q.shortName || q.longName,
            };
        });

        log('✅', '美股快照抓取完成');
        return snapshot;
    } catch (e) {
        log('❌', `美股快照抓取失敗: ${e.message}`);
        return null;
    }
}

/**
 * 將快照轉換為 AI 容易閱讀的 Markdown 格式字串
 */
function formatUSSnapshotForAI(snapshot) {
    if (!snapshot) return "無法取得美股快照數據。";

    let text = "📊 **【美股盤後快照與關鍵數據】**\n";
    
    const groups = [
        { title: "四大指數與情緒", symbols: ['^DJI', '^GSPC', '^IXIC', '^VIX'] },
        { title: "關鍵標的與 ADR", symbols: ['TSM', 'UMC', 'NVDA', 'BTC-USD'] }
    ];

    groups.forEach(group => {
        text += `\n[${group.title}]\n`;
        group.symbols.forEach(sym => {
            const data = snapshot[sym];
            if (data) {
                const sign = data.change >= 0 ? '+' : '';
                text += `- ${data.name || sym}: ${data.price.toFixed(2)} (${sign}${data.changePercent.toFixed(2)}%)\n`;
            }
        });
    });

    return text;
}

module.exports = {
    getUSMarketSnapshot,
    formatUSSnapshotForAI
};
