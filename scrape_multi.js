const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURATION: FULL REGION ---
const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY'];

// --- HELPER: Polite Pause ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Auto-Scroll ---
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= scrollHeight - window.innerHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

// --- HELPER: Browser Launcher (Fresh Instance Every Time) ---
async function runWithBrowser(taskFunction) {
    const browser = await puppeteer.launch({ 
        headless: false, // Keep visible so you can monitor
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled', 
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0'
        ],
        ignoreDefaultArgs: ['--enable-automation'] 
    });
    
    try {
        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const result = await taskFunction(page);
        await browser.close();
        return result;
    } catch (e) {
        console.log(`      ❌ Browser Error: ${e.message}`);
        try { await browser.close(); } catch(e2) {}
        return [];
    }
}

// --- HELPER: Geocoding ---
async function getCoordinates(locationString) {
    if (!locationString || locationString.length < 3) return null;
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationString)}&format=json&limit=1`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderStudentProject/1.0' } });
        if (response.data && response.data.length > 0) {
            return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
        }
    } catch (error) { return null; }
    return null;
}

// --- HELPER: Category Logic ---
function determineCategory(title, extraText = "") {
    const text = (title + " " + extraText).toLowerCase();
    // 1. PRIORITY: Festivals, Cultural Events, & Fairgrounds
    if (text.match(/viking|celtic|irish|german|oktoberfest|steampunk|renaissance|medieval|pirate|fest\b|festival|fair\b|carnival|fairgrounds|county fair/)) {
        return "Festivals & Fairs";
    }
    // 2. Horror & Oddities
    if (text.match(/horror|ghost|spooky|haunted|halloween|dark|oddities|curiosities|paranormal|oddmall/)) {
        return "Horror & Oddities";
    }
    // 3. Cons, Expos & Convention Centers
    if (text.match(/comic|con\b|anime|gaming|cosplay|expo|toy show|collectible|fan|convention center|trade center/)) {
        return "Cons & Expos";
    }
    // 4. Weekly Markets
    if (text.match(/farmers market|weekly|every (sunday|saturday)|flea market/)) {
        return "Weekly Markets";
    }
    // 5. Arts & Crafts
    if (text.match(/craft|handmade|artisan|bazaar|boutique|maker|art show/)) {
        return "Arts & Crafts";
    }
    // 6. Default Fallback
    return "Festivals & Fairs";
}

// --- STRATEGY 1: FairsAndFestivals.net ---
async function scrapeDirectory(state) {
    return await runWithBrowser(async (page) => {
        console.log(`   [Directory A] Scraping ${state}...`);
        await page.goto(`https://www.fairsandfestivals.net/states/${state}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(5000); 

        // Check for block
        const title = await page.title();
        if (title.includes("Page Not Found") || title.includes("Oops")) {
            console.log("      ⚠️ Blocked by FairsAndFestivals (Oops Page). Skipping...");
            return [];
        }

        return await page.evaluate(() => {
            const data = [];
            const rows = document.querySelectorAll('table.events_table tr');
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 3) {
                    const dateText = cols[0].innerText.trim();
                    const nameText = cols[1].innerText.trim();
                    const locText = cols[2].innerText.trim();
                    const link = cols[1].querySelector('a')?.href || "";
                    if (nameText && dateText !== 'Date') {
                        data.push({ name: nameText, dateString: dateText, locationString: locText, link: link, vendorInfo: "Check details" });
                    }
                }
            });
            return data;
        });
    });
}

// --- STRATEGY 2: Festival Guides ---
async function scrapeFestivalGuides(state) {
    const stateMap = { 'OH': 'ohio', 'PA': 'pennsylvania', 'NY': 'new-york', 'MI': 'michigan', 'IN': 'indiana', 'KY': 'kentucky' };
    const fullState = stateMap[state];
    if (!fullState) return [];

    return await runWithBrowser(async (page) => {
        console.log(`   [Directory B] Scraping FestivalGuides (${fullState})...`);
        
        await page.goto(`https://festivalguidesandreviews.com/${fullState}-festivals/`, { waitUntil: 'networkidle2', timeout: 0 });
        await sleep(3000);

        try {
            const consentBtn = await page.$x("//button[contains(., 'AGREE') or contains(., 'Agree') or contains(., 'Accept')]");
            if (consentBtn.length > 0) {
                await consentBtn[0].click();
                await sleep(2000); 
            }
        } catch(e) {}

        return await page.evaluate((currentState) => {
            const data = [];
            const allText = document.body.innerText.split('\n');
            allText.forEach(line => {
                const cleanLine = line.trim();
                if (cleanLine.match(/^\d{1,2}\/\d{1,2}/) && cleanLine.includes('–')) {
                    const parts = cleanLine.split('–');
                    if (parts.length >= 2) {
                        const dateRaw = parts[0].trim();
                        const name = parts[1].trim();
                        let city = parts.length > 2 ? parts[2].trim() : "";
                        if (city.includes("My Review")) city = city.replace("My Review", "").trim();
                        const location = city.length > 2 ? `${city}, ${currentState}` : `${currentState}, USA`;
                        
                        data.push({ name: name, dateString: dateRaw, locationString: location, link: document.URL, vendorInfo: "Check FestivalGuides" });
                    }
                }
            });
            return data;
        }, state);
    });
}

