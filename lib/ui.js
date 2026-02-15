const fs = require('fs');
const path = require('path');
const { publicDir } = require('./config');
const { ensureDir } = require('./utils');

/**
 * 專門處理 HTML 報表生成的模組
 * @param {string} summary AI 摘要文字
 * @param {Array} newsData 新聞資料陣列
 * @param {Object} keywordStats 關鍵字統計物件
 */
function generateHTMLReport(summary, newsData, keywordStats = {}) {
    const dateStr = new Date().toLocaleDateString('zh-TW', { 
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
    });

    // 取得 public 目錄下的所有 HTML 檔案作為歷史存檔 (排除 index.html)
    let historyOptions = '';
    try {
        if (fs.existsSync(publicDir)) {
            const files = fs.readdirSync(publicDir);
            const htmlFiles = files.filter(f => f.endsWith('.html') && f !== 'index.html').sort().reverse();
            if (htmlFiles.length > 0) {
                const options = htmlFiles.map(f => `<option value="${f}">${f.replace('report_', '').replace('.html', '')}</option>`).join('');
                historyOptions = `
                    <div class="absolute top-0 right-0 mt-2 mr-2">
                        <select onchange="if(this.value) window.location.href=this.value" class="bg-white/90 border border-slate-200 text-slate-500 text-xs rounded-lg p-1.5 focus:ring-indigo-500 focus:border-indigo-500 block">
                            <option value="">📜 歷史報表</option>
                            ${options}
                        </select>
                    </div>
                `;
            }
        }
    } catch (e) { console.error("歷史檔案讀取失敗", e); }
    
    // UI 格式化邏輯
    const formattedSummary = summary
        .replace(/\n/g, '<br>')
        .replace(/🟢/g, '<span class="text-2xl animate-pulse">🟢</span> <b class="text-green-600">利多趨勢</b>')
        .replace(/🔴/g, '<span class="text-2xl animate-pulse">🔴</span> <b class="text-red-600">利空警戒</b>')
        .replace(/⚪/g, '<span class="text-2xl">⚪</span> <b class="text-slate-500">中性觀察</b>')
        .replace(/\*\*(.*?)\*\*/g, '<b class="text-indigo-600 font-bold">$1</b>')
        .replace(/### (.*?)(<br>|$)/g, '<h3 class="text-lg font-bold text-slate-800 mt-6 mb-3 border-l-4 border-indigo-500 pl-3 bg-indigo-50/50 py-1">$1</h3>');

    // 分類按鈕
    const categories = ["全部", "科技", "金融", "社會", "其他"];
    const filterButtonsHtml = categories.map(cat => `
        <button onclick="filterCategory('${cat}')" data-filter="${cat}"
            class="filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-sm
            ${cat === '全部' ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'}">
            ${cat}
        </button>
    `).join('');

    // 新聞卡片 (加入 data-title 屬性方便搜尋)
    const articlesHtml = newsData.map(n => `
        <div class="news-card group bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 flex flex-col justify-between" 
             data-category="${n.category ? n.category.trim() : '其他'}"
             data-title="${n.title.toLowerCase()}"
             data-content="${(n.content || '').toLowerCase()}">
            <div>
                <div class="flex items-center justify-between mb-4">
                    <span class="px-3 py-1 bg-indigo-50 text-indigo-600 text-[11px] font-black rounded-full uppercase tracking-widest border border-indigo-100">
                        ${n.category || '其他'}
                    </span>
                    <span class="text-slate-400 text-xs">${new Date().toLocaleTimeString('zh-TW', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <h3 class="text-slate-800 font-bold leading-snug text-lg mb-3 group-hover:text-indigo-600 transition-colors">${n.title}</h3>
                <div class="text-xs text-slate-400 font-medium mb-4 flex items-center">
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2"></span>${n.source}
                </div>
            </div>
            <div class="pt-4 border-t border-slate-50 flex justify-end">
                <a href="${n.url}" target="_blank" class="inline-flex items-center text-sm font-bold text-indigo-500 hover:text-indigo-700 transition-colors">
                    閱讀全文 
                    <svg class="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                </a>
            </div>
        </div>`).join('');

    // 關鍵字熱度圖 (加入 onclick 事件)
    let keywordsHtml = '';
    const sortedKeywords = Object.entries(keywordStats).sort((a, b) => b[1] - a[1]);
    
    if (sortedKeywords.length > 0) {
        const keywordTags = sortedKeywords.map(([key, count]) => {
            let colorClass = "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"; 
            let sizeClass = "text-sm px-3 py-1";
            
            if (count >= 10) {
                colorClass = "bg-red-600 text-white border-red-600 shadow-md shadow-red-200 animate-pulse hover:bg-red-700";
                sizeClass = "text-lg px-5 py-2 font-bold";
            } else if (count >= 5) {
                colorClass = "bg-red-500 text-white border-red-500 hover:bg-red-600";
                sizeClass = "text-base px-4 py-1.5 font-bold";
            } else if (count >= 3) {
                colorClass = "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200";
            }

            // 加入 onclick="searchKeyword('...')"
            return `
                <button onclick="searchKeyword('${key}')" class="inline-flex items-center justify-center ${colorClass} ${sizeClass} rounded-full border m-1 transition-all hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500">
                    <span>${key}</span>
                    <span class="ml-2 text-[0.7em] opacity-80 bg-black/10 px-1.5 rounded-full">${count}</span>
                </button>
            `;
        }).join('');

        keywordsHtml = `
            <section class="mb-12 animate-fade" style="animation-delay: 0.2s;">
                <h3 class="text-xl font-black text-slate-800 mb-4 flex items-center">
                    <span class="text-2xl mr-2">🔥</span> 市場關鍵字熱度 (點擊篩選)
                </h3>
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-wrap content-start">
                    ${keywordTags}
                </div>
            </section>
        `;
    }

    const html = `<!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI 智能儀表板</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Inter', 'Noto Sans TC', sans-serif; }
            .news-card.hidden { display: none; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            .animate-fade { animation: fadeIn 0.4s ease forwards; opacity: 0; }
        </style>
        <script>
            // 全域變數，紀錄目前的篩選狀態
            let currentCategory = '全部';
            let currentSearch = '';

            // 核心篩選邏輯：同時考慮分類與搜尋關鍵字
            function applyFilters() {
                const cards = document.querySelectorAll('.news-card');
                const searchLower = currentSearch.toLowerCase();
                
                cards.forEach(card => {
                    card.classList.remove('animate-fade');
                    const cardCat = card.dataset.category;
                    const cardTitle = card.dataset.title;
                    const cardContent = card.dataset.content;

                    // 判斷分類是否符合
                    const catMatch = (currentCategory === '全部' || cardCat === currentCategory);
                    // 判斷關鍵字是否符合 (搜尋標題或內文)
                    const searchMatch = !currentSearch || cardTitle.includes(searchLower) || cardContent.includes(searchLower);

                    if (catMatch && searchMatch) {
                        card.classList.remove('hidden');
                        requestAnimationFrame(() => {
                            setTimeout(() => card.classList.add('animate-fade'), 10);
                        });
                    } else {
                        card.classList.add('hidden');
                    }
                });
            }

            function filterCategory(targetCat) {
                currentCategory = targetCat;
                
                // 更新按鈕樣式
                document.querySelectorAll('.filter-btn').forEach(btn => {
                    if (btn.dataset.filter === targetCat) {
                        btn.className = 'filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-md bg-indigo-600 text-white border-indigo-600 shadow-indigo-300';
                    } else {
                        btn.className = 'filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-sm bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600';
                    }
                });
                
                applyFilters();
            }

            function searchNews(value) {
                currentSearch = value.trim();
                applyFilters();
            }

            function searchKeyword(keyword) {
                // 將點擊的關鍵字填入搜尋框
                const searchInput = document.getElementById('search-input');
                searchInput.value = keyword;
                currentSearch = keyword;
                
                // 自動切換到"全部"分類以顯示所有結果
                filterCategory('全部');
                
                // 捲動到新聞列表
                document.getElementById('news-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        </script>
    </head>
    <body class="bg-[#f8fafc] text-slate-900 min-h-screen pb-20">
        <div class="max-w-6xl mx-auto px-4 pt-10 relative">
            
            ${historyOptions}

            <header class="text-center mb-10">
                <div class="inline-block px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-full mb-4 tracking-widest uppercase shadow-lg shadow-indigo-200">AI Insight Report</div>
                <h1 class="text-4xl md:text-5xl font-black text-slate-900 mb-3 tracking-tight">智能新聞儀表板</h1>
                <p class="text-slate-500 font-medium text-lg">${dateStr}</p>
            </header>
            
            <div class="sticky top-4 z-50 mb-10">
                <div class="flex flex-col md:flex-row items-center justify-center gap-4 bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white/50 w-fit mx-auto">
                    <div class="flex flex-wrap gap-2 justify-center">
                        ${filterButtonsHtml}
                    </div>
                    
                    <div class="relative w-full md:w-48 transition-all focus-within:w-64">
                        <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <svg class="w-4 h-4 text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                            </svg>
                        </div>
                        <input type="text" id="search-input" oninput="searchNews(this.value)" 
                            class="block w-full p-2 pl-10 text-sm text-slate-900 border border-slate-200 rounded-full bg-slate-50 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all shadow-inner" 
                            placeholder="搜尋新聞...">
                    </div>
                </div>
            </div>

            <section class="mb-12 animate-fade">
                <div class="bg-white rounded-[2rem] p-8 md:p-10 shadow-xl border border-indigo-50 relative overflow-hidden">
                    <div class="relative z-10 prose prose-indigo max-w-none text-slate-600 leading-relaxed text-lg">
                        ${formattedSummary}
                    </div>
                </div>
            </section>
            
            <div id="news-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12 animate-fade" style="animation-delay: 0.1s;">
                ${articlesHtml}
            </div>

            ${keywordsHtml}
            
            <footer class="mt-10 pt-8 border-t border-slate-200 text-center text-slate-400 text-sm font-medium">
                自動化生成系統 · Powered by Gemini 2.5 & GitHub Actions
            </footer>
        </div>
    </body>
    </html>`;

    ensureDir(publicDir);
    const fileName = 'index.html'; 
    const filePath = path.join(publicDir, fileName);
    fs.writeFileSync(filePath, html);
    
    // 🟢 備份一份當日報表 (report_YYYY-MM-DD.html)，供歷史回顧使用
    // 注意：這會增加 public 資料夾的大小，建議搭配 cleanupOldReports 邏輯
    const historyFileName = `report_${new Date().toISOString().split('T')[0]}.html`;
    fs.writeFileSync(path.join(publicDir, historyFileName), html);

    return { filePath, fileName };
}

module.exports = { generateHTMLReport };