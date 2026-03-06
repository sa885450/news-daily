/**
 * v6.0.0: News Daily CSR Core (JavaScript)
 */

let appData = null;
let sentimentChart, radarChart, sectorChart;
let currentCategory = '全部', currentSearch = '', currentSector = '全部', currentDate = '全部';
let displayedCount = 0;
const PAGE_SIZE = 12;
let speaking = false;

// 🟢 初始化入口
async function init() {
    // 🟢 v7.0.0: 增加本地協定檢查 (解決使用者直接點擊 index.html 的困擾)
    if (window.location.protocol === 'file:') {
        const errorMsg = `
            <div class="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
                <div class="flex">
                    <div class="flex-shrink-0"><span class="text-amber-400">⚠️</span></div>
                    <div class="ml-3">
                        <p class="text-sm text-amber-700 font-bold">本地存取限制</p>
                        <p class="text-xs text-amber-600">由於瀏覽器安全限制 (CORS)，請在終端機執行 <b>npm run ui</b> 啟動服務後，再瀏覽 <b>http://localhost:3003</b>。</p>
                    </div>
                </div>
            </div>`;
        document.getElementById('summary-content').innerHTML = errorMsg;
        document.getElementById('report-date').textContent = "本地協定受限";
    }

    try {
        const response = await fetch('data.json');
        appData = await response.json();

        renderHeader();
        renderMarketTicker(); // 🟢 v8.4.0
        renderSummary();
        renderCharts();
        renderKeywordsCloud();
        renderCategories();
        renderTimeline(); // 🟢 v7.2.0
        renderGraph();    // 🟢 v8.0.0
        renderNewsPage();
        startRealtimeTicker(); // 🟢 v8.6.0: 啟動實時更新定時器

        // 初始主題
        if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            updateCharts();
        }
    } catch (e) {
        console.error("Initialization Failed:", e);
        document.getElementById('summary-content').innerHTML = `❌ 資料載入失敗，請確認 <b>data.json</b> 是否存在且格式正確。`;
    }
}

// --- 渲染元件 ---

function renderHeader() {
    const d = new Date(appData.updateTime);
    const datePart = d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const timePart = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

    const dateEl = document.getElementById('report-date');
    if (dateEl) dateEl.textContent = `${datePart} ${timePart}`;

    // AI 實體
    const container = document.getElementById('ai-entities');
    if (!container) return;
    const entities = appData.aiResult.entities || [];
    container.innerHTML = entities.map(e => `
        <button onclick="${e.ticker ? `openChartModal('${e.ticker}', '${e.name}')` : `searchKeyword('${e.name}')`}"
            class="px-3 py-1 bg-white dark:bg-slate-800 border-indigo-100 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 border rounded-md text-sm font-bold hover:opacity-80 transition-colors shadow-sm">
            #${e.name}${e.ticker ? `<span class="text-xs ml-1 opacity-70">(${e.ticker})</span>` : ''}
        </button>
    `).join('');
}

