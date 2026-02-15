# 📰 News Daily AI Bot

全自動化新聞爬蟲與 AI 分析戰情室。透過 Node.js 爬取 RSS 與 API 來源，利用 Google Gemini 進行深度金融分析，並自動部署至 GitHub Pages 呈現儀表板。

## 📂 專案結構 (Project Structure)

```text
news-daily/
├── index.js           # 🚀 主程式入口 (負責排程與流程控制)
├── weekly.js          # 📅 週報機器人 (已整合 lib)
├── news_bot.db        # 🗄️ 資料庫 (保持在根目錄)
├── .env               # 🔑 設定檔
├── package.json       # 📦 套件設定
├── public/            # 🌐 靜態資源目錄 (原 reports)
│   └── index.html     #    生成的儀表板 (最新)
│   └── report_*.html  #    歷史報表存檔
└── lib/               # 🧠 核心邏輯庫
    ├── config.js      #    設定檔載入器
    ├── utils.js       #    通用工具 (Log, Discord)
    ├── db.js          #    資料庫操作
    ├── crawler.js     #    爬蟲與 API 抓取
    ├── ai.js          #    Gemini AI 分析
    ├── ui.js          #    HTML 生成
    └── git.js         #    Git 自動化部署
	
📝 更新日誌 (Changelog)
v2.2.0 - 互動式戰情室 (2026-02-15)
🎨 UI/UX 全面強化：

🔍 即時搜尋 (Live Search)：新增前端搜尋框，可即時過濾新聞標題與內文。

🖱️ 互動式熱力圖：關鍵字雲端改為可點擊 (Clickable)，點擊後自動篩選相關新聞並捲動定位。

📂 歷史報表選單：右上角新增「歷史報表」下拉選單，可快速回顧過去日期的分析報告 (自動備份為 report_YYYY-MM-DD.html)。

⚙️ 篩選邏輯優化：

實作「分類 + 搜尋」的複合篩選機制 (AND Logic)，確保過濾結果精確。

v2.1.1 - 穩定性與 UI 修復 (2026-02-15)
🐛 問題修復 (Bug Fixes)：

RSS 讀取增強 (解決 TechNews 403 錯誤)。

UI 篩選按鈕修復 (改用 data-filter 屬性)。

v2.1.0 - 市場熱度視覺化 (2026-02-15)
🔥 新增關鍵字熱力圖 (Keyword Heatmap)。

v2.0.0 - 架構模組化重構 (2026-02-15)
🏗️ 核心架構升級：拆解 index.js 為 lib/ 模組。

v1.5.0 - AI 深度金融分析 (2026-02-14)
🧠 Gemini Prompt 優化與 📊 資料來源擴充。