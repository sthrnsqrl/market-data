const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURATION ---
const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY']; 
const GEOCODE_DELAY_MS = 1000; 

// --- MANUAL SEEDS (Hardcoded GPS) ---
const MANUAL_SEEDS = [
    { name: "Rogers Community Auction", location: "Rogers, OH", dayOfWeek: 5, startMonth: 0, endMonth: 11, year: 2026, lat: 40.7933, lon: -80.6358, link: "http://rogersohio.com/", desc: "Weekly Friday Flea Market" },
    { name: "Hartville Marketplace", location: "Hartville, OH", dayOfWeek: 5, startMonth: 0, endMonth: 11, year: 2026, lat: 40.9691, lon: -81.3323, link: "https://hartvillemarketplace.com", desc: "Hartville Market (Fri)" },
    { name: "Hartville Marketplace", location: "Hartville, OH", dayOfWeek: 6, startMonth: 0, endMonth: 11, year: 2026, lat: 40.9691, lon: -81.3323, link: "https://hartvillemarketplace.com", desc: "Hartville Market (Sat)" },
    { name: "Hartville Marketplace", location: "Hartville, OH", dayOfWeek: 1, startMonth: 0, endMonth: 11, year: 2026, lat: 40.9691, lon: -81.3323, link: "https://hartvillemarketplace.com", desc: "Hartville Market (Mon)" },
    { name: "Andover Drive-In Flea Market", location: "Andover, OH", dayOfWeek: 6, startMonth: 4, endMonth: 9, year: 2026, lat: 41.6067, lon: -80.5739, link: "FB: PymatuningLakeDriveIn", desc: "Weekly Saturday Flea" },
    { name: "Andover Drive-In Flea Market", location: "Andover, OH", dayOfWeek: 0, startMonth: 4, endMonth: 9, year: 2026, lat: 41.6067, lon: -80.5739, link: "FB: PymatuningLakeDriveIn", desc: "Weekly Sunday Flea" },
    { name: "Traders World Flea Market", location: "Lebanon, OH", dayOfWeek: 6, startMonth: 0, endMonth: 11, year: 2026, lat: 39.4550, lon: -84.3466, link: "https://tradersworldmarket.com", desc: "Traders World (Sat)" },
    { name: "Traders World Flea Market", location: "Lebanon, OH", dayOfWeek: 0, startMonth: 0, endMonth: 11, year: 2026, lat: 39.4550, lon: -84.3466, link: "https://tradersworldmarket.com", desc: "Traders World (Sun)" }
];

// --- HELPER: Polite Pause ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Browser Launcher ---
async function runWithBrowser(taskFunction) {
    const browser = await puppeteer.launch({ 
        headless: false, 
        userDataDir: "./user_data", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
        defaultViewport: null
    });
    try {
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        try { await page.mouse.move(Math.random() * 100, Math.random() * 100); } catch(e) {}
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        const result = await taskFunction(page);
        await browser.close();
        return result;
    } catch (e) {
        console.error('   ❌ Browser error:', e.message);
        try { await browser.close(); } catch(e2) {}
        return [];
    }
}

// --- HELPER: ROBUST DATE PARSER ---
function parseDate(text) {
    if (!text) return null;
    const cleanText = text.toString().trim();
    const currentYear = new Date().getFullYear(); 
    
    // Try numeric format: MM/DD/YYYY
    const numMatch = cleanText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (numMatch) return new Date(parseInt(numMatch[3]), parseInt(numMatch[1]) - 1, parseInt(numMatch[2]));
    
    // Try text format: Month DD
    const textMatch = cleanText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?(\d{1,2})/i);
    if (textMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(textMatch[1].toLowerCase().substring(0, 3));
        const day = parseInt(textMatch[2]);
        let year = currentYear;
        if (new Date().getMonth() > 10 && month < 2) year += 1;
        const yearMatch = cleanText.match(/202[5-7]/);
        if (yearMatch) year = parseInt(yearMatch[0]);
        return new Date(year, month, day);
    }
    
    console.log(`   ⚠️  Could not parse date: "${cleanText}"`);
    return null;
}

function isShowCurrent(dateObj) {
    if (!dateObj) return false;
    const today = new Date();
    today.setHours(0,0,0,0);
    return dateObj >= today;
}

// --- CATEGORY LOGIC ---
function determineCategory(title) {
    const text = title.toLowerCase();
    if (text.match(/flea market|farmers market|weekly|swap meet|trade center/)) return "Weekly Markets";
    if (text.match(/comic|con\b|anime|toy show|card show/)) return "Conventions";
    if (text.match(/craft|artisan|handmade|bazaar|boutique|gift|maker|expo|holiday|christmas|winter|santa|sleigh/)) return "Arts & Craft"; 
    if (text.match(/horror|ghost|spooky|paranormal|oddities/)) return "Horror & Oddities";
    return "Festivals & Fairs";
}

