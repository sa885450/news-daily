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
        // 抓取 BTC, ETH 對 TWD, USD 的價格
        const cryptoRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=twd,usd&include_24hr_change=true', { timeout: 10000 });
        if (cryptoRes.data) {
            snapshot.crypto = {
                btc: {
                    twd: cryptoRes.data.bitcoin.twd,
                    usd: cryptoRes.data.bitcoin.usd,
                    change: cryptoRes.data.bitcoin.twd_24h_change
                },
                eth: {
                    twd: cryptoRes.data.ethereum.twd,
                    usd: cryptoRes.data.ethereum.usd,
                    change: cryptoRes.data.ethereum.twd_24h_change
                }
            };
        }

        // 2. 傳統金融快照 (模擬核心指數，此處未來可擴接 Yahoo Finance)
        // 目前先回傳基準值，之後可在後台配置中加入更多 API
        snapshot.traditional = {
            twii: { name: '台股加權', price: '獲取中...', change: '0%' },
            spx: { name: 'S&P 500', price: '獲取中...', change: '0%' }
        };

        log('✅', '市場數據獲取成功');
        return snapshot;
    } catch (e) {
        log('⚠️', `部分行情數據獲取失敗: ${e.message}`);
        return snapshot; // 回傳局部數據
    }
}

/**
 * 將市場數據轉化為 AI 可讀的文字串
 * @param {Object} snapshot 
 */
function formatSnapshotForAI(snapshot) {
    if (!snapshot || !snapshot.crypto) return '';

    let text = "\n📊 **當前市場行情參考**：\n";
    if (snapshot.crypto.btc) {
        text += `- 比特幣 (BTC): $${snapshot.crypto.btc.usd.toLocaleString()} USD (${snapshot.crypto.btc.change.toFixed(2)}%)\n`;
    }
    if (snapshot.crypto.eth) {
        text += `- 乙太幣 (ETH): $${snapshot.crypto.eth.usd.toLocaleString()} USD (${snapshot.crypto.eth.change.toFixed(2)}%)\n`;
    }
    return text;
}

module.exports = { getMarketSnapshot, formatSnapshotForAI };
