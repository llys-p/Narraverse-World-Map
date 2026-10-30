@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or newer is required.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 exit /b 1
echo Verifying a NEW isolated forest world. Your existing saves are not opened.
echo This check uses no model API and makes no paid calls.
echo Keep this window open until PASS, FAIL, or BLOCKED is reported.
node scripts/verify-forest-playtest.mjs
set "FOREST_VERIFY_EXIT=%ERRORLEVEL%"
echo Report location is printed above. A blocked check is not a pass.
pause
exit /b %FOREST_VERIFY_EXIT%
