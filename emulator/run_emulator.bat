@echo off
REM DSHub Emulator Launcher for Windows

cd /d "%~dp0"

echo ======================================
echo Starting DSHub Board Emulator
echo ======================================
echo.
echo Listening on this machine and the network; pass --local for this machine only.
echo Press Ctrl+C to stop
echo.

python dshub_emulator.py %*
pause
