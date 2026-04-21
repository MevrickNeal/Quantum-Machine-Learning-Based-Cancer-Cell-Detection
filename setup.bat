@echo off
title LeukoQ -- Setup
color 0B

echo.
echo  ========================================================
echo   LeukoQ - Quantum Blood Cancer Detection Platform
echo   One-Time Setup
echo  ========================================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Python not found. Install Python 3.10+ from python.org
    echo  Make sure "Add Python to PATH" is checked during install!
    pause
    exit /b 1
)

echo  [OK] Python found:
python --version
echo.

:: Create venv
echo  [1/3] Creating virtual environment...
if exist venv (
    echo  [SKIP] venv already exists.
) else (
    python -m venv venv
    echo  [OK] venv created.
)
echo.

:: Install dependencies
echo  [2/3] Installing backend dependencies...
call venv\Scripts\activate.bat
pip install --upgrade pip -q
pip install -r backend\requirements.txt -q
echo  [OK] Dependencies installed.
echo.

echo  [3/3] Setup complete!
echo.
echo  ========================================================
echo   NOW RUN:   run.bat
echo  ========================================================
echo.
pause