// --- SMART GEOCODER ---
async function getCoordinates(locationString) {
    if (!locationString || locationString.length < 3) return null;
    let searchLoc = locationString.replace(/\n/g, ", ").trim();
    
    try {
        await sleep(GEOCODE_DELAY_MS); 
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchLoc)}&format=json&limit=1`;
        let response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderApp_Ult_1.0' }, timeout: 8000 });
        if (response.data && response.data.length > 0) {
            console.log("    ✅ Found precise location");
            return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
        }
    } catch (e) {}

    // Fallback: City Only
    if (searchLoc.includes(",")) {
        const parts = searchLoc.split(",");
        if (parts.length >= 2) {
            const cityState = parts.slice(-2).join(",").trim(); 
            if (cityState.length > 5 && !cityState.match(/^\d+$/) && cityState !== searchLoc) {
                console.log(`    ⚠️ Precise failed, trying City: "${cityState}"...`);
                try {
                    await sleep(GEOCODE_DELAY_MS);
                    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityState)}&format=json&limit=1`;
                    let response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderApp_Ult_1.0' }, timeout: 8000 });
                    if (response.data && response.data.length > 0) {
                        console.log("    ✅ Found city location");
                        return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
                    }
                } catch(e) {}
            }
        }
    }
    console.log("    ❌ Geocode failed");
    return null;
}

// --- SPIDER 1: Festival Guides (General) ---
async function scrapeFestivalGuides(state) {
    const stateMap = { 'OH': 'ohio', 'PA': 'pennsylvania', 'NY': 'new-york', 'MI': 'michigan', 'IN': 'indiana', 'KY': 'kentucky' };
    const fullState = stateMap[state];
    if (!fullState) return [];

    return await runWithBrowser(async (page) => {
        console.log(`\n   [Guides] Scraping FestivalGuidesAndReviews (${state})...`);
        try {
            await page.goto(`https://festivalguidesandreviews.com/${fullState}-festivals/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            const data = await page.evaluate((currentState) => {
                const data = [];
                const contentDiv = document.querySelector('.entry-content') || document.body;
                const allText = contentDiv.innerText.split('\n');
                
                console.log(`   DEBUG: Found ${allText.length} lines of text`);
                
                allText.forEach(line => {
                    const cleanLine = line.trim();
                    if (cleanLine.match(/^\d{1,2}\/\d{1,2}/) && (cleanLine.includes('–') || cleanLine.includes('-'))) {
                        const parts = cleanLine.split(/[–-]/);
                        if (parts.length >= 2) {
                            const dateRaw = parts[0].trim();
                            const name = parts[1].trim();
                            let city = parts.length > 2 ? parts[2].trim() : "";
                            const location = city.length > 2 ? `${city}, ${currentState}` : `${currentState}, USA`;
                            data.push({ name: name, dateString: dateRaw, locationString: location, link: document.URL, vendorInfo: "FestivalGuides" });
                        }
                    }
                });
                return data;
            }, state);
            
            console.log(`   DEBUG: Extracted ${data.length} events from FestivalGuides`);
            if (data.length > 0) {
                console.log(`   DEBUG: Sample event:`, JSON.stringify(data[0], null, 2));
            }
            return data;
        } catch (e) { 
            console.error(`   ❌ FestivalGuides error: ${e.message}`);
            return []; 
        }
    });
}

// --- SPIDER 2: OHIO FESTIVALS SPECIFIC ---
async function scrapeOhioFestivals() {
    return await runWithBrowser(async (page) => {
        console.log(`\n   [OhioFestivals] Scraping OhioFestivals.net...`);
        try {
            await page.goto(`https://ohiofestivals.net/schedule/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            const data = await page.evaluate(() => {
                const data = [];
                
                // Try multiple selectors
                let listItems = document.querySelectorAll('.schedule-list li');
                if (listItems.length === 0) {
                    listItems = document.querySelectorAll('main li, article li, .content li');
                }
                
                console.log(`   DEBUG: Found ${listItems.length} list items on OhioFestivals`);
                
                listItems.forEach((li, index) => {
                    const text = li.innerText;
                    if (index < 3) {
                        console.log(`   DEBUG: Sample LI ${index}: ${text.substring(0, 100)}`);
                    }
                    
                    // Look for dates in various formats
                    if (text.match(/202[5-7]/) || text.match(/\d{1,2}\/\d{1,2}/)) {
                        // Try to parse different formats
                        if (text.includes('–') || text.includes('-')) {
                            const parts = text.split(/[–-]/);
                            if (parts.length >= 2) {
                                const name = parts[0].trim();
                                let city = '';
                                let dateRaw = '';
                                
                                // Try to identify which part is city vs date
                                for (let i = 1; i < parts.length; i++) {
                                    const part = parts[i].trim();
                                    if (part.match(/202[5-7]/) || part.match(/\d{1,2}\/\d{1,2}/)) {
                                        dateRaw = part;
                                    } else if (!city && part.length > 2 && part.length < 30) {
                                        city = part;
                                    }
                                }
                                
                                if (name && dateRaw) {
                                    const location = city ? `${city}, OH` : `Ohio, USA`;
                                    const link = li.querySelector('a')?.href || "https://ohiofestivals.net/schedule/";
                                    
                                    data.push({ 
                                        name: name, 
                                        dateString: dateRaw, 
                                        locationString: location, 
                                        link: link, 
                                        vendorInfo: "OhioFestivals.net",
                                        state: "OH"
                                    });
                                }
                            }
                        }
                    }
                });
                return data;
            });
            
            console.log(`   DEBUG: Extracted ${data.length} events from OhioFestivals`);
            if (data.length > 0) {
                console.log(`   DEBUG: Sample event:`, JSON.stringify(data[0], null, 2));
            }
            return data;
        } catch (e) { 
            console.error(`   ❌ OhioFestivals error: ${e.message}`);
            return []; 
        }
    });
}

