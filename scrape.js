const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

// --- CONFIGURATION ---
const STATES = ['OH', 'PA', 'NY', 'MI', 'IN', 'KY']; 
const BASE_URL = 'https://www.fairsandfestivals.net/states/';

// --- HELPER: Polite Pause ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// --- MAIN SPIDER ---
(async () => {
  console.log('🕷️  Starting "Slug-Strategy" Spider...');
  const browser = await puppeteer.launch({ headless: true }); // Hidden browser
  const page = await browser.newPage();
  
  let allShows = [];

  for (let s = 0; s < STATES.length; s++) {
    const state = STATES[s];
    const url = `${BASE_URL}${state}/`;
    
    console.log(`\n------------------------------------------------`);
    console.log(`🇺🇸 Processing State ${s + 1}/${STATES.length}: ${state}`);
    console.log(`------------------------------------------------`);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(3000); 

      // --- SCRAPE LOGIC (SLUG STRATEGY) ---
      const rawShows = await page.evaluate((currentState) => {
        const data = [];
        
        // 1. Find all "Location:" labels
        const locationNodes = document.evaluate(
            "//text()[contains(., 'Location:')]", 
            document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
        );

        for (let i = 0; i < locationNodes.snapshotLength; i++) {
            const node = locationNodes.snapshotItem(i);
            const row = node.parentElement.parentElement; // The <tr> containing Location
            
            if (row) {
                // 2. Extract Location Text
                // Get text from the cell next to "Location:"
                const fullLoc = row.innerText.replace("Location:", "").trim();
                
                // 3. Extract Title from the Link in the NEXT row (Description row)
                let title = "Unknown Event";
                let link = "";
                
                const descRow = row.nextElementSibling;
                if (descRow) {
                    const linkTag = descRow.querySelector('a');
                    if (linkTag) {
                        link = linkTag.href;
                        // URL Example: .../events/details/2025-wilmington-holiday-market_1
                        // We split by "/" and take the last part
                        let slug = link.split('/').pop(); 
                        // Remove trailing ID (e.g. _1) and file extensions
                        slug = slug.replace(/_\d+$/, '').replace(/\.html$/, '');
                        // Remove leading year (e.g. 2025-)
                        slug = slug.replace(/^\d{4}-/, '');
                        // Replace dashes with spaces
                        title = slug.replace(/-/g, ' ');
                        // Capitalize Words (Make it look nice)
                        title = title.replace(/\b\w/g, l => l.toUpperCase());
                    }
                }

                if (fullLoc.length > 2 && title !== "Unknown Event") {
                     data.push({
                        name: title,
                        locationString: fullLoc,
                        link: link,
                        state: currentState,
                        vendorInfo: "Check details" 
                    });
                }
            }
        }
        return data;
      }, state);

      console.log(`   Found ${rawShows.length} events in ${state}. Geocoding now...`);

      // --- GEOCODE ---
      for (let i = 0; i < rawShows.length; i++) {
        const show = rawShows[i];
        
        // Clean location: "Wilmington, OH 123 Rd" -> "Wilmington, OH"
        const cleanLoc = show.locationString.split(',').slice(0, 2).join(',') || show.locationString;

        process.stdout.write(`   [${state}] Processing ${i + 1}/${rawShows.length} (${cleanLoc.substring(0,25)}...)\r`); 
        
        await sleep(1000); // Polite pause

        const coords = await getCoordinates(cleanLoc);
        
        if (coords) {
            show.latitude = coords.lat;
            show.longitude = coords.lon;
        } else {
            show.latitude = 0;
            show.longitude = 0;
        }
        show.id = Math.random().toString(36).substr(2, 9);
        allShows.push(show);
      }
      console.log(`\n   ✅ ${state} Complete.`);

    } catch (err) {
      console.error(`   ❌ Error in ${state}:`, err.message);
    }
  }

  fs.writeFileSync('shows.json', JSON.stringify(allShows, null, 2));
  console.log(`\n🎉 ALL DONE! Total shows collected: ${allShows.length}`);
  console.log('💾 Saved data to shows.json');

  await browser.close();
})();