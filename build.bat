@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="dev" goto dev
if "%~1"=="run" goto run
if "%~1"=="test" goto test
if "%~1"=="bin" goto build
if "%~1"=="" goto build
echo Usage: build.bat [dev^|bin^|run^|test]
exit /b 2
:dev
cargo run
exit /b %errorlevel%
:run
target\release\dshub.exe
exit /b %errorlevel%
:test
cargo test
if errorlevel 1 exit /b %errorlevel%
cargo clippy --all-targets -- -D warnings
exit /b %errorlevel%
:build
cargo build --release
exit /b %errorlevel%
