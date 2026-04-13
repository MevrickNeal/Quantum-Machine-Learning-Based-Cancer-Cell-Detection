# Quantum Cancer Detection — Fast Training (no quantum, ~30 sec)
Set-Location -Path "$PSScriptRoot\backend"
pip install -r requirements.txt
python train.py --skip-quantum
uvicorn api:app --host 127.0.0.1 --port 8888 --reload
