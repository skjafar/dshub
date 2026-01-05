@echo off
REM DeviceMon Web - PM2 Deployment Script for Windows
REM This script builds and deploys the DeviceMon application using PM2

setlocal enabledelayedexpansion

echo ======================================
echo DeviceMon Web - PM2 Deployment
echo ======================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/ ^(v16 or higher^)
    pause
    exit /b 1
)

echo Node version:
node --version
echo NPM version:
npm --version
echo.

REM Check if PM2 is installed, install if not
where pm2 >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo PM2 is not installed. Installing PM2 globally...
    call npm install -g pm2
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install PM2
        pause
        exit /b 1
    )
    echo PM2 installed successfully!
) else (
    echo PM2 is already installed:
    pm2 --version
)
echo.

REM Create logs directory if it doesn't exist
echo Creating logs directory...
if not exist "logs" mkdir logs
echo.

REM Install server dependencies
echo Installing server dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install server dependencies
    pause
    exit /b 1
)
echo.

REM Install client dependencies
echo Installing client dependencies...
cd client
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install client dependencies
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

REM Check if app is already running in PM2
pm2 list | findstr "devicemon-web" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo DeviceMon is already running in PM2.
    echo Reloading application with zero downtime...
    pm2 reload ecosystem.config.js
) else (
    echo Starting DeviceMon with PM2...
    pm2 start ecosystem.config.js
)
echo.

REM Save PM2 process list
echo Saving PM2 process list...
pm2 save
echo.

REM Configure PM2 to start on system boot
echo Configuring PM2 startup script...
echo NOTE: This will configure PM2 to start automatically on Windows boot.
echo.
pm2 startup
if %ERRORLEVEL% neq 0 (
    echo WARNING: Could not configure startup script automatically.
    echo To enable auto-start on Windows boot, you may need to use pm2-windows-startup:
    echo   npm install -g pm2-windows-startup
    echo   pm2-startup install
)
echo.

REM Display status
echo ======================================
echo Deployment Complete!
echo ======================================
echo.
pm2 list
echo.
echo Useful PM2 commands:
echo   pm2 list              - Show all running processes
echo   pm2 logs devicemon-web - View application logs
echo   pm2 monit             - Monitor CPU/Memory usage
echo   pm2 restart devicemon-web - Restart application
echo   pm2 stop devicemon-web    - Stop application
echo   pm2 start devicemon-web   - Start application
echo.
echo Access DeviceMon at: http://localhost:3001
echo ^(Server runs on port 3002, client served on port 3001^)
echo.
echo WINDOWS FIREWALL: You may need to allow Node.js through Windows Firewall
echo for UDP device discovery to work properly.
echo.
pause
