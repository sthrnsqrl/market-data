@echo off
echo ===================================================
echo [AUTO-UPDATE] Starting Spider: %date% %time%
echo ===================================================

:: 1. Navigate to Folder
cd /d "C:\Users\Andrew\Desktop\show-scraper"

:: 2. Run the Spider (Headless Mode)
echo Running Node.js Scraper...
call node scrape.js >> scraper_log.txt 2>&1

:: 3. Push to GitHub (The Cloud)
echo Pushing to Cloud...
git add shows.json
git commit -m "Auto-update: %date% %time%"
git push origin main

echo ===================================================
echo [SUCCESS] Data is live! App users will see changes instantly.
echo ===================================================
if "%1"=="no_pause" goto end
pause
:end