const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { geminiKeys, geminiStrategicKey, modelCandidates: defaultModelCandidates } = require('./config');
const { sleep, log } = require('./utils');
const quota = require('./quota');

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * v14.7.2 模型候選清單 (依據診斷結果優化)
 * 1.5 系列具名模型報 404，改用別名 flash-latest/pro-latest
 * 發現金鑰具備 2.5 系列權限，納入備援
 */
const modelCandidates = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-flash-latest", "gemini-pro-latest"];

const reportSchema = {
  description: "Financial market news analysis and tactical report",
  type: "object",
  properties: {
    title: { type: "string" },
    sentiment: { type: "string", enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
    summary: { type: "string" },
    impact_level: { type: "number", minimum: 1, maximum: 5 },
    keywords: { type: "array", items: { type: "string" } },
    tactical_advice: { type: "string" }
  },
  required: ["title", "sentiment", "summary", "impact_level", "keywords", "tactical_advice"]
};

class KeyManager {
    constructor(keys) {
        this.keys = [...keys];
        this.cooldowns = new Map();
        this.lastIndex = Math.floor(Math.random() * this.keys.length);
    }

    getNextAvailableKey() {
        if (this.keys.length === 0) return null;
        for (let i = 0; i < this.keys.length; i++) {
            this.lastIndex = (this.lastIndex + 1) % this.keys.length;
            const key = this.keys[this.lastIndex];
            if (!this.isCooling(key)) return key;
        }
        return this.keys[0]; 
    }

    markCooldown(key, seconds = 60) {
        this.cooldowns.set(key, Date.now() + seconds * 1000);
    }

    isCooling(key) {
        const until = this.cooldowns.get(key);
        return until && until > Date.now();
    }
}

const keyManager = new KeyManager(geminiKeys);

async function callGemini(prompt, isJson = true, customKey = null, retryCount = 1, overrideModels = null) {
    let lastError = null;
    let usingCustomKey = !!customKey;
    const activeModelCandidates = overrideModels || modelCandidates;

    if (quota.getDailyCount() > 6000) {
        log('🛑', '全域每日請求總量已達 6000 次安全上限，停止 AI 調用以保護配額。');
        throw new Error("Global Daily Quota Protection Triggered");
    }

    const maxPhases = usingCustomKey ? 2 : 1;

    for (let phase = 1; phase <= maxPhases; phase++) {
        const currentCustomKey = phase === 1 && usingCustomKey ? customKey : null;

        if (phase === 2) {
            console.warn(`\n[Fallback] ⚠️ 專屬金鑰 (Strategic) 失敗，正在降級使用【常規金鑰池 (Key Pool)】重試...`);
            lastError = null;
        }

        for (let attempt = 1; attempt <= retryCount; attempt++) {
            const activeKey = currentCustomKey || keyManager.getNextAvailableKey();
            const genAI = new GoogleGenerativeAI(activeKey);

            for (const modelName of activeModelCandidates) {
                // 🟢 v14.7.3: 偵測該金鑰+模型組合是否已全域熔斷 (並給予跳過日誌)
                if (quota.isDead(activeKey, modelName)) {
                    process.stdout.write(`⏩ [QuotaKeeper] 跳過「已熔斷」金鑰: ${activeKey.substring(0,8)}... @ ${modelName}\r`);
                    continue; 
                }

                try {
                    const config = {
                        model: modelName,
                        safetySettings,
                        generationConfig: {
                            responseMimeType: isJson ? "application/json" : "text/plain",
                        }
                    };
                    if (isJson) config.generationConfig.responseSchema = reportSchema;

                    const model = genAI.getGenerativeModel(config);
                    const result = await model.generateContent(prompt);
                    const response = await result.response;
                    const text = response.text();

                    if (!text) throw new Error("Safety Blocked (Empty Response)");
                    return isJson ? JSON.parse(text) : text;

                } catch (e) {
                    lastError = e;
                    const statusCode = e.status || e.response?.status;
                    const isRateLimit = statusCode === 429 || (e.message && (e.message.includes("429") || e.message.includes("Too Many Requests")));
                    const isNotFound = statusCode === 404 || (e.message && (e.message.includes("404") || e.message.includes("not found")));
                    const isServerOverloaded = statusCode === 503 || statusCode === 500 || (e.message && (e.message.includes("503") || e.message.includes("Service Unavailable")));

                    if (isRateLimit) {
                        const isDailyLimit = e.message && (e.message.includes("PerDay") || e.message.includes("quota"));
                        if (isDailyLimit) {
                            console.error(`🚨 ${modelName} 偵測到「每日限額 (Daily Quota)」已耗盡！`);
                            quota.markDead(activeKey, modelName); 
                            continue; 
                        } else {
                            console.warn(`⏳ ${modelName} 觸發 RPM 限流 (429) 保護。`);
                            quota.markTempLimit(activeKey, modelName, 60); 
                        }
                        if (!currentCustomKey) {
                            keyManager.markCooldown(activeKey, 60); 
                            break; 
                        } else {
                            log('💊', `[Strategic Key] 觸發 429 限流，全域標記並改道備援...`);
                            break; 
                        }
                    } else if (isNotFound) {
                        console.warn(`❌ ${modelName} 模型無效 (404) 或未獲授權，跳過。`);
                        continue; 
                    } else if (isServerOverloaded) {
                        console.warn(`🔥 ${modelName} 伺服器高負載 (503/500): ${e.message.substring(0, 50)}...`);
                    } else {
                        console.warn(`⚠️ ${modelName} 未知錯誤 ${statusCode || ''}: ${e.message.substring(0, 50)}...`);
                    }
                }
            }

            if (attempt < retryCount) {
                const waitTime = attempt * 2000;
                console.log(` API Retry Phase[${phase}/${maxPhases}] 嘗試[${attempt}/${retryCount}] (Wait ${waitTime / 1000}s)...`);
                await sleep(waitTime);
            }
        }
    }
    throw lastError || new Error("AI Analysis Failed (All Strategies Exhausted)");
}

async function getAnalysis(prompt, isJson = true) {
    return await callGemini(prompt, isJson);
}

async function getMorningSummary(newsData) {
    const prompt = `請分析以下美股市場新聞並生成一份晨報摘要 (JSON 格式)：\n\n${JSON.stringify(newsData)}`;
    const finalKey = geminiStrategicKey;
    const modelList = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-flash-latest"];
    return await callGemini(prompt, true, finalKey, 1, modelList);
}

async function getWeeklySummary(newsData) {
    const prompt = `請根據以下週報數據生成市場週回顧 (JSON 格式)：\n\n${JSON.stringify(newsData)}`;
    return await callGemini(prompt, true, null, 1);
}

module.exports = {
    getAnalysis,
    getMorningSummary,
    getWeeklySummary,
    callGemini
};