const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURATION ---
const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY']; 
const GEOCODE_DELAY_MS = 800; 

// --- MANUAL SEEDS (Hardcoded GPS) ---
const MANUAL_SEEDS = [
    // ROGERS (Rogers, OH)
    { 
        name: "Rogers Community Auction", location: "Rogers, OH", 
        dayOfWeek: 5, startMonth: 0, endMonth: 11, year: 2026, 
        lat: 40.7933, lon: -80.6358, 
        link: "http://rogersohio.com/", desc: "Weekly Friday Flea Market" 
    },
    // HARTVILLE (Hartville, OH)
    { 
        name: "Hartville Marketplace & Flea", location: "Hartville, OH", 
        dayOfWeek: 5, startMonth: 0, endMonth: 11, year: 2026, 
        lat: 40.9691, lon: -81.3323, 
        link: "https://hartvillemarketplace.com", desc: "Hartville Market (Fri)" 
    },
    { 
        name: "Hartville Marketplace & Flea", location: "Hartville, OH", 
        dayOfWeek: 6, startMonth: 0, endMonth: 11, year: 2026, 
        lat: 40.9691, lon: -81.3323, 
        link: "https://hartvillemarketplace.com", desc: "Hartville Market (Sat)" 
    },
    { 
        name: "Hartville Marketplace & Flea", location: "Hartville, OH", 
        dayOfWeek: 1, startMonth: 0, endMonth: 11, year: 2026, 
        lat: 40.9691, lon: -81.3323, 
        link: "https://hartvillemarketplace.com", desc: "Hartville Market (Mon)" 
    },
    // ANDOVER DRIVE-IN (Andover, OH)
    { 
        name: "Andover Drive-In Flea Market", location: "Andover, OH", 
        dayOfWeek: 6, startMonth: 4, endMonth: 9, year: 2026, 
        lat: 41.6067, lon: -80.5739, 
        link: "FB: PymatuningLakeDriveIn", desc: "Weekly Saturday Flea" 
    },
    { 
        name: "Andover Drive-In Flea Market", location: "Andover, OH", 
        dayOfWeek: 0, startMonth: 4, endMonth: 9, year: 2026, 
        lat: 41.6067, lon: -80.5739, 
        link: "FB: PymatuningLakeDriveIn", desc: "Weekly Sunday Flea" 
    },
    // TRADERS WORLD (Lebanon, OH)
    { 
        name: "Traders World Flea Market", location: "Lebanon, OH", 
        dayOfWeek: 6, startMonth: 0, endMonth: 11, year: 2026, 
        lat: 39.4550, lon: -84.3466, 
        link: "https://tradersworldmarket.com", desc: "Traders World (Sat)" 
    },
    { 
        name: "Traders World Flea Market", location: "Lebanon, OH", 
        dayOfWeek: 0, startMonth: 0, endMonth: 11, year: 2026, 
        lat: 39.4550, lon: -84.3466, 
        link: "https://tradersworldmarket.com", desc: "Traders World (Sun)" 
    }
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
        try { await browser.close(); } catch(e2) {}
        return [];
    }
}

// --- HELPER: ROBUST DATE PARSER ---
function parseDate(text) {
    if (!text) return null;
    const cleanText = text.toString().trim();
    const currentYear = new Date().getFullYear(); 

    const numMatch = cleanText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (numMatch) return new Date(parseInt(numMatch[3]), parseInt(numMatch[1]) - 1, parseInt(numMatch[2]));

    const textMatch = cleanText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?(\d{1,2})/i);
    if (textMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(textMatch[1].toLowerCase().substring(0, 3));
        const day = parseInt(textMatch[2]);
        let year = currentYear;
        // If Dec and finding Jan event, assume next year
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
function determineCategory(title) {
    const text = title.toLowerCase();
    if (text.match(/flea/)) return "Weekly Markets"; 
    if (text.match(/farmers/)) return "Weekly Markets";
    if (text.match(/comic|con\b/)) return "Conventions";
    if (text.match(/craft|artisan/)) return "Arts & Crafts";
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
        if (response.data && response.data.length > 0) return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
    } catch (error) { return null; }
    return null;
}

// =========================================================
// 🕷️ THE SPIDERS
// =========================================================

