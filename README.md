# 📰 News Daily AI Bot

全自動化新聞爬蟲與 AI 分析戰情室。透過 Node.js 爬取 RSS 與 API 來源，利用 Google Gemini 進行深度金融分析，並自動部署至 GitHub Pages 呈現儀表板。

## 📂 專案結構 (Project Structure)

```text
news-daily/
├── src/               # 📦 核心原始碼
│   ├── index.js       #    🚀 主程式入口
│   ├── weekly.js      #    📅 週報機器人
│   ├── lib/           #    🧠 核心邏輯庫 (config, ai, db, crawler...)
│   └── views/         #    🎨 EJS 樣板 (index.ejs)
├── scripts/           # 🛠️ 維護與測試腳本
│   ├── rebuild_views.js
│   ├── verify_fix.js
│   └── ...
├── data/              # 🗄️ 資料儲存
│   └── news_bot.db    #    SQLite 資料庫
├── public/            # 🌐 靜態資源目錄 (報表輸出)
├── tests/             # 🧪 測試程式碼
├── .env               # 🔑 設定檔
├── ecosystem.config.js # 🚀 PM2 啟動設定
├── package.json       # 📦 套件設定
└── README.md          # 📄 專案說明
```

## 📝 更新日誌 (Changelog)

### v4.2.0 - 語音朗讀功能 (2026-02-19)
- **🔊 摘要語音朗讀 (Text-to-Speech)**：
  - 在日報摘要區塊新增朗讀按鈕。
  - 使用瀏覽器原生 `Web Speech API`，無需額外流量與費用。
  - 自動過濾 Markdown 標籤，提供純淨的朗讀體驗。

### v4.1.0 - 專案結構重構 (2026-02-18)
- **🏗️ 目錄重構 (Project Restructuring)**：
  - 建立 `src/` 目錄，收納核心程式碼 (`index.js`, `weekly.js`, `lib/`, `views/`)。
  - 建立 `scripts/` 目錄，收納維護與測試腳本。
  - 建立 `data/` 目錄，收納資料庫檔案 (`news_bot.db`)。
  - 提升專案可維護性與整潔度。
- **🚀 部署設定 (Deployment)**：
  - 新增 `ecosystem.config.js`，修正 PM2 啟動路徑 (`src/index.js`)。
  - 啟動指令：`pm2 start ecosystem.config.js`。

### v4.0.2 - 修復顯示異常 (2026-02-18)
- **🐛 修復前端圖表與摘要消失問題 (Fix Missing UI)**：
  - 還原 `views/index.ejs` 中意外遺失的搜尋區塊、摘要區塊與新聞列表。
  - 修正 EJS 標籤錯誤 (`<% -` -> `<%-`)，確保 JSON 數據正確輸出至前端 Chart.js。
  - 進行完整編碼驗證 (No BOM)，確保中文字元正常顯示。

### v4.0.1 - 程式碼優化 (2026-02-18)
- **🔧 動態版本號 (Dynamic Versioning)**：
  - 修改 `index.js`，改為直接讀取 `package.json` 的 `version` 欄位，避免手動更新不一致的問題。

### v4.0.0 - 互動式儀表板與深度分析 (2026-02-18)
- **📊 互動式關鍵字趨勢 (Interactive Insights)**：
  - 新增關鍵字點擊功能，彈出視窗顯示該關鍵字過去 14 天的熱度走勢圖。
  - 系統自動生成 `trends.json`，提供前端快速查詢歷史數據。
- **🧠 板塊情緒分析 (Deep Sector Analysis)**：
  - AI 分析模組升級，新增對「科技」、「金融」、「傳產」、「服務」四大板塊的獨立多空評估。
  - 首頁新增「板塊情緒分布」長條圖，一目瞭然各產業風向。
- **💾 資料庫升級**：
  - `daily_stats` 資料表擴充 `sector_stats` 欄位，支援儲存板塊情緒數據。
  - 優化 SQL 查詢效能，支援快速檢索關鍵字歷史紀錄。

### v3.0.3 - 徹底修復編碼問題 (2026-02-17)
- **🔥 重建模板檔案 (Rebuild Templates)**：
  - 發現 PowerShell 寫入檔案時的 BOM 問題導致 EJS 解析異常。
  - 使用 Node.js 原生 `fs` 模組重建 `views/index.ejs`，確保為純淨的 UTF-8 (No BOM) 格式。
  - 經 Hex Dump 驗證，生成的 HTML 標題與圖表數據現已完全正常。

### v3.0.2 - 編碼異常修復與顯示修正 (2026-02-17)
- **🔣 修復中文亂碼問題 (Fix Character Encoding)**：
  - 修正 `views/index.ejs` 因檔案寫入過程導致的 UTF-8 編碼異常，還原所有中文標籤與說明文字。
  - 確保所有 EJS 模板檔案強制使用 UTF-8 (No BOM) 格式，解決 Windows 環境下的顯示問題。

