"""
Clinical CBC (Complete Blood Count) screening model.

Uses realistic synthetic data based on published clinical thresholds for
leukemia (ALL / AML) vs healthy individuals. Enables real-time patient
risk assessment from standard blood test values.

Features (14 CBC parameters):
  WBC, RBC, Hemoglobin, Hematocrit, MCV, MCH, MCHC,
  Platelets, Neutrophils%, Lymphocytes%, Monocytes%,
  Eosinophils%, Basophils%, Blast Cells%
"""

import json
import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "outputs"

FEATURE_NAMES = [
    "WBC (K/µL)",
    "RBC (M/µL)",
    "Hemoglobin (g/dL)",
    "Hematocrit (%)",
    "MCV (fL)",
    "MCH (pg)",
    "MCHC (g/dL)",
    "Platelets (K/µL)",
    "Neutrophils (%)",
    "Lymphocytes (%)",
    "Monocytes (%)",
    "Eosinophils (%)",
    "Basophils (%)",
    "Blast Cells (%)",
]

# Normal reference ranges (min, max, typical)
REFERENCE_RANGES = {
    "WBC (K/µL)":        {"min": 4.5,   "max": 11.0,  "unit": "K/µL"},
    "RBC (M/µL)":        {"min": 3.8,   "max": 6.0,   "unit": "M/µL"},
    "Hemoglobin (g/dL)": {"min": 11.5,  "max": 17.5,  "unit": "g/dL"},
    "Hematocrit (%)":    {"min": 35.0,  "max": 52.0,  "unit": "%"},
    "MCV (fL)":          {"min": 80.0,  "max": 100.0, "unit": "fL"},
    "MCH (pg)":          {"min": 27.0,  "max": 33.0,  "unit": "pg"},
    "MCHC (g/dL)":       {"min": 31.5,  "max": 36.0,  "unit": "g/dL"},
    "Platelets (K/µL)":  {"min": 150.0, "max": 400.0, "unit": "K/µL"},
    "Neutrophils (%)":   {"min": 40.0,  "max": 75.0,  "unit": "%"},
    "Lymphocytes (%)":   {"min": 20.0,  "max": 45.0,  "unit": "%"},
    "Monocytes (%)":     {"min": 2.0,   "max": 10.0,  "unit": "%"},
    "Eosinophils (%)":   {"min": 1.0,   "max": 6.0,   "unit": "%"},
    "Basophils (%)":     {"min": 0.0,   "max": 1.0,   "unit": "%"},
    "Blast Cells (%)":   {"min": 0.0,   "max": 2.0,   "unit": "%"},
}

# Slider ranges for the UI
FEATURE_RANGES = {
    "WBC (K/µL)":        (0.1,   500.0),
    "RBC (M/µL)":        (1.0,   7.0),
    "Hemoglobin (g/dL)": (3.0,   22.0),
    "Hematocrit (%)":    (10.0,  62.0),
    "MCV (fL)":          (50.0,  125.0),
    "MCH (pg)":          (15.0,  42.0),
    "MCHC (g/dL)":       (20.0,  40.0),
    "Platelets (K/µL)":  (5.0,   1000.0),
    "Neutrophils (%)":   (0.0,   95.0),
    "Lymphocytes (%)":   (0.0,   98.0),
    "Monocytes (%)":     (0.0,   30.0),
    "Eosinophils (%)":   (0.0,   20.0),
    "Basophils (%)":     (0.0,   5.0),
    "Blast Cells (%)":   (0.0,   99.0),
}

# Default values for healthy adult
NORMAL_DEFAULTS = {
    "WBC (K/µL)":        7.5,
    "RBC (M/µL)":        4.8,
    "Hemoglobin (g/dL)": 14.0,
    "Hematocrit (%)":    42.0,
    "MCV (fL)":          90.0,
    "MCH (pg)":          30.0,
    "MCHC (g/dL)":       34.0,
    "Platelets (K/µL)":  260.0,
    "Neutrophils (%)":   58.0,
    "Lymphocytes (%)":   28.0,
    "Monocytes (%)":     6.0,
    "Eosinophils (%)":   3.0,
    "Basophils (%)":     0.8,
    "Blast Cells (%)":   0.3,
}


