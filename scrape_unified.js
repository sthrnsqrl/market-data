const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURATION ---
const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY']; 
const GEOCODE_DELAY_MS = 800; 

// --- SEARCH TERMS (Year Removed) ---

// 1. DATED EVENTS (Festivals, Fairs)
const EVENT_TERMS = [
    "Festival", "Fair", "Carnival", "Parade", "Celebration", 
    "Community Days", "Founders Day", "Homecoming", "Block Party", 
    "Oktoberfest", "Holiday Market", "Music Fest", "Art Show"
];

// 2. PERMANENT VENUES (Venues, Markets)
const VENUE_TERMS = [
    "Flea Market", "Farmers Market", "Public Market", 
    "Trade Center", "Swap Meet", "Antique Mall", "Drive-In Flea"
];

// 3. VENDOR INDICATORS (The "Qualifier")
const VENDOR_TERMS = [
    "Vendor Application", "Exhibitor Info", "Booth Rental", 
    "Call for Artists", "Vendor Registration", "Sell with us",
    "Merchant Info", "Food Truck Application"
];

// --- MANUAL SEEDS (Backup Only) ---
const MANUAL_SEEDS = [
    { name: "Rogers Community Auction", location: "Rogers, OH", dayOfWeek: 5, startMonth: 0, endMonth: 11, year: 2026, link: "http://rogersohio.com/", desc: "Weekly Friday Flea Market" }
];

// --- HELPER: Polite Pause ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Browser Launcher (Fixed for CAPTCHA - VISIBLE MODE) ---
async function runWithBrowser(taskFunction) {
    const browser = await puppeteer.launch({ 
        // 1. SHOW THE BROWSER (So Google sees a "real" window)
        headless: false, 
        
        // 2. SAVE COOKIES (So you don't get blocked every time)
        userDataDir: "./user_data", 
        
        // 3. MAXIMIZE WINDOW (Looks more human)
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
        defaultViewport: null
    });
    try {
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        
        // Randomize mouse movement to look human
        try {
             await page.mouse.move(Math.random() * 100, Math.random() * 100);
        } catch(e) {}

        // Stealth: Set a real Chrome User Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const result = await taskFunction(page);
        
        // OPTIONAL: Keep window open for 1 second so you can see what happened
        // await sleep(1000); 

        await browser.close();
        return result;
    } catch (e) {
        // Don't close immediately on error, so you can see the CAPTCHA if needed
        console.log("Browser Error (likely CAPTCHA):", e.message);
        try { await browser.close(); } catch(e2) {}
        return [];
    }
}

