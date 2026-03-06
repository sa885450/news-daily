const db = require('../src/lib/db');
console.log('正在清理舊世代垃圾數據...');
const count = db.cleanTrashData();
console.log(`✅ 清理完成！共刪除 ${count} 筆 javascript: 偽連結數據。`);
