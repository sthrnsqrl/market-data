const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURATION ---
const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY']; 
const DISCOVERY_KEYWORDS = [
    "Live Music Festival", 
    "Vendor Wanted", 
    "Arts and Crafts Show", 
    "Free Entertainment", 
    "Food Truck Rally"
];
const GEOCODE_DELAY_MS = 800; 

// --- 1. MANUAL SEEDS (The "Must Haves") ---
const MANUAL_SEEDS = [
    { name: "Rogers Community Auction", location: "Rogers, OH", dayOfWeek: 5, startMonth: 0, endMonth: 11, year: 2026, link: "http://rogersohio.com/", desc: "Weekly Friday Flea Market" },
    { name: "Andover Drive-In Flea Market", location: "Andover, OH", dayOfWeek: 6, startMonth: 4, endMonth: 9, year: 2026, link: "FB: PymatuningLakeDriveIn", desc: "Weekly Saturday Flea" },
    { name: "Andover Drive-In Flea Market", location: "Andover, OH", dayOfWeek: 0, startMonth: 4, endMonth: 9, year: 2026, link: "FB: PymatuningLakeDriveIn", desc: "Weekly Sunday Flea" },
    { name: "Tremont Farmers Market", location: "Cleveland, OH", dayOfWeek: 2, startMonth: 4, endMonth: 9, year: 2026, link: "tremontfarmersmarket.com", desc: "Weekly Tuesday Market" },
    { name: "Jamie's Flea Market", location: "South Amherst, OH", dayOfWeek: 3, startMonth: 0, endMonth: 11, year: 2026, link: "jamiesfleamarket.com", desc: "Weekly Wednesday Flea" },
    { name: "Jamie's Flea Market", location: "South Amherst, OH", dayOfWeek: 6, startMonth: 0, endMonth: 11, year: 2026, link: "jamiesfleamarket.com", desc: "Weekly Saturday Flea" }
];

// --- HELPER: Polite Pause ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Browser Launcher ---
async function runWithBrowser(taskFunction) {
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        const result = await taskFunction(page);
        await browser.close();
        return result;
    } catch (e) {
        try { await browser.close(); } catch(e2) {}
        return [];
    }
}

// --- HELPER: Smart Date Parser ---
function parseDate(text) {
    if (!text) return null;
    const cleanText = text.toString().trim();
    const currentYear = new Date().getFullYear(); 

    // Look for "Month DD" or "Month DD-DD"
    const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?(\d{1,2})/i;
    const match = cleanText.match(dateRegex);

    if (match) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(match[1].toLowerCase().substring(0, 3));
        const day = parseInt(match[2]);
        
        let year = currentYear;
        // If it's Dec and we find a Jan date, assume next year
        if (new Date().getMonth() > 9 && month < 3) year += 1;
        
        // Also look for explicit year
        const yearMatch = cleanText.match(/202[5-7]/);
        if (yearMatch) year = parseInt(yearMatch[0]);

        return new Date(year, month, day);
    }
    return null;
}

function isShowCurrent(dateObj) {
    if (!dateObj) return false;
    const today = new Date();
    today.setHours(0,0,0,0);
    return dateObj >= today;
}

// --- HELPER: Category Guesser ---
function determineCategory(title, extraText = "") {
    const text = (title + " " + extraText).toLowerCase();
    if (text.match(/flea/)) return "Weekly Markets"; 
    if (text.match(/farmers market|weekly|every (sunday|saturday)/)) return "Weekly Markets";
    if (text.match(/comic|con\b|anime|gaming|cosplay|expo|toy/)) return "Conventions";
    if (text.match(/horror|ghost|spooky|haunted|halloween|dark|oddities|paranormal/)) return "Horror & Oddities";
    if (text.match(/music|concert|band|entertainment|jam|rock|jazz|blues/)) return "Live Music & Ent.";
    if (text.match(/craft|handmade|artisan|bazaar|boutique|maker|art/)) return "Arts & Crafts";
    return "Festivals & Fairs";
}

// --- GEOCODER ---
async function getCoordinates(locationString) {
    if (!locationString || locationString.length < 3) return null;
    let searchLoc = locationString.replace(/\n/g, ", ").trim();
    
    try {
        await sleep(GEOCODE_DELAY_MS); 
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchLoc)}&format=json&limit=1`;
        let response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderApp_Ult_1.0' }, timeout: 8000 });
        
        if (response.data && response.data.length > 0) {
            return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
        }
        // Retry City/State only
        if (searchLoc.includes(",")) {
            const parts = searchLoc.split(",");
            if (parts.length >= 2) {
                const cityState = parts.slice(-2).join(",").trim();
                if (cityState.length > 5 && !cityState.match(/^\d+$/)) {
                    await sleep(GEOCODE_DELAY_MS);
                    url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityState)}&format=json&limit=1`;
                    response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderApp_Ult_1.0' }, timeout: 8000 });
                    if (response.data && response.data.length > 0) {
                        return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
                    }
                }
            }
        }
    } catch (error) { return null; }
    return null;
}

