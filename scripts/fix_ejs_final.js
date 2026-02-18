const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'views', 'index.ejs');
let content = fs.readFileSync(filePath, 'utf8');

// Replace all occurrences of <% - with <%-
const fixedContent = content.replace(/<% -/g, '<%-');

if (content !== fixedContent) {
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    console.log("✅ Fixed EJS tags.");
} else {
    console.log("ℹ️ No changes needed (or replacement failed to match).");
}

// Check for BOM and remove if present
const buffer = fs.readFileSync(filePath);
if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    fs.writeFileSync(filePath, buffer.slice(3));
    console.log("✅ Removed BOM.");
}
