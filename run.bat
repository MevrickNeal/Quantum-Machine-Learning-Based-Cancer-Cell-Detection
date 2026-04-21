@echo off
title LeukoQ -- Running
color 0A

echo.
echo  ========================================================
echo   LeukoQ - Quantum Blood Cancer Detection Platform
echo   Starting Local Server...
echo  ========================================================
echo.

:: Check venv exists
if not exist venv (
    echo  [ERROR] venv not found. Please run setup.bat first!
    pause
    exit /b 1
)

:: Activate venv
call venv\Scripts\activate.bat

echo  [1/2] Starting API backend on http://127.0.0.1:8888 ...
echo.

:: Start backend in a new window
start "LeukoQ API" cmd /k "call venv\Scripts\activate.bat && cd backend && uvicorn api:app --host 127.0.0.1 --port 8888 --reload"

:: Give API 3 seconds to boot
timeout /t 3 /nobreak >nul

echo  [2/2] Opening LeukoQ in your browser...
echo.

:: Open frontend in browser (from docs/ which mirrors frontend/)
start "" "http://127.0.0.1:8888"
start "" "%~dp0docs\index.html"

echo  ========================================================
echo   LeukoQ is LIVE!
echo   Backend API  : http://127.0.0.1:8888
echo   Frontend     : docs/index.html (opened in browser)
echo.
echo   Press any key to STOP the server.
echo  ========================================================
echo.
pause

:: Kill the API window
taskkill /fi "WindowTitle eq LeukoQ API" /f >nul 2>&1
echo  [OK] Server stopped.
pause
