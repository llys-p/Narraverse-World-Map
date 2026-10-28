@echo off
setlocal
set "FOREST_SAVE_DIR=%~dp0artifacts\forest-village\slot-%RANDOM%-%RANDOM%\world"
call "%~dp0Start-Forest-Journey.cmd"
endlocal
