const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../data/quota_state.json');

/**
 * v14.6.0 全域配額門神
 * 負責跨進程 (PM2) 追蹤每日配額耗盡狀態
 */
class QuotaManager {
    constructor() {
        this.state = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
                // 清理過期的標記 (超過 24 小時的)
                const now = Date.now();
                const freshState = {};
                for (const [key, val] of Object.entries(data)) {
                    if (val.deadUntil && val.deadUntil > now) {
                        freshState[key] = val;
                    }
                }
                return freshState;
            }
        } catch (e) {
            console.error(`⚠️ QuotaManager: 讀取狀態檔案失敗: ${e.message}`);
        }
        return {};
    }

    _save() {
        try {
            const dir = path.dirname(STATE_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
        } catch (e) {
            console.error(`⚠️ QuotaManager: 儲存狀態檔案失敗: ${e.message}`);
        }
    }

    /**
     * 檢查特定 Key + Model 組合是否已被宣告今日死亡
     */
    isDead(apiKey, modelName) {
        this.state = this._load(); // 每次檢查都重讀一次，確保跨進程同步
        const id = `${apiKey.substring(0, 8)}:${modelName}`;
        const record = this.state[id];
        if (record && record.deadUntil > Date.now()) {
            return true;
        }
        return false;
    }

    /**
     * 標記特定 Key + Model 組合今日耗盡
     * @param {string} apiKey 
     * @param {string} modelName 
     * @param {number} hours 冷卻小時數 (預設 12)
     */
    markDead(apiKey, modelName, hours = 12) {
        const id = `${apiKey.substring(0, 8)}:${modelName}`;
        this.state[id] = {
            deadUntil: Date.now() + hours * 3600 * 1000,
            markedAt: new Date().toISOString()
        };
        this._save();
        console.error(`🚨 [QuotaKeeper] 標記全域熔斷: ${modelName} @ Key[${apiKey.substring(0, 8)}...]，持續 ${hours} 小時`);
    }
}

module.exports = new QuotaManager();
