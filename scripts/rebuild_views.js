const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../src/views');
const indexPath = path.join(viewsDir, 'index.ejs');

const indexTemplate = `<!DOCTYPE html>
<html lang="zh-TW">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 智能儀表板</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+TC:wght@400;500;700&display=swap"
        rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', 'Noto Sans TC', sans-serif;
            transition: background-color 0.3s, color 0.3s;
        }

        .dark {
            background-color: #0f172a;
            color: #f8fafc;
        }

        .news-card.hidden {
            display: none;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }

            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .animate-fade {
            animation: fadeIn 0.4s ease forwards;
            opacity: 0;
        }

        /* 🟢 v5.0.0: 暗色模式適配滾動條 */
        .dark ::-webkit-scrollbar {
            width: 8px;
        }

        .dark ::-webkit-scrollbar-track {
            background: #1e293b;
        }

        .dark ::-webkit-scrollbar-thumb {
            background: #334155;
            border-radius: 10px;
        }
    </style>
    <script>
        // 🟢 v5.0.0: 暗色模式邏輯
        function toggleDarkMode() {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateCharts(); // 重新渲染圖表以適配顏色
        }

        // 初始化主題
        if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        }

        let currentCategory = '全部', currentSearch = '', currentSector = '全部', currentDate = '全部';

        function applyFilters() {
            const lower = currentSearch.toLowerCase();
            document.querySelectorAll('.news-card').forEach(c => {
                const matchCat = (currentCategory === '全部' || c.dataset.category === currentCategory);
                const matchSearch = !currentSearch || c.dataset.title.includes(lower) || c.dataset.content.includes(lower);
                const matchSector = (currentSector === '全部' || c.dataset.sector === currentSector);
                const matchDate = (currentDate === '全部' || c.dataset.date === currentDate);

                if (matchCat && matchSearch && matchSector && matchDate) {
                    c.classList.remove('hidden');
                    setTimeout(() => c.classList.add('animate-fade'), 10);
                } else {
                    c.classList.add('hidden');
                    c.classList.remove('animate-fade');
                }
            });
        }
        function filterCategory(c) { currentCategory = c; applyFilters(); }
        function searchNews(v) { currentSearch = v.trim(); applyFilters(); }
        function searchKeyword(k) { document.getElementById('search-input').value = k; searchNews(k); filterCategory('全部'); document.getElementById('news-grid').scrollIntoView({ behavior: 'smooth' }); }
    </script>
</head>

<body class="bg-[#f8fafc] dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen pb-20">
    <!-- 🟢 v5.0.0: 功能切換列 -->
    <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
        <button onclick="toggleDarkMode()"
            class="p-4 bg-white dark:bg-slate-800 rounded-full shadow-2xl border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:scale-110 transition-transform">
            <svg class="w-6 h-6 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            <svg class="w-6 h-6 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
        </button>
    </div>
    <div class="max-w-6xl mx-auto px-4 pt-10 relative">
        <!-- History Select -->
        <% if (historyFiles && historyFiles.length > 0) { %>
            <div class="absolute top-0 right-0 mt-2 mr-2 z-50">
                <select onchange="if(this.value) window.location.href=this.value"
                    class="bg-white/90 backdrop-blur border border-slate-200 text-slate-600 text-xs font-bold rounded-lg py-1.5 px-2 cursor-pointer hover:bg-slate-50">
                    <option value="index.html">🏠 返回首頁</option>
                    <% historyFiles.forEach(function(f) { %>
                        <option value="<%= f.filename %>" <%= f.isToday ? 'selected' : '' %>>
                            <%= f.isToday ? '📅 今天' : '📜' %>
                                <%= f.label %>
                        </option>
                        <% }); %>
                </select>
            </div>
            <% } %>

                <header class="text-center mb-10">
                    <div
                        class="inline-block px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-full mb-4 tracking-widest uppercase shadow-lg shadow-indigo-200">
                        AI Insight Report v3.0</div>
                    <h1 class="text-4xl md:text-5xl font-black text-slate-900 mb-3 tracking-tight">智能新聞儀表板</h1>
                    <p class="text-slate-500 font-medium text-lg">
                        <%= fullDateStr %>
                    </p>
                    <div class="mt-4 flex flex-wrap justify-center gap-2 animate-fade">
                        <span class="text-sm font-bold text-slate-400 flex items-center mr-2">🤖 AI 關注實體:</span>
                        <% entities.forEach(function(e) { %>
                            <button onclick="searchKeyword('<%= e.name %>')"
                                class="px-3 py-1 <%= e.colorClass %> border rounded-md text-sm font-bold hover:opacity-80 transition-colors shadow-sm">
                                #<%= e.name %>
                                    <% if (e.ticker) { %>
                                        <span class="text-xs ml-1 opacity-70">(<%= e.ticker %>)</span>
                                        <% } %>
                            </button>
                            <% }); %>
                    </div>
                </header>

                <section class="mb-10 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade">
                    <div class="md:col-span-2 bg-white rounded-2xl p-6 shadow-md border border-slate-100">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-bold text-slate-700 flex items-center"><span class="mr-2">📈</span>
                                市場情緒走勢</h3>
                            <div class="text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-500">今日: <span
                                    class="<%= todayScore > 0 ? 'text-red-500' : 'text-green-500' %> text-base">
                                    <%= todayScore %>
                                </span></div>
                        </div>
                        <div class="h-64 w-full"><canvas id="sentimentChart"></canvas></div>
                    </div>
                    <div class="bg-white rounded-2xl p-6 shadow-md border border-slate-100 flex flex-col">
                        <h3 class="text-lg font-bold text-slate-700 mb-4 flex items-center"><span class="mr-2">🧭</span>
                            五力分析</h3>
                        <div class="flex-grow relative"><canvas id="radarChart"></canvas></div>
                    </div>
                    <!-- 🟢 新增：板塊情緒分析 -->
                    <div class="md:col-span-3 bg-white rounded-2xl p-6 shadow-md border border-slate-100">
                        <h3 class="text-lg font-bold text-slate-700 mb-4 flex items-center"><span class="mr-2">📊</span>
                            板塊情緒分布 (Sector Sentiment)</h3>
                        <div class="h-48 w-full"><canvas id="sectorChart"></canvas></div>
                    </div>
                </section>

                <div class="sticky top-4 z-50 mb-10">
                    <div
                        class="flex flex-col md:flex-row items-center justify-center gap-4 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white/50 w-fit mx-auto">
                        <div class="flex flex-wrap gap-2 justify-center">
                            <% categories.forEach(function(cat) { %>
                                <button onclick="filterCategory('<%= cat %>')" data-filter="<%= cat %>"
                                    class="filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-sm <%= cat === '全部' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200' %>">
                                    <%= cat %>
                                </button>
                                <% }); %>
                        </div>
                        <div class="relative w-full md:w-48 transition-all focus-within:w-64">
                            <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><svg
                                    class="w-4 h-4 text-slate-400" aria-hidden="true" fill="none" viewBox="0 0 20 20">
                                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                                        stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                                </svg></div>
                            <input type="text" id="search-input" oninput="searchNews(this.value)"
                                class="block w-full p-2 pl-10 text-sm text-slate-900 border border-slate-200 rounded-full bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
                                placeholder="搜尋新聞...">
                        </div>
                    </div>
                </div>

                <section class="mb-12 animate-fade">
                    <div
                        class="bg-white rounded-[2rem] p-8 md:p-10 shadow-xl border border-indigo-50 relative overflow-hidden">
                        <button onclick="toggleSpeech()" id="ttsBtn"
                            class="absolute top-6 right-6 p-2 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors z-20"
                            title="朗讀摘要">
                            <svg id="ttsIcon" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z">
                                </path>
                            </svg>
                        </button>
                        <div class="relative z-10 prose prose-indigo max-w-none text-slate-600 leading-relaxed text-lg"
                            id="summary-content">
                            <%- summary.replace(/\n/g, '<br>' ) %>
                        </div>
                    </div>
                </section>

                <div id="news-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6 animate-fade"
                    style="animation-delay: 0.1s;">
                    <!-- 內容將由 JavaScript 根據分頁呈現 -->
                </div>

                <div id="load-more-container" class="flex justify-center pb-12 animate-fade hidden">
                    <button onclick="loadMoreNews()"
                        class="px-8 py-3 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 font-black rounded-2xl hover:bg-indigo-50 dark:hover:bg-slate-700 transition-all shadow-lg active:scale-95">
                        載入更多新聞 ...
                    </button>
                </div>

                <!-- 🔵 v5.0.0: 聚類新聞提示 -->
                <script>
                    const RAW_NEWS_DATA = <%- JSON.stringify(newsData) %>;
                    let displayedCount = 0;
                    const PAGE_SIZE = 12;

                    function renderNewsPage() {
                        const grid = document.getElementById('news-grid');
                        const container = document.getElementById('load-more-container');
                        const nextBatch = RAW_NEWS_DATA.slice(displayedCount, displayedCount + PAGE_SIZE);

                        nextBatch.forEach(n => {
                            const card = document.createElement('div');
                            card.className = "news-card group bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-slate-700 flex flex-col justify-between";
                            card.dataset.category = n.category || '其他';
                            card.dataset.title = (n.title || '').toLowerCase();
                            card.dataset.content = (n.content || '').toLowerCase();
                            card.dataset.rawTitle = n.title;
                            card.dataset.rawContent = n.content || '無內文資訊';
                            card.dataset.url = n.url;
                            card.dataset.source = n.source;
                            card.dataset.date = n.timeStr ? n.timeStr.split(' ')[0] : '全部';
                            card.dataset.sector = n.sector || '其他';

                            const relatedHtml = n.relatedArticles && n.relatedArticles.length > 0
                                ? `< div class="mt-2 flex flex-wrap gap-1" >
    <span class="text-[9px] font-bold text-slate-400">其他來源:</span>
