const fs = require('fs');
require('dotenv').config();
const config = require('./src/lib/config');

function matchesAny(text, regexArray) {
    if (!regexArray || regexArray.length === 0) return false;
    return regexArray.some(re => re.test(text));
}

const mockNews = [
    { title: "川普勝選機率大增", contentSnippet: "市場反應激烈..." },
    { title: "美股大漲", contentSnippet: "因為川普的政策..." },
    { title: "這是廣告:川普推薦", contentSnippet: "買就送" } // 符合排除關鍵字 "廣告"
];

let log = "--- 關鍵字匹配測試 ---\n";
log += `KEYWORDS: ${process.env.KEYWORDS}\n`;
log += `EXCLUDE: ${process.env.EXCLUDE_KEYWORDS}\n\n`;

mockNews.forEach((n, i) => {
    const text = `${n.title} ${n.contentSnippet}`;
    const inc = matchesAny(text, config.includeRegex);
    const exc = matchesAny(text, config.excludeRegex);
    log += `新闻 ${i + 1}: "${n.title}"\n`;
    log += ` - 匹配包含: ${inc}\n`;
    log += ` - 匹配排除: ${exc}\n`;
    log += ` - 最終判定: ${inc && !exc ? '✅ 通過' : '❌ 攔截'}\n\n`;
});

fs.writeFileSync('match_test.txt', log);
console.log("Done");
