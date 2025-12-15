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

// --- IMPROVED DATE PARSER (handles ranges and multiple formats) ---
function parseDate(text) {
    if (!text) return null;
    const cleanText = text.toString().trim();
    const currentYear = new Date().getFullYear(); 
    
    // Try numeric format: MM/DD/YYYY or M/D/YY
    const numMatch = cleanText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (numMatch) {
        let year = parseInt(numMatch[3]);
        if (year < 100) year += 2000;
        return new Date(year, parseInt(numMatch[1]) - 1, parseInt(numMatch[2]));
    }
    
    // Try text format with year: "December 15, 2025" or "Dec 15-17, 2025"
    const textWithYearMatch = cleanText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:-\d{1,2})?,?\s+(202[5-7])/i);
    if (textWithYearMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(textWithYearMatch[1].toLowerCase().substring(0, 3));
        const day = parseInt(textWithYearMatch[2]);
        const year = parseInt(textWithYearMatch[3]);
        return new Date(year, month, day);
    }
    
    // Try text format without year: "December 15" or "Dec 15-17"
    const textMatch = cleanText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/i);
    if (textMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(textMatch[1].toLowerCase().substring(0, 3));
        const day = parseInt(textMatch[2]);
        
        let year = currentYear;
        const today = new Date();
        const testDate = new Date(year, month, day);
        if (testDate < today) {
            year += 1;
        }
        
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

// --- CATEGORY LOGIC ---
function determineCategory(title) {
    const text = title.toLowerCase();
    if (text.match(/flea market|farmers market|weekly|swap meet|trade center|hartville|rogers|traders world/)) return "Weekly Markets";
    if (text.match(/comic|con\b|anime|toy show|card show|gaming|cosplay/)) return "Conventions";
    if (text.match(/horror|oddities|oddity|macabre|dark|spooky|paranormal|gothic|haunted|occult/)) return "Horror & Oddities";
    if (text.match(/craft|artisan|handmade|bazaar|boutique|gift|maker|expo|holiday|christmas|winter|santa|sleigh/)) return "Arts & Craft"; 
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
            return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
        }
    } catch (e) {}

    // Fallback: City Only
    if (searchLoc.includes(",")) {
        const parts = searchLoc.split(",");
        if (parts.length >= 2) {
            const cityState = parts.slice(-2).join(",").trim(); 
            if (cityState.length > 5 && !cityState.match(/^\d+$/) && cityState !== searchLoc) {
                try {
                    await sleep(GEOCODE_DELAY_MS);
                    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityState)}&format=json&limit=1`;
                    let response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderApp_Ult_1.0' }, timeout: 8000 });
                    if (response.data && response.data.length > 0) {
                        return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
                    }
                } catch(e) {}
            }
        }
    }
    return null;
}

// --- SPIDER 1: Festival Guides ---
async function scrapeFestivalGuides(state) {
    const stateMap = { 'OH': 'ohio', 'PA': 'pennsylvania', 'NY': 'new-york', 'MI': 'michigan', 'IN': 'indiana', 'KY': 'kentucky' };
    const fullState = stateMap[state];
    if (!fullState) return [];

    return await runWithBrowser(async (page) => {
        console.log(`   [Guides] Scraping FestivalGuidesAndReviews (${state})...`);
        try {
            // FIXED: URL format changed from /state-festivals/ to just /state/
            await page.goto(`https://festivalguidesandreviews.com/${fullState}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const data = await page.evaluate((currentState) => {
                const data = [];
                const contentDiv = document.querySelector('.entry-content') || document.body;
                const allText = contentDiv.innerText.split('\n');
                
                allText.forEach(line => {
                    const cleanLine = line.trim();
                    // NEW FORMAT: "12/15-12/20 – Winter Wonderfest V – Hartville"
                    // Match: DATE(range) – NAME – CITY
                    const match = cleanLine.match(/^(\d{1,2}\/\d{1,2}(?:-\d{1,2}\/\d{1,2})?)\s*[–—-]\s*(.+?)\s*[–—-]\s*(.+)$/);
                    
                    if (match) {
                        const dateRaw = match[1].trim(); // Could be "12/15" or "12/15-12/20"
                        const name = match[2].trim();
                        const city = match[3].trim();
                        
                        // Extract just the first date from range (12/15 from 12/15-12/20)
                        const firstDate = dateRaw.split('-')[0];
                        
                        if (name && city && firstDate) {
                            const location = `${city}, ${currentState}`;
                            data.push({ 
                                name: name, 
                                dateString: firstDate, // Just the start date
                                locationString: location, 
                                link: document.URL, 
                                vendorInfo: "FestivalGuides" 
                            });
                        }
                    }
                });
                return data;
            }, state);
            return data;
        } catch (e) { return []; }
    });
}

