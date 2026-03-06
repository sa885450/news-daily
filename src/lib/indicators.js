const YahooFinance = require('yahoo-finance2').default;
// 🟢 跳過驗證錯誤並關閉所有不必要的通知
const yahoo = new YahooFinance({
    validation: { logErrors: false },
    suppressNotices: ['yahooSurvey', 'ripHistorical']
});

/**
 * 計算 RSI (相對強弱指標)
 * @param {Array} prices 價格陣列
 * @returns {Number} RSI 數值
 */
function calculateRSI(prices) {
    if (prices.length < 15) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
}

/**
 * 獲取標的的技術指標
 * @param {String} symbol 標的代码
 * @returns {Promise<Object>} 指標物件
 */
async function getTechnicalIndicators(symbol) {
    if (!symbol) return null;
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 60); // 獲取 60 天歷史，確保扣除假日後足夠計算 20MA

        // 🟢 升級：使用 chart() 代替已廢棄的 historical()，減少日誌噪音
        const result = await yahoo.chart(symbol, {
            period1: startDate,
            period2: endDate,
            interval: '1d'
        });

        const history = result.quotes;

        if (!history || history.length === 0) {
            return null;
        }

        const closePrices = history.map(h => h.close).filter(p => p != null);
        const highPrices = history.map(h => h.high).filter(p => p != null);

        if (closePrices.length === 0) return null;

        const latestPrice = closePrices[closePrices.length - 1];
        const maxHigh60 = highPrices.length > 0 ? Math.max(...highPrices) : latestPrice;
        const minLow20 = closePrices.length > 0 ? Math.min(...closePrices.slice(-20)) : latestPrice;

        // MA 計算 (支援資料不足時自動截斷)
        const ma5Len = Math.min(closePrices.length, 5);
        const ma20Len = Math.min(closePrices.length, 20);

        const ma5 = closePrices.slice(-ma5Len).reduce((a, b) => a + b, 0) / ma5Len;
        const ma20 = closePrices.slice(-ma20Len).reduce((a, b) => a + b, 0) / ma20Len;

        // RSI (至少需要 2 點計算，否則預設 50)
        const rsi = closePrices.length >= 2 ? calculateRSI(closePrices.slice(-15)) : 50;

        return {
            symbol,
            price: latestPrice,
            prevClose: latestPrice, // 8:30 AM 時，latestPrice 即為前一交易日收盤
            maxHigh: maxHigh60,      // 波段最高點
            minLow: minLow20,        // 20日支撐點
            ma5: parseFloat(ma5.toFixed(2)),
            ma20: parseFloat(ma20.toFixed(2)),
            rsi: parseFloat(rsi.toFixed(2)),
            trend: latestPrice > ma20 ? 'BULL' : 'BEAR'
        };
    } catch (e) {
        return null;
    }
}

module.exports = { getTechnicalIndicators };
