const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

/**
 * rebuild_views.js - 渲染器轉型版 v5.3.4
 * 專業開發實務：將模版 (Template) 與渲染邏輯 (Logic) 分離。
 * 讀取實體模版檔案，並注入模擬數據以產生靜態預覽網頁。
 */

const publicDir = path.join(__dirname, '../public');
const templatePath = path.join(__dirname, '../src/views/index.ejs');
const indexPath = path.join(publicDir, 'index.html');

// 準備模擬數據 (Mock Data)，確保渲染環境與 src/lib/ui.js 完全一致
const mockData = {
    fullDateStr: `${new Date().toLocaleDateString('zh-TW')} · 重建建置模式`,
    summary: "🚀 系統架構已成功轉型。目前的 `public/index.html` 是由實體 EJS 模版渲染而成，不再含有原始標籤。\n\n資深開發建議：永遠保持模版與腳本分離，以避免轉義字串造成的語法地獄。",
    todayScore: 0.85,
    chartLabels: ["02-18", "02-19", "02-20", "02-21", "02-22"],
    chartScores: [0.2, 0.4, -0.1, 0.6, 0.85],
    chartColor: "#dc2626",
    radarData: [0.8, 0.7, 0.9, 0.6, 0.5],
    sectorStats: { tech: 0.8, finance: 0.3, manufacturing: 0.5, service: 0.2 },
    entities: [
        { name: "台積電", ticker: "2330", colorClass: "text-red-600 bg-red-50 border-red-200" },
        { name: "鴻海", ticker: "2317", colorClass: "text-red-600 bg-red-50 border-red-200" },
        { name: "聯發科", ticker: "2454", colorClass: "text-indigo-700 bg-indigo-50 border-indigo-200" }
    ],
    historyFiles: [
        { filename: "index.html", label: "今天", isToday: true }
    ],
    sortedKeywords: [
        { word: "半導體", count: 28 },
        { word: "AI 伺服器", count: 22 },
        { word: "台積電", count: 18 },
        { word: "輝達", count: 15 },
        { word: "降息", count: 12 },
        { word: "通膨", count: 10 },
        { word: "美債引領", count: 8 },
        { word: "散熱模組", count: 7 },
        { word: "矽光子", count: 6 },
        { word: "載板", count: 5 }
    ],
    newsData: [
        {
            title: "台積電 2 奈米進度超前，法人看好全年營收達標",
            source: "經濟日報",
            url: "#",
            content: "&lt;p&gt;台積電於今日法說會表示，2 奈米製程研發進度順利，預計將於明年量產。&lt;/p&gt;&lt;p&gt;市場分析師認為，隨著 AI 需求持續成長，台積電將維持領先地位。&lt;/p&gt;\n這是第二行內容，驗證換行功能。",
            category: "科技",
            timeStr: "11:30",
            is_contrarian: false,
            relatedArticles: [{ source: "工商時報" }, { source: "鉅亨網" }]
        },
        {
            title: "美聯準會維持利率不變，暗示今年內仍有降息空間",
            source: "華爾街見聞",
            url: "#",
            content: "聯準會主席鮑爾表示，雖然通膨緩解速度放慢，但目前利率政策已足夠限制。市場預期最快將於第三季啟動首波降息。",
            category: "金融",
            timeStr: "08:15",
            is_contrarian: false,
            relatedArticles: []
        },
        {
            title: "巴逆逆開口：這檔股票我看好！投資人集體閃避",
            source: "社群網路",
            url: "#",
            content: "知名的「反向指標」女神巴逆逆今日於臉書發文表示看好某半導體概念股，引發市場論壇熱烈討論「逃命波」是否已到。",
            category: "其他",
            timeStr: "14:20",
            is_contrarian: true,
            relatedArticles: []
        }
    ],
    categories: ["全部", "科技", "金融", "社會", "其他"],
    keywords7d: [
        { word: "半導體", count: 85, articles: [] },
        { word: "AI", count: 72, articles: [] },
        { word: "降息", count: 65, articles: [] },
        { word: "台積電", count: 58, articles: [] },
        { word: "NVIDIA", count: 52, articles: [] },
        { word: "伺服器", count: 48, articles: [] },
        { word: "通膨", count: 42, articles: [] },
        { word: "散熱", count: 35, articles: [] },
        { word: "矽光子", count: 30, articles: [] },
        { word: "CoWoS", count: 28, articles: [] },
        { word: "比特幣", count: 25, articles: [] },
        { word: "電動車", count: 22, articles: [] },
        { word: "低軌衛星", count: 20, articles: [] }
    ]
};

async function rebuild() {
    console.log('🏗️  正在依據模版渲染 public/index.html...');

    if (!fs.existsSync(templatePath)) {
        console.error(`❌ 找不到模版檔案: ${templatePath}`);
        process.exit(1);
    }

    try {
        // 使用 ejs 渲染實體檔案，這會處理所有轉義與編碼問題
        const html = await ejs.renderFile(templatePath, mockData);

        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }

        // 以 UTF-8 寫入，確保無亂碼
        fs.writeFileSync(indexPath, html, 'utf8');
        console.log('✅ 渲染成功！網頁檔案已寫入: public/index.html');
        console.log('💡 現在您可以直接打開該檔案，將看到正確的視覺介面呈現。');
    } catch (err) {
        console.error('❌ 渲染過程中發生錯誤:');
        console.error(err);
        process.exit(1);
    }
}

rebuild();
