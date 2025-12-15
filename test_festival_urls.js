const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    const urlsToTry = [
        'https://festivalguidesandreviews.com/ohio-festivals/',
        'https://festivalguidesandreviews.com/ohio/',
        'https://www.festivalguidesandreviews.com/ohio-festivals/',
        'https://festivalguidesandreviews.com/festivals/ohio/',
        'https://festivalguidesandreviews.com/state/ohio/',
    ];
    
    console.log('🔍 Testing FestivalGuides URLs...\n');
    
    for (const url of urlsToTry) {
        try {
            console.log(`Testing: ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
            
            const pageTitle = await page.title();
            const hasContent = await page.evaluate(() => {
                const text = document.body.innerText;
                return !text.includes('nothing was found') && text.length > 500;
            });
            
            console.log(`   Title: "${pageTitle}"`);
            console.log(`   Has content: ${hasContent ? '✅ YES' : '❌ NO (404 or empty)'}`);
            
            if (hasContent) {
                // Get sample text
                const sample = await page.evaluate(() => {
                    const contentDiv = document.querySelector('.entry-content') || document.body;
                    return contentDiv.innerText.substring(0, 500);
                });
                console.log(`   Sample text:\n${sample}`);
                console.log('\n   ✅ THIS URL WORKS!\n');
                break;
            }
            console.log('');
            
        } catch (e) {
            console.log(`   ❌ Error: ${e.message}\n`);
        }
    }
    
    await browser.close();
})();
