const puppeteer = require('puppeteer');
const fs = require('fs');

// Quick diagnostic - save raw HTML from both sites

(async () => {
    console.log('🔍 HTML INSPECTOR - Saving raw page content...');
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        userDataDir: "./user_data",
        args: ['--no-sandbox']
    });
    
    const page = await browser.newPage();
    
    // 1. Check OhioFestivals
    console.log('\n📄 Fetching OhioFestivals.net...');
    try {
        await page.goto('https://ohiofestivals.net/schedule/', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        // Wait a bit for any JS to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const html = await page.content();
        fs.writeFileSync('ohio_festivals_raw.html', html);
        console.log('   ✅ Saved to ohio_festivals_raw.html');
        
        // Also get visible text structure
        const structure = await page.evaluate(() => {
            const body = document.body;
            const allElements = body.querySelectorAll('*');
            const structure = [];
            
            allElements.forEach(el => {
                if (el.children.length === 0 && el.textContent.trim().length > 0) {
                    const text = el.textContent.trim();
                    if (text.length < 200 && (text.match(/202[5-7]/) || text.match(/festival|fair|market|craft/i))) {
                        structure.push({
                            tag: el.tagName,
                            class: el.className,
                            id: el.id,
                            text: text.substring(0, 100)
                        });
                    }
                }
            });
            return structure;
        });
        
        console.log('\n   📊 Elements containing dates/keywords:');
        structure.slice(0, 10).forEach(el => {
            console.log(`      ${el.tag}.${el.class}: "${el.text}"`);
        });
        
    } catch (e) {
        console.error('   ❌ OhioFestivals Error:', e.message);
        console.log('   ⚠️  Skipping OhioFestivals, continuing with FestivalGuides...');
    }
    
    // 2. Check FestivalGuides
    console.log('\n📄 Fetching FestivalGuides (Ohio)...');
    try {
        await page.goto('https://festivalguidesandreviews.com/ohio-festivals/', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const html = await page.content();
        fs.writeFileSync('festival_guides_ohio_raw.html', html);
        console.log('   ✅ Saved to festival_guides_ohio_raw.html');
        
        // Get text lines to see format
        const lines = await page.evaluate(() => {
            const contentDiv = document.querySelector('.entry-content') || document.body;
            const text = contentDiv.innerText;
            return text.split('\n').slice(0, 50); // First 50 lines
        });
        
        console.log('\n   📊 Sample text lines:');
        lines.slice(0, 20).forEach((line, i) => {
            if (line.trim().length > 0) {
                console.log(`      [${i}] ${line.trim().substring(0, 80)}`);
            }
        });
        
    } catch (e) {
        console.error('   ❌ Error:', e.message);
    }
    
    await browser.close();
    console.log('\n✅ DONE! Check the HTML files to see actual structure.');
})();