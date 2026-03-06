const { getTechnicalIndicators } = require('./lib/indicators');
const { log, sendDiscordEmbed } = require('./lib/utils');
const config = require('./lib/config');
const cron = require('node-cron');

/**
 * 🌕 v11.1.0: 戰術評級演算法
 * 結合 RSI, 趨勢與波段位置給出評價
 */
function getTacticalGrade(tech, buy5) {
    const { rsi, trend, price, minLow } = tech;
    let score = 50; // 基準分
    let rationale = [];

    // 1. 強弱勢檢查
    if (rsi < 30) { score += 20; rationale.push('超賣強反彈🔥'); }
    if (rsi > 70) { score -= 20; rationale.push('超買需避險❄️'); }

    // 2. 趨勢檢查
    if (trend === 'BULL') { score += 10; rationale.push('多頭格局'); }
    else { score -= 10; rationale.push('空頭壓制'); }

    // 3. 支撐位對齊 (關鍵位一鍵對齊)
    const distToSupport = Math.abs((buy5 - minLow) / minLow);
    if (distToSupport < 0.02) {
        score += 15;
        rationale.push('接近 20 日強支撐區🎯');
    }

    // 評級判定
    if (score >= 80) return { grade: 'S+', title: '極度低估 / 強力擊球區', color: 3066993, confidence: score, note: rationale.join(' + ') };
    if (score >= 65) return { grade: 'A', title: '健康回撤 / 穩健佈局', color: 3447003, confidence: score, note: rationale.join(' + ') };
    if (score >= 45) return { grade: 'B', title: '常規波動 / 分批測試', color: 15844367, confidence: score, note: rationale.join(' + ') || '盤整觀望' };
    return { grade: 'C', title: '高點盤整 / 慎防拉回', color: 15158332, confidence: score, note: rationale.join(' + ') };
}

async function generateTacticalReport() {
    log('🌅', '開始產生【帶有靈魂】的早盤戰術報告 (v11.1.0)...');

    const symbols = config.tacticalSymbols.split(',').map(s => s.trim());

    try {
        const results = await Promise.all(symbols.map(async (symbol) => {
            const tech = await getTechnicalIndicators(symbol);
            if (!tech) return null;

            const buy3 = tech.prevClose * 0.97;
            const buy5 = tech.prevClose * 0.95;
            const draw5 = tech.maxHigh * 0.95;

            const evaluation = getTacticalGrade(tech, buy5);

            return {
                name: symbol,
                price: tech.price,
                buy3, buy5, draw5,
                peak: tech.maxHigh,
                support: tech.minLow,
                rsi: tech.rsi,
                evaluation
            };
        }));

        const activeResults = results.filter(r => r !== null);
        if (activeResults.length === 0) return;

        for (const r of activeResults) {
            const embed = {
                title: `🛡️ 戰術評級：[ ${r.evaluation.grade} ] - ${r.evaluation.title}`,
                description: `標的：**${r.name}** | 當前價: **$${r.price.toLocaleString()}** (RSI: ${r.rsi})`,
                color: r.evaluation.color,
                fields: [
                    { name: '🎯 執行指令', value: `建議 A (-3%): \`${r.buy3.toLocaleString()}\`\n建議 B (-5%): \`${r.buy5.toLocaleString()}\``, inline: true },
                    { name: '🏔️ 壓力/支撐', value: `60日高點: \`${r.peak.toLocaleString()}\`\n20日支撐: \`${r.support.toLocaleString()}\``, inline: true },
                    { name: '🧠 戰術分析', value: `依據：**${r.evaluation.note}**\n信心指數：\`${r.evaluation.confidence}%\``, inline: false }
                ],
                footer: { text: "AI 戰術終端 v11.1.0 | 靈魂評分系統" },
                timestamp: new Date().toISOString()
            };
            await sendDiscordEmbed(embed, config.discordAlertWebhook);
        }

        log('✅', '【帶有靈魂】的戰術報告已分發。');

    } catch (e) {
        log('❌', `戰術報告產生失敗: ${e.message}`);
    }
}

// 🕰️ 排程：週一至週五 08:30 (開盤前)
cron.schedule('30 8 * * 1-5', () => generateTacticalReport());

if (process.argv.includes('--now')) generateTacticalReport();
