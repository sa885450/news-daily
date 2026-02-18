require('dotenv').config({ path: '../.env' });
const { sendDiscordError, log } = require('../src/lib/utils');

async function testDiscord() {
    log('🧪', '開始測試 Discord 告警功能...');

    if (!process.env.DISCORD_WEBHOOK_URL) {
        log('❌', '錯誤: .env 中未設定 DISCORD_WEBHOOK_URL');
        return;
    }

    try {
        await sendDiscordError("這是一則測試訊息：驗證 Discord 告警通道暢通 ✅\n(來自 tests/test_discord.js)");
        log('✅', '測試完成！請檢查 Discord 頻道是否收到訊息。');
    } catch (e) {
        log('❌', `測試失敗: ${e.message}`);
    }
}

testDiscord();
