const { getTechnicalIndicators, getADRChange } = require('./lib/indicators');
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

        const expectedStr = r.evaluation.adrChange ? ` (預期開盤: \`${r.evaluation.expectedOpen.toLocaleString()}\`)` : '';
        const actionStr = r.evaluation.isAborted ? `🚨 **暫停買入**: 成本 \`${(r.costInfo ? r.costInfo.cost : 0).toLocaleString()}\` 過高` : `🤖 **智慧單指令**: \`設置 ${parseFloat(r.evaluation.orderPrice.toFixed(2)).toLocaleString()} 觸價單 (${r.evaluation.orderName})\``;

        embed.fields.push({
            name: `🔹 **${r.name}** [${r.evaluation.grade}]`,
            value: [
                `現價: \`${r.price.toLocaleString()}\` ${trendIcon}${pnlStr}${expectedStr}`,
                `支撐: 月線 \`${r.levels.A.toLocaleString()}\` / 季線 \`${r.levels.C.toLocaleString()}\``,
                `🎯 **金字塔分層**: ${levelStr}`,
                r.costInfo ? `⚖️ **加碼後預測均價**: \`${parseFloat(r.costInfo.newBase.toFixed(2)).toLocaleString()}\`` : '',
                actionStr
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

// 🟢 核心邏輯：三層金字塔評級系統 (v13.7.8 升級版)
// 引入 adrChange 用以計算 Expected Open，並在買點無利可圖時進行中止判斷 (Abort)
function getTacticalGrade(tech, costInfo, adrChange = 0) {
    const { price, ma20, ma60, rsi } = tech;
    const levelA = ma20;
    const levelB = ma20 * 0.95;
    const levelC = ma60;

    let grade = 'B (觀望)';
    let orderPrice = levelA;
    let orderName = '層級 A:月線';

    // 🟢 v13.7.8: 預期的開盤價 (基於 ADR 跌幅)
    const expectedOpen = price * (1 + adrChange);

    const myCostPrice = costInfo ? costInfo.cost : null;

    if (price <= levelC) {
        grade = 'S (重錘)';
        orderPrice = levelC * 0.98; // 季線已破，往下 2% 找支撐點
        orderName = '層級 C:季線下探';
    } else if (price <= levelB) {
        grade = 'A (撿寶)';
        orderPrice = levelC * 1.005; // 季線上緣
        orderName = '層級 C:季線金位';
    } else if (price <= levelA) {
        grade = 'A (回補)';
        orderPrice = levelB * 1.005; // 月線下 5% 之上緣
        orderName = '層級 B:月下 5%';
    } else {
        // 🟢 v13.7.8: 根據計畫書，改為預期開盤價與月線防守的連動
        grade = price > levelA * 1.05 ? 'C (警戒)' : 'B (觀望)';

        // Sweet Point A 邏輯：取預期開盤與月線防守之最大值 (優先保證成交)
        orderPrice = Math.max(levelA + 3, expectedOpen);
        orderName = '智取單:開盤連動';
    }

    // 🟢 v13.7.10: 優化攤平效率保護 (提供合理低位區參考價，而非暫停買入)
    let isAborted = false;
    if (myCostPrice && orderPrice >= myCostPrice) {
        // 如果原本算出的甜甜價 > 用戶均價，代表沒有攤平效果或者追高。
        // 取消 Abort 強制中止，改為給予「成本過關參考價」 (如成本的 0.985，即跌 1.5% 後才接)
        const suggestedPrice = myCostPrice * 0.985;
        // 確保這個參考價有一定合理性，不低於季線防衛底部
        orderPrice = Math.max(suggestedPrice, levelC);
        orderName = '智取單:成本極限前緣';
        grade = 'C (超限補位)';
        // isAborted 保留給非常極端的例外，在此情境停用
    }

    return {
        grade,
        orderPrice,
        orderName,
        isAborted,
        adrChange,
        expectedOpen,
        levels: { A: levelA, B: levelB, C: levelC }
    };
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

            // 🟢 v13.7.8 獲取對等 ADR 數值 (目前僅針對 2330.TW 取得 TSM)
            let adrVal = 0;
            if (symbol === '2330.TW') {
                adrVal = await getADRChange('TSM');
            }

            const myCostPrice = myCosts[symbol];
            let costInfo = null;

            // 實作金字塔位階評級
            const evaluation = getTacticalGrade(tech, costInfo ? { cost: myCostPrice } : (myCostPrice ? { cost: myCostPrice } : null), adrVal);

            if (myCostPrice) {
                // 試算買入一層後的加碼效率 (假設 1:1 稀釋)
                const targetBuyPrice = evaluation.orderPrice;
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
