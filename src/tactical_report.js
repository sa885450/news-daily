const { getTechnicalIndicators } = require('./lib/indicators');
const { log, sendDiscord, sendDiscordEmbed, sleep } = require('./lib/utils');
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
    header += isNight ? `> *🌙 晚報：次日智慧單整備 (分析點：美股開盤趨勢)*\n\n` : `> *☀️ 晨報：盤前戰術最後校準*\n\n`;

    let table = `| 標的 | 當前價 | 月線(MA20) | 季線(MA60) | 三層金字塔建議 | 買入後新成本 | 評級 |\n`;
    table += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    results.forEach(r => {
        const levels = [
            `1: ${r.levels.A.toLocaleString()}`,
            `2: ${r.levels.B.toLocaleString()}`,
            `3: ${r.levels.C.toLocaleString()}`
        ].join(' / ');

        const newCost = r.costInfo ? r.costInfo.newBase.toLocaleString() : '--';
        const priceDiff = r.price > r.levels.A ? `+${((r.price - r.levels.A) / r.levels.A * 100).toFixed(1)}%` : `${((r.price - r.levels.A) / r.levels.A * 100).toFixed(1)}%`;

        table += `| **${r.name}** | ${r.price.toLocaleString()} (${priceDiff}) | ${r.levels.A.toLocaleString()} | ${r.levels.C.toLocaleString()} | ${levels} | ${newCost} | **${r.evaluation.grade}** |\n`;
    });

    return header + table + `\n`;
}

// 🟢 核心邏輯：三層金字塔評級系統 (v13.7.0)
function getTacticalGrade(tech, costInfo) {
    const { price, ma20, ma60, rsi } = tech;
    const levelA = ma20;
    const levelB = ma20 * 0.95;
    const levelC = ma60;

    let grade = 'B (觀望)';
    let rationale = '目前處於區間波動，建議等待支撐位。';

    if (price <= levelC) {
        grade = 'S (重錘)';
        rationale = '股價已觸及季線「黃金坑」，長線無腦加碼區。';
    } else if (price <= levelB) {
        grade = 'A (撿寶)';
        rationale = '月線超跌 5%，市場出現恐慌性甜甜價。';
    } else if (price <= levelA) {
        if (rsi < 45) {
            grade = 'A+ (止跌)';
            rationale = '回測月線且 RSI 低檔，止跌訊號觀察中。';
        } else {
            grade = 'A (回補)';
            rationale = '觸及月線支撐，常態性分批回補點。';
        }
    } else if (price > levelA * 1.05) {
        grade = 'C (警戒)';
        rationale = '股價正乖離過大，嚴禁追高，靜待回測。';
    }

    return { grade, rationale, levels: { A: levelA, B: levelB, C: levelC } };
}

function generatePlaybook(results) {
    let playbook = `\n### 🎭 盤前劇本演練 (量化情境對策)\n`;
    playbook += `| 劇本 | 條件設定 | 建議動作 |\n`;
    playbook += `| :--- | :--- | :--- |\n`;
    playbook += `| **強勢回檔** | 開盤 > 月線 (MA20) | 取消低位智慧單，改為月線附近防守進場。 |\n`;
    playbook += `| **正常修正** | 開盤 介於 MA20 ~ MA20*0.95 | 維持原定金字塔 第一層/第二層 佈單。 |\n`;
    playbook += `| **恐慌破位** | 開盤 < 季線 (MA60) | **全面下修買點 A 到 C**，季線下方才是真正的重錘區。 |\n\n`;
    return playbook;
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

            const myCostPrice = myCosts[symbol];
            let costInfo = null;

            // 實作金字塔位階評級
            const evaluation = getTacticalGrade(tech);

            if (myCostPrice) {
                // 試算買入一層後的加碼效率 (假設 1:1 稀釋)
                const targetBuyPrice = evaluation.levels.A;
                costInfo = {
                    cost: myCostPrice,
                    newBase: (myCostPrice + targetBuyPrice) / 2,
                    pnl: ((tech.price - myCostPrice) / myCostPrice * 100).toFixed(2)
                };
            }

            return {
                name: symbol,
                price: tech.price,
                levels: evaluation.levels,
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
            let twTable = formatAsTable("🛡️ 台股戰術特快 (TW)", twStocks, isNight);
            twTable += generatePlaybook(twStocks);
            await sendDiscord(twTable, config.discordTacticalWebhook);
            await sleep(1000);
        }

        // 🟢 2. 發送全球/美股/加密貨幣戰報
        if (globalAssets.length > 0) {
            let globalTable = formatAsTable("🌍 全球資產戰報 (Global)", globalAssets, isNight);
            globalTable += generatePlaybook(globalAssets);
            await sendDiscord(globalTable, config.discordTacticalWebhook);
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
