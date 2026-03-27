const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const { dbPath } = require('./lib/config');

const app = express();
const port = process.env.PORT || 3005;
const db = new Database(dbPath);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

/**
 * API: 核心查詢接口
 * 支援: 關鍵字(q), 來源(source), 分類(category), 日期範圍(start, end), 分頁(limit, offset)
 */
app.get('/api/news', (req, res) => {
    try {
        const { q, source, category, start, end, limit = 50, offset = 0, order = 'desc' } = req.query;
        let query = "SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at FROM articles WHERE 1=1";
        const params = [];

        if (q) {
            query += " AND (title LIKE ? OR content LIKE ?)";
            params.push(`%${q}%`, `%${q}%`);
        }
        if (source) {
            query += " AND source = ?";
            params.push(source);
        }
        if (category) {
            query += " AND category = ?";
            params.push(category);
        }
        if (start) {
            query += " AND created_at >= ?";
            params.push(start);
        }
        if (end) {
            query += " AND created_at <= ?";
            params.push(end);
        }

        const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
        const total = db.prepare(countQuery).get(...params).total;

        const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        query += ` ORDER BY created_at ${sortOrder} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const data = db.prepare(query).all(...params);
        res.json({ success: true, total, data, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * API: 取得元數據 (來源與分類清單)
 */
app.get('/api/meta', (req, res) => {
    try {
        const sources = db.prepare("SELECT DISTINCT source FROM articles").all().map(r => r.source);
        const categories = db.prepare("SELECT DISTINCT category FROM articles").all().map(r => r.category);
        res.json({ success: true, sources, categories });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 News Intelligence Query Center Running at http://localhost:${port}`);
});
