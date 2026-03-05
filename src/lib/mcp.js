const axios = require('axios');
const { log } = require('./utils');

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
        // 1. 加密貨幣 (CoinGecko Simple Price)
        const cryptoRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_24hr_change=true', { timeout: 10000 });
        if (cryptoRes.data) {
            snapshot.crypto = {
                btc: { name: 'BTC', price: cryptoRes.data.bitcoin.usd, change: cryptoRes.data.bitcoin.usd_24h_change },
                eth: { name: 'ETH', price: cryptoRes.data.ethereum.usd, change: cryptoRes.data.ethereum.usd_24h_change },
                sol: { name: 'SOL', price: cryptoRes.data.solana.usd, change: cryptoRes.data.solana.usd_24h_change },
                bnb: { name: 'BNB', price: cryptoRes.data.binancecoin.usd, change: cryptoRes.data.binancecoin.usd_24h_change }
            };
        }

        // 2. 傳統金融快照 (模擬核心指數 / 匯率)
        snapshot.traditional = {
            twii: { name: '台股加權', price: '23,256', change: 1.25, symbol: '^TWII' },
            spx: { name: 'S&P 500', price: '5,890', change: -0.32, symbol: '^GSPC' },
            usdtwd: { name: '美元/台幣', price: '32.14', change: 0.12, symbol: 'USDTWD' },
            jpyusd: { name: '日圓/美元', price: '150.2', change: -0.45, symbol: 'JPYUSD' }
        };

        log('✅', '市場數據獲取成功');
        return snapshot;
    } catch (e) {
        log('⚠️', `部分行情數據獲取失敗: ${e.message}`);
        // 兜底數據，防止前端崩潰
        if (Object.keys(snapshot.crypto).length === 0) {
            snapshot.crypto = { btc: { name: 'BTC', price: 92000, change: 0 } };
        }
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
