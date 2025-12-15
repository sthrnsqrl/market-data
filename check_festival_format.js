const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    await page.goto('https://festivalguidesandreviews.com/ohio-festivals/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const samples = await page.evaluate(() => {
        const contentDiv = document.querySelector('.entry-content') || document.body;
        const allText = contentDiv.innerText.split('\n');
        const dateLines = [];
        
        allText.forEach(line => {
            const cleanLine = line.trim();
            // Look for lines with years or month names
            if (cleanLine.match(/202[5-7]/) || cleanLine.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i)) {
                if (cleanLine.length < 150 && cleanLine.length > 10) {
                    dateLines.push(cleanLine);
                }
            }
        });
        
        return dateLines.slice(0, 20); // First 20 date-like lines
    });
    
    console.log('\n📋 Sample lines from FestivalGuides (Ohio):');
    samples.forEach((line, i) => {
        console.log(`${i+1}. "${line}"`);
    });
    
    await browser.close();
})();