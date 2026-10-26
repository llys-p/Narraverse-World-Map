@echo off
setlocal
set "PLAYABLE_SAVE_DIR=%~dp0artifacts\playable-village\slot-%RANDOM%-%RANDOM%\world"
call "%~dp0Start-Playable.cmd"
endlocal