// --- HELPER: ROBUST DATE PARSER ---
function parseDate(text) {
    if (!text) return null;
    const cleanText = text.toString().trim();
    const currentYear = new Date().getFullYear(); 

    // 1. Numeric (MM/DD/YYYY)
    const numMatch = cleanText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (numMatch) {
        return new Date(parseInt(numMatch[3]), parseInt(numMatch[1]) - 1, parseInt(numMatch[2]));
    }

    // 2. Text (Month DD)
    const textMatch = cleanText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?(\d{1,2})/i);
    if (textMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(textMatch[1].toLowerCase().substring(0, 3));
        const day = parseInt(textMatch[2]);
        
        let year = currentYear;
        // Smart Year Logic
        if (new Date().getMonth() > 10 && month < 2) year += 1;
        
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
    if (text.match(/parade|carnival|homecoming|founder|pioneer/)) return "Parades & Carnivals";
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
// 🕷️ THE GOOGLE SPIDERS
// =========================================================

// Generic Google Search Function
async function performGoogleSearch(query, state, type) {
    return await runWithBrowser(async (page) => {
        // Construct natural query: "Flea Market Ohio Vendor Application"
        const fullQuery = `${query} ${state}`; 
        
        console.log(`   [Google ${type}] Searching: "${fullQuery}"`);
        
        try {
            await page.goto(`https://www.google.com/search?q=${encodeURIComponent(fullQuery)}&num=15`, { waitUntil: 'domcontentloaded' });
            
            // Check for CAPTCHA (Manual solve if visible)
            if (await page.$('#captcha-form') || await page.$('iframe[src*="google.com/recaptcha"]')) {
                console.log("     ⚠️ CAPTCHA detected! Please solve it in the window...");
                // Wait for user to solve it (give 30 seconds)
                await sleep(30000); 
            }

            const rawLinks = await page.evaluate(() => {
                const results = [];
                // Select all main search result containers
                const containers = document.querySelectorAll('.g'); 
                
                containers.forEach(container => {
                    const titleEl = container.querySelector('h3');
                    const linkEl = container.querySelector('a');
                    const snippetEl = container.querySelector('.VwiC3b'); // The text snippet
                    
                    if (titleEl && linkEl) {
                        results.push({ 
                            title: titleEl.innerText, 
                            url: linkEl.href,
                            snippet: snippetEl ? snippetEl.innerText : ""
                        });
                    }
                });
                return results;
            });

            return rawLinks.filter(item => {
                const lowerTitle = item.title.toLowerCase();
                const lowerUrl = item.url.toLowerCase();
                
                // Filter out generic Top 10 lists if possible, unless the user wants them
                if (lowerTitle.includes("top 10") || lowerTitle.includes("best of") || lowerTitle.includes("directory")) return false;
                
                // Keep social media events, official sites, and known platforms
                return true; 
            }).map(item => ({
                name: item.title,
                // If snippet has a date, maybe we can use it, otherwise "Check Link"
                dateString: "Check Link", 
                locationString: `${state}, USA`,
                link: item.url,
                vendorInfo: "Google Discovery",
                category: "Discovered",
                state: state
            }));

        } catch (e) { 
            // console.log("Google error:", e.message);
            return []; 
        }
    });
}

// 2. FairsAndFestivals (Directory) - Keeping this as a backup source
async function scrapeDirectory(state) {
    return await runWithBrowser(async (page) => {
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

// --- MAIN EXECUTION ---
(async () => {
    console.log('🚀 STARTING MEGA-SPIDER (Google Edition - Visible)...');
    let masterList = [];

    // 1. MANUAL SEEDS
    console.log(`   [Seeds] Injecting ${MANUAL_SEEDS.length} Backup Seeds...`);
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
                    state: "OH"
                });
            }
            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    });

    // 2. MAIN LOOP
    for (const state of STATES) {
        // A. Directory (Backup)
        const listA = await scrapeDirectory(state);
        if (listA.length > 0) masterList = masterList.concat(listA.map(i => ({...i, state, category: determineCategory(i.name)})));

        // B. GOOGLE HUNTER
        console.log(`   🔎 Google Hunting in ${state}...`);

        // Search 1: General Vendors
        const query1 = `(Festival OR Fair OR Carnival) AND (Vendor Application OR Booth Rental)`;
        const hits1 = await performGoogleSearch(query1, state, "General");
        if (hits1.length > 0) masterList = masterList.concat(hits1);
        await sleep(2000 + Math.random() * 2000); 

        // Search 2: Markets (Venues)
        const query2 = `(Flea Market OR Farmers Market) AND (Vendor Info OR Sell Here)`;
        const hits2 = await performGoogleSearch(query2, state, "Markets");
        if (hits2.length > 0) masterList = masterList.concat(hits2);
        await sleep(2000 + Math.random() * 2000);

        // Search 3: Arts & Crafts
        const query3 = `(Art Show OR Craft Fair) AND (Call for Artists OR Exhibitor Application)`;
        const hits3 = await performGoogleSearch(query3, state, "Arts");
        if (hits3.length > 0) masterList = masterList.concat(hits3);
        await sleep(2000 + Math.random() * 2000);
        
        // Search 4: Entertainment
        const query4 = `(Live Music OR Concert Series) AND (Vendor Wanted OR Food Truck Needed)`;
        const hits4 = await performGoogleSearch(query4, state, "Ent");
        if (hits4.length > 0) masterList = masterList.concat(hits4);
        await sleep(2000 + Math.random() * 2000);
    }

    // 3. PROCESS & CLEANUP
    console.log(`\n📋 Processing ${masterList.length} raw candidates...`);
    
    const validList = masterList.filter(item => {
        if (!item.dateString) return false;
        
        // Pass "Check Link" (Google results)
        if (item.dateString === "Check Link") return true;
        
        const d = parseDate(item.dateString);
        if (d && isShowCurrent(d)) {
            item.dateObj = d; 
            return true;
        }
        return false;
    });

    // 4. GEOCODE
    console.log(`\n🌍 Geocoding ${validList.length} unique events...`);
    let finalGeocoded = [];
    let seen = new Set();

    for (let i = 0; i < validList.length; i++) {
        const show = validList[i];
        const key = (show.name + show.dateString).toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (seen.has(key)) continue;
        seen.add(key);

        if (i % 10 === 0) process.stdout.write(".");

        if (show.locationString) {
            let cleanLoc = show.locationString;
            if (show.state && !cleanLoc.includes(show.state)) cleanLoc += `, ${show.state}`;
            
            const coords = await getCoordinates(cleanLoc);
            if (coords) {
                show.latitude = coords.lat;
                show.longitude = coords.lon;
            } else {
                show.latitude = 0; show.longitude = 0;
            }
        } else {
            show.latitude = 0; show.longitude = 0;
        }
        
        show.id = Math.random().toString(36).substr(2, 9);
        finalGeocoded.push(show);
    }

    fs.writeFileSync('shows.json', JSON.stringify(finalGeocoded, null, 2));
    console.log(`\n🎉 DONE! Saved ${finalGeocoded.length} Total Shows.`);
})();