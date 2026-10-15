@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it, then run this file again.
  pause
  exit /b 1
)
echo D4 local experience candidate - isolated world
echo Map:     http://127.0.0.1:18325/runtime-map.html
echo Village: http://127.0.0.1:18325/runtime-village.html
echo Wait for status ready before opening the page.
echo Type quit and press Enter to save and stop normally. Wait for status stopped.
echo Existing services and saved worlds are not stopped or imported.
echo.
if exist "%~dp0artifacts\d4-daily\world\" (
  node runtime-server.mjs --data-dir "%~dp0artifacts\d4-daily\world" --port 18325 --writable true --inspect-mind false
) else (
  node runtime-server.mjs --data-dir "%~dp0artifacts\d4-daily\world" --port 18325 --profile scene-survival-village --seed 42 --writable true --inspect-mind false
)
if errorlevel 1 (
  echo.
  echo Startup or shutdown failed. Keep the message above; do not delete saves or lock files.
  pause
  exit /b 1
)
endlocal
