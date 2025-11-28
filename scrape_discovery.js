const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const readline = require('readline');

// --- CONFIGURATION ---
const STATES = ['Ohio', 'Pennsylvania', 'New York', 'Michigan', 'Indiana', 'Kentucky'];
const YEAR = '2025';

const QUERIES = [
    `site:facebook.com/events "vendors wanted" OR "crafters wanted"`,
    `site:eventbrite.com "craft fair" OR "art market"`,
    `intitle:"vendor application" "craft show"`,
    `"call for artists" festival`
];

const askQuestion = (query) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

function determineCategory(title, extraText = "") {
    const text = (title + " " + extraText).toLowerCase();
    if (text.match(/viking|celtic|irish|german|oktoberfest|steampunk|renaissance|medieval|pirate|fest\b|festival|fair\b|carnival/)) return "Festivals & Fairs";
    if (text.match(/horror|ghost|spooky|haunted|halloween|dark|oddities|curiosities|paranormal|oddmall/)) return "Horror & Oddities";
    if (text.match(/comic|con\b|anime|gaming|cosplay|expo|toy show|collectible|fan|convention center|trade center/)) return "Cons & Expos";
    if (text.match(/farmers market|weekly|every (sunday|saturday)|flea market/)) return "Weekly Markets";
    if (text.match(/craft|handmade|artisan|bazaar|boutique|maker|art show/)) return "Arts & Crafts";
    return "Festivals & Fairs";
}

(async () => {
    console.log('🔍 Starting Discovery Spider (Crash Proof Mode)...');
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: null,
        args: ['--start-maximized'] 
    });
    
    const page = await browser.newPage();
    let rawLeads = [];

    for (const state of STATES) {
        for (const queryTemplate of QUERIES) {
            const searchQuery = `${queryTemplate} ${state} ${YEAR}`;
            console.log(`\n   Searching: ${searchQuery}`);

            try {
                await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded' });
                
                try {
                    const closeBtn = await page.$x("//button[contains(., 'No thanks') or contains(., 'Not now') or contains(., 'Reject')]");
                    if (closeBtn.length > 0) await closeBtn[0].click();
                } catch(e) {}

                const searchBox = await page.$('textarea[name="q"]') || await page.$('input[name="q"]');
                if (searchBox) {
                    await page.evaluate(el => el.value = '', searchBox);
                    await searchBox.type(searchQuery);
                    await page.keyboard.press('Enter');
                    
                    console.log("      ...Waiting for results...");
                    
                    // HYBRID WAIT
                    try {
                        await page.waitForSelector('div.g, #search', { timeout: 5000 });
                    } catch(e) {
                        console.log("      ⚠️  Auto-detect failed. Please solve CAPTCHA.");
                        console.log("      👉  After results appear, PRESS ENTER here to continue.");
                        await askQuestion("");
                    }

                    // SCRAPE (With Safety Checks)
                    const results = await page.evaluate((currentState) => {
                        const items = [];
                        const allLinks = document.querySelectorAll('a');
                        
                        allLinks.forEach(link => {
                            // SAFETY CHECK: Ensure href is a string before checking 'includes'
                            // SVG links often return objects, which causes the crash.
                            const href = link.href;
                            const title = link.innerText ? link.innerText.trim() : "";
                            
                            if (typeof href === 'string' && title.length > 10 && !href.includes("google.com")) {
                                
                                let isTarget = false;
                                if (href.includes("facebook.com/events")) isTarget = true;
                                if (href.includes("eventbrite.com/e")) isTarget = true;
                                if (document.body.innerText.includes("vendor application")) isTarget = true; 

                                if (isTarget) {
                                    let snippet = "";
                                    const parent = link.closest('div');
                                    if (parent) snippet = parent.innerText.replace(title, "").substring(0, 100);

                                    items.push({
                                        name: title.replace(" | Facebook", "").replace(" - Eventbrite", ""),
                                        locationString: currentState, 
                                        link: href,
                                        vendorInfo: snippet,
                                        state: currentState
                                    });
                                }
                            }
                        });
                        return items;
                    }, state);

                    console.log(`      + Found ${results.length} results`);
                    rawLeads = rawLeads.concat(results);
                }
            } catch (e) {
                console.log("      ! Error: " + e.message);
            }
            
            await sleep(2000); 
        }
    }

    console.log(`\n🌍 Total Discovery Events: ${rawLeads.length}`);
    console.log('🔌 Closing Browser...');
    await browser.close();

    console.log('📍 Starting Geocoding...');
    
    let finalDiscoveryList = [];
    let seenNames = new Set();

    for (let i = 0; i < rawLeads.length; i++) {
        const show = rawLeads[i];
        const uniqueKey = show.name.toLowerCase().replace(/[^a-z]/g, '') + show.state;

        if (seenNames.has(uniqueKey)) continue;
        seenNames.add(uniqueKey);

        show.category = determineCategory(show.name, show.vendorInfo);
        
        const dateMatch = show.vendorInfo.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2}/i);
        if (dateMatch) show.dateString = dateMatch[0];
        else show.dateString = "See Link";

        process.stdout.write(`   Processing ${i + 1}/${rawLeads.length}: ${show.name.substring(0, 15)}...\r`);

        if (show.locationString) {
            await sleep(500);
            let searchLoc = `${show.state}, USA`;
            const coords = await getCoordinates(searchLoc);
            if (coords) {
                show.latitude = coords.lat;
                show.longitude = coords.lon;
                show.id = Math.random().toString(36).substr(2, 9);
                finalDiscoveryList.push(show);
            }
        }
    }

    fs.writeFileSync('shows_discovery.json', JSON.stringify(finalDiscoveryList, null, 2));
    console.log(`\n🎉 DONE! Saved ${finalDiscoveryList.length} discovery events to shows_discovery.json`);

})();