// =========================================================
// 🕷️ THE SPIDERS
// =========================================================

// 1. Northeast Ohio Parent (The requested "Deep Dive")
async function scrapeNortheastOhioParent() {
    console.log("   [Spider] Crawling NortheastOhioParent.com...");
    return await runWithBrowser(async (page) => {
        try {
            // They often list things under /things-to-do/ or /calendar/
            // We'll try the main 'things-to-do' list which is often pagination based
            await page.goto('https://www.northeastohioparent.com/things-to-do/festivals-fairs/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            return await page.evaluate(() => {
                const data = [];
                // Look for standard article headers or list items
                const articles = document.querySelectorAll('article, .entry-content p');
                
                articles.forEach(el => {
                    const text = el.innerText;
                    // Looking for typical "Date: Event Name" or "Event Name (Date)" format
                    if (text.includes("2025") || text.includes("2026")) {
                         // Very basic heuristc: split by newline
                         const lines = text.split('\n');
                         if(lines.length > 0) {
                             const name = lines[0]; // Assume first line is header
                             // Try to find date in text
                             const dateMatch = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?(\d{1,2})/i);
                             if (name.length > 5 && dateMatch) {
                                 data.push({
                                     name: name,
                                     dateString: dateMatch[0],
                                     locationString: "Northeast Ohio", // Default, user can refine
                                     link: "https://www.northeastohioparent.com/things-to-do/festivals-fairs/",
                                     vendorInfo: "NEOhioParent Listing",
                                     state: "OH"
                                 });
                             }
                         }
                    }
                });
                return data;
            });
        } catch (e) { 
            console.log("     NEOhioParent hit a snag (likely layout change).");
            return []; 
        }
    });
}

// 2. The Web Discovery Engine (DuckDuckGo Hunter)
async function performDiscoverySearch(query, state) {
    return await runWithBrowser(async (page) => {
        const fullQuery = `${query} ${state} 2025`;
        console.log(`   [Discovery] Searching web for: "${fullQuery}"...`);
        
        try {
            // Using DuckDuckGo HTML version to avoid heavy JS blocking
            await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`, { waitUntil: 'domcontentloaded' });
            
            const rawLinks = await page.evaluate(() => {
                const results = [];
                const anchors = document.querySelectorAll('.result__a');
                anchors.forEach(a => {
                    results.push({ title: a.innerText, url: a.href });
                });
                return results;
            });

            // Filter for interesting domains
            const relevant = rawLinks.filter(item => {
                const url = item.url.toLowerCase();
                return url.includes('facebook.com/events') || 
                       url.includes('zappication.org') || 
                       url.includes('meetup.com') ||
                       url.includes('eventbrite.com') ||
                       url.includes('festival');
            });

            // Map to our format (These will be "Potential" events, often needing human verification or generic data)
            return relevant.map(item => ({
                name: item.title,
                dateString: "Check Link", // Discovery links often don't have dates in the title
                locationString: `${state}, USA`,
                link: item.url,
                vendorInfo: "Web Discovery (Check for details)",
                category: "Discovered",
                state: state
            }));

        } catch (e) { return []; }
    });
}

// 3. FairsAndFestivals (Directory A)
async function scrapeDirectory(state) {
    return await runWithBrowser(async (page) => {
        console.log(`   [Directory] Scraping FairsAndFestivals (${state})...`);
        try {
            await page.goto(`https://www.fairsandfestivals.net/states/${state}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
                            data.push({ name: nameText, dateString: dateText, locationString: locText, link: link, vendorInfo: "FairsAndFestivals" });
                        }
                    }
                });
                return data;
            });
        } catch(e) { return []; }
    });
}

