const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const { log } = require('./utils');

// 🟢 關閉 yahoo-finance2 的日誌以免刷屏
yahooFinance.setGlobalConfig({ validation: { logErrors: false } });

/**
 * 獲取全球市場與加密貨幣快照
 * @returns {Promise<Object>} 市場數據物件
 */
async function getMarketSnapshot() {
    log('🔍', '正在透過數據中心獲取市場快照...');
    const snapshot = {
        traditional: {},
        crypto: {},
        updatedAt: new Date().toISOString()
    };

    try {
        // 1. 加密貨幣 (CoinGecko)
        try {
            const cryptoRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_24hr_change=true', { timeout: 8000 });
            if (cryptoRes.data) {
                snapshot.crypto = {
                    btc: { name: 'BTC', price: cryptoRes.data.bitcoin.usd, change: cryptoRes.data.bitcoin.usd_24h_change, symbol: 'BTC' },
                    eth: { name: 'ETH', price: cryptoRes.data.ethereum.usd, change: cryptoRes.data.ethereum.usd_24h_change, symbol: 'ETH' },
                    sol: { name: 'SOL', price: cryptoRes.data.solana.usd, change: cryptoRes.data.solana.usd_24h_change, symbol: 'SOL' },
                    bnb: { name: 'BNB', price: cryptoRes.data.binancecoin.usd, change: cryptoRes.data.binancecoin.usd_24h_change, symbol: 'BNB' }
                };
            }
        } catch (ce) {
            log('⚠️', `加密貨幣獲取失敗: ${ce.message}`);
        }

        // 2. 傳統金融 (Yahoo Finance)
        log('📈', '正在同步 Yahoo Finance 全球指標...');
        const symbols = ['^TWII', '^GSPC', '2330.TW', '0050.TW', '009816.TW'];

        for (const symbol of symbols) {
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote) {
                    const key = symbol.replace(/\.TW|\^/g, '').toLowerCase();
                    const nameMap = {
                        'twii': '台股加權',
                        'gspc': 'S&P 500',
                        '2330': '台積電',
                        '0050': '元大台灣50',
                        '009816': '凱基台灣Top50'
                    };

                    snapshot.traditional[key] = {
                        name: nameMap[key] || symbol,
                        price: quote.regularMarketPrice,
                        change: quote.regularMarketChangePercent,
                        symbol: symbol
                    };
                }
            } catch (ye) {
                log('⚠️', `指標 ${symbol} 獲取失敗: ${ye.message}`);
            }
        }

        log('✅', '市場數據同步完成');
        return snapshot;
    } catch (e) {
        log('⚠️', `市場快照程序異常: ${e.message}`);
        return snapshot;
    }
}

/**
 * 將市場數據轉化為 AI 可讀的文字串
 * @param {Object} snapshot 
 */
function formatSnapshotForAI(snapshot) {
    if (!snapshot || !snapshot.crypto) return '';

    let text = "\n📊 **當前市場行情參考**：\n";
    if (snapshot.crypto.btc && snapshot.crypto.btc.price) {
        text += `- 比特幣 (BTC): $${snapshot.crypto.btc.price.toLocaleString()} USD (${(snapshot.crypto.btc.change || 0).toFixed(2)}%)\n`;
    }
    if (snapshot.crypto.eth && snapshot.crypto.eth.price) {
        text += `- 乙太幣 (ETH): $${snapshot.crypto.eth.price.toLocaleString()} USD (${(snapshot.crypto.eth.change || 0).toFixed(2)}%)\n`;
    }
    return text;
}

module.exports = { getMarketSnapshot, formatSnapshotForAI };
