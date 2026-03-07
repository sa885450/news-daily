const { getTechnicalIndicators } = require('./lib/indicators');
const { log, sendDiscordEmbed } = require('./lib/utils');
const config = require('./lib/config');
const cron = require('node-cron');

/**
 * 🌕 v13.5.0: 戰術晚報與全面表格化重構
 * 1. 實現 23:00 的深夜發報 (納入美股開盤分析)
 * 2. 實現台股/全球股分流發送且全表格化
 */

// 🟢 輔助函數：將資料格式化為 Markdown 表格
function formatAsTable(title, results, isNight = false) {
    let header = `### ${title}\n`;
    if (isNight) {
        header += `> *🌙 次日智慧單整備版 (分析點：美股開盤趨勢)*\n\n`;
    } else {
        header += `> *☀️ 盤前戰術最後確認*\n\n`;
    }

    let table = `| 標的 | 當前價 | RSI | 指令/智慧單建議 | 評級 |\n`;
    table += `| :--- | :--- | :--- | :--- | :--- |\n`;

    results.forEach(r => {
        const orderInfo = r.costInfo
            ? `建倉:**${r.costInfo.costAt99.toLocaleString()}**`
            : `接:**${r.buy5.toLocaleString()}**`;
        table += `| **${r.name}** | ${r.price.toLocaleString()} | ${r.rsi} | ${orderInfo} | **${r.evaluation.grade}** |\n`;
    });

    return header + table + `\n---\n`;
}

async function generateTacticalReport() {
    const isNight = new Date().getHours() >= 21;
    log('🌅', `開始產生【全面表格化】戰術報告 (v13.5.0) [時段: ${isNight ? '深夜' : '晨間'}]...`);

    const symbols = config.tacticalSymbols.split(',').map(s => s.trim());
    const myCosts = config.myCosts;

    try {
        const results = await Promise.all(symbols.map(async (symbol) => {
            const tech = await getTechnicalIndicators(symbol);
            if (!tech) return null;

            const buy5 = tech.prevClose * 0.95;
            const myCostPrice = myCosts[symbol];
            let costInfo = null;
            if (myCostPrice) {
                costInfo = {
                    cost: myCostPrice,
                    costAt99: myCostPrice * 0.99,
                    pnl: ((tech.price - myCostPrice) / myCostPrice * 100).toFixed(2)
                };
            }

            const evaluation = getTacticalGrade(tech, buy5, costInfo);

            return {
                name: symbol,
                price: tech.price,
                buy5,
                rsi: tech.rsi,
                costInfo,
                evaluation
            };
        }));

        const activeResults = results.filter(r => r !== null);
        if (activeResults.length === 0) return;

        // 🟢 分類：台股 (.TW) 與 全球/其他
        const twStocks = activeResults.filter(r => r.name.endsWith('.TW'));
        const globalAssets = activeResults.filter(r => !r.name.endsWith('.TW'));

        // 🟢 1. 發送台股戰報
        if (twStocks.length > 0) {
            const twTable = formatAsTable("🛡️ 台股戰術特快 (TW)", twStocks, isNight);
            await sendDiscord(twTable, config.discordAlertWebhook);
            await sleep(1000);
        }

        // 🟢 2. 發送全球/美股/加密貨幣戰報
        if (globalAssets.length > 0) {
            const globalTable = formatAsTable("🌍 全球資產戰報 (Global)", globalAssets, isNight);
            await sendDiscord(globalTable, config.discordAlertWebhook);
        }

        log('✅', '【全面表格化】戰術報告已分發。');

    } catch (e) {
        log('❌', `戰術報告產生失敗: ${e.message}`);
    }
}

// 🕰️ 排程：
// 1. 每日 23:00 (🌙 晚報預發 - 智慧單對齊)
cron.schedule('0 23 * * *', () => generateTacticalReport());

// 2. 週一至週五 08:30 (☀️ 晨報 - 開盤最後點校)
cron.schedule('30 8 * * 1-5', () => generateTacticalReport());

if (process.argv.includes('--now')) generateTacticalReport();

module.exports = { generateTacticalReport };