// 1. FESTIVAL GUIDES (Restored: This one has Cities!)
async function scrapeFestivalGuides(state) {
    const stateMap = { 'OH': 'ohio', 'PA': 'pennsylvania', 'NY': 'new-york', 'MI': 'michigan', 'IN': 'indiana', 'KY': 'kentucky' };
    const fullState = stateMap[state];
    if (!fullState) return [];

    return await runWithBrowser(async (page) => {
        console.log(`   [Guides] Scraping FestivalGuidesAndReviews (${state})...`);
        try {
            await page.goto(`https://festivalguidesandreviews.com/${fullState}-festivals/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            return await page.evaluate((currentState) => {
                const data = [];
                const contentDiv = document.querySelector('.entry-content') || document.body;
                const allText = contentDiv.innerText.split('\n');
                allText.forEach(line => {
                    const cleanLine = line.trim();
                    // Looks for: "1/15 - Event Name - City"
                    if (cleanLine.match(/^\d{1,2}\/\d{1,2}/) && (cleanLine.includes('–') || cleanLine.includes('-'))) {
                        const parts = cleanLine.split(/[–-]/);
                        if (parts.length >= 2) {
                            const dateRaw = parts[0].trim();
                            const name = parts[1].trim();
                            // Grab City if available
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

// 2. GOOGLE HUNTER (Backup)
async function performGoogleSearch(query, state, type) {
    return await runWithBrowser(async (page) => {
        const fullQuery = `${query} ${state}`; 
        console.log(`   [Google ${type}] Searching: "${fullQuery}"`);
        try {
            await page.goto(`https://www.google.com/search?q=${encodeURIComponent(fullQuery)}&num=20`, { waitUntil: 'domcontentloaded' });
            if (await page.$('#captcha-form') || await page.$('iframe[src*="google.com/recaptcha"]')) {
                console.log("     ⚠️ CAPTCHA detected! Please solve it...");
                await sleep(30000); 
            }
            const rawLinks = await page.evaluate(() => {
                const results = [];
                const containers = document.querySelectorAll('.g'); 
                containers.forEach(container => {
                    const titleEl = container.querySelector('h3');
                    const linkEl = container.querySelector('a');
                    if (titleEl && linkEl) {
                        results.push({ title: titleEl.innerText, url: linkEl.href });
                    }
                });
                return results;
            });
            return rawLinks.map(item => ({
                name: item.title,
                dateString: "Check Link", 
                locationString: `${state}, USA`,
                link: item.url,
                vendorInfo: "Google Discovery",
                category: "Discovered",
                state: state
            }));
        } catch (e) { return []; }
    });
}

// --- MAIN EXECUTION ---
(async () => {
    console.log('🚀 STARTING MEGA-SPIDER (City-Level Precision)...');
    let masterList = [];

    // 1. SEEDS (With Pre-Set GPS)
    console.log(`   [Seeds] Injecting ${MANUAL_SEEDS.length} Seeds...`);
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
                    // Use Hardcoded Lat/Lon
                    latitude: rule.lat || 0,
                    longitude: rule.lon || 0
                });
            }
            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    });

    // 2. MAIN LOOP
    for (const state of STATES) {
        // A. Festival Guides (Primary Source for CITIES)
        const listA = await scrapeFestivalGuides(state);
        if (listA.length > 0) {
            masterList = masterList.concat(listA.map(i => ({...i, state, category: determineCategory(i.name)})));
            console.log(`     -> Found ${listA.length} city-specific events for ${state}`);
        }

        // B. Google Hunter (Backup)
        const query1 = `(Festival OR Fair OR Carnival) AND (Vendor Application OR Booth Rental)`;
        const hits1 = await performGoogleSearch(query1, state, "General");
        if (hits1.length > 0) masterList = masterList.concat(hits1);
        await sleep(1500);
    }

    // 3. PROCESS
    console.log(`\n📋 Processing ${masterList.length} raw candidates...`);
    const validList = masterList.filter(item => {
        if (!item.dateString) return false;
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

        if (i % 20 === 0) process.stdout.write(".");

        if (show.latitude && show.latitude !== 0) {
            finalGeocoded.push(show);
            continue; 
        }

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