def generate_synthetic_cbc(n_samples: int = 3000, random_state: int = 42) -> tuple:
    """
    Generate clinically realistic synthetic CBC data.

    Classes:
        0 = Healthy
        1 = Leukemia (combined ALL + AML)

    Returns:
        X : (n_samples, 14) float array
        y : (n_samples,)   int binary label
        subtypes : (n_samples,) str — 'Healthy', 'AML', or 'ALL'
    """
    rng = np.random.RandomState(random_state)

    def clip_col(arr, lo, hi):
        return np.clip(arr, lo, hi)

    # ─── Healthy (~55%) ───────────────────────────────────────────────────────
    n_h = int(n_samples * 0.55)
    H = np.column_stack([
        clip_col(rng.normal(7.5,   2.0,   n_h), 4.5,   11.0),   # WBC
        clip_col(rng.normal(4.8,   0.5,   n_h), 3.8,    6.0),   # RBC
        clip_col(rng.normal(14.0,  1.5,   n_h), 11.5,  17.5),   # Hgb
        clip_col(rng.normal(42.0,  4.0,   n_h), 35.0,  52.0),   # Hct
        clip_col(rng.normal(90.0,  5.0,   n_h), 80.0, 100.0),   # MCV
        clip_col(rng.normal(30.0,  2.0,   n_h), 27.0,  33.0),   # MCH
        clip_col(rng.normal(34.0,  1.2,   n_h), 31.5,  36.0),   # MCHC
        clip_col(rng.normal(260.0, 50.0,  n_h),150.0, 400.0),   # Plt
        clip_col(rng.normal(60.0,  8.0,   n_h), 42.0,  74.0),   # Neutro%
        clip_col(rng.normal(28.0,  5.0,   n_h), 20.0,  44.0),   # Lymph%
        clip_col(rng.normal(6.0,   2.0,   n_h),  2.0,  10.0),   # Mono%
        clip_col(rng.normal(3.0,   1.5,   n_h),  1.0,   6.0),   # Eosin%
        clip_col(rng.normal(0.7,   0.3,   n_h),  0.0,   1.0),   # Baso%
        clip_col(rng.exponential(0.3,     n_h),  0.0,   2.0),   # Blast% ~0
    ])
    y_h = np.zeros(n_h, dtype=int)
    sub_h = np.array(["Healthy"] * n_h)

    # ─── AML (~22%) ───────────────────────────────────────────────────────────
    n_aml = int(n_samples * 0.22)
    AML = np.column_stack([
        clip_col(rng.exponential(35.0,         n_aml),   2.0,  300.0),  # WBC elevated
        clip_col(rng.normal(3.0,   0.7,        n_aml),   1.5,    4.5),  # RBC low
        clip_col(rng.normal(8.5,   1.5,        n_aml),   4.0,   12.0),  # Hgb low
        clip_col(rng.normal(26.0,  5.0,        n_aml),  12.0,   38.0),  # Hct low
        clip_col(rng.normal(88.0,  8.0,        n_aml),  70.0,  110.0),  # MCV
        clip_col(rng.normal(28.0,  4.0,        n_aml),  18.0,   36.0),  # MCH
        clip_col(rng.normal(32.0,  2.5,        n_aml),  25.0,   37.0),  # MCHC
        clip_col(rng.normal(55.0,  40.0,       n_aml),   5.0,  200.0),  # Plt low
        clip_col(rng.normal(20.0,  14.0,       n_aml),   2.0,   70.0),  # Neutro% variable
        clip_col(rng.normal(18.0,  10.0,       n_aml),   5.0,   55.0),  # Lymph%
        clip_col(rng.normal(10.0,   5.0,       n_aml),   2.0,   28.0),  # Mono% elevated
        clip_col(rng.normal(2.5,   2.0,        n_aml),   0.0,    9.0),  # Eosin%
        clip_col(rng.normal(1.2,   0.8,        n_aml),   0.0,    4.0),  # Baso%
        clip_col(rng.normal(45.0,  22.0,       n_aml),  20.0,   95.0),  # Blast% HIGH
    ])
    y_aml = np.ones(n_aml, dtype=int)
    sub_aml = np.array(["AML"] * n_aml)

    # ─── ALL (~23%) ───────────────────────────────────────────────────────────
    n_all = n_samples - n_h - n_aml
    ALL = np.column_stack([
        clip_col(rng.exponential(28.0,         n_all),   1.0,  400.0),  # WBC very high
        clip_col(rng.normal(2.8,   0.7,        n_all),   1.0,    4.0),  # RBC low
        clip_col(rng.normal(7.5,   1.5,        n_all),   3.0,   11.0),  # Hgb low
        clip_col(rng.normal(23.0,  5.0,        n_all),  10.0,   35.0),  # Hct low
        clip_col(rng.normal(85.0,  8.0,        n_all),  65.0,  105.0),  # MCV
        clip_col(rng.normal(27.0,  4.0,        n_all),  15.0,   36.0),  # MCH
        clip_col(rng.normal(31.0,  2.5,        n_all),  24.0,   37.0),  # MCHC
        clip_col(rng.normal(50.0,  35.0,       n_all),   5.0,  150.0),  # Plt low
        clip_col(rng.normal(10.0,   7.0,       n_all),   0.5,   40.0),  # Neutro% low
        clip_col(rng.normal(72.0,  13.0,       n_all),  42.0,   97.0),  # Lymph% HIGH (hallmark)
        clip_col(rng.normal(5.0,   3.0,        n_all),   0.5,   15.0),  # Mono%
        clip_col(rng.normal(2.0,   1.5,        n_all),   0.0,    8.0),  # Eosin%
        clip_col(rng.normal(1.0,   0.6,        n_all),   0.0,    4.0),  # Baso%
        clip_col(rng.normal(55.0,  20.0,       n_all),  20.0,   95.0),  # Blast% HIGH
    ])
    y_all = np.ones(n_all, dtype=int)
    sub_all = np.array(["ALL"] * n_all)

    X = np.vstack([H, AML, ALL])
    y = np.concatenate([y_h, y_aml, y_all])
    subtypes = np.concatenate([sub_h, sub_aml, sub_all])

    idx = rng.permutation(len(y))
    return X[idx], y[idx], subtypes[idx]


