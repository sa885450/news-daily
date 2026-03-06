/**
 * 金十頁面結構診斷腳本 v13.1.9
 * 執行：node scripts/diagnose_jin10.js
 */
const { chromium } = require('playwright');

(async () => {
    let browser;
    try {
        console.log('🔍 啟動 Playwright 診斷...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        console.log('📡 導航至 jin10.com...');
        await page.goto('https://www.jin10.com', { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(5000);

        const result = await page.evaluate(() => {
            const output = {};

            // 1. 現有 selector 有多少
            const oldItems = document.querySelectorAll('.jin-flash-item-container');
            output.old_selector_count = oldItems.length;

            // 2. 找含「time」「flash」「item」「news」相關的所有 class
            const allEls = document.querySelectorAll('*');
            const classSet = new Set();
            allEls.forEach(el => {
                el.classList.forEach(c => {
                    if (/(flash|item|news|time|list|feed|live)/i.test(c)) classSet.add(c);
                });
            });
            output.related_classes = [...classSet];

            // 3. 找時間格式文字（HH:MM 或 HH:MM:SS）
            const timeNodes = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const txt = node.textContent.trim();
                if (/^\d{2}:\d{2}(:\d{2})?$/.test(txt)) {
                    const p = node.parentElement;
                    const gp = p?.parentElement;
                    timeNodes.push({
                        time: txt,
                        pTag: p?.tagName, pClass: (p?.className || '').substring(0, 80),
                        gpTag: gp?.tagName, gpClass: (gp?.className || '').substring(0, 80)
                    });
                }
            }
            output.time_nodes = timeNodes.slice(0, 8);

            // 4. 印出頁面上幾個候選 selector 找到的內容
            const trySelectors = [
                '.jin-flash-item',
                '.flash-item',
                '[class*="flash-item"]',
                '[class*="jin-flash"]',
                '.f-item',
                '.jf-item'
            ];
            output.candidates = {};
            trySelectors.forEach(sel => {
                try {
                    const found = document.querySelectorAll(sel);
                    if (found.length > 0) {
                        output.candidates[sel] = {
                            count: found.length,
                            first_class: found[0].className.substring(0, 80),
                            first_text: found[0].textContent.replace(/\s+/g, ' ').trim().substring(0, 120)
                        };
                    }
                } catch (e) { }
            });

            return output;
        });

        console.log('\n=== 🔬 診斷結果 ===');
        console.log('原有 selector 找到:', result.old_selector_count, '個元素');
        console.log('\n含關鍵字的 class 名稱:');
        result.related_classes.forEach(c => console.log(' -', c));
        console.log('\n頁面時間節點 (最多 8 個):');
        result.time_nodes.forEach(n => console.log(` [${n.time}] pClass="${n.pClass}" gpClass="${n.gpClass}"`));
        console.log('\n候選 Selector 結果:');
        console.log(JSON.stringify(result.candidates, null, 2));

    } catch (e) {
        console.error('❌ 診斷失敗:', e.message);
    } finally {
        if (browser) await browser.close();
    }
})();
