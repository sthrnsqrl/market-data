const { execSync } = require('child_process');
const fs = require('fs');

console.log("🚀 STARTING CLOUD UPDATE (Unified Edition)...");

try {
    // 1. Run the New Unified Scraper
    console.log("\n🔹 Executing: node scrape_unified.js...");
    // This runs your new master script that finds all 7,800+ shows
    execSync('node scrape_unified.js', { stdio: 'inherit' });

    // 2. Git Operations
    console.log("\n☁️ Pushing to GitHub...");

    // IMPORTANT: 'git add -A' stages the file updates AND the deletions you made
    console.log("🔹 Staging changes (including deletions)...");
    execSync('git add -A', { stdio: 'inherit' });

    // Commit
    try {
        console.log("🔹 Committing...");
        execSync('git commit -m "Auto-update: Fresh shows list"', { stdio: 'inherit' });
    } catch (e) {
        // If git commit fails (usually because nothing changed), just ignore it
        console.log("   (No new changes to commit today, or commit already clean.)");
    }

    // Push
    console.log("🔹 Pushing...");
    execSync('git push', { stdio: 'inherit' });

    console.log("\n🎉 SUCCESS! New data is live in the cloud.");

} catch (error) {
    console.error("\n❌ ERROR during update:");
    console.error(error.message);
}