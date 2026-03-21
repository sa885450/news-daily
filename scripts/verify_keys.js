require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const pool = (process.env.GEMINI_KEY_POOL || "").split(/[,,;]/).map(k => k.trim()).filter(k => k);
const strategic = process.env.GEMINI_STRATEGIC_KEY ? [process.env.GEMINI_STRATEGIC_KEY.trim()] : [];
const allKeys = [...new Set([...pool, ...strategic])];

// 測試 REST API 掃出的真實名稱
const newCandidates = [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-pro-latest"
];

async function verify() {
    const key = allKeys[0];
    const genAI = new GoogleGenerativeAI(key);

    console.log(`\n🧪 正在驗證新世代模型可用性 (Key: ${key.substring(0,8)}...)...`);
    for (const m of newCandidates) {
        process.stdout.write(`  🎯 測試 [${m.padEnd(25)}] : `);
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("Hi");
            const r = await result.response;
            if (r.text()) console.log("✅ 成功！");
        } catch (e) {
             const msg = e.message || "";
             if (msg.includes("429")) {
                if (msg.includes("PerDay") || msg.includes("quota")) console.log("🛑 每日限額滿 (RPD)");
                else console.log("⌛ RPM 限流");
             } else if (msg.includes("404")) console.log("❌ 404 找不到");
             else console.log(`❌ ${msg.substring(0, 30)}`);
        }
    }
}

verify();
