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
```

## 📝 更新日誌 (Changelog)

### v2.5.0 - 雙 AI 引擎架構 (2026-02-16)
- **🧠 引入 OpenAI 支援**：
  - 解決 Gemini 免費版額度不足導致週報失敗的問題。
  - `weekly.js` 全面切換至 OpenAI API (`gpt-4o` / `gpt-3.5-turbo`)，提供更穩定的長文本分析能力。
  - `lib/ai.js` 新增 `getOpenAISummary` 函式，專門處理週報摘要。
- **⚙️ 設定檔更新**：
  - `lib/config.js` 新增 `openaiKey` 與 `openaiModel` 設定。

### v2.4.2 - 週報與 AI 容錯修復 (2026-02-16)
- **🐛 修復 AI 分析崩潰問題 (Fix TypeError)**：
  - 修正 `lib/ai.js` 中 `getSummary` 函式。當新聞資料缺失 `content` 欄位時（如週報讀取歷史資料），自動降級使用 `title` 作為分析素材，防止 `substring` 方法導致程式崩潰。
- **🤖 週報機器人穩定性提升**：
  - 優化 `weekly.js` 的錯誤處理流程，確保與新版 `lib/db.js` 相容。

### v2.4.1 - 週報機器人修復 (2026-02-16)
- **🐛 修正 WeeklyBot 資料庫連線錯誤**：
  - 將 `weekly.js` 重構為模組化架構，改用 `lib/db.js` 存取資料庫，解決 `no such table: articles` 錯誤。
  - 將 `sendDiscord` 函式抽離至 `lib/utils.js` 供全域共用。
  - 週報現在會自動調用 Gemini AI 進行「一週重點回顧」並發送到 Discord。

### v2.4.0 - AI 邏輯深化與多維度分析 (2026-02-15)
- **🧠 實體識別 (Entity Recognition)**：
  - AI 自動提取新聞中的關鍵實體（公司、人物、機構）。
  - 在儀表板標題下方顯示「AI 關注實體」，點擊即可連動搜尋相關新聞。
- **🧭 五力分析雷達圖 (Multi-dimensional Scoring)**：
  - 新增「政策、資金、產業、國際、技術」五大面向評分 (0.0 ~ 1.0)。
  - 透過 Radar Chart 可視化今日市場結構，快速掌握利多/利空來源。
- **📊 儀表板佈局優化**：
  - 改為雙圖表佈局：左側顯示歷史情緒趨勢，右側顯示今日五力分析。

### v2.3.0 - 數據深度與可視化 (2026-02-15)
- **📈 新增情緒趨勢圖 (Sentiment Trend Chart)**：
  - 整合 `Chart.js`，在儀表板首頁繪製近 7 日市場情緒折線圖。
  - 建立 `daily_stats` 資料表，記錄每日 AI 評分 (-1.0 ~ 1.0)。
- **🧠 AI 增量分析 (Incremental Analysis)**：
  - 升級 AI Prompt，將「昨日總結」作為背景知識餵給 AI。
  - AI 能夠自動比對今日與昨日差異，產出更具連續性的觀點。
- **⚙️ 核心邏輯升級**：
  - AI 回傳格式全面改為 JSON，提升資料處理精確度。
  
### v2.2.0 - 互動式戰情室 (2026-02-15)
- **🎨 UI/UX 全面強化**：
  - 🔍 即時搜尋 (Live Search)：新增前端搜尋框，可即時過濾新聞標題與內文。
  - 🖱️ 互動式熱力圖：關鍵字雲端改為可點擊 (Clickable)，點擊後自動篩選相關新聞並捲動定位。
  - 📂 歷史報表選單：右上角新增「歷史報表」下拉選單，可快速回顧過去日期的分析報告 (自動備份為 report_YYYY-MM-DD.html)。
  - ⚙️ 篩選邏輯優化：
  - 實作「分類 + 搜尋」的複合篩選機制 (AND Logic)，確保過濾結果精確。

### v2.1.1 - 穩定性與 UI 修復 (2026-02-15)
- **🐛 問題修復 (Bug Fixes)**：
  - RSS 讀取增強 (解決 TechNews 403 錯誤)。
  - UI 篩選按鈕修復 (改用 data-filter 屬性)。

### v2.1.0 - 市場熱度視覺化 (2026-02-15)
- **🔥 新增關鍵字熱力圖 (Keyword Heatmap)。**

### v2.0.0 - 架構模組化重構 (2026-02-15)
- **🏗️ 核心架構升級：拆解 index.js 為 lib/ 模組。**

### v1.5.0 - AI 深度金融分析 (2026-02-14)
- **🧠 Gemini Prompt 優化與 📊 資料來源擴充。**