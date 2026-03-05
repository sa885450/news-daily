const { getMarketSnapshot } = require('./lib/mcp');
const { getTechnicalIndicators } = require('./lib/indicators');
const { log, sendDiscordEmbed } = require('./lib/utils');
const config = require('./lib/config');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const MONITOR_STATE_FILE = path.join(__dirname, '../data/monitor_state.json');

// 🟢 第三階段優化：差異化門檻
function getThreshold(symbol) {
    if (symbol.startsWith('^') || symbol.includes('=F')) return -1.0; // 指數與黃金類跌 1% 預警
    if (symbol.includes('.TW')) return -2.0; // 盤中個股跌 2% 預警
    return -5.0; // 加密貨幣波動大，跌 5% 預警
}

async function runMonitor() {
    log('📡', '啟動專業級監控衛星...');

    try {
        const snapshot = await getMarketSnapshot();
        if (!snapshot) return;

        const allTargets = [
            ...(Object.values(snapshot.crypto || {})),
            ...(Object.values(snapshot.traditional || {}))
        ];

        let state = {};
        if (fs.existsSync(MONITOR_STATE_FILE)) {
            state = JSON.parse(fs.readFileSync(MONITOR_STATE_FILE, 'utf8'));
        }

        const now = Date.now();
        const COOL_DOWN_MS = 3600000; // 1 小時冷卻

        for (const target of allTargets) {
            const currentPrice = target.price;
            const lastPrice = state[target.name]?.price || currentPrice;
            const lastAlertAt = state[target.name]?.lastAlertAt || 0;

            if (!currentPrice || isNaN(currentPrice)) continue;

            // 🟢 第五階段：實時獲取技術指標
            const tech = await getTechnicalIndicators(target.symbol || '');
            const rsiStr = tech ? `${tech.rsi} (${tech.rsi < 30 ? '超賣🔥' : tech.rsi > 70 ? '超買❄️' : '中性'})` : '計算中';

            const changeRate = ((currentPrice - lastPrice) / lastPrice) * 100;
            const threshold = getThreshold(target.symbol || '');

            log('📊', `[${target.name}] $${currentPrice.toLocaleString()} (RSI: ${tech?.rsi || '?'}, 當前: ${changeRate.toFixed(2)}%)`);

            // 異動偵測邏輯 (跌破門檻 OR RSI 極度超賣 OR RSI 極度超買)
            const isOverbought = tech && tech.rsi > 75;
            const isOversold = tech && tech.rsi < 25;
            const isAbnormalDrop = changeRate <= threshold;

            if ((isAbnormalDrop || isOversold || isOverbought) && (now - lastAlertAt > COOL_DOWN_MS)) {
                log('🚨', `觸發預警: ${target.name} (RSI: ${tech?.rsi})`);

                let title = `🏮 市場移動預警: ${target.name}`;
                let color = 15158332; // 默認紅色 (風險)
                let description = `偵測到 **${target.name}** 出現顯著波動。`;

                if (isOversold) {
                    title = `💎 潛在進場機會: ${target.name}`;
                    color = 3066993; // 綠色
                    description = `指標顯示 **超賣**，數值為 ${tech.rsi}，可能存在支撐。`;
                } else if (isOverbought) {
                    title = `📦 建議獲利了結/減碼: ${target.name}`;
                    color = 15844367; // 黃色/橙色
                    description = `指標顯示 **超買**，數值為 ${tech.rsi}，需注意回測風險。`;
                }

                const embed = {
                    title: title,
                    description: description,
                    color: color,
                    fields: [
                        { name: '當前價格', value: `**$${currentPrice.toLocaleString()}**`, inline: true },
                        { name: '波動幅度', value: `**${changeRate.toFixed(2)}%**`, inline: true },
                        { name: 'RSI 強弱', value: `**${rsiStr}**`, inline: true },
                        { name: '均線趨勢', value: tech ? `${tech.trend === 'BULL' ? '🟢多頭' : '🔴空頭'} (MA20: ${tech.ma20})` : '未知', inline: false }
                    ],
                    footer: { text: "AI 財經監控終端 v9.1.0 | 戰術建議版" },
                    timestamp: new Date().toISOString()
                };

                await sendDiscordEmbed(embed, config.discordAlertWebhook);

                // 儲存警報時間
                state[target.name] = { price: currentPrice, lastAlertAt: now };

                // 🟢 智慧聯動：如果跌幅劇烈 (<-3.0% 或 指數跌 > 1%)，主動觸發 AI 分析
                if (changeRate <= -3.0 || (target.symbol.startsWith('^') && changeRate <= -1.0)) {
                    log('🧠', '啟動 AI 智慧追擊分析...');
                    exec(`node src/index.js --emergency --target="${target.name}"`, (err) => {
                        if (err) log('❌', `AI 聯動失敗: ${err.message}`);
                    });
                }
            } else {
                // 僅更新價格，不重置警報時間
                state[target.name] = {
                    price: currentPrice,
                    lastAlertAt: lastAlertAt
                };
            }
        }

        fs.writeFileSync(MONITOR_STATE_FILE, JSON.stringify(state, null, 2));
        log('💾', '所有標的巡邏完畢，狀態已存檔。');

    } catch (e) {
        log('❌', `監控程序異常: ${e.message}`);
    }
}

runMonitor();
