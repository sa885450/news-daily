require('dotenv').config();
const axios = require('axios');

const pool = (process.env.GEMINI_KEY_POOL || "").split(/[,,;]/).map(k => k.trim()).filter(k => k);
const strategic = process.env.GEMINI_STRATEGIC_KEY ? [process.env.GEMINI_STRATEGIC_KEY.trim()] : [];
const allKeys = [...new Set([...pool, ...strategic])];

async function listAll() {
    if (allKeys.length === 0) return console.log("❌ No keys");

    const key = allKeys[0];
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    console.log(`\n🌍 正在透過 REST API 查詢金鑰授權清單 (Key: ${key.substring(0,8)}...)...`);
    try {
        const response = await axios.get(url);
        const models = response.data.models;
        if (!models || models.length === 0) {
            console.log("⚠️ 伺服器傳回空清單。可能此 Key 被限制或尚未配置模型。");
        } else {
            console.log(`✅ 找到 ${models.length} 個可用模型：`);
            models.forEach(m => {
                console.log(`  - ${m.name.replace('models/', '')} (${m.displayName})`);
            });
        }
    } catch (e) {
        console.log(`❌ API 呼叫失敗: ${e.response?.status} ${e.response?.data?.error?.message || e.message}`);
    }
}

listAll();
