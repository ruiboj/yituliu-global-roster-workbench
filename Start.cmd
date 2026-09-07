@echo off
setlocal
cd /d "%~dp0"
set "NODE=%~dp0runtime\node.exe"
if not exist "%NODE%" (
  echo Bundled runtime missing. Download the Windows-x64 ZIP from Releases.
  pause
  exit /b 1
)
if not exist "data\operator-catalog.json" (
  echo First launch: downloading the public game catalog. No account login is needed.
  "%NODE%" scripts\fetch-public-data.mjs
  if errorlevel 1 goto failed
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" %*
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Startup failed. Check the message above and your internet connection, then try again.
pause
exit /b 1