\${ n.relatedArticles.map(r => `<span class="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[9px] rounded-md border border-slate-100 dark:border-slate-600 font-medium">\${r.source}</span>`).join('') }
                                   </div > `
                                : '';

                            card.innerHTML = `
    < div >
                                    <div class="flex items-center justify-between mb-4">
                                        <span class="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[11px] font-black rounded-full uppercase tracking-widest border border-indigo-100 dark:border-indigo-900/50">
                                            \${n.category || '其他'}
                                        </span>
                                        <span class="text-slate-400 text-xs">\${n.timeStr || ''}</span>
                                    </div>
                                    <h3 class="text-slate-800 dark:text-slate-100 font-bold leading-snug text-lg mb-3 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                        \${n.title}
                                    </h3>
                                    <div class="text-xs text-slate-400 font-medium mb-2 flex items-center">
                                        <span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span>
                                        \${n.source}
                                    </div>
                                    \${ relatedHtml }
                                </div >
    <div class="pt-4 border-t border-slate-50 dark:border-slate-700 flex justify-between items-center mt-4">
        <button onclick="handlePreview(this)" class="inline-flex items-center text-xs font-bold text-slate-400 hover:text-indigo-500 transition-colors">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>預覽內容
        </button>
        <a href="\${n.url}" target="_blank" class="inline-flex items-center text-sm font-bold text-indigo-500 hover:text-indigo-700">閱讀全文
            <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
        </a>
    </div>