// --- SPIDER 2: OHIO FESTIVALS TABLE ---
async function scrapeOhioFestivals() {
    return await runWithBrowser(async (page) => {
        console.log(`   [OhioFestivals] Scraping OhioFestivals.net TABLE...`);
        try {
            await page.goto(`https://ohiofestivals.net/schedule/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Wait longer and try different approaches
            try {
                await page.waitForSelector('#tablepress-2', { timeout: 5000 });
            } catch(e) {
                try {
                    await page.waitForSelector('.tablepress', { timeout: 5000 });
                } catch(e2) {
                    // Just wait a bit and hope the table loads
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            
            return await page.evaluate(() => {
                const data = [];
                const table = document.querySelector('#tablepress-2') || document.querySelector('.tablepress');
                if (!table) return data;
                
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const name = cells[0].innerText.trim();
                        const city = cells[1].innerText.trim();
                        const dateRaw = cells[2].innerText.trim();
                        
                        if (name && city && dateRaw && dateRaw.length > 3) {
                            const location = `${city}, OH`;
                            const link = cells[0].querySelector('a')?.href || "https://ohiofestivals.net/schedule/";
                            data.push({ name, dateString: dateRaw, locationString: location, link, vendorInfo: "OhioFestivals.net", state: "OH" });
                        }
                    }
                });
                return data;
            });
        } catch (e) { 
            console.error(`   ❌ OhioFestivals: ${e.message}`);
            return []; 
        }
    });
}

// --- SPIDER 3: ODMALL (Horror & Oddities) ---
async function scrapeODMall() {
    return await runWithBrowser(async (page) => {
        console.log(`   [ODMall] Scraping ODMall Vendor Events...`);
        try {
            await page.goto(`https://www.theodditiesfleamarket.com/vendor-info/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('.gdlr-core-event-item-list', { timeout: 10000 });
            
            return await page.evaluate(() => {
                const data = [];
                const currentYear = new Date().getFullYear();
                const events = document.querySelectorAll('.gdlr-core-event-item-list');
                
                events.forEach(event => {
                    try {
                        const monthSpan = event.querySelector('.gdlr-core-event-item-info-date');
                        const daySpan = event.querySelector('.gdlr-core-event-item-info-day');
                        const titleLink = event.querySelector('.gdlr-core-event-item-title a');
                        const locationSpan = event.querySelector('.gdlr-core-event-item-info');
                        
                        const name = titleLink ? titleLink.innerText.trim() : '';
                        const link = titleLink ? titleLink.href : '';
                        const location = locationSpan ? locationSpan.innerText.trim() : 'Ohio, USA';
                        
                        if (monthSpan && daySpan && name) {
                            const month = monthSpan.innerText.trim();
                            const day = daySpan.innerText.trim();
                            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                            const monthNum = monthNames.indexOf(month) + 1;
                            
                            if (monthNum > 0) {
                                let year = currentYear;
                                const today = new Date();
                                const eventDate = new Date(year, monthNum - 1, parseInt(day));
                                if (eventDate < today) year += 1;
                                
                                const dateString = `${monthNum}/${day}/${year}`;
                                data.push({
                                    name, dateString,
                                    locationString: location,
                                    link: link || "https://oddities-fleamarket.com/vendor-info/",
                                    vendorInfo: "ODMall (Oddities)",
                                    state: "OH",
                                    category: "Horror & Oddities"
                                });
                            }
                        }
                    } catch (err) {}
                });
                return data;
            });
        } catch (e) { 
            console.error(`   ❌ ODMall: ${e.message}`);
            return []; 
        }
    });
}

// --- MAIN EXECUTION ---
(async () => {
    console.log('🚀 STARTING MEGA-SPIDER (3 Sources Edition)...');
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
                    name: rule.name, dateString: dateStr, locationString: rule.location,
                    link: rule.link, vendorInfo: rule.desc, category: "Weekly Markets",
                    state: "OH", latitude: rule.lat, longitude: rule.lon
                });
            }
            dateCursor.setDate(dateCursor.getDate() + 1);
        }
    });
    console.log(`   ✅ Generated ${masterList.length} seed events`);

    // 2. SCRAPERS
    const ohioData = await scrapeOhioFestivals();
    if (ohioData.length > 0) {
        masterList = masterList.concat(ohioData.map(i => ({...i, category: i.category || determineCategory(i.name)})));
        console.log(`   ✅ Added ${ohioData.length} from OhioFestivals.net`);
    }

    const odmallData = await scrapeODMall();
    if (odmallData.length > 0) {
        masterList = masterList.concat(odmallData);
        console.log(`   ✅ Added ${odmallData.length} from ODMall`);
    }

    for (const state of STATES) {
        const listA = await scrapeFestivalGuides(state);
        if (listA.length > 0) {
            masterList = masterList.concat(listA.map(i => ({...i, state, category: determineCategory(i.name)})));
            console.log(`   ✅ Added ${listA.length} from FestivalGuides (${state})`);
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
    console.log(`\n🌍 Geocoding ${validList.length} events...`);
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
                console.log('✅');
            } else {
                console.log('❌');
            }
        }
    }

    fs.writeFileSync('shows.json', JSON.stringify(finalGeocoded, null, 2));
    console.log(`\n🎉 DONE! Saved ${finalGeocoded.length} VERIFIED Shows.`);
    console.log(`\n📊 BREAKDOWN:`);
    console.log(`   - Seeds: ${finalGeocoded.filter(s => s.vendorInfo && s.vendorInfo.includes('Weekly')).length}`);
    console.log(`   - OhioFestivals: ${finalGeocoded.filter(s => s.vendorInfo === 'OhioFestivals.net').length}`);
    console.log(`   - ODMall: ${finalGeocoded.filter(s => s.vendorInfo && s.vendorInfo.includes('ODMall')).length}`);
    console.log(`   - FestivalGuides: ${finalGeocoded.filter(s => s.vendorInfo === 'FestivalGuides').length}`);
})();
