const fs = require('fs');
try {
    const raw = fs.readFileSync('public/data.json', 'utf8');
    const data = JSON.parse(raw);

    for (const key in data) {
        const size = JSON.stringify(data[key]).length;
        console.log(`Key: ${key.padEnd(15)} | Size: ${(size / 1024).toFixed(2)} KB`);
    }

    if (data.newsData && data.newsData.length > 0) {
        console.log('--- News Data Sample ---');
        console.log('Title:', data.newsData[0].title);
        console.log('Content Length:', data.newsData[0].content.length);
    }
} catch (e) {
    console.error('Analysis failed:', e.message);
}