def train_clinical_model(output_dir=None):
    """Train and save the clinical CBC screening model."""
    out = Path(output_dir) if output_dir else OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)

    print("[clinical] Generating synthetic CBC dataset ...")
    X, y, subtypes = generate_synthetic_cbc(n_samples=3000, random_state=42)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    scaler = MinMaxScaler()
    X_tr_s = scaler.fit_transform(X_train)
    X_te_s = scaler.transform(X_test)

    print("[clinical] Training Gradient Boosting classifier ...")
    clf = GradientBoostingClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05,
        subsample=0.8, random_state=42
    )
    clf.fit(X_tr_s, y_train)

    preds = clf.predict(X_te_s)
    probas = clf.predict_proba(X_te_s)[:, 1]

    metrics = {
        "accuracy": float(accuracy_score(y_test, preds)),
        "f1":       float(f1_score(y_test, preds)),
        "roc_auc":  float(roc_auc_score(y_test, probas)),
    }
    print(f"[clinical] Accuracy={metrics['accuracy']:.4f}  F1={metrics['f1']:.4f}  AUC={metrics['roc_auc']:.4f}")

    # Feature importances
    importances = {
        feat: float(imp)
        for feat, imp in zip(FEATURE_NAMES, clf.feature_importances_)
    }

    # Save artifacts
    joblib.dump(clf,    out / "clinical_model.joblib")
    joblib.dump(scaler, out / "clinical_scaler.joblib")

    meta = {
        "feature_names":   FEATURE_NAMES,
        "feature_ranges":  {k: list(v) for k, v in FEATURE_RANGES.items()},
        "reference_ranges": REFERENCE_RANGES,
        "normal_defaults":  NORMAL_DEFAULTS,
        "model_metrics":   metrics,
        "feature_importances": importances,
        "n_training_samples": len(X_train),
        "disclaimer": "Research/educational only. NOT for clinical diagnosis.",
    }
    with open(out / "clinical_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"[clinical] Saved model + scaler + meta to {out}")
    return clf, scaler, metrics, importances


def predict_risk(features_dict: dict, model, scaler) -> dict:
    """
    Predict blood cancer risk from a dictionary of CBC values.

    Args:
        features_dict : {feature_name: float_value, ...}
        model         : trained GradientBoostingClassifier
        scaler        : fitted MinMaxScaler

    Returns:
        dict with risk_score, risk_level, contributing_factors, ...
    """
    x = np.array([features_dict.get(f, NORMAL_DEFAULTS[f]) for f in FEATURE_NAMES]).reshape(1, -1)
    x_scaled = scaler.transform(x)
    prob = float(model.predict_proba(x_scaled)[0, 1])

    if prob < 0.25:
        level, label = "LOW", "Low Risk — Normal Pattern Detected"
        color = "#00ff94"
    elif prob < 0.55:
        level, label = "MODERATE", "Moderate Risk — Further Evaluation Recommended"
        color = "#ffd700"
    elif prob < 0.80:
        level, label = "HIGH", "High Risk — Urgent Medical Consultation Required"
        color = "#ff8c00"
    else:
        level, label = "CRITICAL", "Critical Risk — Immediate Hematologist Referral"
        color = "#ff3366"

    # Flag out-of-range parameters
    factors = []
    for feat in FEATURE_NAMES:
        val = features_dict.get(feat, NORMAL_DEFAULTS[feat])
        ref = REFERENCE_RANGES[feat]
        if val < ref["min"]:
            concern = "LOW"
        elif val > ref["max"]:
            concern = "HIGH"
        else:
            concern = "NORMAL"
        factors.append({
            "feature": feat,
            "value": round(float(val), 2),
            "normal_min": ref["min"],
            "normal_max": ref["max"],
            "unit": ref["unit"],
            "concern": concern,
        })

    # Sort by concern severity
    order = {"CRITICAL": 0, "HIGH": 1, "LOW": 2, "NORMAL": 3}
    factors.sort(key=lambda x: order.get(x["concern"], 3))

    return {
        "risk_score": round(prob, 4),
        "risk_level": level,
        "risk_label": label,
        "risk_color": color,
        "contributing_factors": factors,
        "disclaimer": "This is a research/educational tool only. NOT for clinical diagnosis or treatment.",
    }