### v3.0.1 - 緊急修復與部署優化 (2026-02-17)
- **🐛 修復圖表顯示問題 (Fix EJS Syntax)**：
  - 修正 `views/index.ejs` 中的 EJS 語法錯誤 (`<% -` -> `<%-`)，解決前端 Charts.js 無法讀取數據導致圖表消失的問題。
- **⚙️ 部署設定優化**：
  - 更新 `package.json`，新增 `start` script (`node index.js`)，支援標準 `npm start` 指令啟動服務。
  - 更新 `.gitignore`，從忽略清單中排除 `views/index.ejs` (若先前誤將其忽略)，確保樣板檔正確提交。

### v3.0.0 - 架構重構與效能優化 (2026-02-17)
- **🏗️ 架構重構 (Architecture Refactor)**：
  - 引入 **EJS** 樣板引擎 (`views/`)，將 HTML 生成邏輯與 JS 分離，提升可維護性。
  - 重構 `lib/ui.js`，不再使用難以維護的 Template Strings。
- **⚡ 效能優化 (Performance)**：
  - 引入 **p-limit** 實作並發爬蟲 (Concurrency Crawling)。RSS 解析與內容抓取改為平行處理 (Max 5 concurrent requests)，大幅縮短執行時間。
- **🧪 測試與品質 (Testing & QA)**：
  - 引入 **Jest** 測試框架。
  - 建立基礎單元測試 (`tests/utils.test.js`) 與整合測試配置。
- **📝 日誌升級 (Logging)**：
  - 引入 **Winston** 結構化日誌。
  - 支援 Console 美化輸出與 JSON 格式檔案記錄 (`logs/combined.log`, `logs/error.log`)。

### v2.9.1 - 自動化驗證腳本 (2026-02-17)
- **🧪 新增驗證工具 (Verification Tools)**：
  - 建立 `tests/test_discord.js`：用於測試 Discord Webhook 連線與告警發送功能。
  - 建立 `tests/test_ai_failure.js`：用於模擬 API Key 失效或配額不足的情境，驗證重試 (Retry) 與降級 (Fallback) 機制是否正常運作。

### v2.9.0 - AI 韌性強化與容錯升級 (2026-02-17)
- **🦾 強化 AI 重試與降級機制 (Robust Retry & Fallback)**：
  - 更新 `lib/ai.js`。針對 Gemini API 的 `429 Too Many Requests` 實作更激進的 **10秒冷卻** 策略。
  - 新增 **JSON Mode 自動降級**：若因 Safety Settings 導致 JSON 模式失敗，AI 會自動切換至純文字模式重試並嘗試提取 JSON，大幅減少 `Safety Blocked` 錯誤。
- **🚨 嚴重錯誤即時通知**：
  - 更新 `lib/utils.js` 新增 `sendDiscordError`。
  - 當 AI 模型經多次重試仍全數失敗，或週報全批次失敗時，系統會立即發送 Discord 告警，並附上最後一次的錯誤訊息。
- **🛡️ 週報部份容錯**：
  - `getWeeklySummary` 現在允許**部分批次失敗**。只要有任一批次成功，週報流程就會繼續執行，不再因為單一批次的網路波動而直接拋出錯誤。

### v2.8.0 - 深度分析與數據挖掘 (2026-02-16)
- **🧠 自適應 Persona (Adaptive Persona)**：
  - AI 現在會根據「昨天的情緒分數」切換人格。在恐慌時變身「逆勢投資大師」，在貪婪時變身「風控專家」，提供更符合當下市場氛圍的建議。
- **📈 實體代碼化 (Ticker Mapping)**：
  - 升級 `lib/ai.js` Prompt。AI 現在能自動識別公司實體並附上股票代號 (如 `台積電` -> `2330.TW`)。
  - 儀表板與 Discord 通知同步更新，直接顯示代號，方便使用者查詢股價。
- **⛏️ 數據挖掘基礎建設**：
  - `lib/db.js` 新增 `getKeywordLifecycle` 查詢，支援未來開發「關鍵字生命週期」圖表。
  - 新增 `getLastStats` 接口，讓 AI 能讀取歷史情緒分數作為決策依據。

### v2.7.1 - 補全日報 Discord 通知 (2026-02-16)
- **📢 實作日報 Discord 推送**：
  - 更新 `index.js`，在 AI 分析與網頁生成後，自動調用 `sendDiscord` 發送摘要。
  - 解決了之前版本雖然有 `sendDiscord` 函式但 `index.js` 從未呼叫，導致日報靜悄悄的問題。
  - 訊息包含：今日情緒指數、去 HTML 標籤的重點摘要，以及儀表板連結。

