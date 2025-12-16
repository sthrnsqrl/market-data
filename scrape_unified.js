/*
================================================================================
SHOW FINDER - MEGA SCRAPER
================================================================================
Scrapes vendor shows/craft fairs/festivals from multiple sources across 6 states
Created by: Drew Noles @ Black Squirrel Studios
Last Updated: December 2025

SOURCES:
1. Manual Seeds - Weekly markets with hardcoded GPS (Hartville, Rogers, Traders World, Andover)
2. FestivalGuides - State festival listings (OH, PA, NY, MI, IN, KY)
3. ODMall.info - Horror & oddities marketplace events

OUTPUT: shows.json (geocoded events ready for app)
================================================================================
*/

const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// ============================================================================
// CONFIGURATION
// ============================================================================

const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY']; 
const GEOCODE_DELAY_MS = 1000; // Be polite to OpenStreetMap

// ============================================================================
// MANUAL SEEDS - Weekly Markets with Known Locations
// ============================================================================

const MANUAL_SEEDS = [
    { name: "Rogers Community Auction", location: "Rogers, OH", dayOfWeek: 5, startMonth: 0, endMonth: 11, lat: 40.7933, lon: -80.6358, link: "http://rogersohio.com/", desc: "Weekly Friday Flea Market" },
    { name: "Hartville Marketplace", location: "Hartville, OH", dayOfWeek: 5, startMonth: 0, endMonth: 11, lat: 40.9691, lon: -81.3323, link: "https://hartvillemarketplace.com", desc: "Hartville Market (Fri)" },
    { name: "Hartville Marketplace", location: "Hartville, OH", dayOfWeek: 6, startMonth: 0, endMonth: 11, lat: 40.9691, lon: -81.3323, link: "https://hartvillemarketplace.com", desc: "Hartville Market (Sat)" },
    { name: "Hartville Marketplace", location: "Hartville, OH", dayOfWeek: 1, startMonth: 0, endMonth: 11, lat: 40.9691, lon: -81.3323, link: "https://hartvillemarketplace.com", desc: "Hartville Market (Mon)" },
    { name: "Andover Drive-In Flea Market", location: "Andover, OH", dayOfWeek: 6, startMonth: 4, endMonth: 9, lat: 41.6067, lon: -80.5739, link: "FB: PymatuningLakeDriveIn", desc: "Weekly Saturday Flea" },
    { name: "Andover Drive-In Flea Market", location: "Andover, OH", dayOfWeek: 0, startMonth: 4, endMonth: 9, lat: 41.6067, lon: -80.5739, link: "FB: PymatuningLakeDriveIn", desc: "Weekly Sunday Flea" },
    { name: "Traders World Flea Market", location: "Lebanon, OH", dayOfWeek: 6, startMonth: 0, endMonth: 11, lat: 39.4550, lon: -84.3466, link: "https://tradersworldmarket.com", desc: "Traders World (Sat)" },
    { name: "Traders World Flea Market", location: "Lebanon, OH", dayOfWeek: 0, startMonth: 0, endMonth: 11, lat: 39.4550, lon: -84.3466, link: "https://tradersworldmarket.com", desc: "Traders World (Sun)" }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// ============================================================================
// DATE PARSER - Handles Multiple Formats
// ============================================================================

function parseDate(text) {
    if (!text) return null;
    const cleanText = text.toString().trim();
    const currentYear = new Date().getFullYear(); 
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Format: MM/DD/YYYY or M/D/YYYY
    const numMatchWithYear = cleanText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (numMatchWithYear) {
        let year = parseInt(numMatchWithYear[3]);
        if (year < 100) year += 2000;
        return new Date(year, parseInt(numMatchWithYear[1]) - 1, parseInt(numMatchWithYear[2]));
    }
    
    // Format: MM/DD or M/D (no year - add it smartly)
    const numMatchNoYear = cleanText.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if (numMatchNoYear) {
        const month = parseInt(numMatchNoYear[1]) - 1;
        const day = parseInt(numMatchNoYear[2]);
        
        let year = currentYear;
        const testDate = new Date(year, month, day);
        if (testDate < today) {
            year += 1;
        }
        
        return new Date(year, month, day);
    }
    
    // Format: "December 15, 2025" or "Dec 15-17, 2025"
    const textWithYearMatch = cleanText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:-\d{1,2})?,?\s+(202[5-7])/i);
    if (textWithYearMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(textWithYearMatch[1].toLowerCase().substring(0, 3));
        const day = parseInt(textWithYearMatch[2]);
        const year = parseInt(textWithYearMatch[3]);
        return new Date(year, month, day);
    }
    
    // Format: "December 15" or "Dec 15-17" (no year)
    const textMatch = cleanText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/i);
    if (textMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const month = monthNames.indexOf(textMatch[1].toLowerCase().substring(0, 3));
        const day = parseInt(textMatch[2]);
        
        let year = currentYear;
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

// ============================================================================
// CATEGORY CLASSIFIER
// ============================================================================

function determineCategory(title) {
    const text = title.toLowerCase();
    if (text.match(/flea market|farmers market|weekly|swap meet|trade center|hartville|rogers|traders world/)) return "Weekly Markets";
    if (text.match(/comic|con\b|anime|toy show|card show|gaming|cosplay/)) return "Conventions";
    if (text.match(/horror|oddities|oddity|macabre|dark|spooky|paranormal|gothic|haunted|occult/)) return "Horror & Oddities";
    if (text.match(/craft|artisan|handmade|bazaar|boutique|gift|maker|expo|holiday|christmas|winter|santa|sleigh/)) return "Arts & Craft"; 
    return "Festivals & Fairs";
}

// ============================================================================
// GEOCODER - OpenStreetMap Nominatim
// ============================================================================

async function getCoordinates(locationString) {
    if (!locationString || locationString.length < 3) return null;
    let searchLoc = locationString.replace(/\n/g, ", ").trim();
    
    // Try full address first
    try {
        await sleep(GEOCODE_DELAY_MS); 
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchLoc)}&format=json&limit=1`;
        let response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderApp_v1.0' }, timeout: 8000 });
        if (response.data && response.data.length > 0) {
            return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
        }
    } catch (e) {}

    // Fallback: Try city, state only
    if (searchLoc.includes(",")) {
        const parts = searchLoc.split(",");
        if (parts.length >= 2) {
            const cityState = parts.slice(-2).join(",").trim(); 
            if (cityState.length > 5 && !cityState.match(/^\d+$/) && cityState !== searchLoc) {
                try {
                    await sleep(GEOCODE_DELAY_MS);
                    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityState)}&format=json&limit=1`;
                    let response = await axios.get(url, { headers: { 'User-Agent': 'ShowFinderApp_v1.0' }, timeout: 8000 });
                    if (response.data && response.data.length > 0) {
                        return { lat: parseFloat(response.data[0].lat), lon: parseFloat(response.data[0].lon) };
                    }
                } catch(e) {}
            }
        }
    }
    return null;
}

