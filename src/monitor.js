const { getMarketSnapshot } = require('./lib/mcp');
const { getTechnicalIndicators } = require('./lib/indicators');
const { log, sendDiscordEmbed } = require('./lib/utils');
const config = require('./lib/config');
const db = require('./lib/db');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const MONITOR_STATE_FILE = path.join(__dirname, '../data/monitor_state.json');

// 🟢 差異化門檻 (v12.0.1 恢復)
function getThreshold(symbol) {
    if (!symbol) return -2.0;
    if (symbol.startsWith('^') || symbol.includes('=F')) return -1.0; // 指數與黃金類跌 1% 預警
    if (symbol.includes('.TW')) return -2.0; // 盤中個股跌 2% 預警
    return -5.0; // 加密貨幣波動大，跌 5% 預警
}

// 🟢 v12.0.0: 三級警報門檻與權重判斷
function evaluateAlertLevel(target, tech, changeRate) {
    if (!tech) return { level: 'NONE', color: 0, score: 0 };

    let score = 0;
    const threshold = getThreshold(target.symbol);
    const isAbnormalDrop = changeRate <= threshold;
    const isHeavyVolume = tech.volumeRatio >= 2.0;
    const isRSIExtremes = tech.rsi <= 25 || tech.rsi >= 75;

    if (isAbnormalDrop) score += 2;
    if (isHeavyVolume) score += 2;
    if (isRSIExtremes) score += 1;
    if (tech.trend === 'BEAR' && changeRate < 0) score += 1;

    if (score >= 5) return { level: 'RED', color: 15158332, label: '🚨 垂直打擊 (緊急風險)' };
    if (score >= 3) return { level: 'ORANGE', color: 15844367, label: '🟠 進階預警 (趨勢轉折)' };
    if (score >= 1) return { level: 'YELLOW', color: 3447003, label: '🟡 一般預告 (標的異動)' };

    return { level: 'NONE', color: 0, score };
}

async function runMonitor() {
    log('📡', '啟動專業級監控衛星 v12.0.1...');

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
        const COOL_DOWN_MS = 3600000;

        for (const target of allTargets) {
            const currentPrice = target.price;
            const lastPrice = state[target.name]?.price || currentPrice;
            const lastAlertAt = state[target.name]?.lastAlertAt || 0;

            if (!currentPrice || isNaN(currentPrice)) continue;

            const tech = await getTechnicalIndicators(target.symbol || '');
            const changeRate = ((currentPrice - lastPrice) / lastPrice) * 100;
            const alert = evaluateAlertLevel(target, tech, changeRate);

            log('📊', `[${target.name}] $${currentPrice.toLocaleString()} (VolRatio: ${tech?.volumeRatio || '?'}, RSI: ${tech?.rsi || '?'})`);

            if (alert.level !== 'NONE' && (now - lastAlertAt > COOL_DOWN_MS)) {
                log('🚨', `觸發 ${alert.level} 級預警: ${target.name}`);

                // 🟢 關聯近期新聞 (整合戰術直覺)
                let newsContext = "";
                try {
                    const recentNews = db.getRecentNewsForSymbol ? db.getRecentNewsForSymbol(target.symbol, target.name, 4) : [];
                    if (recentNews.length > 0) {
                        newsContext = "\n\n**🔍 近期相關新聞**:\n" + recentNews.map(n => `• ${n.title}`).join('\n');
                    }
                } catch (ne) { }

                const embed = {
                    title: `${alert.label}: ${target.name}`,
                    description: `偵測到 **${target.name}** 出現技術面異動。${newsContext}`,
                    color: alert.color,
                    fields: [
                        { name: '當前價格', value: `**$${currentPrice.toLocaleString()}**`, inline: true },
                        { name: '波動幅度', value: `**${changeRate.toFixed(2)}%**`, inline: true },
                        { name: '成交量比', value: `**${tech?.volumeRatio || '?'}x**`, inline: true },
                        { name: 'RSI 強弱', value: `**${tech?.rsi || '?'}**`, inline: true },
                        { name: '均線趨勢', value: tech ? `${tech.trend === 'BULL' ? '🟢多頭' : '🔴空頭'} (MA20: ${tech.ma20})` : '未知', inline: true }
                    ],
                    footer: { text: "AI 財經監控衛星 v12.0.1 | 專業告警頻道" },
                    timestamp: new Date().toISOString()
                };

                // 🟢 發送至「告警專屬頻道」
                await sendDiscordEmbed(embed, config.discordMonitorWebhook);

                state[target.name] = { price: currentPrice, lastAlertAt: now };

                // 打擊分析聯動 (僅限 RED 等級)
                if (alert.level === 'RED') {
                    exec(`node src/index.js --emergency --target="${target.name}"`, (err) => {
                        if (err) log('❌', `AI 聯動失敗: ${err.message}`);
                    });
                }
            } else {
                state[target.name] = { price: currentPrice, lastAlertAt: lastAlertAt };
            }
        }

        await checkAndSendDailySnapshot(allTargets, state);
        fs.writeFileSync(MONITOR_STATE_FILE, JSON.stringify(state, null, 2));
        log('💾', '巡邏完畢。');

    } catch (e) {
        log('❌', `監控程序異常: ${e.message}`);
    }
}

/**
 * 每日正午發送健康快照 (僅開市日)
 */
async function checkAndSendDailySnapshot(targets, state) {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();

    // 僅限週一到週五 (1-5)，且在 12 點時段
    if (day >= 1 && day <= 5 && hour === 12) {
        const todayStr = now.toISOString().split('T')[0];
        if (state.lastDailySnapshotAt === todayStr) return; // 今日已發送

        log('📊', '正在產生每日正午健康快照...');

        // 篩選核心標的 (0050, 2330, BTC, 黃金)
        const coreSymbols = ['2330.TW', '0050.TW', 'BTC-USD', 'GC=F'];
        const coreDatas = targets.filter(t => coreSymbols.includes(t.symbol) || coreSymbols.includes(t.name));

        const fields = await Promise.all(coreDatas.map(async t => {
            const tech = await getTechnicalIndicators(t.symbol || '');
            const rsiVal = tech ? tech.rsi : '?';
            const rsiStatus = tech ? (tech.rsi < 30 ? '🔥' : tech.rsi > 70 ? '❄️' : '⚖️') : '';
            return {
                name: `${t.name}`,
                value: `價格: **$${t.price.toLocaleString()}**\nRSI: **${rsiVal}** ${rsiStatus}`,
                inline: true
            };
        }));

        const embed = {
            title: `☀️ 每日市場健康快照 (${todayStr})`,
            description: "這是您的每日資產體溫表，協助您掌握長線佈局時機。",
            color: 3447003, // 藍色 (科技感)
            fields: fields,
            footer: { text: "AI 財經監控終端 v12.0.1 | 健康快照版" },
            timestamp: now.toISOString()
        };

        await sendDiscordEmbed(embed, config.discordMonitorWebhook);
        state.lastDailySnapshotAt = todayStr;
        log('✅', '每日健康快照已發送至 Discord。');
    }
}

runMonitor();