### v2.7.0 - UI 細節優化與 Discord 診斷 (2026-02-16)
- **🕰️ 儀表板顯示更新時間**：
  - 更新 `lib/ui.js`，現在標題下方會顯示「YYYY-MM-DD · 更新於 HH:mm」，讓資訊時效性一目了然。
- **📢 Discord 通知系統診斷**：
  - 強化 `lib/utils.js` 中的 `sendDiscord` 函式。
  - 增加環境變數檢查：若 `.env` 遺漏 `DISCORD_WEBHOOK_URL`，會明確提示警告。
  - 增加錯誤細節捕捉：若發送失敗，會印出 Discord API 回傳的具體錯誤碼與訊息 (如 400 Bad Request)，方便除錯。

### v2.6.3 - 修復日報生成錯誤 (2026-02-16)
- **🐛 修復 `ensureDir is not a function` 錯誤**：
  - 在 `lib/utils.js` 中重新實作並導出 `ensureDir` 函式。
  - 解決因模組重構導致日報生成 HTML 時，無法確認 `public/` 目錄存在而崩潰的問題。

### v2.6.2 - 雙金鑰架構與穩定性強化 (2026-02-16)
- **🔑 實作雙金鑰架構 (Dual-Key Architecture)**：
  - 新增 `GEMINI_WEEKLY_API_KEY` 支援。
  - 將日報與週報的 API 配額完全隔離，解決週報執行時因請求量大而導致日報被 Rate Limit 的問題。
- **❄️ API 冷卻機制 (Throttling)**：
  - 在 `lib/ai.js` 的 Map-Reduce 迴圈中加入 **4秒強制冷卻**。
  - 配合指數退避重試機制，顯著提升長文本分析的成功率。
- **🛡️ 系統容錯升級**：
  - 優化 `weekly.js` 的錯誤捕捉與日誌輸出，現在能清楚顯示當前使用的金鑰指紋，方便除錯。

### v2.6.1 - 週報 AI 引擎穩定性強化 (2026-02-16)
- **🛡️ 實作 API 指數退避重試 (Exponential Backoff)**：
  - 針對 Gemini API 不穩定的問題，在 `lib/ai.js` 中實作重試機制 (Retry)。當請求失敗時，會自動等待 2s/4s/8s 後重試，大幅降低 `AI 模型全數失敗` 的機率。
- **⏳ Map-Reduce 批次延遲 (Batch Throttling)**：
  - 在階層式總結的迴圈中加入 `sleep(3000)`，強制在每批次分析間休息 3 秒，避免觸發 API 的 RPM (Rate Per Minute) 限制。
- **⚙️ AI 安全設定放寬**：
  - 將 Gemini 的 Safety Filter 設為 `BLOCK_NONE`，防止新聞內容因涉及敏感詞彙（如戰爭、犯罪）而被 AI 拒絕處理。

### v2.6.0 - 階層式總結與權重過濾 (2026-02-16)
- **🧠 實作 AI 階層式總結 (Map-Reduce AI)**：
  - 解決週報新聞量過大 (2500+) 導致的 Gemini Token 限制問題。
  - 新增 `lib/ai.js/getWeeklySummary`，採用分批處理（Batch Processing）邏輯，先對新聞分組產生小摘要，再匯總為最終週報。
- **⚖️ 引入分數權重過濾 (Keyword Weighting)**：
  - 在 `weekly.js` 實作權重演算法，根據 `.env` 關鍵字命中率對新聞進行評分。
  - 確保只有權重最高的前 120 則新聞進入 AI 分析流程，大幅提升週報精準度。
- **🧹 移除 OpenAI 依賴**：
  - 驗證並移除了不必要的 OpenAI 程式碼，回歸純淨的 Gemini 架構，降低維護成本與付費門檻。

### v2.5.2 - SQLite 數據脫水演算法與 AI 自動備援 (2026-02-16)
- **📉 SQLite 數據脫水演算法**：
  - 更新 `lib/db.js`。針對週報海量數據（2500+），引入 `GROUP BY SUBSTR(title, 1, 12)` 演算法，在資料庫層級自動過濾 90% 的重複轉載內容。
- **🧬 AI 自動備援機制 (Fallback)**：
  - 優化 `weekly.js`。系統現在會動態偵測 `OPENAI_API_KEY` 是否存在。
  - 若 OpenAI 額度不足或未設定，系統將自動無縫切換回 Gemini 引擎，確保週報不中斷。
- **⚙️ AI 容錯增強**：
  - `lib/ai.js` 中的 Gemini 流程已強化對缺失 `content` 欄位數據的支援。

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