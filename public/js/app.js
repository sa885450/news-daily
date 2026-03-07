/**
 * v13.5.4: News Daily CSR Core (JavaScript)
 * 支援市場走馬燈、AI 戰術建議與多維度圖表
 */

let appData = null;
let sentimentChart, radarChart, sectorChart;
let currentCategory = '全部', currentSearch = '', currentSector = '全部', currentDate = '全部';
let displayedCount = 0;
const PAGE_SIZE = 12;
let speaking = false;

// 🟢 v13.5.4: 初始化
async function init() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        appData = await response.json();

        if (!appData) throw new Error("Data load failed");

        // 更新基本資訊
        document.getElementById('report-date').textContent = `${appData.date} · 更新於 ${appData.time || '--:--'}`;

        // 渲染走馬燈
        renderTicker();

        // 渲染 AI 實體標籤
        renderAIEntities();

        // 渲染 AI 摘要與戰術建議
        renderSummary();

        // 渲染分類按鈕
        renderCategories();

        // 渲染圖表
        renderCharts();

        // 渲染知識圖譜
        renderKnowledgeGraph();

        // 初始渲染新聞
        renderNewsPage();

        // 監聽滾動以支援加載更多 (可選)
    } catch (e) {
        console.error("Init Error:", e);
        document.getElementById('summary-content').innerHTML = `
            <div class="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100">
                <h3 class="font-bold">數據載入失敗</h3>
                <p class="text-sm">${e.message}</p>
            </div>
        `;
    }
}

// 🟢 v8.4.0: 渲染市場走馬燈
function renderTicker() {
    const ticker = document.getElementById('market-ticker');
    const content = document.getElementById('ticker-content');
    // 🟢 v13.5.9: 修正物件遍歷邏輯 (Object to Array)
    const snapshotObj = appData.market_snapshot || {};
    const flatItems = [
        ...Object.values(snapshotObj.traditional || {}),
        ...Object.values(snapshotObj.crypto || {})
    ];

    if (flatItems.length === 0) {
        ticker.classList.add('hidden');
        return;
    }

    ticker.classList.remove('hidden');
    const items = flatItems.map(item => {
        const isUp = item.change && (typeof item.change === 'string' ? !item.change.startsWith('-') : item.change >= 0);
        const color = isUp ? 'text-red-500' : 'text-green-500';
        const priceStr = typeof item.price === 'number' ? item.price.toLocaleString() : (item.price || '--');
        const changeStr = typeof item.change === 'number' ? item.change.toFixed(2) + '%' : (item.change || '');

        return `
            <div class="flex items-center gap-2 px-6 border-r border-slate-100 dark:border-slate-800 whitespace-nowrap cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors py-1" onclick="openChart('${item.symbol}')">
                <span class="font-black text-slate-800 dark:text-slate-200">${item.name}</span>
                <span class="font-mono font-bold ${color}">${priceStr}</span>
                <span class="text-[10px] font-bold ${color}">${changeStr}</span>
            </div>
        `;
    }).join('');

    // 複製兩份以實現無縫滾動
    content.innerHTML = items + items;
}

// 🟢 v2.4.0: 渲染 AI 實體
function renderAIEntities() {
    const container = document.getElementById('ai-entities');
    const entities = appData.aiResult?.entities || [];
    if (entities.length === 0) return;

    container.innerHTML = entities.slice(0, 5).map(e => {
        const entityName = typeof e === 'string' ? e : (e.name || '');
        if (!entityName) return '';
        return `
        <span onclick="handleSearch('${entityName}')" class="px-3 py-1 bg-white/10 hover:bg-white/30 rounded-full text-xs font-bold cursor-pointer transition-all border border-white/10">
            #${entityName}
        </span>
    `;
    }).join('');
}

// 🟢 v13.5.0: 渲染 AI 摘要與戰術建議
function renderSummary() {
    const summaryBox = document.getElementById('summary-content');
    const badge = document.getElementById('sentiment-badge');
    const tacticalBox = document.getElementById('tactical-advice-box');

    const result = appData.aiResult || {};

    // 設定情緒勳章
    const score = result.sentiment_score || 0;
    let badgeClass = 'bg-slate-100 text-slate-500';
    let badgeText = '中立';

    if (score >= 0.3) {
        badgeClass = 'bg-red-500 text-white';
        badgeText = '極度樂觀';
    } else if (score > 0) {
        badgeClass = 'bg-red-100 text-red-600';
        badgeText = '偏多';
    } else if (score <= -0.3) {
        badgeClass = 'bg-green-500 text-white';
        badgeText = '極度恐慌';
    } else if (score < 0) {
        badgeClass = 'bg-green-100 text-green-600';
        badgeText = '偏空';
    }

    badge.className = `ml-auto px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider ${badgeClass}`;
    badge.textContent = badgeText;

    // 格式化摘要內容 (處理換行)
    const summaryHtml = (result.summary || "今日暫無深度分析資料。")
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    summaryBox.innerHTML = `<p>${summaryHtml}</p>`;

    // 渲染戰術建議 (v13.5.0)
    if (result.tactical_advice) {
        tacticalBox.classList.remove('hidden');
        let adviceContent = '';
        if (typeof result.tactical_advice === 'object' && result.tactical_advice !== null) {
            const ta = result.tactical_advice;
            adviceContent = `<strong>建議行動：</strong> ${ta.action || '無'} (信心度: ${ta.confidence || 0}%)<br>
                             <strong>建議倉位：</strong> ${ta.position_size || '未提供'}<br>
                             <strong>戰略理由：</strong> ${ta.rationale || '無'}`;
        } else {
            adviceContent = result.tactical_advice || "今日無特別戰術建議。";
        }

        tacticalBox.innerHTML = `
            <div class="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                <h4 class="font-black text-sm uppercase tracking-tighter">AI 戰術執行建議</h4>
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-400 italic" id="tactical_advice">${adviceContent}</p>
        `;
    }
}

