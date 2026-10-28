@echo off
setlocal
set "TRUST_SAVE_DIR=%~dp0artifacts\trust-village\slot-%RANDOM%-%RANDOM%\world"
call "%~dp0Start-Trust-Journey.cmd"
endlocal
