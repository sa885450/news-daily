const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const filePath = path.join(__dirname, 'views', 'index.ejs');
const content = fs.readFileSync(filePath);

// Check for BOM
if (content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
    console.log("⚠️ BOM detected!");
} else {
    console.log("✅ No BOM detected.");
}

const str = content.toString('utf8');
if (str.includes('市場情緒走勢') && str.includes('五力分析')) {
    console.log("✅ Chinese characters detected correctly.");
} else {
    console.log("❌ Chinese characters might be garbled.");
}

if (str.includes('<%- JSON.stringify')) {
    console.log("✅ Correct EJS tags detected (<%-).");
}
if (str.includes('<% - JSON.stringify')) {
    console.log("❌ Incorrect EJS tags detected (<% -).");
}

// Compile check
try {
    ejs.compile(str);
    console.log("✅ EJS Syntax is valid.");
} catch (e) {
    console.error("❌ EJS Syntax Error:", e.message);
}
