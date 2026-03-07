const { execSync } = require('child_process');
const { gitPath, publicDir, dbPath } = require('./config');
const { log } = require('./utils');

// 🟢 v13.1.6: 全域 Git 互斥鎖，防止多排程並發導致倉庫對象損毀
let _isGitPushing = false;

function pushToGitHub() {
    // 若上一次 push 尚未完成，直接跳過本次 (避免競態條件)
    if (_isGitPushing) {
        log('⏸️', 'Git Push 已有一個進行中，跳過本次以防衝突。');
        return;
    }

    _isGitPushing = true;
    log('📤', "正在執行 Git Push...");

    try {
        // v13.7.11 修復：不再寫死檔案名，改用 add . 讓 .gitignore 生效過濾掉 *.db，解決鎖定阻擋問題
        execSync(`"${gitPath}" add .`, { windowsHide: true, stdio: 'ignore' });
        execSync(`"${gitPath}" commit -m "🤖 Local Bot Update: ${new Date().toLocaleString()}"`, { windowsHide: true, stdio: 'ignore' });
        execSync(`"${gitPath}" push origin main`, { windowsHide: true, stdio: 'ignore' });
        log('✅', 'Git Push 成功！網站已更新。');
    } catch (error) {
        const stdoutMsg = error.stdout ? error.stdout.toString() : '';
        const stderrMsg = error.stderr ? error.stderr.toString() : '';
        const errMsg = stderrMsg || stdoutMsg || error.message;

        if (errMsg.includes('nothing to commit') || stdoutMsg.includes('nothing to commit') || errMsg.includes('沒有變更')) {
            log('💤', '資料庫無變動，跳過上傳。');
        } else if (errMsg.includes('unstable object') || errMsg.includes('confused by')) {
            // 🟢 v13.1.6: 倉庫對象損壞自動修復
            log('🔧', `Git 倉庫對象異常，嘗試自動修復 (git gc)...`);
            try {
                execSync(`"${gitPath}" gc --prune=now`, { windowsHide: true, stdio: 'ignore' });
                log('✅', 'Git gc 修復完成，下次排程將重試。');
            } catch (gcErr) {
                log('❌', `Git gc 修復失敗: ${gcErr.message}`);
            }
        } else {
            log('❌', `Git Push 失敗: ${errMsg.trim()}`);
        }
    } finally {
        _isGitPushing = false;
    }
}

module.exports = { pushToGitHub };