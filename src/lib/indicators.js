const YahooFinance = require('yahoo-finance2').default;
const yahoo = new YahooFinance();

/**
 * 計算 RSI (相對強弱指標)
 * @param {Array} prices 價格陣列
 * @returns {Number} RSI 數值
 */
function calculateRSI(prices) {
    if (prices.length < 15) return 50; // 數據不足，回傳中性值

    let gains = 0;
    let losses = 0;

    for (let i = 1; i < 15; i++) {
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
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30); // 獲取 30 天歷史

        const history = await yahoo.historical(symbol, {
            period1: startDate,
            period2: endDate,
            interval: '1d'
        });

        if (!history || history.length < 20) return null;

        const closePrices = history.map(h => h.close).filter(p => p != null);
        const latestPrice = closePrices[closePrices.length - 1];

        // MA 計算 (5日, 20日)
        const ma5 = closePrices.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const ma20 = closePrices.slice(-20).reduce((a, b) => a + b, 0) / 20;

        // RSI (14日)
        const rsi = calculateRSI(closePrices.slice(-15));

        return {
            symbol,
            price: latestPrice,
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
