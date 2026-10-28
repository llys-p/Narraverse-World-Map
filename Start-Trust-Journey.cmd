@echo off
setlocal
if not defined TRUST_JOURNEY_SAVE_DIR set "TRUST_JOURNEY_SAVE_DIR=%~dp0artifacts\trust-journey\world"
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 is required for this verified candidate.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 (
  echo Node.js 24 or newer is required. This candidate was verified with Node 24.
  pause
  exit /b 1
)
echo Narraverse hunter trust journey
echo Page: http://127.0.0.1:18354/demo-runtime.html
echo This candidate uses its own new world. Existing services are not stopped.
echo Wait for status ready. Type quit and Enter to close normally.
echo Cold opening and longer histories can still be slow.
if exist "%TRUST_JOURNEY_SAVE_DIR%\" (
  if not exist "%TRUST_JOURNEY_SAVE_DIR%\service-commit-r*.json" (
    echo No completed commit in existing directory. Preserve it for diagnosis.
    pause
    exit /b 1
  )
  node --env-file-if-exists=.env runtime-server.mjs --data-dir "%TRUST_JOURNEY_SAVE_DIR%" --port 18354 --writable true --continuous-march true
) else (
  node --env-file-if-exists=.env runtime-server.mjs --data-dir "%TRUST_JOURNEY_SAVE_DIR%" --port 18354 --profile campaign-trust-village --seed 42 --writable true --continuous-march true
)
if errorlevel 1 (
  echo Failed. Preserve the error and saves; do not remove lock files.
  pause
  exit /b 1
)
endlocal