// 渲染分類按鈕
function renderCategories() {
    const container = document.getElementById('category-btns');
    const categories = ['科技', '金融', '傳產', '政治', '國際', '加密'];

    container.innerHTML = categories.map(cat => `
        <button onclick="setCategory('${cat}')" data-cat="${cat}" 
            class="cat-btn px-4 py-3 rounded-2xl text-sm font-bold transition-all bg-white dark:bg-slate-800 text-slate-500 shadow-sm border border-slate-100 dark:border-slate-700 hover:border-indigo-500">
            ${cat}
        </button>
    `).join('');
}

// 🟢 v13.3.0: 渲染圖表
function renderCharts() {
    renderSentimentChart();
    renderRadarChart();
    renderSectorChart();
    renderWordCloud();
}

function renderSentimentChart() {
    const ctx = document.getElementById('sentimentChart').getContext('2d');
    const stats = appData.recentStats || [];

    if (sentimentChart) sentimentChart.destroy();

    sentimentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: stats.map(s => s.date.split('-').slice(1).join('/')),
            datasets: [{
                label: '情緒分數',
                data: stats.map(s => s.sentiment_score ?? 0),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 4,
                tension: 0.4,
                pointRadius: 4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: -1, max: 1, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderRadarChart() {
    const ctx = document.getElementById('radarChart').getContext('2d');
    const dims = appData.aiResult?.dimensions || { "政策": 0.5, "資金": 0.5, "產業": 0.5, "國際": 0.5, "技術": 0.5 };

    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: Object.keys(dims),
            datasets: [{
                data: Object.values(dims),
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                borderColor: '#6366f1',
                pointBackgroundColor: '#6366f1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: { min: 0, max: 1, ticks: { display: false } }
            }
        }
    });
}

function renderSectorChart() {
    const ctx = document.getElementById('sectorChart').getContext('2d');
    const sectors = appData.aiResult?.sector_stats || { "科技": 0.1, "金融": 0.1, "傳產": 0.1, "服務": 0.1 };

    if (sectorChart) sectorChart.destroy();

    const colors = Object.values(sectors).map(v => v >= 0 ? '#ef4444' : '#22c55e');

    sectorChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(sectors),
            datasets: [{
                data: Object.values(sectors),
                backgroundColor: colors,
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { min: -1, max: 1, grid: { color: 'rgba(0,0,0,0.05)' } }
            }
        }
    });
}

// 渲染熱詞雲
function renderWordCloud() {
    const canvas = document.getElementById('keyword-cloud');
    const keywords = appData.keywords7d || [];
    if (keywords.length === 0) {
        canvas.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 text-xs">暫無熱詞數據</div>';
        return;
    }

    const maxCount = Math.max(...keywords.map(k => k.count), 1);
    const minCount = Math.min(...keywords.map(k => k.count), 0);
    const list = keywords.slice(0, 50).map(k => {
        let weight = 15;
        if (maxCount > minCount) {
            weight = 15 + ((k.count - minCount) / (maxCount - minCount)) * 45;
        }
        return [k.word, weight];
    });

    WordCloud(canvas, {
        list: list,
        weightFactor: 1,
        fontFamily: 'Inter, Noto Sans TC',
        color: (word, weight) => weight > 30 ? '#6366f1' : '#94a3b8',
        rotateRatio: 0,
        backgroundColor: 'transparent',
        click: (item) => handleSearch(item[0])
    });
}

