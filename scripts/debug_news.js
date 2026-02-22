require('dotenv').config();
const { fetchCnyesAPI } = require('./src/lib/crawler');
const config = require('./src/lib/config');
const fs = require('fs');

function matchesAny(text, regexArray) {
    if (!regexArray || regexArray.length === 0) return false;
    return regexArray.some(re => re.test(text));
}

async function debug() {
    let output = "-----------------------------------------\n";
    output += `🔍 偵測時間: ${new Date().toISOString()}\n`;

    try {
        const news = await fetchCnyesAPI(5);
        output += `📡 抓取到 ${news.length} 則新聞\n`;

        const targetId = '6667';
        const found = news.find(n => n.link.includes(targetId));

        if (found) {
            output += `✅ 找到目標新聞: ${JSON.stringify(found, null, 2)}\n`;
            const targetText = `${found.title} ${found.contentSnippet || ""}`;
            output += `🎯 包含匹配: ${matchesAny(targetText, config.includeRegex)}\n`;
        } else {
            output += `❌ 找不到 ID 包含 ${targetId}\n`;
            const trumpNews = news.filter(n => n.title.includes("川普") || (n.contentSnippet && n.contentSnippet.includes("川普")));
            output += `🔥 包含「川普」的新聞共 ${trumpNews.length} 則\n`;
            trumpNews.forEach(n => {
                output += ` - [${n.link}] ${n.title}\n`;
                const targetText = `${n.title} ${n.contentSnippet || ""}`;
                output += `   匹配: 包含=${matchesAny(targetText, config.includeRegex)}, 排除=${matchesAny(targetText, config.excludeRegex)}\n`;
            });
        }
    } catch (e) {
        output += `❌ 錯誤: ${e.message}\n${e.stack}\n`;
    }
    output += "-----------------------------------------\n";
    fs.writeFileSync('debug_output.txt', output);
}

debug();