// --- STRATEGY 3: Oddmall ---
async function scrapeOddmall() {
    return await runWithBrowser(async (page) => {
        console.log(`   [Promoter] Scraping Oddmall...`);
        await page.goto('https://www.oddmall.info/ohio-shows/', { waitUntil: 'domcontentloaded' });
        await sleep(3000);
        return await page.evaluate(() => {
            const data = [];
            const lines = document.body.innerText.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.toLowerCase().includes('oddmall') || line.toLowerCase().includes('expedition')) {
                    let dateText = "Check Site";
                    for (let j = 1; j < 5; j++) { 
                        if (lines[i+j] && lines[i+j].match(/202[4-9]/)) { dateText = lines[i+j].trim(); break; }
                    }
                    let loc = "Akron, OH"; 
                    if (line.toLowerCase().includes("canton")) loc = "Canton, OH";
                    if (line.toLowerCase().includes("mayfield")) loc = "Mayfield Heights, OH";
                    if (line.length < 100) {
                        data.push({ name: line, dateString: dateText, locationString: loc, link: "https://www.oddmall.info/ohio-shows/", vendorInfo: "Oddmall" });
                    }
                }
            }
            return data;
        });
    });
}

// --- STRATEGY 4: Northcoast ---
async function scrapeNorthcoast() {
    return await runWithBrowser(async (page) => {
        console.log(`   [Promoter] Scraping Northcoast...`);
        await page.goto('https://northcoastpromo.com/events-1', { waitUntil: 'domcontentloaded' });
        
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if(totalHeight >= scrollHeight - window.innerHeight){ clearInterval(timer); resolve(); }
                }, 100);
            });
        });
        await sleep(3000);
        
        return await page.evaluate(() => {
            const data = [];
            const articles = document.querySelectorAll('article.mec-event-article');
            if (articles.length > 0) {
                articles.forEach(article => {
                    const titleLink = article.querySelector('.mec-event-title a');
                    const dateMeta = article.querySelector('.mec-start-date-label') || article.querySelector('.mec-event-date');
                    if (titleLink) {
                        let dateStr = dateMeta ? dateMeta.innerText.trim() : "See Website";
                        data.push({
                            name: titleLink.innerText.trim(),
                            dateString: dateStr,
                            locationString: "Cleveland, OH",
                            link: titleLink.href,
                            vendorInfo: "Northcoast Promo"
                        });
                    }
                });
            }
            return data;
        });
    });
}

// --- MAIN CONTROLLER ---
(async () => {
    console.log('🕷️  Starting RESILIENT Multi-Spider...');
    let masterList = [];

    // 1. Directories (Loop through states)
    for (const state of STATES) {
        // Source A
        const listA = await scrapeDirectory(state);
        if (listA.length > 0) {
            const catA = listA.map(item => ({ ...item, state, category: determineCategory(item.name, item.locationString) }));
            console.log(`      + Added ${catA.length} events from Directory A`);
            masterList = masterList.concat(catA);
        } else {
            console.log("      - No events found (or blocked).");
        }

        // Source B
        const listB = await scrapeFestivalGuides(state);
        if (listB.length > 0) {
            const catB = listB.map(item => ({ ...item, state, category: determineCategory(item.name, item.locationString) }));
            console.log(`      + Added ${catB.length} events from FestivalGuides`);
            masterList = masterList.concat(catB);
        }
    }

    // 2. Promoters
    const listOdd = await scrapeOddmall();
    const catOdd = listOdd.map(item => ({...item, state: "OH", category: determineCategory(item.name, item.locationString)}));
    console.log(`   + Added ${catOdd.length} Oddmall events`);
    masterList = masterList.concat(catOdd);

    const listNC = await scrapeNorthcoast();
    const catNC = listNC.map(item => ({...item, state: "OH", category: determineCategory(item.name, item.locationString)}));
    console.log(`   + Added ${catNC.length} Northcoast events`);
    masterList = masterList.concat(catNC);

    console.log(`\n🌍 Total Raw Events: ${masterList.length}`);
    console.log('📍 Starting Geocoding...');

    // --- BATCH GEOCODING ---
    let geocodedList = [];
    let seenNames = new Set(); 

    for (let i = 0; i < masterList.length; i++) {
        const show = masterList[i];
        const uniqueKey = show.name.toLowerCase().replace(/[^a-z]/g, '') + show.state;
        
        if (seenNames.has(uniqueKey)) continue;
        seenNames.add(uniqueKey);

        process.stdout.write(`   Processing ${i + 1}/${masterList.length}: ${show.name.substring(0, 15)}... [${show.dateString}]\r`);
        
        if (show.locationString && show.locationString.length > 5) {
            await sleep(500); 
            let cleanLoc = show.locationString.split('\n')[0];
            if (cleanLoc.length > 50 || cleanLoc.includes("USA")) cleanLoc = `Columbus, ${show.state}`; 
            
            const coords = await getCoordinates(cleanLoc);
            if (coords) {
                show.latitude = coords.lat;
                show.longitude = coords.lon;
                show.id = Math.random().toString(36).substr(2, 9);
                geocodedList.push(show);
            }
        }
    }

    fs.writeFileSync('shows.json', JSON.stringify(geocodedList, null, 2));
    console.log(`\n🎉 DONE! Saved ${geocodedList.length} unique events.`);
})();