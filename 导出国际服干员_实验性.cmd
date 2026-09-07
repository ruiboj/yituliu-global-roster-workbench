@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem DESIGN: ArkPRTS is optional, so this launcher discovers Python but never
rem downloads Python or installs packages without the user's explicit action.
set "ARK_PYTHON_EXE="
set "ARK_PYTHON_ARGS="
where py >nul 2>nul && set "ARK_PYTHON_EXE=py" && set "ARK_PYTHON_ARGS=-3"
if not defined ARK_PYTHON_EXE where python >nul 2>nul && set "ARK_PYTHON_EXE=python"
if not defined ARK_PYTHON_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" set "ARK_PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if not defined ARK_PYTHON_EXE (
  echo 未找到 Python。主工具仍可正常使用 MAA JSON 和手动编辑。
  echo 如需实验性 ArkPRTS 导出，请先从 python.org 安装 Python 3。
  pause
  exit /b 1
)

"%ARK_PYTHON_EXE%" %ARK_PYTHON_ARGS% "%~dp0arkprts_export.py"
if errorlevel 1 (
  echo.
  echo 如提示未安装 ArkPRTS，请先手动运行：
  echo   "%ARK_PYTHON_EXE%" %ARK_PYTHON_ARGS% -m pip install -U arkprts
)
pause
