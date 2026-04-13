"""
FastAPI backend for the QML Blood Cancer Detection Dashboard.

Endpoints:
  GET  /health              — service health + model status
  GET  /metrics             — full training results (metrics.json)
  GET  /shap                — SHAP feature importances
  GET  /dataset             — dataset metadata
  GET  /clinical/meta       — clinical model feature ranges + defaults
  POST /clinical/predict    — CBC values → risk assessment
  GET  /assets/{filename}   — serve generated charts (PNG)

Run:
    cd backend
    uvicorn api:app --host 127.0.0.1 --port 8888 --reload
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT    = Path(__file__).resolve().parent
OUT_DIR = ROOT / "outputs"
sys.path.insert(0, str(ROOT))

# ─── Lazy-load clinical model ─────────────────────────────────────────────────
_clf    = None
_scaler = None
_meta   = None


def _ensure_clinical_model():
    global _clf, _scaler, _meta

    if _clf is not None:
        return True

    model_path  = OUT_DIR / "clinical_model.joblib"
    scaler_path = OUT_DIR / "clinical_scaler.joblib"
    meta_path   = OUT_DIR / "clinical_meta.json"

    if not model_path.exists():
        return False

    try:
        import joblib
        _clf    = joblib.load(model_path)
        _scaler = joblib.load(scaler_path)
        with open(meta_path) as f:
            _meta = json.load(f)
        return True
    except Exception as e:
        print(f"[api] Could not load clinical model: {e}")
        return False


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Quantum Cancer Detection API",
    description=(
        "Research API for QML-based blood cancer (leukemia) early detection. "
        "EDUCATIONAL USE ONLY — NOT a medical device."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated chart images
if OUT_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(OUT_DIR)), name="assets")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ClinicalInput(BaseModel):
    wbc:         float = Field(7.5,   ge=0.1, le=500.0,  description="WBC count K/µL")
    rbc:         float = Field(4.8,   ge=1.0, le=7.0,    description="RBC count M/µL")
    hemoglobin:  float = Field(14.0,  ge=3.0, le=22.0,   description="Hemoglobin g/dL")
    hematocrit:  float = Field(42.0,  ge=10.0, le=62.0,  description="Hematocrit %")
    mcv:         float = Field(90.0,  ge=50.0, le=125.0, description="MCV fL")
    mch:         float = Field(30.0,  ge=15.0, le=42.0,  description="MCH pg")
    mchc:        float = Field(34.0,  ge=20.0, le=40.0,  description="MCHC g/dL")
    platelets:   float = Field(260.0, ge=5.0,  le=1000.0,description="Platelets K/µL")
    neutrophils: float = Field(58.0,  ge=0.0,  le=95.0,  description="Neutrophils %")
    lymphocytes: float = Field(28.0,  ge=0.0,  le=98.0,  description="Lymphocytes %")
    monocytes:   float = Field(6.0,   ge=0.0,  le=30.0,  description="Monocytes %")
    eosinophils: float = Field(3.0,   ge=0.0,  le=20.0,  description="Eosinophils %")
    basophils:   float = Field(0.8,   ge=0.0,  le=5.0,   description="Basophils %")
    blast_cells: float = Field(0.3,   ge=0.0,  le=99.0,  description="Blast cells %")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
def health():
    model_ready = _ensure_clinical_model()
    metrics_ready = (OUT_DIR / "metrics.json").exists()
    return {
        "status":        "ok",
        "clinical_model_loaded": model_ready,
        "training_done": metrics_ready,
        "disclaimer":    "Research tool only — NOT for clinical diagnosis.",
    }


@app.get("/metrics", tags=["Results"])
def get_metrics():
    path = OUT_DIR / "metrics.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Training not yet run. Execute: python train.py",
        )
    with open(path) as f:
        return json.load(f)


@app.get("/shap", tags=["Results"])
def get_shap():
    path = OUT_DIR / "shap_importances.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="SHAP data not found. Run train.py first.")
    with open(path) as f:
        return json.load(f)


@app.get("/dataset", tags=["Results"])
def get_dataset_info():
    path = OUT_DIR / "dataset_info.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Dataset info not found. Run train.py first.")
    with open(path) as f:
        return json.load(f)


@app.get("/clinical/meta", tags=["Clinical Screening"])
def get_clinical_meta():
    """Return feature definitions + reference ranges + defaults for the patient screening form."""
    path = OUT_DIR / "clinical_meta.json"
    if not path.exists():
        # Return defaults even without training
        from pipeline.clinical_model import FEATURE_NAMES, FEATURE_RANGES, REFERENCE_RANGES, NORMAL_DEFAULTS
        return {
            "feature_names":    FEATURE_NAMES,
            "feature_ranges":   {k: list(v) for k, v in FEATURE_RANGES.items()},
            "reference_ranges": REFERENCE_RANGES,
            "normal_defaults":  NORMAL_DEFAULTS,
            "model_trained":    False,
        }
    with open(path) as f:
        data = json.load(f)
    data["model_trained"] = (OUT_DIR / "clinical_model.joblib").exists()
    return data


@app.post("/clinical/predict", tags=["Clinical Screening"])
def clinical_predict(body: ClinicalInput):
    """
    Predict blood cancer risk from Complete Blood Count values.

    Returns risk level (LOW / MODERATE / HIGH / CRITICAL), risk score,
    and per-feature concern flags.
    """
    if not _ensure_clinical_model():
        # Try training on the fly (one-time cost)
        try:
            from pipeline.clinical_model import train_clinical_model
            train_clinical_model(OUT_DIR)
            _ensure_clinical_model()
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"Clinical model not ready: {e}. Run python train.py first.",
            )

    from pipeline.clinical_model import FEATURE_NAMES, predict_risk, NORMAL_DEFAULTS

    features_dict = {
        "WBC (K/µL)":        body.wbc,
        "RBC (M/µL)":        body.rbc,
        "Hemoglobin (g/dL)": body.hemoglobin,
        "Hematocrit (%)":    body.hematocrit,
        "MCV (fL)":          body.mcv,
        "MCH (pg)":          body.mch,
        "MCHC (g/dL)":       body.mchc,
        "Platelets (K/µL)":  body.platelets,
        "Neutrophils (%)":   body.neutrophils,
        "Lymphocytes (%)":   body.lymphocytes,
        "Monocytes (%)":     body.monocytes,
        "Eosinophils (%)":   body.eosinophils,
        "Basophils (%)":     body.basophils,
        "Blast Cells (%)":   body.blast_cells,
    }

    result = predict_risk(features_dict, _clf, _scaler)
    return result


@app.get("/assets/{filename}", tags=["Charts"])
def serve_asset(filename: str):
    """Serve generated chart images."""
    path = OUT_DIR / filename
    if not path.exists() or not filename.endswith(".png"):
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(str(path), media_type="image/png")


@app.get("/", tags=["System"])
def root():
    return {
        "name": "Quantum Cancer Detection API v2",
        "docs": "/docs",
        "health": "/health",
        "endpoints": [
            "GET  /health",
            "GET  /metrics",
            "GET  /shap",
            "GET  /dataset",
            "GET  /clinical/meta",
            "POST /clinical/predict",
            "GET  /assets/{filename}",
        ],
        "disclaimer": "RESEARCH ONLY. NOT for clinical diagnosis.",
    }


# ─── Startup: auto-load model ─────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    loaded = _ensure_clinical_model()
    print(f"[api] Clinical model loaded: {loaded}")
    print(f"[api] Outputs dir: {OUT_DIR}")
    if not (OUT_DIR / "metrics.json").exists():
        print("[api] ⚠ Training not yet run — some endpoints will return 404")
        print("[api]   Run:  python train.py  to generate all artifacts")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8888, reload=True)
