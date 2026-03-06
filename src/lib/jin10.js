const { chromium } = require('playwright');
const { log } = require('./utils');

/**
 * Jin10 數據整合模組 v13.0.0
 * 使用 Playwright 進行瀏覽器模擬抓取
 */
class Jin10Service {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    async init() {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
            this.context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            });
            this.page = await this.context.newPage();
        }
    }

    async fetchFlashNews(limit = 10) {
        try {
            // 🟢 v13.1.9: 每次重建 context 強制清除快取，避免看到舊頁面
            if (this.browser) {
                await this.browser.close().catch(() => { });
                this.browser = null;
            }
            await this.init();
            log('📡', '正在透過模擬瀏覽器同步金十快訊...');

            // 導航並等待渲染
            await this.page.goto('https://www.jin10.com', { waitUntil: 'networkidle', timeout: 45000 });
            await this.page.waitForTimeout(5000);

            const news = await this.page.evaluate((max) => {
                const items = Array.from(document.querySelectorAll('.jin-flash-item-container'));
                return items.slice(0, max).map(item => {
                    const time = item.querySelector('.jin-flash-time')?.innerText || '';
                    const textEl = item.querySelector('.jin-flash-text') || item.querySelector('.jin-flash-item-title') || item;
                    const content = textEl ? textEl.innerText.replace(/\s+/g, ' ').trim() : '';
                    const isImportant = !!item.querySelector('.jin-flash-star-ranking') || item.classList.contains('is-important');
                    const link = item.querySelector('a')?.href || '';
                    const id = `jin10_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    return { id, time, content, isImportant, link };
                });
            }, limit);

            // 🟢 v13.1.9: 廣告過濾 - 排除金十自家廣告與無效快訊
            const adKeywords = ['广告', '推廣', 'TradingHero', '推出行情', 'AppStore', 'Google Play'];
            const filtered = news.filter(n => {
                if (!n.content || n.content.length < 15) return false;
                return !adKeywords.some(kw => n.content.includes(kw));
            });

            if (news.length !== filtered.length) {
                log('🚫', `金十廣告過濾: 已排除 ${news.length - filtered.length} 則廣告/無效快訊`);
            }

            return filtered;
        } catch (e) {
            log('❌', `金十抓取異常: ${e.message}`);
            return [];
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = new Jin10Service();
