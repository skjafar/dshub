@echo off
REM DSHub - PM2 Deployment Script for Windows
REM This script builds and deploys the DSHub application using PM2

setlocal enabledelayedexpansion

echo ======================================
echo DSHub - PM2 Deployment
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

REM Check if PM2 is available (globally or locally)
set PM2_CMD=
where pm2 >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PM2_CMD=call pm2
    echo PM2 is installed globally:
    call pm2 --version
) else if exist "node_modules\.bin\pm2.cmd" (
    set PM2_CMD=call npx pm2
    echo PM2 is installed locally:
    call npx pm2 --version
) else (
    echo PM2 is not installed.
    echo.
    echo Installing PM2 as a local dev dependency...
    call npm install --save-dev pm2
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install PM2
        pause
        exit /b 1
    )
    set PM2_CMD=call npx pm2
    echo PM2 installed successfully!
    echo.
    echo NOTE: PM2 is installed locally to this project.
    echo To install PM2 globally ^(optional^), run: npm install -g pm2
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

REM Check if app is already running in PM2
%PM2_CMD% list | findstr "dshub" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo DSHub is already running in PM2.
    echo Reloading application with zero downtime...
    %PM2_CMD% reload ecosystem.config.js
) else (
    echo Starting DSHub with PM2...
    %PM2_CMD% start ecosystem.config.js
)
echo.

REM Save PM2 process list
echo Saving PM2 process list...
%PM2_CMD% save
echo.

REM Display status
echo ======================================
echo Deployment Complete!
echo ======================================
echo.
%PM2_CMD% list
echo.
echo Useful PM2 commands:
if "%PM2_CMD%"=="call pm2" (
    echo   call pm2 list              - Show all running processes
    echo   call pm2 logs dshub - View application logs
    echo   call pm2 monit             - Monitor CPU/Memory usage
    echo   call pm2 restart dshub - Restart application
    echo   call pm2 stop dshub    - Stop application
    echo   call pm2 start dshub   - Start application
    echo.
    echo To configure auto-start on system boot ^(optional^):
    echo   npm install -g pm2-windows-startup
    echo   call pm2-startup install
    echo   call pm2 save
) else (
    echo   call npx pm2 list              - Show all running processes
    echo   call npx pm2 logs dshub - View application logs
    echo   call npx pm2 monit             - Monitor CPU/Memory usage
    echo   call npx pm2 restart dshub - Restart application
    echo   call npx pm2 stop dshub    - Stop application
    echo   call npx pm2 start dshub   - Start application
    echo.
    echo To install PM2 globally ^(optional^):
    echo   npm install -g pm2
)
echo.
echo Access DSHub at: http://localhost:3001
echo ^(Server runs on port 3002, client served on port 3001^)
echo.
echo WINDOWS FIREWALL: You may need to allow Node.js through Windows Firewall
echo for UDP device discovery to work properly.
echo.
pause
