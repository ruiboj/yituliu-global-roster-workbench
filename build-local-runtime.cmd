@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem DESIGN: source releases do not redistribute the generated third-party
rem catalog. This opt-in local build downloads source data onto the user's own
rem machine, builds the Windows runtime, validates it, and then starts it.
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js 18+ / Node.js 18+ was not found.
  echo 请先安装 Node.js，然后重新运行 / Install Node.js, then run this file again.
  pause
  exit /b 1
)

echo 正在下载公开目录 / Downloading public catalog...
node scripts\fetch-public-data.mjs
if errorlevel 1 goto :failed

echo 正在构建并检查 / Building and validating...
node scripts\build.mjs dist
if errorlevel 1 goto :failed
node scripts\validate.mjs dist
if errorlevel 1 goto :failed

echo 构建完成 / Build complete.
call dist\启动工具.cmd
exit /b %errorlevel%

:failed
echo.
echo 构建失败；请复制上方错误，但不要附带 Token 或个人导出。
echo Build failed. Copy the error above, but never include tokens or account exports.
pause
exit /b 1
