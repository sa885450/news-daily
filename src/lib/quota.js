const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../data/quota_state.json');

/**
 * v14.7.1 全域配額門神 (Global Quota Keeper)
 * 負責跨進程 (PM2) 共享 API 配額狀態與 RPM 防撞同步
 */
class QuotaManager {
    constructor() {
        this.state = this.load();
    }

    load() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
                const now = Date.now();
                
                // 初步檢查日期，若跨日則重置
                const today = new Date().toISOString().split('T')[0];
                if (data.lastDate !== today) {
                    return { lastDate: today, dailyCount: 0, deadKeys: {}, cooldowns: {} };
                }

                // 清理過期的短效冷卻
                if (data.cooldowns) {
                    for (const [id, until] of Object.entries(data.cooldowns)) {
                        if (until < now) delete data.cooldowns[id];
                    }
                }
                return data;
            }
        } catch (e) {
            // console.error(`⚠️ QuotaManager: 讀取狀態失敗: ${e.message}`);
        }
        const today = new Date().toISOString().split('T')[0];
        return { lastDate: today, dailyCount: 0, deadKeys: {}, cooldowns: {} };
    }

    save() {
        try {
            const dir = path.dirname(STATE_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
        } catch (e) {
            // console.error(`⚠️ QuotaManager: 儲存狀態失敗: ${e.message}`);
        }
    }

    isDead(key, model) {
        this.state = this.load();
        const id = `${key.substring(0, 8)}_${model}`;
        
        // 1. 檢查永久熔斷 (12小時)
        const deadUntil = this.state.deadKeys?.[id];
        if (deadUntil && Date.now() < deadUntil) return true;

        // 2. 檢查短效 RPM 冷卻 (60秒) - v14.7.1
        const coolUntil = this.state.cooldowns?.[id];
        if (coolUntil && Date.now() < coolUntil) return true;

        return false;
    }

    markDead(key, model) {
        this.state = this.load();
        const id = `${key.substring(0, 8)}_${model}`;
        if (!this.state.deadKeys) this.state.deadKeys = {};
        this.state.deadKeys[id] = Date.now() + (12 * 60 * 60 * 1000);
        this.incrementCount();
        this.save();
        console.log(`🚨 [QuotaKeeper] 標記全域熔斷: ${model} @ Key[${key.substring(0, 8)}...]，持續 12 小時`);
    }

    markTempLimit(key, model, seconds = 60) {
        this.state = this.load();
        if (!this.state.cooldowns) this.state.cooldowns = {};
        const id = `${key.substring(0, 8)}_${model}`;
        this.state.cooldowns[id] = Date.now() + (seconds * 1000);
        this.incrementCount();
        this.save();
        console.log(`⏳ [QuotaKeeper] 標記全域短效冷卻 (RPM): ${model} @ Key[${key.substring(0, 8)}...]，持續 ${seconds}s`);
    }

    incrementCount() {
        const today = new Date().toISOString().split('T')[0];
        if (this.state.lastDate !== today) {
            this.state.lastDate = today;
            this.state.dailyCount = 0;
            this.state.deadKeys = {};
            this.state.cooldowns = {};
        }
        this.state.dailyCount = (this.state.dailyCount || 0) + 1;
    }

    getDailyCount() {
        this.state = this.load();
        return this.state.dailyCount || 0;
    }
}

module.exports = new QuotaManager();
