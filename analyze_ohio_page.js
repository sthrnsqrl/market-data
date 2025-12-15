const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log('🔍 Analyzing Ohio festivals page structure...\n');
    
    await page.goto('https://festivalguidesandreviews.com/ohio/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const analysis = await page.evaluate(() => {
        const results = {
            title: document.title,
            hasEntryContent: !!document.querySelector('.entry-content'),
            hasTable: !!document.querySelector('table'),
            hasList: !!document.querySelector('ul, ol'),
            sampleLines: []
        };
        
        // Get all text and look for date patterns
        const contentDiv = document.querySelector('.entry-content') || document.querySelector('main') || document.body;
        const allText = contentDiv.innerText.split('\n');
        
        allText.forEach(line => {
            const cleanLine = line.trim();
            // Look for lines with dates
            if (cleanLine.match(/\d{1,2}\/\d{1,2}/) || 
                cleanLine.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i) ||
                cleanLine.match(/202[5-7]/)) {
                if (cleanLine.length > 10 && cleanLine.length < 200) {
                    results.sampleLines.push(cleanLine);
                }
            }
        });
        
        return results;
    });
    
    console.log('📊 Page Analysis:');
    console.log(`   Title: "${analysis.title}"`);
    console.log(`   Has .entry-content: ${analysis.hasEntryContent ? '✅' : '❌'}`);
    console.log(`   Has <table>: ${analysis.hasTable ? '✅' : '❌'}`);
    console.log(`   Has lists: ${analysis.hasList ? '✅' : '❌'}`);
    console.log(`\n📋 Sample date-containing lines (first 20):`);
    
    analysis.sampleLines.slice(0, 20).forEach((line, i) => {
        console.log(`   ${i+1}. "${line}"`);
    });
    
    await browser.close();
})();
