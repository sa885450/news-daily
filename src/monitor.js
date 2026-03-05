const { getMarketSnapshot } = require('./lib/mcp');
const { log, sendDiscord } = require('./lib/utils');
const config = require('./lib/config');
const fs = require('fs');
const path = require('path');

const MONITOR_STATE_FILE = path.join(__dirname, '../data/monitor_state.json');

async function runMonitor() {
    log('📡', '啟動輕量級監控任務...');

    try {
        const snapshot = await getMarketSnapshot();
        if (!snapshot || !snapshot.crypto || !snapshot.crypto.btc) {
            log('⚠️', '無法獲取完整快照，監控跳過。');
            return;
        }

        // 讀取上次狀態
        let lastState = {};
        if (fs.existsSync(MONITOR_STATE_FILE)) {
            lastState = JSON.parse(fs.readFileSync(MONITOR_STATE_FILE, 'utf8'));
        }

        const btcCurrent = snapshot.crypto.btc.price;
        const btcLast = lastState.btcPrice || btcCurrent;

        // 計算變動率 (與上次監控對比)
        const changeRate = ((btcCurrent - btcLast) / btcLast) * 100;

        log('📊', `BTC 當前價格: $${btcCurrent.toLocaleString()} (對比上次: ${changeRate.toFixed(2)}%)`);

        // 偵測異動 (例如變動絕對值 > 2% 或 跌幅 > 3%)
        const ALERT_THRESHOLD = -3.0; // 跌幅 3% 預警

        if (changeRate <= ALERT_THRESHOLD) {
            log('🚨', '偵測到劇烈波動，正在發送預警...');

            const alertMsg = `
# 🚨 **市場異動預警 (Anomaly Detected)**
---
**偵測標的**: 比特幣 (BTC)
**當前價格**: $${btcCurrent.toLocaleString()} USD
**異動幅度**: **${changeRate.toFixed(2)}%** (自上次監控)

💡 *此為自動監控訊號，顯示市場出現短線劇烈波動，請注意倉位風險。*
🔗 [即時戰情室](https://${config.githubUser}.github.io/${config.repoName}/public/)
            `.trim();

            await sendDiscord(alertMsg, config.discordAlertWebhook);
            log('✅', '預警簡訊已發送至指定頻道。');
        }

        // 儲存狀態供下次比對
        const newState = {
            btcPrice: btcCurrent,
            updatedAt: new Date().toISOString()
        };

        // 確保 data 目錄存在
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

        fs.writeFileSync(MONITOR_STATE_FILE, JSON.stringify(newState, null, 2));
        log('💾', '狀態已更新。');

    } catch (e) {
        log('❌', `監控執行出錯: ${e.message}`);
    }
}

// 執行
runMonitor();
