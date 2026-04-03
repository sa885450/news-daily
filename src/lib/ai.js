const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { geminiKeys, geminiStrategicKey, modelCandidates: defaultModelCandidates, enable20Flash, enable20Lite } = require('./config');
const { sleep, log } = require('./utils');
const quota = require('./quota');

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * v15.3.0 模型候選清單 (依據環境變數動態過濾)
 * 允許手動禁用經常用盡配額的 2.0 系列
 */
const modelCandidates = [
    enable20Flash && "gemini-2.0-flash",
    "gemini-2.5-flash",
    enable20Lite && "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-pro-latest"
].filter(Boolean);

// 🟢 v14.9.3: 修正 Schema 以對接 index.js 與 morning.js 的欄位需求
const reportSchema = {
    description: "Financial market news analysis and tactical report",
    type: "object",
    properties: {
        sentiment_score: { type: "number", description: "市場情緒指數 (-1 到 1)" },
        summary: { type: "string", description: "HTML 格式的深度摘要" },
        dimensions: {
            type: "object",
            properties: {
                policy: { type: "number" },
                capital: { type: "number" },
                industry: { type: "number" },
                international: { type: "number" },
                tech: { type: "number" }
            },
            required: ["policy", "capital", "industry", "international", "tech"]
        },
        sector_stats: {
            type: "object",
            properties: {
                tech: { type: "number" },
                finance: { type: "number" },
                energy: { type: "number" },
                general: { type: "number" }
            },
            required: ["tech", "finance", "energy", "general"]
        },
        events: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    impact: { type: "string", enum: ["正面", "負面", "中性"] }
                },
                required: ["title", "summary", "impact"]
            }
        },
        relations: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    source: { type: "string" },
                    target: { type: "string" },
                    type: { type: "string" }
                },
                required: ["source", "target", "type"]
            }
        },
        tactical_advice: {
            type: "object",
            properties: {
                action: { type: "string" },
                confidence: { type: "number" },
                rationale: { type: "string" },
                position_size: { type: "string" }
            },
            required: ["action", "confidence", "rationale", "position_size"]
        },
        entities: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    ticker: { type: "string" }
                }
            }
        }
    },
    required: ["sentiment_score", "summary", "dimensions", "sector_stats", "events", "relations", "tactical_advice"]
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

// 🟢 v14.9.2: 恢復 getSummary 接口以對接 index.js
async function getSummary(newsData, lastSummary, lastScore, marketSnapshotStr, isEmergency, targetName, techData, mode = 'deep') {
    const newsJson = JSON.stringify(newsData);
    const techStr = techData ? `技術指標: ${JSON.stringify(techData)}` : '';
    const emergencyPrompt = isEmergency ? `🚨 緊急分析標的: ${targetName}\n` : '';

    const prompt = `您是一位專業的資深財經分析師。請根據以下市場數據與新聞生成一份深度分析報告 (JSON 格式)。
${emergencyPrompt}
昨日摘要回顧: ${lastSummary || '無'}
昨日情緒分數: ${lastScore}
${techStr}
市場即時快照: ${marketSnapshotStr}

待分析新聞數據 (共 ${newsData.length} 則):
${newsJson}`;

    return await callGemini(prompt, true);
}

async function getMorningSummary(newsData) {
    const prompt = `請分析以下美股市場新聞並生成一份晨報摘要 (JSON 格式)：\n\n${JSON.stringify(newsData)}`;
    const finalKey = geminiStrategicKey;
    const modelList = [
        enable20Flash && "gemini-2.0-flash",
        "gemini-2.5-flash",
        "gemini-flash-latest"
    ].filter(Boolean);
    return await callGemini(prompt, true, finalKey, 1, modelList);
}

async function getWeeklySummary(newsData) {
    const prompt = `請根據以下週報數據生成市場週回顧 (JSON 格式)：\n\n${JSON.stringify(newsData)}`;
    return await callGemini(prompt, true, null, 1);
}

module.exports = {
    getAnalysis,
    getSummary,
    getMorningSummary,
    getWeeklySummary,
    callGemini
};