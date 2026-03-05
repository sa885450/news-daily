require('dotenv').config();
const axios = require('axios');

async function getMarketSnapshot() {
    console.log('🔍 正在獲取市場快照...');
    const results = {};

    try {
        // Yahoo Finance 模擬 (或使用簡易回傳)
        // 實際開發中這裏會換成 MCP 工具
        results.traditional = {
            twii: { name: '台股指數', price: 23256, change: '+1.2%' },
            spx: { name: '標普 500', price: 5890, change: '-0.3%' }
        };

        // CoinGecko 模擬
        results.crypto = {
            btc: { name: '比特幣', price: 92450, change: '+2.5%' },
            eth: { name: '乙太幣', price: 2450, change: '+1.1%' }
        };

        console.log('✅ 獲取成功:', JSON.stringify(results, null, 2));
        return results;
    } catch (e) {
        console.error('❌ 獲取失敗:', e.message);
        return null;
    }
}

getMarketSnapshot();
