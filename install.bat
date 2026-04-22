@echo off
title LeukoQ -- Full Installer
color 0B

echo.
echo  ========================================================
echo   LeukoQ - Quantum Cancer Detection Platform
echo   Full Prerequisite Installer
echo  ========================================================
echo.

:: ── Step 1: Check if Python is already installed ──────────────────────────────
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo  [OK] Python already installed:
    python --version
    echo.
    goto :install_deps
)

echo  [INFO] Python not found. Installing now...
echo.

:: ── Step 2: Try winget (Windows 10/11 built-in) ───────────────────────────────
winget --version >nul 2>&1
if %errorlevel% == 0 (
    echo  [INFO] Using winget to install Python 3.11...
    winget install -e --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
    
    :: Refresh PATH
    call RefreshEnv.cmd >nul 2>&1
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts"
    
    python --version >nul 2>&1
    if %errorlevel% == 0 (
        echo  [OK] Python installed via winget.
        goto :install_deps
    )
)

:: ── Step 3: Download Python installer manually ────────────────────────────────
echo  [INFO] Downloading Python 3.11 installer from python.org...
powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile 'python_installer.exe' -UseBasicParsing"

if not exist python_installer.exe (
    echo  [ERROR] Download failed. Please install Python manually from:
    echo          https://www.python.org/downloads/
    echo          Tick "Add Python to PATH" during install, then re-run this file.
    pause
    exit /b 1
)

echo  [INFO] Running Python installer (this may take 1-2 minutes)...
python_installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0

del python_installer.exe

:: Refresh PATH
set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts"

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Python install failed. Please restart this file or install manually.
    pause
    exit /b 1
)

echo  [OK] Python installed successfully.
echo.

:: ── Step 4: Install dependencies ──────────────────────────────────────────────
:install_deps
echo  [INFO] Creating virtual environment...
if exist venv (
    echo  [SKIP] venv already exists.
) else (
    python -m venv venv
    echo  [OK] venv created.
)
echo.

echo  [INFO] Installing backend dependencies...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip -q
pip install -r backend\requirements.txt -q
echo  [OK] Dependencies installed.
echo.

echo  ========================================================
echo   INSTALLATION COMPLETE!
echo.
echo   Now run:  run.bat
echo  ========================================================
echo.
pause
