const { chromium } = require('playwright');
const { log } = require('./utils');
const OpenCC = require('opencc-js');

/**
 * Jin10 數據整合模組 v13.4.0
 * 🟢 v13.4.0: 整合繁體化與隱藏視窗優化
 */
class Jin10Service {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        // 🟢 初始化繁體轉換器 (cn -> tw)
        this.converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
    }

    async init() {
        if (!this.browser) {
            // 🟢 v13.4.0: 強化隱藏視窗參數
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process', // Windows 下減少進程開銷
                    '--hide-scrollbars',
                    '--mute-audio'
                ]
            });
            this.context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            });
            this.page = await this.context.newPage();
        }
    }

    async fetchFlashNews(limit = 10) {
        try {
            if (this.browser) {
                await this.browser.close().catch(() => { });
                this.browser = null;
            }
            await this.init();
            log('📡', '正在透過模擬瀏覽器同步金十快訊...');

            await this.page.goto('https://www.jin10.com', { waitUntil: 'networkidle', timeout: 45000 });
            await this.page.waitForTimeout(5000);

            const news = await this.page.evaluate((max) => {
                const items = Array.from(document.querySelectorAll('.jin-flash-item'));
                return items.slice(0, max).map(item => {
                    const time = item.querySelector('.item-time')?.innerText?.trim() || '';
                    const textEl = item.querySelector('.flash-text') || item.querySelector('.flash-remark') || item;
                    const content = textEl ? textEl.innerText.replace(/\s+/g, ' ').trim() : '';
                    const isImportant = item.classList.contains('is-important');

                    const stableKey = (time + '_' + content.replace(/\s/g, '').substring(0, 20))
                        .replace(/[^\w\u4e00-\u9fa5]/g, '');

                    const link = stableKey ? `https://jin10.com/flash/${stableKey}` : null;
                    const id = `jin10_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    return { id, time, content, isImportant, link };
                });
            }, limit);

            // 🟢 v13.4.0: 廣告過濾與「繁體化轉換」
            const adKeywords = ['广告', '推廣', 'TradingHero', '推出行情', 'AppStore', 'Google Play'];
            const filtered = news.filter(n => {
                if (!n.content || n.content.length < 15) return false;
                return !adKeywords.some(kw => n.content.includes(kw));
            }).map(n => ({
                ...n,
                // 🟢 執行轉繁體
                content: this.converter(n.content)
            }));

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
