/**
 * v7.1.0: TradingView Strategic Chart Widget
 */

let tvWidget = null;

/**
 * 將美股/台股代碼轉換為 TradingView 格式
 * @param {string} ticker - 例如: NVDA.US, 2330.TW
 */
function mapTickerToTV(ticker) {
    if (!ticker) return "NASDAQ:AAPL";
    const parts = ticker.split('.');
    const symbol = parts[0];
    const market = parts[1] ? parts[1].toUpperCase() : 'US';

    if (market === 'TW') {
        return `TWSE:${symbol}`;
    } else if (market === 'US') {
        // 簡單判斷美股交易所，預設 NASDAQ
        const techSymbols = ['AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'META', 'TSLA'];
        return techSymbols.includes(symbol) ? `NASDAQ:${symbol}` : `NYSE:${symbol}`;
    }
    return symbol;
}

/**
 * 開啟圖表 Modal 並渲染
 */
function openChartModal(ticker, name) {
    const modal = document.getElementById('chartModal');
    const container = document.getElementById('tradingview-container');
    const title = document.getElementById('chartModalTitle');
    const subtitle = document.getElementById('chartModalSubtitle');

    const tvSymbol = mapTickerToTV(ticker);
    title.textContent = `${name} - 即時盤勢`;
    subtitle.textContent = `Symbol: ${tvSymbol} (${ticker})`;

    // 清空舊容器
    container.innerHTML = '<div id="tv_chart_div" class="w-full h-full"></div>';

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');

        // 初始化 TradingView
        new TradingView.widget({
            "autosize": true,
            "symbol": tvSymbol,
            "interval": "60",
            "timezone": "Asia/Taipei",
            "theme": document.documentElement.classList.contains('dark') ? "dark" : "light",
            "style": "1",
            "locale": "zh_TW",
            "toolbar_bg": "#f1f3f6",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "container_id": "tv_chart_div"
        });
    }, 100);
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('tradingview-container').innerHTML = '';
    }, 300);
}