function renderMarketTicker() {
    const container = document.getElementById('market-ticker');
    const snapshot = appData.market_snapshot;
    if (!snapshot) {
        container.classList.add('hidden');
        return;
    }

    const items = [
        ...(Object.values(snapshot.traditional || {})),
        ...(Object.values(snapshot.crypto || {}))
    ];

    if (items.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = items.map(item => {
        const isUp = item.change > 0;
        const colorClass = isUp ? 'text-red-500' : (item.change < 0 ? 'text-green-500' : 'text-slate-400');
        const bgColorClass = isUp ? 'bg-red-50 dark:bg-red-900/10' : (item.change < 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-slate-50 dark:bg-slate-800/50');
        const arrow = isUp ? '▲' : (item.change < 0 ? '▼' : '▬');

        return `
            <div class="flex-shrink-0 flex items-center gap-3 px-4 py-2 ${bgColorClass} rounded-xl border border-white/50 dark:border-slate-700/50 shadow-sm transition-transform hover:scale-105 cursor-default group">
                <div class="flex flex-col">
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-tighter">${item.name}</span>
                    <div class="flex items-baseline gap-1.5">
                        <span class="text-sm font-bold text-slate-700 dark:text-slate-200">${typeof item.price === 'number' ? item.price.toLocaleString() : item.price}</span>
                        <span class="text-[11px] font-black ${colorClass}">${arrow} ${Math.abs(item.change).toFixed(2)}%</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 🟢 v8.6.0: 瀏覽器端實時行情更新
function startRealtimeTicker() {
    // 每 2 分鐘刷新一次
    setInterval(async () => {
        console.log('🔄 正在同步最新市場報價 (Client-side)...');
        const updatedCrypto = await fetchExternalPrices();
        if (updatedCrypto && appData.market_snapshot) {
            // 合併數據
            appData.market_snapshot.crypto = {
                ...appData.market_snapshot.crypto,
                ...updatedCrypto
            };
            renderMarketTicker();
            console.log('✨ 報價已更新');
        }
    }, 120000);
}

async function fetchExternalPrices() {
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_24hr_change=true');
        const data = await res.json();
        return {
            btc: { name: 'BTC', price: data.bitcoin.usd, change: data.bitcoin.usd_24h_change },
            eth: { name: 'ETH', price: data.ethereum.usd, change: data.ethereum.usd_24h_change },
            sol: { name: 'SOL', price: data.solana.usd, change: data.solana.usd_24h_change },
            bnb: { name: 'BNB', price: data.binancecoin.usd, change: data.binancecoin.usd_24h_change }
        };
    } catch (e) {
        console.warn('行情刷新失敗:', e);
        return null;
    }
}

function renderSummary() {
    const content = appData.aiResult.summary || "無摘要內容";
    document.getElementById('summary-content').innerHTML = content.replace(/\n/g, '<br>');

    // 情緒數值
    const scoreVal = document.getElementById('today-sentiment-value');
    const score = appData.aiResult.sentiment_score;
    scoreVal.textContent = score;
    // 🟢 v7.3.0: 紅漲綠跌校正
    scoreVal.className = score > 0 ? 'text-red-500' : (score < 0 ? 'text-green-500' : 'text-slate-400');
}

function renderTimeline() {
    const container = document.getElementById('ai-timeline-container');
    const timeline = document.getElementById('ai-timeline');
    const events = appData.events || [];

    if (events.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    timeline.innerHTML = events.map(e => {
        // 🟢 v7.3.0: 紅漲綠跌校正
        const impactColor = e.impact === '正面' ? 'text-red-500' : (e.impact === '負面' ? 'text-green-500' : 'text-slate-400');
        const borderColor = e.impact === '正面' ? 'border-red-100 dark:border-red-900/30' : (e.impact === '負面' ? 'border-green-100 dark:border-green-900/30' : 'border-slate-100 dark:border-slate-800');

        return `
            <div class="p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border ${borderColor} transition-all hover:bg-white dark:hover:bg-slate-800 group">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-grow">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs font-black ${impactColor} tracking-widest uppercase">[${e.impact || '中性'}]</span>
                            <h4 class="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">${e.title}</h4>
                        </div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${e.summary}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderGraph() {
    const container = document.getElementById('ai-graph-container');
    const graphDiv = document.getElementById('ai-graph');
    const relations = appData.relations || [];

    if (relations.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    // 1. 準備節點與連線
    const nodesMap = new Map();
    const edges = [];

    relations.forEach(r => {
        if (!nodesMap.has(r.from)) nodesMap.set(r.from, { id: r.from, label: r.from, color: '#ef4444' });
        if (!nodesMap.has(r.to)) nodesMap.set(r.to, { id: r.to, label: r.to, color: '#3b82f6' });
        edges.push({ from: r.from, to: r.to, label: r.type, font: { size: 10, align: 'top' }, arrows: 'to' });
    });

    const data = {
        nodes: Array.from(nodesMap.values()),
        edges: edges
    };

    const options = {
        layout: { hierarchical: false },
        physics: {
            enabled: true,
            barnesHut: { gravitationalConstant: -2000, centralGravity: 0.3, springLength: 95 }
        },
        nodes: {
            shape: 'dot',
            size: 16,
            font: { color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b', size: 12, face: 'Inter' },
            borderWidth: 2,
            shadow: true
        },
        edges: {
            color: { color: '#94a3b8', highlight: '#ef4444' },
            width: 1,
            shadow: true,
            smooth: { type: 'continuous' }
        }
    };

    // 2. 渲染 (Vis.js Network)
    new vis.Network(graphDiv, data, options);
}

function renderCategories() {
    const container = document.getElementById('category-filters');
    const news = appData.newsData || [];
    const cats = ['全部', ...new Set(news.map(n => n.category || '其他'))];

    container.innerHTML = cats.map(cat => `
        <button onclick="filterCategory('${cat}')" data-filter="${cat}"
            class="filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-sm ${cat === '全部' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}">
            ${cat}
        </button>
    `).join('');
}

function renderNewsPage() {
    const grid = document.getElementById('news-grid');
    const container = document.getElementById('load-more-container');
    const news = appData.newsData || [];

    // 預先過濾
    const filtered = news.filter(n => {
        const lower = currentSearch.toLowerCase();
        const matchCat = (currentCategory === '全部' || (n.category || '其他') === currentCategory);
        const matchSearch = !currentSearch || (n.title || '').toLowerCase().includes(lower) || (n.content || '').toLowerCase().includes(lower);
        return matchCat && matchSearch;
    });

    const nextBatch = filtered.slice(displayedCount, displayedCount + PAGE_SIZE);

    nextBatch.forEach(n => {
        const card = document.createElement('div');
        card.className = "news-card animate-fade bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-slate-700 flex flex-col overflow-hidden";

        const hasImg = !!n.thumbnail;
        const imgHtml = hasImg ? `
            <div class="relative h-40 w-full overflow-hidden group">
                <img src="${n.thumbnail}" alt="news" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" onerror="this.parentElement.style.display='none'">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>
                <div class="absolute bottom-3 left-4">
                    <span class="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded uppercase tracking-widest">${n.category || '其他'}</span>
                </div>
            </div>
        ` : '';

        const relatedHtml = n.relatedArticles && n.relatedArticles.length > 0
            ? `<div class="mt-2 flex flex-wrap gap-1">
                <span class="text-[9px] font-bold text-slate-400">其他來源:</span>
                ${n.relatedArticles.map(r => `<span class="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[9px] rounded-md border border-slate-100 dark:border-slate-600 font-medium">${r.source}</span>`).join('')}
               </div>`
            : '';

        card.innerHTML = `
            ${imgHtml}
            <div class="p-6 flex-grow flex flex-col justify-between">
                <div>
                    ${!hasImg ? `
                    <div class="flex items-center justify-between mb-4">
                        <span class="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[11px] font-black rounded-full uppercase tracking-widest border border-indigo-100 dark:border-indigo-900/50">${n.category || '其他'}</span>
                        <span class="text-slate-400 text-xs">${n.timeStr || ''}</span>
                    </div>` : `
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-slate-400 text-[10px] font-bold uppercase tracking-tight">${n.source}</span>
                        <span class="text-slate-400 text-[10px]">${n.timeStr || ''}</span>
                    </div>`}
                    <h3 class="text-slate-800 dark:text-slate-100 font-bold leading-snug text-lg mb-3 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer line-clamp-2" onclick="handlePreview(this)">${n.title}</h3>
                    ${!hasImg ? `<div class="text-xs text-slate-400 font-medium mb-2 flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span>${n.source}</div>` : ''}
                    ${relatedHtml}
                </div>
                <div class="pt-4 border-t border-slate-50 dark:border-slate-700 flex justify-between items-center mt-4">
                    <button onclick="handlePreview(this)" class="inline-flex items-center text-xs font-bold text-slate-400 hover:text-indigo-500 transition-colors">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>預覽內容
                    </button>
                    <a href="${n.url}" target="_blank" class="inline-flex items-center text-sm font-bold text-indigo-500 hover:text-indigo-700">閱讀全文
                        <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                    </a>
                </div>
            </div>
        `;
        // 儲存原始資料供 Modal 使用
        card._rawData = n;
        grid.appendChild(card);
    });

    displayedCount += nextBatch.length;
    container.classList.toggle('hidden', displayedCount >= filtered.length);
}

// --- 圖表邏輯 ---

function renderCharts() {
    const colors = getThemeColors();
    const stats = appData.recentStats || [];
    const labels = stats.map(s => s.date.slice(5));
    const scores = stats.map(s => s.sentiment_score);

    const ctx = document.getElementById('sentimentChart').getContext('2d');
    sentimentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '情緒指數',
                data: scores,
                borderColor: '#ef4444', // 🟢 v7.3.0: 紅色
                backgroundColor: 'rgba(239, 68, 68, 0.1)', // 🟢 v7.3.0: 紅色
                borderWidth: 3,
                pointRadius: 5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min: -1, max: 1, grid: { color: colors.grid }, ticks: { color: colors.text } },
                x: { grid: { display: false }, ticks: { color: colors.text } }
            },
            plugins: { legend: { display: false } }
        }
    });

    const radarCtx = document.getElementById('radarChart').getContext('2d');
    const dim = appData.aiResult.dimensions || { policy: 0, market: 0, industry: 0, international: 0, technical: 0 };
    radarChart = new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: ['政策', '資金', '基本面', '國際', '技術'],
            datasets: [{
                label: '今日強度',
                data: [dim.policy, dim.market, dim.industry, dim.international, dim.technical],
                fill: true,
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                borderColor: 'rgb(79, 70, 229)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: colors.grid },
                    grid: { color: colors.grid },
                    pointLabels: { font: { size: 12, weight: 'bold' }, color: colors.text },
                    suggestedMin: 0, suggestedMax: 1, ticks: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });

    const sectorCtx = document.getElementById('sectorChart').getContext('2d');
    const s = appData.aiResult.sector_stats || { tech: 0, finance: 0, manufacturing: 0, service: 0 };
    sectorChart = new Chart(sectorCtx, {
        type: 'bar',
        data: {
            labels: ['科技/半導體', '金融', '傳產/製造', '服務/消費'],
            datasets: [{
                label: '板塊情緒',
                data: [s.tech, s.finance, s.manufacturing, s.service],
                backgroundColor: [
                    s.tech > 0 ? '#ef4444' : '#22c55e',
                    s.finance > 0 ? '#ef4444' : '#22c55e',
                    s.manufacturing > 0 ? '#ef4444' : '#22c55e',
                    s.service > 0 ? '#ef4444' : '#22c55e'
                ],
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { min: -1, max: 1, grid: { color: colors.grid }, ticks: { color: colors.text } },
                y: { grid: { display: false }, ticks: { color: colors.text } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderKeywordsCloud() {
    const k7d = appData.keywords7d || [];
    if (k7d.length === 0) return;

    const section = document.getElementById('buzzword-section');
    section.classList.remove('hidden');

    const cloudData = k7d.map(k => [k.word, k.count]);
    const canvas = document.getElementById('wordCloudCanvas');
    const width = canvas.parentElement.offsetWidth - 48;
    canvas.width = width;
    canvas.height = 350;

    WordCloud(canvas, {
        list: cloudData,
        gridSize: 12,
        weightFactor: size => Math.pow(size, 0.7) * (width / 400),
        fontFamily: 'Noto Sans TC, sans-serif',
        color: () => ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#4338ca'][Math.floor(Math.random() * 5)],
        rotateRatio: 0.3,
        rotationSteps: 2,
        backgroundColor: 'transparent',
        click: (item) => {
            const word = item[0];
            showKeywordArticles(word);
        }
    });
}

// --- 互動功能 ---

function filterCategory(cat) {
    currentCategory = cat;
    displayedCount = 0;
    document.getElementById('news-grid').innerHTML = '';

    // UI 反饋
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const active = btn.dataset.filter === cat;
        btn.classList.toggle('bg-indigo-600', active);
        btn.classList.toggle('text-white', active);
    });

    renderNewsPage();
}

function searchNews(val) {
    currentSearch = val.trim();
    displayedCount = 0;
    document.getElementById('news-grid').innerHTML = '';
    renderNewsPage();
}

function searchKeyword(k) {
    document.getElementById('search-input').value = k;
    searchNews(k);
    filterCategory('全部');
    document.getElementById('news-grid').scrollIntoView({ behavior: 'smooth' });
}

function loadMoreNews() { renderNewsPage(); }

function handlePreview(btn) {
    const card = btn.closest('.news-card');
    const n = card._rawData;
    if (!n) return;

    const modal = document.getElementById('contentModal');
    const inner = modal.querySelector('div');

    document.getElementById('modalTitle').textContent = n.title;
    document.getElementById('modalSource').textContent = n.source;
    document.getElementById('modalFullLink').href = n.url;

    // 解碼 HTML 實體 + 換行轉換
    const txt = document.createElement("textarea");
    txt.innerHTML = n.content || '無內文資訊';
    document.getElementById('modalText').innerHTML = txt.value.replace(/\n/g, '<br>');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        inner.classList.remove('scale-95');
    }, 10);
}

function closeContentModal() {
    const modal = document.getElementById('contentModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

const keywordMap = () => appData.keywords7d.reduce((acc, curr) => { acc[curr.word] = curr.articles; return acc; }, {});

function showKeywordArticles(word) {
    const articles = appData.keywords7d.find(k => k.word === word)?.articles || [];
    const modal = document.getElementById('keywordArticlesModal');
    const list = document.getElementById('kwModalList');

    document.getElementById('kwModalTitle').innerHTML = `🔥 <span class="text-indigo-600">${word}</span> 相關新聞`;
    list.innerHTML = articles.map(a => `
        <div class="group p-4 mb-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-indigo-50 border border-slate-100 dark:border-slate-600 hover:border-indigo-200 rounded-2xl cursor-pointer transition-all"
             onclick="openModalFromArticle('${a.title.replace(/'/g, "\\'")}', '${(a.content || '').replace(/'/g, "\\'")}', '${a.url}', '${a.source}')">
            <div class="text-[10px] font-black text-slate-400 mb-1">${a.source}</div>
            <h4 class="text-slate-700 dark:text-slate-200 font-bold group-hover:text-indigo-600 transition-colors line-clamp-2">${a.title}</h4>
        </div>
    `).join('') || '<div class="p-8 text-center text-slate-400">暫無相關新聞</div>';

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

function openModalFromArticle(t, c, u, s) {
    // 橋接器：讓列表點擊也能開預覽
    const mockBtn = { closest: () => ({ _rawData: { title: t, content: c, url: u, source: s } }) };
    handlePreview(mockBtn);
}

function closeKeywordModal() {
    const modal = document.getElementById('keywordArticlesModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- 工具 ---

function getThemeColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        text: isDark ? '#94a3b8' : '#475569',
        grid: isDark ? '#1e293b' : '#f1f5f9'
    };
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateCharts();
}

function updateCharts() {
    const colors = getThemeColors();
    [sentimentChart, radarChart, sectorChart].forEach(chart => {
        if (!chart) return;
        if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(s => {
                if (s.grid) s.grid.color = colors.grid;
                if (s.ticks) s.ticks.color = colors.text;
                if (s.pointLabels) s.pointLabels.color = colors.text;
            });
        }
        chart.update();
    });
}

function toggleSpeech() {
    if (speaking) {
        window.speechSynthesis.cancel();
        speaking = false;
        document.getElementById('ttsBtn').classList.remove('bg-red-50', 'text-red-600');
    } else {
        const text = document.getElementById('summary-content').textContent;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-TW';
        u.onend = () => {
            speaking = false;
            document.getElementById('ttsBtn').classList.remove('bg-red-50', 'text-red-600');
        };
        window.speechSynthesis.speak(u);
        speaking = true;
        document.getElementById('ttsBtn').classList.add('bg-red-50', 'text-red-600');
    }
}

// Init
init();
