@echo off
echo ==========================================
echo      L.I.S.A. Developer Launch Script
echo ==========================================

echo [1/3] Starting Go Backend...
start "LISA Backend" cmd /k "cd backend && go run main.go"

echo [2/3] Opening Frontend...
start posture-demo/index.html

echo [3/3] Launching Resource Monitor (Optional)...
echo        To run monitor: activate lisa_env && python monitor_resources.py
echo.
echo Done! Backend is running in a separate window.
pause
