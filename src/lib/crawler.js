const Parser = require('rss-parser');
const axios = require('axios');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
// 🟢 確保這裡引入的是剛剛修改過、包含增強 Headers 的 config
const { headers } = require('./config'); 
const { log, sleep } = require('./utils');

const parser = new Parser();
const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {});

async function fetchRSS(url) {
    try {
        // 🟢 關鍵：先用 Axios + 偽裝 Headers 下載 XML，再給 Parser 解析
        const response = await axios.get(url, { headers, timeout: 15000 });
        return await parser.parseString(response.data);
    } catch (e) {
        log('⚠️', `RSS 讀取失敗: ${url} (錯誤: ${e.message})`);
        return { items: [] };
    }
}

async function fetchContent(url) {
    try {
        await sleep(800);
        const { data } = await axios.get(url, { timeout: 15000, headers });
        const dom = new JSDOM(data, { url, virtualConsole });
        const article = new Readability(dom.window.document).parse();
        return (article && article.textContent) ? article.textContent.trim().substring(0, 2500) : null;
    } catch (e) { return null; }
}

async function fetchCnyesAPI(pagesToFetch = 2) {
    const categories = ['tw_stock', 'wd_stock', 'tech'];
    const limit = 30;
    
    let allNews = [];
    let fetchedIds = new Set(); 

    log('🔍', `準備抓取鉅亨網 API...`);

    for (const cat of categories) {
        for (let page = 1; page <= pagesToFetch; page++) {
            const url = `https://api.cnyes.com/media/api/v1/newslist/category/${cat}?page=${page}&limit=${limit}`;
            try {
                // 鉅亨網 API 也需要特定的 Headers
                const response = await axios.get(url, {
                    headers: {
                        ...headers,
                        'Origin': 'https://news.cnyes.com/',
                        'Referer': 'https://news.cnyes.com/'
                    },
                    timeout: 15000
                });

                if (response.data && response.data.items && response.data.items.data) {
                    for (const news of response.data.items.data) {
                        if (!fetchedIds.has(news.newsId)) {
                            fetchedIds.add(news.newsId);
                            allNews.push({
                                title: news.title,
                                link: `https://news.cnyes.com/news/id/${news.newsId}`,
                                contentSnippet: news.summary, 
                                content: news.content ? news.content.replace(/<[^>]*>?/gm, '').substring(0, 2500) : '', 
                                pubDate: new Date(news.publishAt * 1000).toISOString(),
                                source: `鉅亨網(${cat})` 
                            });
                        }
                    }
                }
                await sleep(1000);
            } catch (e) {
                log('⚠️', `鉅亨網 API (${cat}) 失敗: ${e.message}`);
            }
        }
    }
    return allNews;
}

module.exports = { fetchRSS, fetchContent, fetchCnyesAPI };