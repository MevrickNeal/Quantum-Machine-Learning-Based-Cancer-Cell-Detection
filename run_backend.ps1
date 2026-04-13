# Quantum Cancer Detection v2 — Launch Scripts

### run_backend.ps1 (Windows PowerShell)
### Usage: .\run_backend.ps1

Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Quantum Cancer Detection — Backend Setup" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\backend"

Write-Host "`n[1/3] Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt

Write-Host "`n[2/3] Training all models (this may take 5-20 minutes)..." -ForegroundColor Yellow
Write-Host "      To skip quantum models for a fast run: python train.py --skip-quantum" -ForegroundColor Gray
python train.py

Write-Host "`n[3/3] Starting FastAPI server on http://127.0.0.1:8888 ..." -ForegroundColor Green
Write-Host "      API docs: http://127.0.0.1:8888/docs" -ForegroundColor Green
uvicorn api:app --host 127.0.0.1 --port 8888 --reload
