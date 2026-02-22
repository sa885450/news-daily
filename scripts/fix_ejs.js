const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * News Daily AI Bot - EJS 自動語法修復工具 (v5.3.4)
 * 功能：
 * 1. 修復 index.ejs 模版中的 <% - 標籤空格
 * 2. 修復 HTML 標籤內部的多餘空格
 */

const VIEWS_INDEX = path.join(__dirname, '../src/views/index.ejs');
const REBUILD_SCRIPT = path.join(__dirname, 'rebuild_views.js');

console.log('🚀 開始執行 EJS 深度修復程序...');

function fixFile(filePath, isRebuildScript = false) {
    if (!fs.existsSync(filePath)) return false;

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        // 1. 修復 EJS 標籤空格: <% -  => <%-
        content = content.replace(/<%\s+-/g, '<%-');

        // 2. 修復 HTML 標籤內部的多餘空格 (例如 < div, </ div, < span)
        content = content.replace(/<\s+\/?\s*(div|span|h3|h4|p|span|section|article|header|footer|ul|li|a)\b/gi, (match) => {
            return match.replace(/\s+/g, '');
        });

        // 修正標籤結尾可能有空格的情況: <div > => <div>
        content = content.replace(/<(div|span|h3|h4|p|span|section|article)\s+>/gi, '<$1>');
        content = content.replace(/<\/\s*(div|span|h3|h4|p|span|section|article)\s*>/gi, '</$1>');

        // 3. 專門針對 rebuild_views.js 的修復 (目前僅保留空位，由手動修復確保轉義正確)
        if (isRebuildScript) {
            // 已移除了複雜的轉義正則，以避免誤殺語法
        }

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ 已修正檔案：${path.basename(filePath)}`);
            return true;
        } else {
            console.log(`✨ 檔案無需修正：${path.basename(filePath)}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ 處理 ${filePath} 時出錯:`, error.message);
        return false;
    }
}

const f1 = fixFile(VIEWS_INDEX);
const f2 = fixFile(REBUILD_SCRIPT, true);

if (f1 || f2 || fs.existsSync(path.join(__dirname, '../public/index.html'))) {
    console.log('\r\n🔄 正在嘗試重新產生 index.html...');
    try {
        execSync(`node "${REBUILD_SCRIPT}"`, { stdio: 'inherit' });
        console.log('\r\n🎉 一鍵修復成功！網頁圖表應已恢復正常。');
    } catch (error) {
        console.log('\r\n⚠️ 視圖建構腳本仍有語法錯誤。請檢查日誌或聯繫開發人員。');
        console.error(error.message);
    }
} else {
    console.log('\r\n🆗 系統目前狀態良好。');
}
