const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURATION ---
const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY'];
const GEOCODE_DELAY_MS = 1000; // Fast but safe

// --- 1. THE MANUAL SEED LIST (Your "Must Have" Weekly Shows) ---
const MANUAL_SEEDS = [
    {
        name: "Rogers Community Auction (Flea Market)",
        location: "Rogers, OH", 
        dayOfWeek: 5, // Friday
        startMonth: 0, endMonth: 11, 
        year: 2026, // Generates future dates
        link: "http://rogersohio.com/",
        desc: "Weekly Friday Flea Market (Massive)"
    },
    {
        name: "Andover / Pymatuning Lake Drive-In Flea Market",
        location: "Andover, OH", 
        dayOfWeek: 6, // Saturday
        startMonth: 4, endMonth: 9, 
        year: 2026,
        link: "https://www.facebook.com/PymatuningLakeDriveIn/",
        desc: "Weekly Saturday Flea Market"
    },
    {
        name: "Andover / Pymatuning Lake Drive-In Flea Market",
        location: "Andover, OH", 
        dayOfWeek: 0, // Sunday
        startMonth: 4, endMonth: 9, 
        year: 2026,
        link: "https://www.facebook.com/PymatuningLakeDriveIn/",
        desc: "Weekly Sunday Flea Market"
    },
    {
        name: "Tremont Farmers Market",
        location: "Lincoln Park, Cleveland, OH",
        dayOfWeek: 2, // Tuesday
        startMonth: 4, endMonth: 9,
        year: 2026,
        link: "https://www.tremontfarmersmarket.com/",
        desc: "Weekly Tuesday Market"
    },
    {
        name: "Madison Village Outdoor Market",
        location: "33 E. Main St, Madison, OH",
        dayOfWeek: 4, // Thursday
        startMonth: 5, endMonth: 7,
        year: 2026,
        link: "Facebook Check",
        desc: "Weekly Thursday Market"
    },
    {
        name: "Fairport Harbor Harborview Market",
        location: "Fairport Harbor, OH", 
        dayOfWeek: 3, // Wednesday
        startMonth: 5, endMonth: 7,
        year: 2026,
        link: "https://www.fairportharbor.org/",
        desc: "Weekly Wednesday Market"
    },
    {
        name: "Jamie's Flea Market",
        location: "South Amherst, OH",
        dayOfWeek: 3, // Wednesday
        startMonth: 0, endMonth: 11,
        year: 2026,
        link: "https://jamiesfleamarket.com/",
        desc: "Weekly Wednesday Flea Market"
    },
    {
        name: "Jamie's Flea Market",
        location: "South Amherst, OH",
        dayOfWeek: 6, // Saturday
        startMonth: 0, endMonth: 11,
        year: 2026,
        link: "https://jamiesfleamarket.com/",
        desc: "Weekly Saturday Flea Market"
    }
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
        // Block images/css for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
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

// --- HELPER: Date Generator for Weekly Events ---
function generateDatesFromRules(rules, defaultState = "OH") {
    let generated = [];
    rules.forEach(rule => {
        let dateCursor = new Date(rule.year, rule.startMonth, 1);
        const endDate = new Date(rule.year, rule.endMonth + 1, 0);

        while (dateCursor <= endDate) {
            if (dateCursor.getDay() === rule.dayOfWeek) {
                const monthStr = dateCursor.toLocaleString('default', { month: 'short' });
                const dayStr = dateCursor.getDate();
                generated.push({
                    name: rule.name,
                    dateString: `${monthStr} ${dayStr}, ${rule.year}`,
                    locationString: rule.location,
                    link: rule.link,
                    vendorInfo: rule.desc || "Weekly Event",
                    category: "Weekly Markets",
                    state: defaultState
                });
            }
            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    });
    return generated;
}

// --- HELPER: Category Logic ---
function determineCategory(title, extraText = "") {
    const text = (title + " " + extraText).toLowerCase();
    if (text.match(/flea/)) return "Weekly Markets"; 
    if (text.match(/farmers market|weekly|every (sunday|saturday)/)) return "Weekly Markets";
    if (text.match(/viking|celtic|irish|german|oktoberfest|steampunk|renaissance|medieval|pirate|fest\b|festival|fair\b|carnival/)) return "Festivals & Fairs";
    if (text.match(/horror|ghost|spooky|haunted|halloween|dark|oddities|curiosities|paranormal|oddmall/)) return "Horror & Oddities";
    if (text.match(/comic|con\b|anime|gaming|cosplay|expo|toy show|collectible|fan|convention center|trade center/)) return "Cons & Expos";
    if (text.match(/craft|handmade|artisan|bazaar|boutique|maker|art show/)) return "Arts & Crafts";
    return "Festivals & Fairs";
}

// --- HELPER: Date Freshness ---
function isShowCurrent(dateString) {
    if (!dateString || dateString.length < 3) return true; 
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Future years are always current
    if (dateString.includes("2026") || dateString.includes("2027")) return true;

    const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?(\d{1,2})|(\d{1,2})[\/\-](\d{1,2})/i;
    const match = dateString.match(dateRegex);

    if (match) {
        const currentYear = new Date().getFullYear();
        let month, day;
        if (match[1]) { 
            const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
            month = monthNames.indexOf(match[1].toLowerCase().substring(0, 3));
            day = parseInt(match[2]);
        } else { 
            month = parseInt(match[3]) - 1;
            day = parseInt(match[4]);
        }

        let year = currentYear;
        // If date is Jan/Feb but we are in Dec, assume next year
        if (month < 3 && today.getMonth() > 9) year = currentYear + 1; 
        
        const showDate = new Date(year, month, day);
        return showDate >= today;
    }
    return true; 
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
                    process.stdout.write("."); // slight visual cue
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

// --- SCRAPERS ---

// 1. Multi-State Directory (FairsAndFestivals)
async function scrapeDirectory(state) {
    return await runWithBrowser(async (page) => {
        console.log(`   [Global] Scraping FairsAndFestivals (${state})...`);
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

// 2. Specific Ohio Scrapers (OFEA, Oddmall)
async function scrapeOFEA() {
    console.log("   [Ohio] Scraping OFEA...");
    return await runWithBrowser(async (page) => {
        try {
            await page.goto('https://www.ofea.org/festivals-and-events/', { waitUntil: 'domcontentloaded', timeout: 45000 });
            return await page.evaluate(() => {
                const data = [];
                const rows = document.querySelectorAll('tr'); 
                rows.forEach(row => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length >= 3) {
                        const name = cols[0].innerText.trim();
                        const city = cols[1].innerText.trim();
                        const date = cols[2].innerText.trim();
                        if (name && city && date && !name.includes("Festival / Event")) {
                            data.push({ name: name, dateString: date, locationString: `${city}, OH`, link: "https://www.ofea.org/festivals-and-events/", vendorInfo: "Official OFEA", category: "Festivals & Fairs" });
                        }
                    }
                });
                return data;
            });
        } catch(e) { return []; }
    });
}

async function scrapeOddmall() {
    console.log("   [Ohio] Scraping Oddmall...");
    return await runWithBrowser(async (page) => {
        try {
            await page.goto('https://www.oddmall.info/vendor-registration/', { waitUntil: 'domcontentloaded', timeout: 45000 });
            return await page.evaluate(() => {
                const data = [];
                const items = document.querySelectorAll('li');
                items.forEach(li => {
                    const text = li.innerText.trim();
                    if ((text.includes('2025') || text.includes('2026')) && text.includes('Ohio')) {
                        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        if (lines.length >= 2) {
                            const date = lines[1];
                            if (!date.includes("TBA")) {
                                data.push({ 
                                    name: lines[0], 
                                    dateString: date, 
                                    locationString: lines[lines.length - 1], 
                                    link: "https://www.oddmall.info/vendor-registration/", 
                                    vendorInfo: "Oddmall", 
                                    category: "Horror & Oddities" 
                                });
                            }
                        }
                    }
                });
                return data;
            });
        } catch(e) { return []; }
    });
}

// --- MAIN EXECUTION ---
(async () => {
    console.log('🚀 Starting UNIFIED SCRAPER (Seeds + Multi-State)...');
    let masterList = [];

    // 1. GENERATE MANUAL SEEDS (The Weekly Markets)
    console.log(`   [Seeds] Generating ${MANUAL_SEEDS.length} Manual Weekly Markets...`);
    const seedEvents = generateDatesFromRules(MANUAL_SEEDS);
    masterList = masterList.concat(seedEvents);
    console.log(`   ✅ Added ${seedEvents.length} weekly occurrences.`);

    // 2. SCRAPE MULTI-STATE (The Big 7800 List)
    for (const state of STATES) {
        const list = await scrapeDirectory(state);
        // Clean and categorize
        const processed = list.map(item => ({
            ...item,
            state: state,
            category: determineCategory(item.name, item.locationString)
        }));
        masterList = masterList.concat(processed);
        console.log(`   + Loaded ${processed.length} events from ${state}`);
    }

    // 3. SCRAPE SPECIFIC OHIO SITES (High Quality Data)
    try {
        const ofea = await scrapeOFEA();
        masterList = masterList.concat(ofea.map(i => ({...i, state: 'OH'})));
    } catch (e) { console.log("   OFEA skipped"); }
    
    try {
        const odd = await scrapeOddmall();
        masterList = masterList.concat(odd.map(i => ({...i, state: 'OH'})));
    } catch (e) { console.log("   Oddmall skipped"); }

    // 4. FILTER OLD DATES
    const freshList = masterList.filter(s => isShowCurrent(s.dateString));
    console.log(`\n📋 Final Candidate Count: ${freshList.length} (Filtering expired...)`);

    // 5. GEOCODE & SAVE
    console.log(`\n🌍 Geocoding & Saving... (This keeps all ${freshList.length} shows)`);
    
    let geocodedList = [];
    let seen = new Set();

    // Prioritize SEEDS (put them first in the list so they appear at the top if dates match)
    // Actually, sorting by date later handles that. We just need to make sure we don't duplicate.
    
    for (let i = 0; i < freshList.length; i++) {
        const show = freshList[i];
        
        // Dedup Key: Name + Date
        const key = (show.name + show.dateString).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) continue;
        seen.add(key);

        process.stdout.write(`   [${i}/${freshList.length}] ${show.name.substring(0, 20)}... `);

        if (show.locationString) {
            let cleanLoc = show.locationString;
            if (show.state && !cleanLoc.includes(show.state)) cleanLoc += `, ${show.state}`;

            // Check if it's a manual seed (already has coords? No, we need to fetch or hardcode)
            // For now, we just geocode everything to be safe.
            const coords = await getCoordinates(cleanLoc);
            
            if (coords) {
                show.latitude = coords.lat;
                show.longitude = coords.lon;
                console.log("✅");
            } else {
                show.latitude = 0; show.longitude = 0;
                console.log("⚠️");
            }
        } else {
            show.latitude = 0; show.longitude = 0;
            console.log("❌");
        }

        show.id = Math.random().toString(36).substr(2, 9);
        geocodedList.push(show);
    }

    fs.writeFileSync('shows.json', JSON.stringify(geocodedList, null, 2));
    console.log(`\n🎉 SUCCESS! Saved ${geocodedList.length} Total Shows.`);
})();