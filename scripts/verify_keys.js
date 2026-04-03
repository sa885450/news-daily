const { GoogleGenerativeAI } = require("@google/generative-ai");
const { enable20Flash, enable25Flash, enable20Lite, enableFlashLatest, enableProLatest } = require('../src/lib/config');

const pool = (process.env.GEMINI_KEY_POOL || "").split(/[,,;]/).map(k => k.trim()).filter(k => k);
const strategic = process.env.GEMINI_STRATEGIC_KEY ? [process.env.GEMINI_STRATEGIC_KEY.trim()] : [];
const allKeys = [...new Set([...pool, ...strategic])];

// 測試模型清單與開關狀態
const modelConfig = [
    { name: "gemini-2.0-flash", enabled: enable20Flash },
    { name: "gemini-2.5-flash", enabled: enable25Flash },
    { name: "gemini-2.0-flash-lite", enabled: enable20Lite },
    { name: "gemini-flash-latest", enabled: enableFlashLatest },
    { name: "gemini-pro-latest", enabled: enableProLatest }
];

async function verify() {
    for (const key of allKeys) {
        const genAI = new GoogleGenerativeAI(key);
        console.log(`\n🧪 正在驗證金鑰 (Key: ${key.substring(0,8)}...)...`);

        for (const m of modelConfig) {
            process.stdout.write(`  🎯 測試 [${m.name.padEnd(25)}] : `);
            
            if (!m.enabled) {
                console.log("💤 已手動禁用 (休息中)");
                continue;
            }

            try {
                const model = genAI.getGenerativeModel({ model: m.name });
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
    // 🟢 v14.9.0 GitHub Models 串接測試 (預留)
    const ghToken = process.env.GITHUB_MODELS_TOKEN;
    if (ghToken) {
        console.log('\n🧪 偵測到 GitHub Token，正在驗證 GitHub Models (GPT-4o-mini)...');
        try {
            const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ghToken}`
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "Say hello and confirm you are GPT-4o-mini" }],
                    model: "gpt-4o-mini",
                    max_tokens: 50
                })
            });
            const data = await response.json();
            if (response.ok) {
                console.log(`  ✅ GitHub Models 連線成功: "${data.choices[0].message.content.trim()}"`);
            } else {
                console.log(`  ❌ GitHub Models 回傳錯誤 (${response.status}): ${JSON.stringify(data)}`);
            }
        } catch (err) {
            console.log(`  ❌ GitHub Models 連線失敗: ${err.message}`);
        }
    } else {
        console.log('\n💡 提示: 若要測試 GitHub Models 備援，請在 .env 中設定 GITHUB_MODELS_TOKEN');
    }
}

verify();
