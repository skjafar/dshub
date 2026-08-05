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
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install tauri-cli. Aborting.
        exit /b 1
    )
)
goto :eof

:: Closes processes that commonly hold this project's files open: a dev
:: server started with "npm run dev" / "cargo tauri dev" locks
:: client\node_modules\@esbuild's binary, and a previously-launched dshub.exe
:: locks its own binary. Delegated to a PowerShell script rather than
:: `taskkill /IM node.exe`, which would also close every unrelated Node.js
:: process on the machine -- an editor's language server, another project's
:: dev server -- not just this project's.
:kill_blocking_processes
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\close-blocking-processes.ps1"
goto :eof

:: Asks whether to close blocking processes and retry. Returns errorlevel 0
:: if the user agreed (and processes are now closed) or 1 if they declined,
:: which callers treat as "abort".
:prompt_retry
echo.
echo [ERROR] %~1 failed.
echo A running process ^(this project's own dev server from "npm run dev" /
echo "cargo tauri dev", or a previously-launched dshub.exe^) may be holding a
echo file open that this step needs to replace.
echo.
choice /C YN /M "Close this project's dev server and dshub.exe, then retry"
if errorlevel 2 exit /b 1
call :kill_blocking_processes
exit /b 0

:try_frontend_build
call npm --prefix "%ROOT%\client" ci --silent
if errorlevel 1 exit /b 1
call npm --prefix "%ROOT%\client" run build
if errorlevel 1 exit /b 1
exit /b 0

:build_frontend
echo ^>^> Building frontend...
call :try_frontend_build
if not errorlevel 1 goto :eof

call :prompt_retry "Frontend build"
if errorlevel 1 (
    echo Build aborted.
    exit /b 1
)
echo ^>^> Retrying frontend build...
call :try_frontend_build
if errorlevel 1 (
    echo.
    echo [ERROR] Frontend build failed again after closing processes. Aborting.
    exit /b 1
)
goto :eof

:dev
call :check_tauri_cli
if errorlevel 1 exit /b 1
echo ^>^> Starting Tauri dev mode...
cd /d "%ROOT%\src-tauri"
cargo tauri dev
goto :eof

:bin
call :check_tauri_cli
if errorlevel 1 exit /b 1
call :build_frontend
if errorlevel 1 exit /b 1

echo ^>^> Compiling Rust binary (no packages)...
cd /d "%ROOT%\src-tauri"
cargo tauri build --no-bundle
if not errorlevel 1 goto bin_done

call :prompt_retry "Rust build"
if errorlevel 1 (
    echo Build aborted.
    exit /b 1
)
echo ^>^> Retrying Rust build...
cargo tauri build --no-bundle
if errorlevel 1 (
    echo.
    echo [ERROR] Rust build failed again after closing processes. Aborting.
    exit /b 1
)

:bin_done
echo.
echo Done: %BINARY%
goto :eof

:pkg
call :check_tauri_cli
if errorlevel 1 exit /b 1
call :build_frontend
if errorlevel 1 exit /b 1

echo ^>^> Building packages (.msi, .exe installer)...
cd /d "%ROOT%\src-tauri"
cargo tauri build
if not errorlevel 1 goto pkg_done

call :prompt_retry "Rust build"
if errorlevel 1 (
    echo Build aborted.
    exit /b 1
)
echo ^>^> Retrying Rust build...
cargo tauri build
if errorlevel 1 (
    echo.
    echo [ERROR] Rust build failed again after closing processes. Aborting.
    exit /b 1
)

:pkg_done
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
