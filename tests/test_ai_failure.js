require('dotenv').config({ path: '../.env' });
const { getSummary } = require('../lib/ai');
const { log } = require('../lib/utils');

// 覆寫 console.log 以便觀察 retry
const originalLog = console.log;
console.log = (...args) => {
    // 讓 lib/ai.js 的 retry log 顯示出來
    originalLog(...args);
};

async function testAIFailure() {
    log('🧪', '開始測試 AI 失敗處理 (預期會失敗並發送 Discord 通知)...');

    // 模擬新聞資料
    const mockNews = [
        { title: "測試新聞 A", source: "Test", content: "測試內容..." }
    ];

    try {
        // 使用無效 Key 強制觸發 403/400 錯誤 -> 進而觸發 retry -> 最終觸發 sendDiscordError
        // 注意：這裡假設 lib/config.js 會讀取環境變數，我們暫時改掉 process.env.GEMINI_API_KEY
        // 但 lib/ai.js 已經 require 了 config，所以我們要用 callGemini 的 customKey 參數
        // 不過 getSummary 內部是呼叫 callGemini 且用 default key

        // 為了測試，我們直接 mock callGemini 內部依賴... 比較困難
        // 簡單作法：我們直接修改 process.env 並重新 require (但 require cache 會有影響)
        // 更好的作法：我們直接呼叫底層的 callGemini (需要從 lib/ai.js export)

        // 根據目前 lib/ai.js，只有 export getSummary, getWeeklySummary
        // 我們測試 getSummary 即可，但它會用真實 Key。
        // 我們可以暫時將 GEMINI_API_KEY 設為無效

        process.env.GEMINI_API_KEY = "INVALID_KEY_FOR_TESTING";

        // 重新載入 config 以吃到新環境變數 (清除 cache)
        delete require.cache[require.resolve('../lib/config')];
        delete require.cache[require.resolve('../lib/ai')];

        const ai = require('../lib/ai');

        log('🔄', '呼叫 getSummary (預期會 Retry 3 次)...');
        await ai.getSummary(mockNews, null, 0); // 這裡應該會失敗

    } catch (e) {
        log('✅', `捕捉到預期錯誤: ${e.message}`);
        log('ℹ️', '請檢查 Discord 是否收到「AI 模型全數失敗」的告警。');
    }
}

testAIFailure();
