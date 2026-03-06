const { chromium } = require('playwright');

/**
 * 金十數據 (Jin10) 終極突破腳本 (Playwright 穩定版 v13.0.1)
 * 繞過所有 WAF 與 DNS 解析限制，直接從渲染後的網頁擷取資料
 */

async function breakJin10() {
    console.log('🚀 啟動 Playwright 瀏覽器模擬突破...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        console.log('📡 正在導航至 jin10.com...');
        await page.goto('https://www.jin10.com', { waitUntil: 'networkidle', timeout: 60000 });

        console.log('⏱️ 等待資料加載與渲染...');
        await page.waitForTimeout(8000); // 增加等待時間確保內容完整

        // 擷取快訊列表內容
        const newsList = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.jin-flash-item-container'));
            return items.slice(0, 8).map(item => {
                const time = item.querySelector('.jin-flash-time')?.innerText || '';
                // 金十快訊可能有 title 或 content，甚至在不同的 div 裡
                const textEl = item.querySelector('.jin-flash-text') || item.querySelector('.jin-flash-item-title') || item;
                const content = textEl ? textEl.innerText : '';
                const isImportant = !!item.querySelector('.jin-flash-star-ranking') || item.classList.contains('is-important');
                return { time, content, isImportant };
            });
        });

        if (newsList && newsList.length > 0) {
            console.log('\n🏆 [突破成功] 已成功擷取最新快訊：');
            newsList.forEach((n, i) => {
                const safeContent = (n.content || '').replace(/\s+/g, ' ').trim();
                const preview = safeContent ? safeContent.substring(0, 100) : '(無文字內容)';
                console.log(`${i + 1}. [${n.time || '即時'}] ${n.isImportant ? '⭐' : '  '} ${preview}${safeContent.length > 100 ? '...' : ''}`);
            });
            await browser.close();
            return true;
        } else {
            console.error('❌ 頁面已加載，但未找到 .jin-flash-item-container 結構。');
            const bodyPreview = await page.innerText('body');
            console.log('📄 頁面內文預覽：', bodyPreview.substring(0, 200));
        }
    } catch (e) {
        console.error(`❌ 瀏覽器模擬過程中發生錯誤: ${e.message}`);
    }

    await browser.close();
    return false;
}

breakJin10().then(success => {
    process.exit(success ? 0 : 1);
});
