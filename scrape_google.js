const puppeteer = require('puppeteer');
const fs = require('fs');
const readline = require('readline');

// --- CONFIGURATION ---
const SEARCH_QUERY = 'site:facebook.com/events ("vendor wanted" OR "crafters wanted" OR "spots available" OR "space available" OR "booth size" OR "call for artists" OR "food trucks wanted") Ohio 2025';

const askQuestion = (query) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
};

(async () => {
  console.log('🔍 Starting Google Detective (Popup Buster Mode)...');
  
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // 1. Go to Google
  await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded' });

  // 2. BUST THE POPUP
  try {
      console.log("   Checking for Consent Popup...");
      // Look for buttons with text "Reject all" or "Accept all"
      // This XPath finds a button that contains the text
      const button = await page.waitForXPath("//button[contains(., 'Reject all') or contains(., 'Accept all') or contains(., 'I agree')]", { timeout: 5000 });
      
      if (button) {
          console.log("   Popup found! Clicking button...");
          await button.click();
          await new Promise(r => setTimeout(r, 2000)); // Wait for it to close
      }
  } catch (e) {
      console.log("   No popup found (or timed out checking). Continuing...");
  }

  // 3. Type Query
  try {
      const searchBox = await page.waitForSelector('textarea[name="q"], input[name="q"]');
      await searchBox.type(SEARCH_QUERY, { delay: 50 }); 
      await page.keyboard.press('Enter');
  } catch (e) {
      console.log("Error typing. Please type manually.");
  }
  
  // 4. THE PAUSE
  console.log("\n🛑 SCRIPT PAUSED 🛑");
  console.log("1. Solve CAPTCHA if needed.");
  console.log("2. Wait for results.");
  await askQuestion("👉 Press ENTER here when you see the results list...");

  console.log('   Harvesting links...');

  // 5. Scrape Results
  const leads = await page.evaluate(() => {
      const data = [];
      const allLinks = document.querySelectorAll('a');

      allLinks.forEach(link => {
          const href = link.href;
          const title = link.innerText.trim();
          
          if (href.includes('facebook.com/events/')) {
              if (title.length > 5 && !title.includes("google") && !title.includes("Cached")) {
                  let snippet = "Check link for details";
                  const parent = link.closest('div');
                  if (parent && parent.parentElement) {
                      const fullText = parent.parentElement.innerText;
                      snippet = fullText.replace(title, '').trim().substring(0, 150) + "...";
                  }

                  data.push({
                      name: title.replace(" | Facebook", ""),
                      link: href,
                      snippet: snippet,
                      source: "Google Search"
                  });
              }
          }
      });
      return data;
  });

  console.log(`   Found ${leads.length} potential leads.`);
  
  // 6. Save Files
  fs.writeFileSync('leads.json', JSON.stringify(leads, null, 2));
  
  const csvHeader = "Name,Link,Snippet\n";
  const csvRows = leads.map(l => {
      const cleanName = l.name.replace(/,/g, '').replace(/"/g, '').replace(/\n/g, ' ');
      const cleanLink = l.link.split('&')[0];
      const cleanSnip = l.snippet.replace(/,/g, '').replace(/"/g, '').replace(/\n/g, ' ');
      return `"${cleanName}","${cleanLink}","${cleanSnip}"`;
  }).join("\n");
  
  fs.writeFileSync('leads.csv', csvHeader + csvRows);
  
  console.log('💾 Saved to leads.csv');
  await browser.close();
})();