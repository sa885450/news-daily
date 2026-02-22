const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * News Daily AI Bot - EJS 自動語法修復工具 (v5.3.0)
 * 功能：修復 <% - 標籤空格問題並自動重產 HTML
 */

const targetFiles = [
    path.join(__dirname, '../src/views/index.ejs'),
    path.join(__dirname, 'rebuild_views.js')
];

const REBUILD_SCRIPT = path.join(__dirname, 'rebuild_views.js');

console.log('🚀 開始執行 EJS 自動修復程序...');

let fixedCount = 0;

targetFiles.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ 找不到檔案：${filePath}`);
        return;
    }

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        // 正則匹配：<% 後面跟著空格與減號，替換為標準的 <%-
        const regex = /<%\s+-/g;

        if (regex.test(content)) {
            const newContent = content.replace(regex, '<%-');
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`✅ 已修正：${path.basename(filePath)}`);
            fixedCount++;
        } else {
            console.log(`✨ 檔案結構正常：${path.basename(filePath)}`);
        }
    } catch (error) {
        console.error(`❌ 修復檔案 ${filePath} 時發生錯誤:`, error.message);
    }
});

if (fixedCount > 0 || fs.existsSync(path.join(__dirname, '../public/index.html'))) {
    console.log('\r\n🔄 正在觸發連鎖反應：重新產生 index.html...');
    try {
        // 使用與專案一致的執行方式
        execSync(`node "${REBUILD_SCRIPT}"`, { stdio: 'inherit' });
        console.log('\r\n🎉 修復完成且視圖已重產！您可以重新整併頁面圖表了。');
    } catch (error) {
        console.error('❌ 執行 rebuild_views.js 時失敗:', error.message);
    }
} else {
    console.log('\r\n🆗 語法無礙，無需額外處理。');
}
