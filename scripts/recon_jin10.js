const WebSocket = require('ws');
const axios = require('axios');

/**
 * 金十數據 (Jin10) 連通性偵察腳本 v3
 * 測試所有可能的數據推送路徑
 */

async function checkDns(hostname) {
    console.log(`🔍 [DNS] 正在嘗試解析 ${hostname}...`);
    try {
        const { execSync } = require('child_process');
        const ip = execSync(`nslookup ${hostname}`).toString();
        // 簡單判斷是否有解析結果
        if (ip.includes('Address:')) {
            console.log(`✅ [DNS] ${hostname} 解析成功`);
            return true;
        }
    } catch (e) {
        console.error(`❌ [DNS] ${hostname} 解析失敗`);
    }
    return false;
}

async function testJin10WS() {
    // 根據網頁端實際行為，測試幾個可能的 WS 端口
    const wsUrls = [
        'wss://push.jin10.com/web',
        'wss://v-push.jin10.com/web',
        'wss://push-api.jin10.com/web'
    ];

    for (const wsUrl of wsUrls) {
        console.log(`\n🚀 嘗試連線: ${wsUrl}`);
        const success = await new Promise((resolve) => {
            const ws = new WebSocket(wsUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Origin': 'https://www.jin10.com'
                },
                handshakeTimeout: 5000
            });

            const timeout = setTimeout(() => {
                ws.terminate();
                resolve(false);
            }, 6000);

            ws.on('open', () => {
                console.log(`✅ [WS] ${wsUrl} 握手成功！`);
                clearTimeout(timeout);
                ws.close();
                resolve(true);
            });

            ws.on('error', (e) => {
                console.error(`❌ [WS] ${wsUrl} 失敗: ${e.message}`);
                clearTimeout(timeout);
                resolve(false);
            });
        });

        if (success) return true;
    }
    return false;
}

async function run() {
    console.log('🕵️‍♂️ 金十數據深度偵察啟動...\n');

    await checkDns('jin10.com');
    await checkDns('flash-api.jin10.com');
    await checkDns('push.jin10.com');
    await checkDns('v-push.jin10.com');

    const wsOk = await testJin10WS();

    if (wsOk) {
        console.log('\n🏆 結論: 已找到可用的數據推送路徑！');
    } else {
        console.log('\n❌ 結論: 全數路徑皆受阻，可能是地理圍欄(Geo-fencing)或強效 WAF。');
        console.log('💡 建議: 請老大大確認 .env 是否需要 Proxy 配置，或考慮使用 Playwright 模擬抓取。');
    }
}

run();
