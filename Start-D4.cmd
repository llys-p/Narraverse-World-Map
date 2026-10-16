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
echo Map:     http://127.0.0.1:18327/runtime-map.html
echo Village: http://127.0.0.1:18327/runtime-village.html
echo Activity list: explicit developer world observation (not player/character knowledge)
echo Wait for status ready before opening the page.
echo Type quit and press Enter to save and stop normally. Wait for status stopped.
echo Existing services and saved worlds are not stopped or imported.
echo.
if exist "%~dp0artifacts\d4-daily\world\" (
  if not exist "%~dp0artifacts\d4-daily\world\service-commit-r*.json" (
    echo No completed service commit found in the existing world directory.
    echo Initialization may have been interrupted. Keep the directory for diagnosis.
    pause
    exit /b 1
  )
  node runtime-server.mjs --data-dir "%~dp0artifacts\d4-daily\world" --port 18327 --writable true --inspect-mind false --inspect-activity true
) else (
  node runtime-server.mjs --data-dir "%~dp0artifacts\d4-daily\world" --port 18327 --profile scene-survival-village --seed 42 --writable true --inspect-mind false --inspect-activity true
)
if errorlevel 1 (
  echo.
  echo Startup or shutdown failed. Keep the message above; do not delete saves or lock files.
  pause
  exit /b 1
)
endlocal
