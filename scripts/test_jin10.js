const WebSocket = require('ws');

/**
 * 金十數據 (Jin10) WebSocket 驗證腳本 v2
 * 原理: 模擬 Web 端連線模式
 */

async function testJin10WS() {
    console.log('🚀 開始金十數據 WebSocket 連通性測試 (低延遲推播模式)...');
    const wsUrl = 'wss://push.jin10.com/web';

    return new Promise((resolve) => {
        let messageCount = 0;
        const ws = new WebSocket(wsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Origin': 'https://www.jin10.com'
            }
        });

        const timeout = setTimeout(() => {
            if (messageCount === 0) {
                console.error('❌ [WS] 在觀測期內未收到有效數據推送。');
                ws.terminate();
                resolve(false);
            }
        }, 20000);

        ws.on('open', () => {
            console.log('✅ [WS] 連線建立成功，正在等待即時數據...');
            // 嘗試發送心跳以維持長連線 (Jin10 WS 通常需要)
            setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('');
                }
            }, 5000);
        });

        ws.on('message', (data) => {
            messageCount++;
            try {
                const msgStr = data.toString();
                if (msgStr.startsWith('{')) {
                    const msg = JSON.parse(msgStr);
                    console.log(`📩 [WS] 捕獲消息 [${msg.type || 'UNKNOWN'}]:`);
                    if (msg.data && (msg.data.content || msg.data.title)) {
                        console.log(`✨ 內容: ${msg.data.content || msg.data.title}`);
                        console.log(`🕒 時間: ${msg.data.time || 'N/A'}`);

                        // 只要抓到一條有效數據，就宣告 POC 成功
                        clearTimeout(timeout);
                        console.log('\n🏆 [POC 成功] 證實 WebSocket 可作為資料來源。');
                        ws.close();
                        resolve(true);
                    }
                }
            } catch (e) {
                // 部分心跳響應可能不是 JSON
            }
        });

        ws.on('error', (e) => {
            console.error(`❌ [WS] 連線異常: ${e.message}`);
            clearTimeout(timeout);
            resolve(false);
        });

        ws.on('close', () => {
            console.log('🏁 [WS] 連線已關閉。');
        });
    });
}

testJin10WS().then(success => {
    if (!success) {
        console.log('\n⚠️ 警告: WebSocket 測試失敗，可能需要模擬更細緻的握手過程或檢查網路環境。');
        process.exit(1);
    }
    process.exit(0);
});
