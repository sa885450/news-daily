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

        if (!history || history.length < 20) {
            // console.error(`[DEBUG] ${symbol} 歷史數據不足: ${history?.length || 0}`);
            return null;
        }

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
