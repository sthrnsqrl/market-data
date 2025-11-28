const fs = require('fs');

console.log("🔄 Starting Data Merge...");

let mainList = [];
let discoveryList = [];

// 1. Load the Main Directory List (from scrape_multi.js)
if (fs.existsSync('shows.json')) {
    try {
        mainList = JSON.parse(fs.readFileSync('shows.json'));
        console.log(`   📂 Main Directory: ${mainList.length} events`);
    } catch (e) { console.log("   ⚠️ Error reading shows.json"); }
}

// 2. Load the Discovery List (from scrape_discovery.js)
if (fs.existsSync('shows_discovery.json')) {
    try {
        discoveryList = JSON.parse(fs.readFileSync('shows_discovery.json'));
        console.log(`   🔎 Discovery Feed: ${discoveryList.length} events`);
    } catch (e) { console.log("   ⚠️ Discovery file empty or missing (skipping)."); }
}

// 3. Combine
const combined = mainList.concat(discoveryList);

// 4. Intelligent De-Duplication
// We create a "fingerprint" for each show (Name + State)
// If we see the fingerprint again, we skip it.
const uniqueEvents = [];
const seenFingerprints = new Set();

combined.forEach(show => {
    // Create a simple fingerprint: "ohiofaircolumbusoh"
    const fingerprint = (show.name + show.locationString).toLowerCase().replace(/[^a-z]/g, '');
    
    if (!seenFingerprints.has(fingerprint)) {
        seenFingerprints.add(fingerprint);
        uniqueEvents.push(show);
    }
});

// 5. Save the Master File
fs.writeFileSync('shows_master.json', JSON.stringify(uniqueEvents, null, 2));
console.log(`✅ MERGE COMPLETE. Total Unique Events: ${uniqueEvents.length}`);