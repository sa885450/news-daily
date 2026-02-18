const { execSync } = require('child_process');
const { gitPath, publicDir, dbPath } = require('./config');
const { log } = require('./utils');

function pushToGitHub() {
    log('📤', "正在執行 Git Push...");
    
    try {
        // 加入 DB 與 Public 目錄
        execSync(`${gitPath} add "${dbPath}" "${publicDir}"`);
        execSync(`${gitPath} commit -m "🤖 Local Bot Update: ${new Date().toLocaleString()}"`);
        execSync(`${gitPath} push origin main`);
        log('✅', 'Git Push 成功！網站已更新。');
    } catch (error) {
        const stdoutMsg = error.stdout ? error.stdout.toString() : '';
        const stderrMsg = error.stderr ? error.stderr.toString() : '';
        const errMsg = stderrMsg || stdoutMsg || error.message;

        if (errMsg.includes('nothing to commit') || stdoutMsg.includes('nothing to commit') || errMsg.includes('沒有變更')) {
            log('💤', '資料庫無變動，跳過上傳。');
        } else {
            log('❌', `Git Push 失敗: ${errMsg.trim()}`);
        }
    }
}

module.exports = { pushToGitHub };