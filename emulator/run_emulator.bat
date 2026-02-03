@echo off
REM DSHub Emulator Launcher for Windows

cd /d "%~dp0"

echo ======================================
echo Starting DSHub Board Emulator
echo ======================================
echo.
echo The emulator will be discoverable at 127.0.0.1
echo Press Ctrl+C to stop
echo.

python dshub_emulator.py
pause
