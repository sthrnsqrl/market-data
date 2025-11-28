@echo off
echo ===================================================
echo [MASTER SYNC] Processing Data...
echo ===================================================

:: 1. Go to Scraper Folder
cd /d "C:\Users\Andrew\Desktop\show-scraper"

:: 2. Run the Merger (Combines Directory + Discovery)
:: This takes shows.json and shows_discovery.json and makes shows_master.json
echo.
echo [1/4] Merging Data Sources...
call node merge_data.js

:: 3. Rename the Master file to be the "Production" file
:: We overwrite shows.json with the merged version so the App gets everything
copy /Y "shows_master.json" "shows.json"

:: 4. Copy to Local App (For your testing)
echo.
echo [2/4] Updating Local App...
copy /Y "shows.json" "C:\Users\Andrew\Desktop\market-vendor-show-finder\src\data\shows.json"

:: 5. Push to Cloud (GitHub)
:: Git will automatically detect if data changed. 
:: If nothing changed, it does nothing. If it changed, it uploads.
echo.
echo [3/4] Pushing to Cloud...
git add shows.json
git commit -m "Auto-update: Merged Data %date%"
git push origin main

echo.
echo ===================================================
echo [SUCCESS] Ecosystem Synced. 
echo ===================================================
pause