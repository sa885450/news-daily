const config = require('../src/lib/config');
const { version } = require('../package.json');
const { execSync } = require('child_process');

console.log(`🔍 [Smoke Test] 正在驗證 v${version} 配置...`);

// 1. 驗證 Git 路徑
console.log(`\n1. Git 路徑檢查:`);
console.log(`   - 配置路徑: ${config.gitPath}`);
try {
    const gitVersion = execSync(`"${config.gitPath}" --version`).toString().trim();
    console.log(`   - ✅ 執行成功: ${gitVersion}`);
} catch (e) {
    console.error(`   - ❌ 執行失敗: ${e.message}`);
}

// 2. 驗證 AI 模型清單
console.log(`\n2. AI 模型候選清單:`);
console.log(`   - 當前清單: ${config.modelCandidates.join(', ')}`);
if (config.modelCandidates.includes('gemini-1.5-flash')) {
    console.error(`   - ❌ 錯誤: 仍包含無效模型 gemini-1.5-flash`);
} else {
    console.log(`   - ✅ 已移除無效模型`);
}

// 3. 驗證 UI 版本號驅動
console.log(`\n3. 模組檢查:`);
try {
    const ui = require('../src/lib/ui');
    console.log(`   - ✅ ui.js 載入正常`);
} catch (e) {
    console.error(`   - ❌ ui.js 載入失敗: ${e.message}`);
}

console.log(`\n✨ 驗證完成！請執行 \`npm start\` 或等待下一次排程自動執行。`);
