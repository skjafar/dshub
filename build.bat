@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set BINARY=%ROOT%\src-tauri\target\release\dshub.exe

if "%~1"=="" goto usage
if "%~1"=="dev" goto dev
if "%~1"=="bin" goto bin
if "%~1"=="pkg" goto pkg
if "%~1"=="run" goto run
if "%~1"=="clean" goto clean
goto usage

:usage
echo Usage: %~nx0 ^<command^>
echo.
echo Commands:
echo   dev       Start dev mode with hot-reload (requires tauri-cli)
echo   bin       Build standalone binary only (fast)
echo   pkg       Build binary + .msi and .exe installer packages
echo   run       Run the last built binary
echo   clean     Remove all build artifacts
echo.
echo Note: Linux (.deb/.rpm) and macOS (.dmg) builds require running on those
echo platforms natively, or use GitHub Actions (.github/workflows/build.yml).
echo.
goto :eof

:check_tauri_cli
cargo tauri --version >nul 2>&1
if errorlevel 1 (
    echo tauri-cli not found. Installing...
    cargo install tauri-cli --version "^2" --locked
)
goto :eof

:build_frontend
echo ^>^> Building frontend...
call npm --prefix "%ROOT%\client" ci --silent
call npm --prefix "%ROOT%\client" run build
goto :eof

:dev
call :check_tauri_cli
echo ^>^> Starting Tauri dev mode...
cd /d "%ROOT%\src-tauri"
cargo tauri dev
goto :eof

:bin
call :check_tauri_cli
call :build_frontend
echo ^>^> Compiling Rust binary (no packages)...
cd /d "%ROOT%\src-tauri"
cargo tauri build --no-bundle
echo.
echo Done: %BINARY%
goto :eof

:pkg
call :check_tauri_cli
call :build_frontend
echo ^>^> Building packages (.msi, .exe installer)...
cd /d "%ROOT%\src-tauri"
cargo tauri build
echo.
echo Done:
for /r "%ROOT%\src-tauri\target\release\bundle" %%f in (*.msi *.exe) do echo   %%f
goto :eof

:run
if not exist "%BINARY%" (
    echo No binary found. Run '%~nx0 bin' first.
    exit /b 1
)
"%BINARY%"
goto :eof

:clean
echo ^>^> Cleaning build artifacts...
if exist "%ROOT%\src-tauri\target" rd /s /q "%ROOT%\src-tauri\target"
if exist "%ROOT%\client\build" rd /s /q "%ROOT%\client\build"
echo Done.
goto :eof
