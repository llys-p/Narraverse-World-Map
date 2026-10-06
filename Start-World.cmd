@echo off
rem World map prototype (needs Laya bridge on 8130 for Laya reads; game works without it)
cd /d "%~dp0"
if not defined WORLD_PORT set WORLD_PORT=18312
echo World map prototype: http://127.0.0.1:%WORLD_PORT%/
node server.cjs
pause
