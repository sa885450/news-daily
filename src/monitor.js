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
        if (!snapshot) {
            log('⚠️', '無法獲取快照，監控跳過。');
            return;
        }

        // 平坦化所有監控標的
        const allTargets = [
            ...(Object.values(snapshot.crypto || {})),
            ...(Object.values(snapshot.traditional || {}))
        ];

        // 讀取上次狀態
        let state = {};
        if (fs.existsSync(MONITOR_STATE_FILE)) {
            state = JSON.parse(fs.readFileSync(MONITOR_STATE_FILE, 'utf8'));
        }

        const ALERT_THRESHOLD = -3.0; // 統一跌幅 3% 預警
        let alertSent = false;

        for (const target of allTargets) {
            const currentPrice = typeof target.price === 'string' ? parseFloat(target.price.replace(/,/g, '')) : target.price;
            const lastPrice = state[target.name] || currentPrice;

            if (isNaN(currentPrice)) continue;

            const changeRate = ((currentPrice - lastPrice) / lastPrice) * 100;
            log('📊', `[${target.name}] 當前: ${currentPrice} (幅: ${changeRate.toFixed(2)}%)`);

            if (changeRate <= ALERT_THRESHOLD) {
                log('🚨', `偵測到 ${target.name} 劇烈波動!`);

                const alertMsg = `
# 🚨 **市場異動預警 (Anomaly Detected)**
---
**偵測標的**: ${target.name} (${target.symbol || 'N/A'})
**當前價格**: ${currentPrice.toLocaleString()}
**異動幅度**: **${changeRate.toFixed(2)}%** (自上次監控)

💡 *市場出現顯著波動，建議檢查相關新聞或事件。*
🔗 [即時戰情室](https://${config.githubUser}.github.io/${config.repoName}/public/)
                `.trim();

                await sendDiscord(alertMsg, config.discordAlertWebhook);
                alertSent = true;
            }

            // 更新個體狀態
            state[target.name] = currentPrice;
        }

        // 儲存總體狀態
        state.updatedAt = new Date().toISOString();
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

        fs.writeFileSync(MONITOR_STATE_FILE, JSON.stringify(state, null, 2));
        log('💾', alertSent ? '✅ 預警已發布且狀態已保存' : '💾 狀態已更新');

    } catch (e) {
        log('❌', `監控執行出錯: ${e.message}`);
    }
}

// 執行
runMonitor();
