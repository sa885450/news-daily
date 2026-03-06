const fs = require('fs');
const path = require('path');

try {
    const data = fs.readFileSync('public/data.json', 'utf8');
    JSON.parse(data);
    console.log('✅ JSON is valid.');
} catch (e) {
    console.error('❌ JSON Error:', e.message);
    // 輸出報錯附近的部分內容
    const match = e.message.match(/position (\d+)/);
    if (match) {
        const pos = parseInt(match[1]);
        const start = Math.max(0, pos - 50);
        const end = Math.min(fs.readFileSync('public/data.json', 'utf8').length, pos + 50);
        console.error('Context near error:', fs.readFileSync('public/data.json', 'utf8').substring(start, end));
    }
}
