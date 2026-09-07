@echo off
setlocal
cd /d "%~dp0"
"%~dp0runtime\node.exe" scripts\fetch-public-data.mjs
if errorlevel 1 (
  echo Update failed. Your previous catalog is unchanged.
  pause
  exit /b 1
)
echo Catalog updated. Reload the browser to use it. Save any draft first.
pause
