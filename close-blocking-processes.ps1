# Closes this project's own dev-server and app processes so a build can
# replace files they're holding open. Called from build.bat's retry prompt.
#
# Scoped by command line rather than a blanket `taskkill /IM node.exe`: this
# machine runs Node.js for plenty of things that have nothing to do with
# DSHub -- an editor's language server, other projects' dev servers -- and
# closing all of them just to unblock a `npm ci` is a bigger hammer than the
# problem calls for. What actually holds a file open here is the Vite dev
# server importing this project's own esbuild binary, so that is what gets
# matched: a node.exe process whose command line names both this project's
# client directory and vite.

$root = (Resolve-Path "$PSScriptRoot").Path
$clientDir = Join-Path $root 'client'

Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($clientDir) -and $_.CommandLine -match 'vite' } |
    ForEach-Object {
        Write-Host "Closing node.exe (PID $($_.ProcessId)) -- this project's Vite dev server"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

Get-Process -Name dshub -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Closing dshub.exe (PID $($_.Id))"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
