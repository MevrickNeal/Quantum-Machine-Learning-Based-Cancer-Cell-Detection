@echo off
echo ══════════════════════════════════════════
echo   Quantum Cancer Detection — Frontend
echo ══════════════════════════════════════════
cd /d "%~dp0frontend"
echo Starting frontend on http://localhost:3000 ...
echo Open your browser at: http://localhost:3000
python -m http.server 3000
