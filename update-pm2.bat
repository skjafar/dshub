@echo off
REM DeviceMon Web - PM2 Update Script for Windows
REM This script updates the running application with zero downtime

setlocal enabledelayedexpansion

echo ======================================
echo DeviceMon Web - Update with PM2
echo ======================================
echo.

REM Check if PM2 is running the app
pm2 list | findstr "devicemon-web" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: DeviceMon is not running in PM2.
    echo Please run 'deploy-pm2.bat' first to deploy the application.
    pause
    exit /b 1
)

REM Optional: Pull latest changes from git
if exist ".git" (
    echo Git repository detected. Do you want to pull latest changes? ^(y/n^)
    set /p response=
    if /i "!response!"=="y" (
        echo Pulling latest changes from git...
        git pull
        if %ERRORLEVEL% neq 0 (
            echo WARNING: Git pull failed or had conflicts
        )
        echo.
    )
)

REM Install/update server dependencies
echo Updating server dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to update server dependencies
    pause
    exit /b 1
)
echo.

REM Install/update client dependencies
echo Updating client dependencies...
cd client
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to update client dependencies
    cd ..
    pause
    exit /b 1
)
cd ..
echo.

REM Build client
echo Building client production bundle...
cd client
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to build client
    cd ..
    pause
    exit /b 1
)
cd ..
echo.

REM Build server
echo Building TypeScript server...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to build server
    pause
    exit /b 1
)
echo.

REM Reload application with zero downtime
echo Reloading application with zero downtime...
pm2 reload ecosystem.config.js
echo.

REM Display status
echo ======================================
echo Update Complete!
echo ======================================
echo.
pm2 list
echo.
pm2 logs devicemon-web --lines 20 --nostream
echo.
echo Application has been updated and reloaded successfully.
echo Run 'pm2 logs devicemon-web' to monitor the application.
echo.
pause