// ============================================================================
// SCRAPER 1: FestivalGuides (Multi-State)
// ============================================================================

async function scrapeFestivalGuides(state) {
    const stateMap = { 'OH': 'ohio', 'PA': 'pennsylvania', 'NY': 'new-york', 'MI': 'michigan', 'IN': 'indiana', 'KY': 'kentucky' };
    const fullState = stateMap[state];
    if (!fullState) return [];

    return await runWithBrowser(async (page) => {
        console.log(`   [FestivalGuides] Scraping ${state}...`);
        try {
            await page.goto(`https://festivalguidesandreviews.com/${fullState}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            const data = await page.evaluate((currentState) => {
                const data = [];
                const contentDiv = document.querySelector('.entry-content') || document.body;
                const allText = contentDiv.innerText.split('\n');
                
                allText.forEach(line => {
                    const cleanLine = line.trim();
                    // Format: "12/15-12/20 – Winter Wonderfest V – Hartville"
                    const match = cleanLine.match(/^(\d{1,2}\/\d{1,2}(?:-\d{1,2}\/\d{1,2})?)\s*[–—-]\s*(.+?)\s*[–—-]\s*(.+)$/);
                    
                    if (match) {
                        const dateRaw = match[1].trim();
                        const name = match[2].trim();
                        const city = match[3].trim();
                        
                        // FILTER OUT JUNK: Skip if name is just a date, contains asterisk, or too short
                        if (name.match(/^\d{1,2}\/\d{1,2}\*?$/) || name.includes('*') || name.length < 8) {
                            return; // Skip this line
                        }
                        
                        // Extract just first date from range
                        const firstDate = dateRaw.split('-')[0];
                        
                        if (name && city && firstDate) {
                            const location = `${city}, ${currentState}`;
                            data.push({ 
                                name: name, 
                                dateString: firstDate,
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
        } catch (e) { 
            console.error(`   ❌ FestivalGuides (${state}): ${e.message}`);
            return []; 
        }
    });
}

// ============================================================================
// SCRAPER 2: ODMall.info (Horror & Oddities)
// ============================================================================

async function scrapeODMall() {
    return await runWithBrowser(async (page) => {
        console.log(`   [ODMall] Scraping Events...`);
        try {
            await page.goto(`https://www.oddmall.info/vendor-show-info`, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            // Flexible Squarespace selectors
            let contentFound = false;
            try {
                await page.waitForSelector('.sqs-block-content', { timeout: 5000 });
                contentFound = true;
            } catch(e) {
                try {
                    await page.waitForSelector('.sqs-block', { timeout: 5000 });
                    contentFound = true;
                } catch(e2) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            
            const data = await page.evaluate(() => {
                const data = [];
                
                let contentBlocks = document.querySelectorAll('.sqs-block-content');
                if (contentBlocks.length === 0) {
                    contentBlocks = document.querySelectorAll('.sqs-block');
                }
                if (contentBlocks.length === 0) {
                    contentBlocks = document.querySelectorAll('main, article, .content');
                }
                
                contentBlocks.forEach(block => {
                    const paragraphs = block.querySelectorAll('p');
                    
                    paragraphs.forEach(para => {
                        const text = para.innerText.trim();
                        
                        // Format: "January 18, 2025: Defiance, OH"
                        const match = text.match(/^([A-Za-z]+\s+\d{1,2},\s+\d{4}):\s*(.+)$/);
                        
                        if (match) {
                            const dateString = match[1].trim();
                            let nameAndLocation = match[2].trim();
                            
                            const link = para.querySelector('a');
                            let eventLink = link ? link.href : 'https://www.oddmall.info/vendor-show-info';
                            let eventName = '';
                            let location = '';
                            
                            if (link) {
                                const linkText = link.innerText.trim();
                                
                                if (linkText.includes(',')) {
                                    location = linkText;
                                    const city = linkText.split(',')[0].trim();
                                    eventName = `ODMall ${city}`;
                                } else {
                                    eventName = linkText;
                                    location = nameAndLocation.replace(linkText, '').trim() || "Ohio, USA";
                                }
                            } else {
                                location = nameAndLocation;
                                eventName = `ODMall ${nameAndLocation}`;
                            }
                            
                            data.push({
                                name: eventName,
                                dateString: dateString,
                                locationString: location,
                                link: eventLink,
                                vendorInfo: "ODMall (Oddities & Curiosities)",
                                state: location.includes('OH') ? 'OH' : 'Multi',
                                category: "Horror & Oddities"
                            });
                        }
                    });
                });
                
                return data;
            });
            
            console.log(`      Found ${data.length} ODMall events`);
            return data;
            
        } catch (e) { 
            console.error(`   ❌ ODMall: ${e.message}`);
            return []; 
        }
    });
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

(async () => {
    console.log('🚀 SHOW FINDER - MEGA SCRAPER');
    console.log('   Scraping vendor shows across 6 states...\n');
    
    let masterList = [];

    // ------------------------------------------------------------------------
    // STEP 1: Generate Seed Events (Weekly Markets)
    // ------------------------------------------------------------------------
    
    console.log('📍 [Seeds] Generating weekly market events...');
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const nextYear = currentYear + 1;
    
    MANUAL_SEEDS.forEach(rule => {
        // Generate events for remainder of current year + all of next year
        for (let year = currentYear; year <= nextYear; year++) {
            let dateCursor = new Date(year, rule.startMonth, 1);
            const endDate = new Date(year, rule.endMonth + 1, 0);
            
            while (dateCursor <= endDate) {
                if (dateCursor.getDay() === rule.dayOfWeek && dateCursor >= today) {
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
        }
    });
    
    console.log(`   ✅ Generated ${masterList.length} seed events\n`);

    // ------------------------------------------------------------------------
    // STEP 2: Scrape External Sources
    // ------------------------------------------------------------------------
    
    // ODMall
    const odmallData = await scrapeODMall();
    if (odmallData.length > 0) {
        masterList = masterList.concat(odmallData);
        console.log(`   ✅ Added ${odmallData.length} from ODMall\n`);
    }

    // FestivalGuides (all states)
    for (const state of STATES) {
        const listA = await scrapeFestivalGuides(state);
        if (listA.length > 0) {
            masterList = masterList.concat(listA.map(i => ({...i, state, category: determineCategory(i.name)})));
            console.log(`   ✅ Added ${listA.length} from FestivalGuides (${state})`);
        }
        await sleep(1000);
    }

    // ------------------------------------------------------------------------
    // STEP 3: Date Validation
    // ------------------------------------------------------------------------
    
    console.log(`\n📋 Processing ${masterList.length} raw events...`);
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
    console.log(`   ✅ ${validList.length} events have valid future dates\n`);

    // ------------------------------------------------------------------------
    // STEP 4: Geocoding
    // ------------------------------------------------------------------------
    
    console.log('🌍 Geocoding events...');
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

    // ------------------------------------------------------------------------
    // STEP 5: Save Results
    // ------------------------------------------------------------------------
    
    // Add unique IDs and final cleanup
    const finalData = finalGeocoded.map((show, index) => ({
      ...show,
      id: show.id || generateId(), // Generate ID if missing
      // Ensure all required fields exist
      name: show.name || "Unnamed Event",
      dateString: show.dateString || "",
      locationString: show.locationString || "",
      category: show.category || "Festivals & Fairs"
    }));
    
    fs.writeFileSync('shows.json', JSON.stringify(finalData, null, 2));
    
    console.log(`\n🎉 COMPLETE! Saved ${finalData.length} shows to shows.json\n`);
    console.log('📊 BREAKDOWN:');
    console.log(`   - Seeds: ${finalData.filter(s => s.vendorInfo && s.vendorInfo.includes('Weekly')).length}`);
    console.log(`   - ODMall: ${finalData.filter(s => s.vendorInfo && s.vendorInfo.includes('ODMall')).length}`);
    console.log(`   - FestivalGuides: ${finalData.filter(s => s.vendorInfo === 'FestivalGuides').length}`);
})();

// Helper function to generate unique IDs
function generateId() {
  return Math.random().toString(36).substring(2, 11);
}