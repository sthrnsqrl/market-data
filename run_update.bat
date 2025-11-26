@echo off
echo ===================================================
echo [AUTO-UPDATE] Starting Spider: %date% %time%
echo ===================================================

:: 1. Go to Scraper Folder (using your specific path)
cd /d "C:\Users\Andrew\Desktop\show-scraper"

:: 2. Run the Spider
:: We pipe output to a log file so you can check errors later
echo Running Node.js Scraper...
call node scrape.js >> scraper_log.txt 2>&1

:: 3. Copy the file to the App Folder
echo Copying data to App...
copy /Y "shows.json" "C:\Users\Andrew\Desktop\market-vendor-show-finder\src\data\shows.json"

echo ===================================================
echo [SUCCESS] Update Complete. Data is now in the App.
echo ===================================================