require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    console.log("🔍 正在查詢您的 API Key 支援的模型清單...");
    try {
        // 直接透過 API 端點查詢，這最準確
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const axios = require('axios');
        const response = await axios.get(url);
        
        console.log("\n✅ 成功取得清單！請複製以下其中一個模型名稱替換到 index.js：");
        const models = response.data.models
            .filter(m => m.supportedGenerationMethods.includes("generateContent"))
            .map(m => m.name.replace("models/", ""));
        
        models.forEach(name => console.log(`👉 ${name}`));
        
    } catch (error) {
        console.error("❌ 無法取得清單，請檢查 API Key 是否正確:", error.message);
    }
}

listModels();