@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo      L.I.S.A. Developer Launch Script
echo ==========================================

echo.
echo [1/4] Setting up Environment...
:: Set Proxy for faster downloads (Fixes network issues in some regions)
set GOPROXY=https://goproxy.io,direct
echo        GOPROXY set to https://goproxy.io,direct

echo.
echo [2/4] Checking Dependencies...
cd backend
echo        Downloading modules (if needed)...
:: 'go mod download' ensures we have everything before building
go mod download
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Network Error! Could not download dependencies.
    echo         Please check your internet connection.
    pause
    exit /b
)

echo.
echo [3/4] Building Backend (System Tray Mode)...
echo        Compiling... (Lines below show progress)
echo        ----------------------------------------
:: -v shows the package names as they are compiled, acting as a progress indicator
go build -v -ldflags -H=windowsgui -o lisa-backend.exe main.go
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build Failed!
    pause
    exit /b
)
echo        ----------------------------------------
echo        Build Complete!

echo.
echo [4/4] Launching L.I.S.A...
start "" "lisa-backend.exe"
cd ..

echo.
echo ==========================================
echo      SUCCESS! L.I.S.A. is running.
echo      Look for the icon in your System Tray.
echo ==========================================
echo.

echo Opening Frontend...
start posture-demo/index.html

echo.
echo To run resource monitor (Optional):
echo    activate lisa_env ^&^& python monitor_resources.py
echo.
pause
