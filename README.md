news-daily/<br>
├── index.js           # 🚀 主程式入口 (負責排程與流程控制)<br>
├── weekly.js          # 📅 週報機器人 (已整合 lib)<br>
├── news_bot.db        # 🗄️ 資料庫 (保持在根目錄)<br>
├── .env               # 🔑 設定檔<br>
├── package.json       # 📦 套件設定<br>
├── public/            # 🌐 靜態資源目錄 (原 reports)<br>
│&nbsp;&nbsp;&nbsp;└── index.html     #    生成的儀表板<br>
└── lib/               # 🧠 核心邏輯庫<br>
&nbsp;&nbsp;&nbsp;&nbsp;├── config.js      #    設定檔載入器<br>
&nbsp;&nbsp;&nbsp;&nbsp;├── utils.js       #    通用工具 (Log, Discord)<br>
&nbsp;&nbsp;&nbsp;&nbsp;├── db.js          #    資料庫操作<br>
&nbsp;&nbsp;&nbsp;&nbsp;├── crawler.js     #    爬蟲與 API 抓取<br>
&nbsp;&nbsp;&nbsp;&nbsp;├── ai.js          #    Gemini AI 分析<br>
&nbsp;&nbsp;&nbsp;&nbsp;├── ui.js          #    HTML 生成<br>
&nbsp;&nbsp;&nbsp;&nbsp;└── git.js         #    Git 自動化部署<br>
