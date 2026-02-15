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
│   └── index.html     #    生成的儀表板
└── lib/               # 🧠 核心邏輯庫
    ├── config.js      #    設定檔載入器
    ├── utils.js       #    通用工具 (Log, Discord)
    ├── db.js          #    資料庫操作
    ├── crawler.js     #    爬蟲與 API 抓取
    ├── ai.js          #    Gemini AI 分析
    ├── ui.js          #    HTML 生成
    └── git.js         #    Git 自動化部署

📝 更新日誌 (Changelog)
v2.1.1 - 穩定性與 UI 修復 (2026-02-15)
🐛 問題修復 (Bug Fixes)：

RSS 讀取增強：解決部分網站 (如 TechNews) 因防爬機制導致的 403 Forbidden 錯誤。

在 config.js 加入偽裝瀏覽器 Headers (User-Agent, Accept, Referer)。

優化 crawler.js 抓取邏輯，強制使用 Axios 預處理請求。

UI 篩選修復：修正儀表板分類按鈕點擊無效的問題。

改用 data-filter 屬性進行精確比對，解決文字空格導致的判定失誤。

v2.1.0 - 市場熱度視覺化 (2026-02-15)
🔥 新增關鍵字熱力圖 (Keyword Heatmap)：

在儀表板底部新增「當日關鍵字」區塊。

實作動態權重變色邏輯：

<span style="color:red">🔴 極熱 (10+次)</span>：紅色呼吸燈效

<span style="color:orange">🟠 熱門 (5+次)</span>：深橘色

<span style="color:gray">⚪ 一般 (1-4次)</span>：灰色標籤

自動過濾零觸發關鍵字，保持版面簡潔。

v2.0.0 - 架構模組化重構 (2026-02-15)
🏗️ 核心架構升級 (The Big Surgery)：

將單一臃腫的 index.js 拆解為 lib/ 模組化結構。

分離 crawler (爬蟲)、ai (大腦)、db (資料)、ui (畫面) 等職責。

🌐 部署路徑變更：

輸出目錄由 reports/ 遷移至 public/，以符合靜態網站託管標準。

優化 Git 自動推送邏輯，支援 GitHub Actions 環境變數注入。

🤖 自動化與排程：

修正 GitHub Actions main.yml 權限與路徑問題。

導入 PM2 生態系設定，支援背景穩定執行。

v1.5.0 - AI 深度金融分析 (2026-02-14)
🧠 Gemini Prompt 優化：

引入「避險基金經理人」角色設定。

新增 情緒量化指標 (-1.0 至 +1.0) 與趨勢燈號 (🟢/🔴/⚪)。

強制 JSON 格式輸出分類標籤，提升資料處理精確度。

📊 資料來源擴充：

整合鉅亨網 (Cnyes) API，支援台股、美股、科技多頻道抓取。

實作 RSS 來源自動去重與全文爬取 (Readability)。

v1.0.0 - 專案初始化
建立基礎 RSS 爬蟲。

整合 SQLite 資料庫儲存歷史新聞。

實作基礎 HTML 報表生成。