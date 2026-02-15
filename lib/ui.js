const fs = require('fs');
const path = require('path');
const { publicDir } = require('./config');
const { ensureDir } = require('./utils');

function generateHTMLReport(summary, newsData) {
    const dateStr = new Date().toLocaleDateString('zh-TW', { 
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
    });
    
    // UI 格式化邏輯 (縮減版，詳細樣式同原版)
    const formattedSummary = summary
        .replace(/\n/g, '<br>')
        .replace(/🟢/g, '<span class="text-2xl animate-pulse">🟢</span> <b class="text-green-600">利多趨勢</b>')
        .replace(/🔴/g, '<span class="text-2xl animate-pulse">🔴</span> <b class="text-red-600">利空警戒</b>')
        .replace(/⚪/g, '<span class="text-2xl">⚪</span> <b class="text-slate-500">中性觀察</b>')
        .replace(/\*\*(.*?)\*\*/g, '<b class="text-indigo-600 font-bold">$1</b>')
        .replace(/### (.*?)(<br>|$)/g, '<h3 class="text-lg font-bold text-slate-800 mt-6 mb-3 border-l-4 border-indigo-500 pl-3 bg-indigo-50/50 py-1">$1</h3>');

    // ... (Filter Buttons HTML 同原版，此處省略以節省空間) ...
    const categories = ["全部", "科技", "金融", "社會", "其他"];
    const filterButtonsHtml = categories.map(cat => `
        <button onclick="filterCategory('${cat}')" 
            class="filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-sm
            ${cat === '全部' ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'}">
            ${cat}
        </button>
    `).join('');

    // ... (Cards HTML 同原版) ...
    const articlesHtml = newsData.map(n => `
        <div class="news-card group bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 flex flex-col justify-between" 
             data-category="${n.category || '其他'}">
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

    // 完整的 HTML 結構
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
            .animate-fade { animation: fadeIn 0.4s ease forwards; }
        </style>
        <script>
            function filterCategory(cat) {
                const cards = document.querySelectorAll('.news-card');
                const btns = document.querySelectorAll('.filter-btn');
                btns.forEach(btn => {
                    if (btn.innerText.trim() === cat) {
                        btn.className = 'filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-md bg-indigo-600 text-white border-indigo-600 shadow-indigo-300';
                    } else {
                        btn.className = 'filter-btn px-5 py-2 rounded-full text-sm font-bold border transition-all duration-300 transform active:scale-95 shadow-sm bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600';
                    }
                });
                cards.forEach(card => {
                    card.classList.remove('animate-fade');
                    if (cat === '全部' || card.dataset.category === cat) {
                        card.classList.remove('hidden');
                        setTimeout(() => card.classList.add('animate-fade'), 10);
                    } else {
                        card.classList.add('hidden');
                    }
                });
            }
        </script>
    </head>
    <body class="bg-[#f8fafc] text-slate-900 min-h-screen pb-20">
        <div class="max-w-6xl mx-auto px-4 pt-10">
            <header class="text-center mb-10">
                <div class="inline-block px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-full mb-4 tracking-widest uppercase shadow-lg shadow-indigo-200">AI Insight Report</div>
                <h1 class="text-4xl md:text-5xl font-black text-slate-900 mb-3 tracking-tight">智能新聞儀表板</h1>
                <p class="text-slate-500 font-medium text-lg">${dateStr}</p>
            </header>
            
            <div class="sticky top-4 z-50 mb-10">
                <div class="flex flex-wrap gap-2 justify-center bg-white/80 backdrop-blur-md p-2 rounded-full shadow-lg border border-white/50 w-fit mx-auto">
                    ${filterButtonsHtml}
                </div>
            </div>

            <section class="mb-12">
                <div class="bg-white rounded-[2rem] p-8 md:p-10 shadow-xl border border-indigo-50 relative overflow-hidden">
                    <div class="relative z-10 prose prose-indigo max-w-none text-slate-600 leading-relaxed text-lg">
                        ${formattedSummary}
                    </div>
                </div>
            </section>
            
            <div id="news-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
                ${articlesHtml}
            </div>
            
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

    return { filePath, fileName };
}

module.exports = { generateHTMLReport };