// --- MAIN EXECUTION ---
(async () => {
    console.log('🚀 STARTING MEGA-SPIDER (Debug Edition)...');
    let masterList = [];

    // 1. SEEDS
    console.log(`\n📍 [Seeds] Injecting ${MANUAL_SEEDS.length} Seeds...`);
    MANUAL_SEEDS.forEach(rule => {
        let dateCursor = new Date(rule.year, rule.startMonth, 1);
        const endDate = new Date(rule.year, rule.endMonth + 1, 0);
        while (dateCursor <= endDate) {
            if (dateCursor.getDay() === rule.dayOfWeek) {
                const dateStr = `${dateCursor.getMonth()+1}/${dateCursor.getDate()}/${dateCursor.getFullYear()}`;
                masterList.push({
                    name: rule.name,
                    dateString: dateStr,
                    locationString: rule.location,
                    link: rule.link,
                    vendorInfo: rule.desc,
                    category: "Weekly Markets",
                    state: "OH",
                    latitude: rule.lat,
                    longitude: rule.lon
                });
            }
            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    });
    console.log(`   ✅ Generated ${masterList.length} seed events`);

    // 2. SCRAPERS
    // A. Ohio Festivals
    const ohioData = await scrapeOhioFestivals();
    if (ohioData.length > 0) {
        masterList = masterList.concat(ohioData.map(i => ({...i, category: determineCategory(i.name)})));
        console.log(`   ✅ Added ${ohioData.length} events from OhioFestivals.net`);
    }

    // B. Standard Loop
    for (const state of STATES) {
        const listA = await scrapeFestivalGuides(state);
        if (listA.length > 0) {
            masterList = masterList.concat(listA.map(i => ({...i, state, category: determineCategory(i.name)})));
            console.log(`   ✅ Added ${listA.length} events for ${state}`);
        }
        await sleep(1000);
    }

    // 3. PROCESS
    console.log(`\n📋 Processing ${masterList.length} raw candidates...`);
    const validList = masterList.filter(item => {
        if (!item.dateString) return false;
        const d = parseDate(item.dateString);
        if (d && isShowCurrent(d)) {
            item.dateString = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
            item.dateObj = d; 
            return true;
        }
        return false;
    });
    console.log(`   ✅ ${validList.length} events have valid future dates`);

    // 4. GEOCODE
    console.log(`\n🌍 Geocoding ${validList.length} unique events...`);
    let finalGeocoded = [];
    let seen = new Set();

    for (let i = 0; i < validList.length; i++) {
        const show = validList[i];
        const key = (show.name + show.dateString).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) continue;
        seen.add(key);

        if (show.latitude && show.latitude !== 0) {
            finalGeocoded.push(show);
            continue; 
        }

        if (show.locationString) {
            process.stdout.write(`   [${i+1}/${validList.length}] ${show.name.substring(0, 30)}... `);
            let cleanLoc = show.locationString;
            if (show.state && !cleanLoc.includes(show.state)) cleanLoc += `, ${show.state}`;
            
            const coords = await getCoordinates(cleanLoc);
            if (coords) {
                show.latitude = coords.lat;
                show.longitude = coords.lon;
                finalGeocoded.push(show); 
            } else {
                console.log("Skipped.");
            }
        }
    }

    fs.writeFileSync('shows.json', JSON.stringify(finalGeocoded, null, 2));
    console.log(`\n🎉 DONE! Saved ${finalGeocoded.length} VERIFIED Shows.`);
    console.log(`\n📊 BREAKDOWN:`);
    console.log(`   - Seeds: ${masterList.filter(s => s.vendorInfo && s.vendorInfo.includes('Weekly')).length}`);
    console.log(`   - Scraped: ${finalGeocoded.length - masterList.filter(s => s.vendorInfo && s.vendorInfo.includes('Weekly')).length}`);
})();