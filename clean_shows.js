/*
================================================================================
SHOW DATA CLEANUP SCRIPT
================================================================================
Cleans your existing shows.json file without re-scraping:
- Removes junk events (date-only names, too short, missing coords)
- Adds unique IDs to all events
- Standardizes required fields
- Validates data structure

Run with: node clean_shows.js
================================================================================
*/

const fs = require('fs');

// Read the original shows.json
console.log('📖 Reading shows.json...');
const rawData = fs.readFileSync('shows.json', 'utf8');
const shows = JSON.parse(rawData);

console.log(`   Found ${shows.length} total events\n`);

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function isJunkEvent(show) {
  // Check for invalid name
  if (!show.name || show.name.length < 8) {
    return true;
  }
  
  // Check if name is just a date (e.g. "11/30", "12/5")
  if (show.name.match(/^\d{1,2}\/\d{1,2}/)) {
    return true;
  }
  
  // Check if name contains asterisk (usually navigation elements)
  if (show.name.includes('*')) {
    return true;
  }
  
  // Check for missing coordinates
  if (!show.latitude || !show.longitude) {
    return true;
  }
  
  // Check for invalid coordinates (0,0 or 999999)
  if (show.latitude === 0 || show.longitude === 0) {
    return true;
  }
  
  return false;
}

function cleanShow(show) {
  return {
    id: show.id || generateId(),
    name: show.name.trim(),
    dateString: show.dateString || "",
    locationString: show.locationString || "",
    latitude: show.latitude || null,
    longitude: show.longitude || null,
    link: show.link || "",
    vendorInfo: show.vendorInfo || "",
    state: show.state || "",
    category: show.category || "Festivals & Fairs"
  };
}

// ============================================================================
// PROCESS DATA
// ============================================================================

console.log('🧹 Cleaning data...');

let junkCount = 0;
let missingCoordsCount = 0;
let addedIdsCount = 0;

const cleanedShows = shows
  .filter(show => {
    if (isJunkEvent(show)) {
      junkCount++;
      if (!show.latitude || !show.longitude) {
        missingCoordsCount++;
      }
      return false;
    }
    return true;
  })
  .map(show => {
    if (!show.id) {
      addedIdsCount++;
    }
    return cleanShow(show);
  });

// ============================================================================
// STATS & BREAKDOWN
// ============================================================================

const stats = {
  seeds: cleanedShows.filter(s => s.vendorInfo && s.vendorInfo.includes('Weekly')).length,
  odmall: cleanedShows.filter(s => s.vendorInfo && s.vendorInfo.includes('ODMall')).length,
  festivalGuides: cleanedShows.filter(s => s.vendorInfo === 'FestivalGuides').length,
  other: cleanedShows.filter(s => !s.vendorInfo || (!s.vendorInfo.includes('Weekly') && !s.vendorInfo.includes('ODMall') && s.vendorInfo !== 'FestivalGuides')).length
};

const categoryBreakdown = {
  'Weekly Markets': cleanedShows.filter(s => s.category === 'Weekly Markets').length,
  'Arts & Craft': cleanedShows.filter(s => s.category === 'Arts & Craft').length,
  'Festivals & Fairs': cleanedShows.filter(s => s.category === 'Festivals & Fairs').length,
  'Conventions': cleanedShows.filter(s => s.category === 'Conventions').length,
  'Horror & Oddities': cleanedShows.filter(s => s.category === 'Horror & Oddities').length
};

const stateBreakdown = {};
cleanedShows.forEach(show => {
  const state = show.state || 'Unknown';
  stateBreakdown[state] = (stateBreakdown[state] || 0) + 1;
});

// ============================================================================
// SAVE RESULTS
// ============================================================================

// Backup original file
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
fs.writeFileSync(`shows_backup_${timestamp}.json`, rawData);
console.log(`   💾 Backed up original to shows_backup_${timestamp}.json`);

// Save cleaned data
fs.writeFileSync('shows.json', JSON.stringify(cleanedShows, null, 2));

// ============================================================================
// REPORT
// ============================================================================

console.log('\n✅ CLEANUP COMPLETE!\n');
console.log('📊 RESULTS:');
console.log(`   Original events: ${shows.length}`);
console.log(`   Cleaned events: ${cleanedShows.length}`);
console.log(`   Removed: ${junkCount} junk events`);
console.log(`     - Missing coordinates: ${missingCoordsCount}`);
console.log(`     - Invalid names: ${junkCount - missingCoordsCount}`);
console.log(`   Added IDs: ${addedIdsCount} events\n`);

console.log('🗂️  BY SOURCE:');
console.log(`   - Seeds (Weekly Markets): ${stats.seeds}`);
console.log(`   - ODMall: ${stats.odmall}`);
console.log(`   - FestivalGuides: ${stats.festivalGuides}`);
console.log(`   - Other: ${stats.other}\n`);

console.log('🏷️  BY CATEGORY:');
Object.entries(categoryBreakdown)
  .sort((a, b) => b[1] - a[1])
  .forEach(([category, count]) => {
    console.log(`   - ${category}: ${count}`);
  });

console.log('\n📍 BY STATE:');
Object.entries(stateBreakdown)
  .sort((a, b) => b[1] - a[1])
  .forEach(([state, count]) => {
    console.log(`   - ${state}: ${count}`);
  });

console.log('\n🎉 Your shows.json is now clean and ready for the app!');
console.log(`   File size: ${(fs.statSync('shows.json').size / 1024).toFixed(1)} KB\n`);