\`;
                            grid.appendChild(card);
                        });

                        displayedCount += nextBatch.length;
                        if (displayedCount < RAW_NEWS_DATA.length) {
                            container.classList.remove('hidden');
                        } else {
                            container.classList.add('hidden');
                        }
                    }

                    function loadMoreNews() { renderNewsPage(); }
                    window.addEventListener('DOMContentLoaded', () => renderNewsPage());
                </script>

                <% if (sortedKeywords.length > 0) { %>
                    <section class="mb-12 animate-fade" style="animation-delay: 0.2s;">
                        <h3 class="text-xl font-black text-slate-800 mb-4 flex items-center"><span
                                class="text-2xl mr-2">🔥</span> 市場關鍵字熱度 (點擊查看趨勢)</h3>
                        <div
                            class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-wrap content-start">
                            <% sortedKeywords.forEach(function(k) { %>
                                <button onclick="showKeywordTrend('<%= k.word %>')"
                                    class="inline-flex items-center justify-center bg-slate-100 text-slate-600 border-slate-200 hover:bg-indigo-100 hover:text-indigo-700 hover:border-indigo-300 text-sm px-3 py-1 rounded-full border m-1 transition-all">
                                    <span>
                                        <%= k.word %>
                                    </span><span class="ml-2 text-[0.7em] opacity-80 bg-black/10 px-1.5 rounded-full">
                                        <%= k.count %>
                                    </span>
                                </button>
                                <% }); %>
                        </div>
                    </section>
                    <% } %>

                        <% if (keywords7d && keywords7d.length > 0) { %>
                            <section class="mb-12 animate-fade" style="animation-delay: 0.3s;">
                                <h3 class="text-xl font-black text-slate-800 mb-4 flex items-center"><span
                                        class="text-2xl mr-2">📅</span> 7日市場熱詞 (Buzzword Cloud)</h3>
                                <div
                                    class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-center">
                                    <canvas id="wordCloudCanvas"
                                        class="w-full max-w-4xl h-[350px] cursor-pointer"></canvas>
                                    <div
                                        class="mt-4 flex flex-wrap gap-2 justify-center opacity-60 text-xs font-bold text-slate-400">
                                        💡 點擊熱詞查看趨勢或搜尋新聞
                                    </div>
                                </div>
                            </section>
                            <script
                                src="https://cdnjs.cloudflare.com/ajax/libs/wordcloud2.js/1.2.2/wordcloud2.min.js"></script>
                            <% } %>

                                <!-- 🟢 新增：趨勢圖 Modal -->
                                <div id="trendModal"
                                    class="fixed inset-0 bg-black/50 z-[100] hidden flex items-center justify-center backdrop-blur-sm opacity-0 transition-opacity duration-300">
                                    <div class="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl transform scale-95 transition-transform duration-300"
                                        id="trendModalContent">
                                        <div class="flex justify-between items-center mb-4">
                                            <h3 class="text-xl font-bold text-slate-800" id="trendModalTitle">關鍵字趨勢</h3>
                                            <button onclick="closeTrendModal()"
                                                class="text-slate-400 hover:text-slate-600">
                                                <svg class="w-6 h-6" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                                </svg>
                                            </button>
                                        </div>
                                        <div class="h-64 w-full relative">
                                            <canvas id="trendChart"></canvas>
                                        </div>
                                    </div>
                                </div>

                                <!-- 🟢 新増：內容預覽 Modal -->
                                <div id="contentModal"
                                    class="fixed inset-0 bg-black/60 z-[110] hidden flex items-center justify-center backdrop-blur-md opacity-0 transition-all duration-300">
                                    <div
                                        class="bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl w-full max-w-2xl mx-4 overflow-hidden transform scale-95 transition-all duration-300">
                                        <div class="p-8 pb-4 flex justify-between items-start">
                                            <div>
                                                <div id="modalSource"
                                                    class="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">
                                                    新聞來源</div>
                                                <h3 class="text-2xl font-black text-slate-800 dark:text-slate-100 leading-tight"
                                                    id="modalTitle">標題載入中...</h3>
                                            </div>
                                            <button onclick="closeContentModal()"
                                                class="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500 transition-all">
                                                <svg class="w-6 h-6" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                                </svg>
                                            </button>
                                        </div>
                                        <div class="px-8 py-4 max-h-[60vh] overflow-y-auto text-slate-600 dark:text-slate-300 leading-relaxed text-lg"
                                            id="modalText">
                                            內容載入中...
                                        </div>
                                        <div
                                            class="p-8 pt-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                            <a id="modalFullLink" href="#" target="_blank"
                                                class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">閱讀全文</a>
                                        </div>
                                    </div>
                                </div>

                                <!-- 🟢 新增：關鍵字相關新聞列表 Modal -->
                                <div id="keywordArticlesModal"
                                    class="fixed inset-0 bg-black/60 z-[105] hidden flex items-center justify-center backdrop-blur-md opacity-0 transition-all duration-300">
                                    <div
                                        class="bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl w-full max-w-xl mx-4 overflow-hidden transform scale-95 transition-all duration-300">
                                        <div
                                            class="p-8 pb-4 flex justify-between items-center border-b border-slate-50 dark:border-slate-700">
                                            <h3 class="text-xl font-black text-slate-800 dark:text-slate-100"
                                                id="kwModalTitle">相關新聞列表</h3>
                                            <button onclick="closeKeywordModal()"
                                                class="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500 transition-all">
                                                <svg class="w-6 h-6" fill="none" stroke="currentColor"
                                                    viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round"
                                                        stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                                </svg>
                                            </button>
                                        </div>
                                        <div class="p-4 max-h-[50vh] overflow-y-auto" id="kwModalList">
                                            <!-- 列表將動態生成 -->
                                        </div>
                                        <div
                                            class="p-6 bg-slate-50 dark:bg-slate-900/50 text-center text-xs text-slate-400 font-bold">
                                            💡 點擊標題即可顯示預覽內容
                                        </div>
                                    </div>
                                </div>

                                <footer
                                    class="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 text-center text-slate-400 dark:text-slate-500 text-sm font-medium">
                                    自動化生成系統 · Powered by Gemini 2.5 & EJS Engine (v5.0.0)</footer>
    </div>

    <script>
        // 🟢 新增：從卡片獲取資料並開啟預覽
        function handlePreview(btn) {
            const card = btn.closest('.news-card');
            if (card) {
                const title = card.dataset.rawTitle;
                const content = card.dataset.rawContent;
                const url = card.dataset.url;
                const source = card.dataset.source;
                openContentModal(title, content, url, source);
            }
        }

        // 🟢 新增：內文預覽 Modal 邏輯
        function openContentModal(title, content, url, source) {
            const modal = document.getElementById('contentModal');
            const inner = modal.querySelector('div');
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalText').innerHTML = content;
            document.getElementById('modalSource').textContent = source;
            document.getElementById('modalFullLink').href = url;

            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                inner.classList.remove('scale-95');
            }, 10);
        }

        function closeContentModal() {
            const modal = document.getElementById('contentModal');
            const inner = modal.querySelector('div');
            modal.classList.add('opacity-0');
            inner.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }

        document.getElementById('contentModal').addEventListener('click', (e) => {
            if (e.target.id === 'contentModal') closeContentModal();
        });
        // 🟢 v5.0.0: 圖表顏色自定義與暗色切換
        function getThemeColors() {
            const isDark = document.documentElement.classList.contains('dark');
            return {
                text: isDark ? '#94a3b8' : '#475569',
                grid: isDark ? '#1e293b' : '#f1f5f9',
                chart: isDark ? '#818cf8' : '#4f46e5'
            };
        }

        function updateCharts() {
            const colors = getThemeColors();
            [sentimentChart, radarChart, sectorChart].forEach(chart => {
                if (!chart) return;

                // 更新格線與文字顏色
                if (chart.options.scales) {
                    if (chart.options.scales.x) {
                        chart.options.scales.x.grid.color = colors.grid;
                        chart.options.scales.x.ticks.color = colors.text;
                    }
                    if (chart.options.scales.y) {
                        chart.options.scales.y.grid.color = colors.grid;
                        chart.options.scales.y.ticks.color = colors.text;
                    }
                    if (chart.options.scales.r) {
                        chart.options.scales.r.grid.color = colors.grid;
                        chart.options.scales.r.angleLines.color = colors.grid;
                        chart.options.scales.r.pointLabels.color = colors.text;
                    }
                }
                chart.update();
            });
        }

        // --- Existing Charts with Interaction ---
        let sentimentChart, radarChart, sectorChart;

        const ctx = document.getElementById('sentimentChart').getContext('2d');
        sentimentChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: <%- JSON.stringify(chartLabels) %>,
                datasets: [{
                    label: '情緒指數',
                    data: <%- JSON.stringify(chartScores) %>,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    borderWidth: 3,
                    pointRadius: 5,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, items) => {
                    if (items.length > 0) {
                        const idx = items[0].index;
                        currentDate = <%- JSON.stringify(chartLabels) %> [idx];
                        document.getElementById('kwModalTitle').innerText = \`📅 \${currentDate} 新聞回顧\`;
                        applyFilters();
                    }
                },
                scales: {
                    y: { min: -1, max: 1, grid: { color: getThemeColors().grid }, ticks: { color: getThemeColors().text } },
                    x: { grid: { display: false }, ticks: { color: getThemeColors().text } }
                },
                plugins: { legend: { display: false } }
            }
        });

        const radarCtx = document.getElementById('radarChart').getContext('2d');
        radarChart = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: ['政策', '資金', '基本面', '國際', '技術'],
                datasets: [{
                    label: '今日強度',
                    data: <%- JSON.stringify(radarData) %>,
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
                        angleLines: { color: getThemeColors().grid },
                        grid: { color: getThemeColors().grid },
                        pointLabels: { font: { size: 12, weight: 'bold' }, color: getThemeColors().text },
                        suggestedMin: 0, suggestedMax: 1, ticks: { display: false }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

        const sectorCtx = document.getElementById('sectorChart').getContext('2d');
        const sectorData = <%- JSON.stringify(sectorStats) %>;
        sectorChart = new Chart(sectorCtx, {
            type: 'bar',
            data: {
                labels: ['科技/半導體', '金融', '傳產/製造', '服務/消費'],
                datasets: [{
                    label: '板塊情緒',
                    data: [sectorData.tech, sectorData.finance, sectorData.manufacturing, sectorData.service],
                    backgroundColor: [
                        sectorData.tech > 0 ? '#ef4444' : '#22c55e',
                        sectorData.finance > 0 ? '#ef4444' : '#22c55e',
                        sectorData.manufacturing > 0 ? '#ef4444' : '#22c55e',
                        sectorData.service > 0 ? '#ef4444' : '#22c55e'
                    ],
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, items) => {
                    if (items.length > 0) {
                        const label = sectorChart.data.labels[items[0].index];
                        currentSector = label;
                        applyFilters();
                        document.getElementById('news-grid').scrollIntoView({ behavior: 'smooth' });
                    }
                },
                scales: {
                    x: { min: -1, max: 1, grid: { color: getThemeColors().grid }, ticks: { color: getThemeColors().text } },
                    y: { grid: { display: false }, ticks: { color: getThemeColors().text } }
                },
                plugins: { legend: { display: false } }
            }
        });

        // 🟢 新增：關鍵字趨勢 Modal 邏輯
        let trendChart = null;
        let trendsCache = null;

        async function showKeywordTrend(keyword) {
            const modal = document.getElementById('trendModal');
            const content = document.getElementById('trendModalContent');
            const title = document.getElementById('trendModalTitle');

            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('scale-95');
            }, 10);

            title.textContent = "🔥 " + keyword + " - 7日熱度趨勢";

            // Fetch data if not cached
            if (!trendsCache) {
                try {
                    const res = await fetch('data/trends.json');
                    trendsCache = await res.json();
                } catch (e) { console.error("Trends fetch failed", e); return; }
            }

            const history = trendsCache[keyword] || [];
            const labels = history.map(h => h.date.slice(5));
            const data = history.map(h => h.count);

            const ctx = document.getElementById('trendChart').getContext('2d');

            if (trendChart) trendChart.destroy();

            trendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '出現次數',
                        data: data,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#6366f1',
                        pointRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { stepSize: 1 } }, x: { grid: { display: false } } },
                    plugins: { legend: { display: false } }
                }
            });
        }

        function closeTrendModal() {
            const modal = document.getElementById('trendModal');
            const content = document.getElementById('trendModalContent');

            modal.classList.add('opacity-0');
            content.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }

        // Close on click outside
        document.getElementById('trendModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('trendModal')) closeTrendModal();
        });

        // 🟢 新增：TTS 語音朗讀邏輯
        let speaking = false;
        function toggleSpeech() {
            const btn = document.getElementById('ttsBtn');
            const icon = document.getElementById('ttsIcon');

            if (speaking) {
                window.speechSynthesis.cancel();
                speaking = false;
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>';
                btn.classList.remove('bg-red-50', 'text-red-600');
                btn.classList.add('bg-indigo-50', 'text-indigo-600');
            } else {
                const text = document.getElementById('summary-content').textContent; // 取得純文字
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'zh-TW';
                u.rate = 1.0;
                u.onend = () => {
                    speaking = false;
                    icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>';
                    btn.classList.remove('bg-red-50', 'text-red-600');
                    btn.classList.add('bg-indigo-50', 'text-indigo-600');
                };

                window.speechSynthesis.speak(u);
                speaking = true;

                // Change icon to Stop
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>';
                btn.classList.remove('bg-indigo-50', 'text-indigo-600');
                btn.classList.add('bg-red-50', 'text-red-600');
            }
        }

        // 🟢 v4.7.0: 關鍵字與文章地圖
        const keywordMap = <%- JSON.stringify(keywords7d.reduce((acc, curr) => { acc[curr.word] = curr.articles; return acc; }, {})) %>;

        // 🟢 v4.7.0: 顯示關鍵字相關新聞列表
        function showKeywordArticles(word) {
            const articles = keywordMap[word] || [];
            const modal = document.getElementById('keywordArticlesModal');
            const title = document.getElementById('kwModalTitle');
            const list = document.getElementById('kwModalList');

            title.innerHTML = \`🔥 <span class="text-indigo-600">\${word}</span> 相關新聞\`;
            list.innerHTML = articles.map(a => \`
                <div class="group p-4 mb-2 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl cursor-pointer transition-all"
                     onclick="openContentModal('\${a.title.replace(/'/g, "\\\\'")}', '\${(a.content || '無內文資訊').replace(/'/g, "\\\\'").replace(/\\n/g, '<br>')}', '\${a.url}', '\${a.source}')">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">\${a.source}</span>
                        <svg class="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </div>
                    <h4 class="text-slate-700 font-bold group-hover:text-indigo-600 transition-colors line-clamp-2">\${a.title}</h4>
                </div>
            \`).join('') || '<div class="p-8 text-center text-slate-400 font-medium">暫無相關新聞</div>';

            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('div').classList.remove('scale-95');
            }, 10);
        }

        function closeKeywordModal() {
            const modal = document.getElementById('keywordArticlesModal');
            const inner = modal.querySelector('div');
            modal.classList.add('opacity-0');
            inner.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }

        // Close on click outside
        document.getElementById('keywordArticlesModal').addEventListener('click', (e) => {
            if (e.target.id === 'keywordArticlesModal') closeKeywordModal();
        });

        // 🟢 v4.5.0: Word Cloud 初始化
        <% if (keywords7d && keywords7d.length > 0) { %>
            const cloudData = <%- JSON.stringify(keywords7d.map(k => [k.word, k.count])) %>;
            const canvas = document.getElementById('wordCloudCanvas');

            function renderCloud() {
                const width = canvas.parentElement.offsetWidth - 48;
                canvas.width = width;
                canvas.height = 350;

                WordCloud(canvas, {
                    list: cloudData,
                    gridSize: 12,
                    weightFactor: function (size) {
                        return Math.pow(size, 0.7) * (width / 400); // 根據頻率與寬度動態縮放
                    },
                    fontFamily: 'Noto Sans TC, sans-serif',
                    color: function () {
                        return ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#4338ca'][Math.floor(Math.random() * 5)];
                    },
                    rotateRatio: 0.3,
                    rotationSteps: 2,
                    backgroundColor: '#ffffff',
                    click: function (item) {
                        const word = item[0];
                        // 🟢 v4.7.0: 改為顯示新聞列表
                        showKeywordArticles(word);
                    }
                });
            }

            window.addEventListener('resize', renderCloud);
            renderCloud();
        <% } %>
    </script>
</body>

</html>\`;

if (!fs.existsSync(viewsDir)) {
    fs.mkdirSync(viewsDir, { recursive: true });
}

fs.writeFileSync(indexPath, indexTemplate, 'utf8');
console.log('✅ src/views/index.ejs has been rebuilt successfully.');
