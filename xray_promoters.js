const puppeteer = require('puppeteer');
const fs = require('fs');

const TARGETS = [
    { name: 'Oddmall', url: 'https://www.oddmall.info/ohio-shows/' }, 
    { name: 'Northcoast', url: 'https://northcoastpromo.com/event-schedule/' } 
];

(async () => {
  console.log('🩻  Starting Promoter X-Ray...');
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  let findings = [];

  for (const target of TARGETS) {
      console.log(`Analyzing ${target.name}...`);
      try {
          await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Wait a second for things to settle
          await new Promise(r => setTimeout(r, 2000));

          const pageData = await page.evaluate((tName) => {
            // "Universal Keyword Strategy"
            // We look for any text block that looks like a date, then grab its parent
            const allElements = document.querySelectorAll('*');
            const hits = [];
            
            // Regex for dates like "May 4", "Sept 10-11", "11/25"
            const dateRegex = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s\d{1,2}|(\d{1,2}\/\d{1,2})/i;

            allElements.forEach(el => {
                // Only look at "leaf" nodes (elements with no children, just text)
                if (el.children.length === 0 && el.innerText && el.innerText.length < 200) {
                    if (dateRegex.test(el.innerText)) {
                        // We found a date! Let's look at the container around it.
                        const container = el.parentElement;
                        hits.push({
                            source: tName,
                            textFound: el.innerText,
                            containerHTML: container.outerHTML.substring(0, 500), // Grab snippet
                            link: container.querySelector('a')?.href || "No Link"
                        });
                    }
                }
            });
            return hits.slice(0, 3); // Just give us the first 3 examples
          }, target.name);

          findings = findings.concat(pageData);

      } catch (e) {
          console.log(`Error on ${target.name}: ${e.message}`);
      }
  }

  fs.writeFileSync('promoter_layout.txt', JSON.stringify(findings, null, 2));
  console.log('✅ X-Ray complete. Upload "promoter_layout.txt"!');
  await browser.close();
})();