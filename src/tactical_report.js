const { getTechnicalIndicators } = require('./lib/indicators');
const { log, sendDiscord, sendDiscordEmbed, sleep } = require('./lib/utils');
const config = require('./lib/config');
const cron = require('node-cron');

/**
 * 🛡️ v13.7.4: 戰術報告視覺大改造 (Embed 格式)
 * 1. 徹底捨棄不穩定的 Markdown/ASCII 表格
 * 2. 採用 Discord Embed (富文本卡片) 渲染
 * 3. 實作晨晚報動態色彩分流
 */

// 🟢 輔助函數：將資料格式化為 Discord Embed 戰術卡片 (v13.7.4)
function formatAsEmbed(title, results, isNight = false) {
    const embed = {
        title: `🛡️ ${title}`,
        description: isNight ? "🌙 **晚報：次日智慧單整備** (美股開盤趨勢)" : "☀️ **晨報：盤前戰術最後校準**",
        color: isNight ? 3447003 : 15844367, // 深藍 (夜) / 金色 (晨)
        fields: [],
        timestamp: new Date().toISOString(),
        footer: { text: "智捷戰術核心 v13.7.4" }
    };

    // 1. 各標的戰術詳細欄位
    results.forEach(r => {
        const trendIcon = r.price > r.levels.A ? '📈' : '📉';
        const pnlStr = r.costInfo ? ` (持倉損益: ${r.costInfo.pnl}%)` : '';
        const levelStr = `1️⃣月:**${r.levels.A.toLocaleString()}** | 2️⃣跌:**${r.levels.B.toLocaleString()}** | 3️⃣季:**${r.levels.C.toLocaleString()}**`;

        embed.fields.push({
            name: `🔹 **${r.name}** [${r.evaluation.grade}]`,
            value: [
                `現價: \`${r.price.toLocaleString()}\` ${trendIcon}${pnlStr}`,
                `支撐: 月線 \`${r.levels.A.toLocaleString()}\` / 季線 \`${r.levels.C.toLocaleString()}\``,
                `🎯 **金字塔分層**: ${levelStr}`,
                r.costInfo ? `⚖️ **加碼後新成本**: \`${r.costInfo.newBase.toLocaleString()}\`` : '',
                `🤖 **智慧單指令**: \`設置 ${r.evaluation.orderPrice.toLocaleString()} 智慧單 (${r.evaluation.orderName})\``
            ].filter(l => l).join('\n'),
            inline: false
        });
    });

    // 2. 盤前劇本演練
    embed.fields.push({
        name: "🎭 **盤前量化劇本演練**",
        value: [
            "🟢 **強勢回檔**: 開盤 > 月線 → 取消低位單，月線防守。",
            "🟡 **正常修正**: 開盤 介於 MA20~B 點 → 維持佈單。",
            "🔴 **恐慌破位**: 開盤 < 季線 → 下修買點至 C 點金位。"
        ].join('\n')
    });

    return embed;
}

// 🟢 核心邏輯：三層金字塔評級系統 (v13.7.0)
function getTacticalGrade(tech, costInfo) {
    const { price, ma20, ma60, rsi } = tech;
    const levelA = ma20;
    const levelB = ma20 * 0.95;
    const levelC = ma60;

    let grade = 'B (觀望)';
    let orderPrice = levelA;
    let orderName = '層級 A:月線';

    if (price <= levelC) {
        grade = 'S (重錘)';
        orderPrice = levelC * 0.98; // 季線已破，往下 2% 找支撐點
        orderName = '層級 C:季線下探';
    } else if (price <= levelB) {
        grade = 'A (撿寶)';
        orderPrice = levelC;
        orderName = '層級 C:季線金位';
    } else if (price <= levelA) {
        grade = 'A (回補)';
        orderPrice = levelB;
        orderName = '層級 B:超跌 5%';
    } else {
        // 價格在月線上方，下單指令設在月線
        grade = price > levelA * 1.05 ? 'C (警戒)' : 'B (觀望)';
        orderPrice = levelA;
        orderName = '層級 A:月線回測';
    }

    return { grade, orderPrice, orderName, levels: { A: levelA, B: levelB, C: levelC } };
}

async function generateTacticalReport() {
    const isNight = new Date().getHours() >= 21;
    log('🌅', `開始產生【戰術卡片】報告 (v13.7.4) [時段: ${isNight ? '深夜' : '晨間'}]...`);

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

        // 🟢 1. 發送台股戰報 Embed
        if (twStocks.length > 0) {
            const twEmbed = formatAsEmbed("台股戰術特快 (TW)", twStocks, isNight);
            await sendDiscordEmbed(twEmbed, config.discordTacticalWebhook);
            await sleep(1000);
        }

        // 🟢 2. 發送全球/美股戰報 Embed
        if (globalAssets.length > 0) {
            const globalEmbed = formatAsEmbed("全球資產戰報 (Global)", globalAssets, isNight);
            await sendDiscordEmbed(globalEmbed, config.discordTacticalWebhook);
        }

        log('✅', '【戰術卡片】報告已分發。');

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
