const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🩻  Starting X-Ray Diagnostics...');
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  // Go to Ohio page
  await page.goto('https://www.fairsandfestivals.net/states/OH/', { waitUntil: 'domcontentloaded' });
  
  // Wait for the "Location:" text to appear
  try {
      await page.waitForXPath("//text()[contains(., 'Location:')]", { timeout: 5000 });
  } catch(e) {
      console.log("Could not find 'Location:' text on the page.");
  }

  const debugData = await page.evaluate(() => {
    const findings = [];
    // Find all text nodes containing "Location:"
    const locationNodes = document.evaluate(
        "//text()[contains(., 'Location:')]", 
        document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
    );

    // Look at the first 3 items only
    const limit = Math.min(locationNodes.snapshotLength, 3);
    
    for (let i = 0; i < limit; i++) {
        const node = locationNodes.snapshotItem(i);
        const parent = node.parentElement;
        const grandParent = parent.parentElement;
        const greatGrandParent = grandParent ? grandParent.parentElement : null;

        findings.push({
            index: i,
            textFound: node.textContent,
            // We grab the HTML of the parent containers to see where the Title is hiding
            parentHTML: parent ? parent.outerHTML : "N/A",
            grandParentHTML: grandParent ? grandParent.outerHTML : "N/A",
            greatGrandParentHTML: greatGrandParent ? greatGrandParent.outerHTML : "N/A"
        });
    }
    return findings;
  });

  // Save to file
  const outputText = JSON.stringify(debugData, null, 2);
  fs.writeFileSync('layout_test.txt', outputText);
  
  console.log('✅ X-Ray complete.');
  console.log('📄 Saved "layout_test.txt". Please upload this file!');

  await browser.close();
})();