// 🟢 v8.0.0: 市場勢力圖 (Vis-network)
function renderKnowledgeGraph() {
    const container = document.getElementById('vis-network');
    const relations = appData.aiResult?.relations || [];

    if (relations.length === 0) {
        container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 text-xs">暫無關聯數據</div>';
        return;
    }

    const nodes = new Set();
    const edges = [];

    relations.forEach(rel => {
        const source = rel.from || rel.source;
        const target = rel.to || rel.target;
        if (source && target) {
            nodes.add(source);
            nodes.add(target);
            edges.push({ from: source, to: target, label: rel.type, font: { size: 10 } });
        }
    });
    const data = {
        nodes: Array.from(nodes).map(n => ({ id: n, label: n, color: '#e0e7ff', shadow: true })),
        edges: edges
    };

    const options = {
        nodes: { shape: 'dot', size: 16, font: { size: 12, face: 'Noto Sans TC' }, borderWidth: 2 },
        edges: { width: 1, color: '#94a3b8', arrows: { to: { enabled: true, scaleFactor: 0.5 } } },
        physics: { enabled: true, stabilization: true }
    };

    new vis.Network(container, data, options);
}

// 新聞分頁渲染
function renderNewsPage(append = false) {
    const grid = document.getElementById('news-grid');
    if (!append) {
        grid.innerHTML = '';
        displayedCount = 0;
    }

    const filtered = filterNews();
    const slice = filtered.slice(displayedCount, displayedCount + PAGE_SIZE);

    if (slice.length === 0 && !append) {
        grid.innerHTML = `
            <div class="col-span-full py-20 text-center">
                <div class="text-slate-300 mb-4">
                    <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 class="text-slate-500 font-bold">找不到相符的新聞報導</h3>
            </div>
        `;
        document.getElementById('load-more-trigger').classList.add('hidden');
        return;
    }

    const html = slice.map((news, idx) => {
        const isBullish = news.sentiment >= 0;
        const sentimentColor = isBullish ? 'bg-red-500' : 'bg-green-500';
        const categoryColor = news.category === '金融' ? 'bg-indigo-500' : (news.category === '科技' ? 'bg-blue-500' : 'bg-slate-500');

        return `
            <div class="news-card bg-white dark:bg-slate-800 rounded-[2.5rem] overflow-hidden shadow-lg border border-slate-100 dark:border-slate-700 flex flex-col group animate-fade" style="animation-delay: ${idx * 0.05}s">
                <div class="p-8 flex flex-col flex-grow">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="px-3 py-1 ${categoryColor} text-white text-[10px] font-black rounded-lg uppercase tracking-widest shadow-sm">${news.category || '一般'}</span>
                        <span class="px-3 py-1 ${sentimentColor} text-white text-[10px] font-black rounded-lg uppercase tracking-widest shadow-sm">${isBullish ? 'BULLISH' : 'BEARISH'}</span>
                        <span class="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">${news.source} · ${news.timeStr || ''}</span>
                    </div>
                    <h3 class="text-xl font-black text-slate-800 dark:text-slate-100 mb-4 leading-tight">${news.title}</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-4 mb-6 flex-grow leading-relaxed">${news.content || ''}</p>
                    <div class="mt-auto flex items-center justify-between pt-6 border-t border-slate-50 dark:border-slate-700">
                        <a href="${news.url}" target="_blank" class="text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-widest hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                            READ SOURCE
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (append) {
        grid.insertAdjacentHTML('beforeend', html);
    } else {
        grid.innerHTML = html;
    }

    displayedCount += slice.length;

    if (displayedCount >= filtered.length) {
        document.getElementById('load-more-trigger').classList.add('hidden');
    } else {
        document.getElementById('load-more-trigger').classList.remove('hidden');
    }
}

// 過濾邏輯
function filterNews() {
    const articles = appData.newsData || [];
    return articles.filter(n => {
        const matchCat = currentCategory === '全部' || n.category === currentCategory;
        const matchSearch = !currentSearch || n.title.includes(currentSearch) || (n.summary && n.summary.includes(currentSearch));
        return matchCat && matchSearch;
    });
}

// 互動函數
function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        if (btn.dataset.cat === cat) {
            btn.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'active-cat');
            btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-slate-500');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'active-cat');
            btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-slate-500');
        }
    });
    renderNewsPage();
}

function handleSearch(val) {
    currentSearch = val;
    document.getElementById('search-input').value = val;
    renderNewsPage();
}

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
}

// Chart Modal
function openChart(symbol) {
    const modal = document.getElementById('chartModal');
    const container = document.getElementById('tradingview-container');
    const title = document.getElementById('chartModalTitle');
    const subtitle = document.getElementById('chartModalSubtitle');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);

    title.textContent = `即時盤勢分析: ${symbol}`;
    subtitle.textContent = `Symbol: ${symbol}`;
    container.innerHTML = '';

    new TradingView.widget({
        "autosize": true,
        "symbol": symbol,
        "interval": "D",
        "timezone": "Asia/Taipei",
        "theme": document.documentElement.classList.contains('dark') ? "dark" : "light",
        "style": "1",
        "locale": "zh_TW",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "allow_symbol_change": true,
        "container_id": "tradingview-container"
    });
}

function closeChartModal() {
    const modal = document.getElementById('chartModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}
