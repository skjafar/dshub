@echo off
REM DeviceMon Web - PM2 Update Script for Windows
REM This script updates the running application with zero downtime

setlocal enabledelayedexpansion

echo ======================================
echo DeviceMon Web - Update with PM2
echo ======================================
echo.

REM Detect PM2 command (global or local via npx)
set PM2_CMD=
where pm2 >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PM2_CMD=call pm2
) else if exist "node_modules\.bin\pm2.cmd" (
    set PM2_CMD=call npx pm2
) else (
    echo ERROR: PM2 is not installed.
    echo Please run 'deploy-pm2.bat' first to deploy the application.
    pause
    exit /b 1
)

REM Check if PM2 is running the app
%PM2_CMD% list | findstr "devicemon-web" >nul 2>nul
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
echo Building client production bundle with Vite...
cd client
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Client build failed.
    echo Check the error messages above for details.
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
%PM2_CMD% reload ecosystem.config.js
echo.

REM Display status
echo ======================================
echo Update Complete!
echo ======================================
echo.
%PM2_CMD% list
echo.
%PM2_CMD% logs devicemon-web --lines 20 --nostream
echo.
echo Application has been updated and reloaded successfully.
if "%PM2_CMD%"=="call pm2" (
    echo Run 'call pm2 logs devicemon-web' to monitor the application.
) else (
    echo Run 'call npx pm2 logs devicemon-web' to monitor the application.
)
echo.
pause
