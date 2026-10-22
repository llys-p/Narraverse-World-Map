@echo off
setlocal
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
echo Narraverse single NPC village experiment
echo Page: http://127.0.0.1:18344/demo-runtime.html
echo This candidate uses its own new world. Existing services are not stopped.
echo Wait for status ready. Type quit and Enter to close normally.
echo Cold opening and longer histories can still be slow.
if exist "%~dp0artifacts\npc1-village\world\" (
  if not exist "%~dp0artifacts\npc1-village\world\service-commit-r*.json" (
    echo No completed commit in existing directory. Preserve it for diagnosis.
    pause
    exit /b 1
  )
  node runtime-server.mjs --data-dir "%~dp0artifacts\npc1-village\world" --port 18344 --writable true --continuous-march true
) else (
  node runtime-server.mjs --data-dir "%~dp0artifacts\npc1-village\world" --port 18344 --profile campaign-npc-village --seed 42 --writable true --continuous-march true
)
if errorlevel 1 (
  echo Failed. Preserve the error and saves; do not remove lock files.
  pause
  exit /b 1
)
endlocal
