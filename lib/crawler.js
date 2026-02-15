const Parser = require('rss-parser');
const axios = require('axios');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { headers } = require('./config');
const { log, sleep } = require('./utils');

const parser = new Parser();
const virtualConsole = new VirtualConsole();
virtualConsole.on("error", () => {});

async function fetchRSS(url) {
    try {
        const response = await axios.get(url, { headers, timeout: 15000 });
        return await parser.parseString(response.data);
    } catch (e) {
        log('⚠️', `RSS 讀取失敗: ${url}`);
        return { items: [] };
    }
}

async function fetchContent(url) {
    try {
        await sleep(800); // 禮貌性延遲
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

    log('🔍', `準備抓取鉅亨網 API：共 ${categories.length} 個分類，每分類 ${pagesToFetch} 頁...`);

    for (const cat of categories) {
        for (let page = 1; page <= pagesToFetch; page++) {
            const url = `https://api.cnyes.com/media/api/v1/newslist/category/${cat}?page=${page}&limit=${limit}`;
            try {
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
                log('⚠️', `鉅亨網 API (${cat} 第 ${page} 頁) 抓取失敗: ${e.message}`);
            }
        }
    }
    return allNews;
}

module.exports = { fetchRSS, fetchContent, fetchCnyesAPI };