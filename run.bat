@echo off
title LeukoQ -- Running
color 0A

echo.
echo  ========================================================
echo   LeukoQ - Quantum Blood Cancer Detection Platform
echo  ========================================================
echo.

if not exist venv (
    echo  [ERROR] Run setup.bat first!
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

echo  [1/3] Starting API backend on http://127.0.0.1:8888 ...
start "LeukoQ API" cmd /k "call venv\Scripts\activate.bat && cd backend && uvicorn api:app --host 127.0.0.1 --port 8888 --reload"

echo  [2/3] Starting Frontend server on http://127.0.0.1:8080 ...
start "LeukoQ Frontend" cmd /k "python -m http.server 8080 --directory docs"

timeout /t 4 /nobreak >nul

echo  [3/3] Opening browser...
start "" "http://127.0.0.1:8080"

echo.
echo  ========================================================
echo   LeukoQ is LIVE at: http://127.0.0.1:8080
echo   API running at:    http://127.0.0.1:8888
echo.
echo   Image analysis now works (served over HTTP, not file://)
echo.
echo   Press any key to STOP both servers.
echo  ========================================================
echo.
pause

taskkill /fi "WindowTitle eq LeukoQ API" /f >nul 2>&1
taskkill /fi "WindowTitle eq LeukoQ Frontend" /f >nul 2>&1
echo  [OK] Servers stopped.
pause
