const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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
        'NVDA',    // 輝達 (AI 風向標)
        'DX-Y.NYB',// 美元指數 (DXY)
        'GC=F',    // 黃金期貨
        'CL=F',    // 原油期貨
        'BTC-USD', // 比特幣
        'ETH-USD', // 以太幣
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
        { title: "總經與避險資產", symbols: ['DX-Y.NYB', 'GC=F', 'CL=F'] },
        { title: "風險資產 (加密貨幣)", symbols: ['BTC-USD', 'ETH-USD'] },
        { title: "關鍵個股與 ADR", symbols: ['TSM', 'NVDA'] }
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