// 4. FestivalGuides (Directory B)
async function scrapeFestivalGuides(state) {
    const stateMap = { 'OH': 'ohio', 'PA': 'pennsylvania', 'NY': 'new-york', 'MI': 'michigan', 'IN': 'indiana', 'KY': 'kentucky' };
    const fullState = stateMap[state];
    if (!fullState) return [];

    return await runWithBrowser(async (page) => {
        console.log(`   [Directory] Scraping FestivalGuides (${state})...`);
        try {
            await page.goto(`https://festivalguidesandreviews.com/${fullState}-festivals/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            return await page.evaluate((currentState) => {
                const data = [];
                const contentDiv = document.querySelector('.entry-content') || document.body;
                const allText = contentDiv.innerText.split('\n');
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
        } catch (e) { return []; }
    }, state);
}

// --- MAIN EXECUTION ---
(async () => {
    console.log('🚀 STARTING MEGA-SPIDER (Directories + Web Discovery)...');
    let masterList = [];

    // 1. MANUAL SEEDS
    // We generate dates for seeds manually
    console.log(`   [Seeds] Injecting ${MANUAL_SEEDS.length} Weekly Markets...`);
    MANUAL_SEEDS.forEach(rule => {
        let dateCursor = new Date(rule.year, rule.startMonth, 1);
        const endDate = new Date(rule.year, rule.endMonth + 1, 0);
        while (dateCursor <= endDate) {
            if (dateCursor.getDay() === rule.dayOfWeek) {
                masterList.push({
                    name: rule.name,
                    dateString: dateCursor.toLocaleDateString(),
                    locationString: rule.location,
                    link: rule.link,
                    vendorInfo: rule.desc,
                    category: "Weekly Markets",
                    state: "OH"
                });
            }
            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    });

    // 2. NORTHEAST OHIO PARENT (Special Request)
    const neoData = await scrapeNortheastOhioParent();
    if (neoData.length > 0) {
        masterList = masterList.concat(neoData.map(i => ({...i, category: determineCategory(i.name)})));
        console.log(`   ✅ Found ${neoData.length} events from NortheastOhioParent.`);
    }

    // 3. MAIN DIRECTORIES
    for (const state of STATES) {
        // Source A
        const listA = await scrapeDirectory(state);
        if (listA.length > 0) masterList = masterList.concat(listA.map(i => ({...i, state, category: determineCategory(i.name)})));
        
        // Source B
        const listB = await scrapeFestivalGuides(state);
        if (listB.length > 0) masterList = masterList.concat(listB.map(i => ({...i, state, category: determineCategory(i.name)})));

        // 4. DISCOVERY SEARCH (The "Spider" Part)
        // We only do this for OHIO right now to save time/bandwidth, but you can expand loop
        if (state === 'OH') {
             for (const keyword of DISCOVERY_KEYWORDS) {
                 const discovered = await performDiscoverySearch(keyword, state);
                 if (discovered.length > 0) {
                     masterList = masterList.concat(discovered);
                     console.log(`      + Discovered ${discovered.length} links for "${keyword}"`);
                 }
                 await sleep(2000); // Be nice to DuckDuckGo
             }
        }
    }

    // 5. PROCESS & CLEANUP
    console.log(`\n📋 Processing ${masterList.length} raw candidates...`);
    
    // Parse Dates & Filter Old
    const validList = masterList.filter(item => {
        if (!item.dateString) return false;
        // If it's a "Check Link" item from discovery, we keep it for now (shows as TBD)
        if (item.dateString === "Check Link") return true;
        
        const d = parseDate(item.dateString);
        if (d && isShowCurrent(d)) {
            item.dateObj = d; // Store parsed object
            return true;
        }
        return false;
    });

    // 6. GEOCODE
    console.log(`\n🌍 Geocoding ${validList.length} unique events...`);
    let finalGeocoded = [];
    let seen = new Set();

    for (let i = 0; i < validList.length; i++) {
        const show = validList[i];
        const key = (show.name + show.dateString).toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (seen.has(key)) continue;
        seen.add(key);

        process.stdout.write(`   [${i}/${validList.length}] ${show.name.substring(0, 15)}... `);

        if (show.locationString) {
            let cleanLoc = show.locationString;
            if (show.state && !cleanLoc.includes(show.state)) cleanLoc += `, ${show.state}`;
            
            const coords = await getCoordinates(cleanLoc);
            if (coords) {
                show.latitude = coords.lat;
                show.longitude = coords.lon;
                console.log("✅");
            } else {
                show.latitude = 0; show.longitude = 0;
                console.log("❌");
            }
        } else {
            show.latitude = 0; show.longitude = 0;
            console.log("❌");
        }
        
        show.id = Math.random().toString(36).substr(2, 9);
        finalGeocoded.push(show);
    }

    fs.writeFileSync('shows.json', JSON.stringify(finalGeocoded, null, 2));
    console.log(`\n🎉 DONE! Saved ${finalGeocoded.length} Total Shows.`);
})();