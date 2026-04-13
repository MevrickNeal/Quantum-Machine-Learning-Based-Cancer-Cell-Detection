"""
Master training orchestrator for the QML Blood Cancer Detection pipeline.

Runs:
  1. Data loading + preprocessing (OpenML leukemia)
  2. Classical baseline models (5 models)
  3. Quantum models — Qiskit VQC, QSVM, QSVM+Noise
  4. PennyLane QNN
  5. Clinical CBC model (synthetic data)
  6. SHAP explainability + all visualizations
  7. Exports everything to outputs/ for the web dashboard + API

Usage:
    python train.py [--skip-quantum] [--n-qubits 4]
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")  # headless rendering

# Force UTF-8 output on Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT    = Path(__file__).resolve().parent
OUT_DIR = ROOT / "outputs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Add pipeline directory to path
sys.path.insert(0, str(ROOT))

from pipeline.data_loader       import (load_leukemia_dataset, preprocess_for_classical,
                                         preprocess_for_quantum, get_train_test_split,
                                         save_dataset_info)
from pipeline.classical_models  import run_classical_models, get_best_classical
from pipeline.quantum_models    import run_all_quantum
from pipeline.pennylane_models  import run_pennylane_qnn
from pipeline.clinical_model    import train_clinical_model
from pipeline.explainability    import (compute_shap_importances, plot_roc_curves,
                                         plot_confusion_matrix, plot_model_comparison_bar)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def safe_metrics(result):
    """Extract metrics dict from a model result, handling skipped models."""
    if isinstance(result, dict):
        if result.get("status") == "ok":
            return result.get("metrics", {})
        return None
    return None


def print_banner(text):
    sep = "=" * 60
    print(f"\n{sep}\n  {text}\n{sep}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-quantum",  action="store_true",
                        help="Skip quantum models (fast dry-run)")
    parser.add_argument("--n-qubits",      type=int, default=4,
                        help="Number of qubits for quantum models")
    parser.add_argument("--qnn-epochs",    type=int, default=60,
                        help="PennyLane QNN training epochs")
    args = parser.parse_args()

    t0 = time.time()
    summary = {
        "project": "Quantum ML Blood Cancer Detection",
        "version": "2.0",
        "dataset":  "OpenML leukemia (ALL vs AML)",
        "n_qubits": args.n_qubits,
        "models":   {},
        "medical_disclaimer": (
            "RESEARCH / EDUCATIONAL PROTOTYPE ONLY. "
            "NOT a medical device. NOT for clinical diagnosis or treatment."
        ),
    }

    # ── 1. Data ───────────────────────────────────────────────────────────────
    print_banner("1 · Loading & Preprocessing Data")
    X_raw, y, class_names, feature_names = load_leukemia_dataset()

    X_cl, selector, scaler_cl, scaler_qt, selected_idx = preprocess_for_classical(
        X_raw, y, n_features=64
    )
    X_q, pca, angle_scaler, pca_explained = preprocess_for_quantum(
        X_raw, y, n_qubits=args.n_qubits,
        selector=selector, scaler_qt=scaler_qt
    )

    X_cl_tr, X_cl_te, y_tr, y_te = get_train_test_split(X_cl, y)
    X_q_tr,  X_q_te,  _,    _    = get_train_test_split(X_q,  y)

    dataset_info = save_dataset_info(X_raw, y, class_names, feature_names,
                                     selected_idx, OUT_DIR)
    summary["dataset_info"] = dataset_info
    summary["pca_explained_variance"] = round(pca_explained, 4)

    selected_gene_names = [feature_names[i] for i in selected_idx]

    # ── 2. Classical Models ───────────────────────────────────────────────────
    print_banner("2 · Classical Baseline Models")
    classical_results, trained_models = run_classical_models(
        X_cl_tr, X_cl_te, y_tr, y_te
    )
    summary["models"]["classical"] = classical_results
    best_cl_name, best_cl_metrics = get_best_classical(classical_results)
    summary["best_classical"] = {"name": best_cl_name, "metrics": best_cl_metrics}

    # ── 3. Quantum Models (Qiskit) ────────────────────────────────────────────
    quantum_results = {}
    if not args.skip_quantum:
        print_banner("3 · Quantum Models — Qiskit (Local Aer Simulator)")
        quantum_results = run_all_quantum(X_q_tr, X_q_te, y_tr, y_te,
                                          n_qubits=args.n_qubits)
        summary["models"]["quantum_qiskit"] = {
            k: {
                "status": v.get("status"),
                "metrics": v.get("metrics"),
                "circuit": v.get("circuit"),
                "n_qubits": v.get("n_qubits"),
            }
            for k, v in quantum_results.items()
        }
    else:
        print("[train] --skip-quantum set, skipping Qiskit models")

    # ── 4. PennyLane QNN ─────────────────────────────────────────────────────
    pl_result = {}
    if not args.skip_quantum:
        print_banner("4 · PennyLane Quantum Neural Network")
        pl_result = run_pennylane_qnn(
            X_q_tr, X_q_te, y_tr, y_te,
            n_qubits=args.n_qubits,
            n_layers=3,
            n_epochs=args.qnn_epochs,
        )
        summary["models"]["quantum_pennylane"] = {
            "status":   pl_result.get("status"),
            "metrics":  pl_result.get("metrics"),
            "circuit":  pl_result.get("circuit"),
            "n_qubits": pl_result.get("n_qubits"),
            "n_layers": pl_result.get("n_layers"),
            "loss_history": pl_result.get("loss_history", []),
        }

    # ── 5. Clinical Model ─────────────────────────────────────────────────────
    print_banner("5 · Clinical CBC Screening Model")
    _, _, clinical_metrics, clinical_importances = train_clinical_model(OUT_DIR)
    summary["models"]["clinical_cbc"] = {
        "metrics": clinical_metrics,
        "description": (
            "Gradient Boosting on synthetic CBC data. "
            "Enables real-time patient risk screening."
        ),
    }

    # ── 6. Visualizations ─────────────────────────────────────────────────────
    print_banner("6 · Generating Visualizations")

    # Collect all model scores for ROC plot
    roc_scores = {}
    best_cl_model = trained_models[best_cl_name]
    best_cl_scores = best_cl_model.predict_proba(X_cl_te)[:, 1]
    roc_scores[best_cl_name] = best_cl_scores

    # Add RF if available
    if "Random Forest" in trained_models and "Random Forest" != best_cl_name:
        roc_scores["Random Forest"] = trained_models["Random Forest"].predict_proba(X_cl_te)[:, 1]

    # Add quantum scores
    for name, res in quantum_results.items():
        if res.get("status") == "ok" and "_scores" in res:
            roc_scores[name] = np.array(res["_scores"])

    if pl_result.get("status") == "ok" and "_scores" in pl_result:
        roc_scores["PennyLane QNN"] = np.array(pl_result["_scores"])

    # ROC curves (quantum use quantum test set, classical use classical)
    # For unified plot, use classical models on classical test set
    plot_roc_curves(y_te, roc_scores, OUT_DIR)

    # Confusion matrix for best classical
    best_preds = best_cl_model.predict(X_cl_te)
    plot_confusion_matrix(y_te, best_preds, best_cl_name, OUT_DIR)

    # Confusion matrices for quantum models
    for name, res in quantum_results.items():
        if res.get("status") == "ok" and "_preds" in res:
            plot_confusion_matrix(y_te, np.array(res["_preds"]), name, OUT_DIR)

    # SHAP — use Random Forest (best for TreeExplainer)
    rf_model = trained_models.get("Random Forest",
                                   trained_models.get(best_cl_name))
    compute_shap_importances(rf_model, X_cl_tr, X_cl_te,
                              [selected_gene_names[i] for i in range(X_cl_tr.shape[1])],
                              OUT_DIR)

    # Combined model comparison bar
    all_metrics_for_plot = {}
    for name, m in classical_results.items():
        all_metrics_for_plot[name] = m
    for name, res in quantum_results.items():
        if res.get("status") == "ok" and res.get("metrics"):
            all_metrics_for_plot[name] = res["metrics"]
    if pl_result.get("status") == "ok" and pl_result.get("metrics"):
        all_metrics_for_plot["PennyLane QNN"] = pl_result["metrics"]

    plot_model_comparison_bar(all_metrics_for_plot, OUT_DIR)

    # ── 7. Save master metrics.json ───────────────────────────────────────────
    summary["wall_time_seconds"] = round(time.time() - t0, 1)
    summary["all_model_metrics"] = all_metrics_for_plot

    metrics_path = OUT_DIR / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(summary, f, indent=2)

    # Also copy to frontend/data/ for static fallback
    frontend_data = ROOT.parent / "frontend" / "data"
    frontend_data.mkdir(parents=True, exist_ok=True)
    with open(frontend_data / "metrics.json", "w") as f:
        json.dump(summary, f, indent=2)

    # Copy visualizations to frontend/assets/
    import shutil
    frontend_assets = ROOT.parent / "frontend" / "assets"
    frontend_assets.mkdir(parents=True, exist_ok=True)
    for img in OUT_DIR.glob("*.png"):
        shutil.copy2(img, frontend_assets / img.name)

    print_banner("TRAINING COMPLETE")
    print(f"  Wall time    : {summary['wall_time_seconds']}s")
    print(f"  Best classical: {best_cl_name}  "
          f"AUC={best_cl_metrics['roc_auc']:.4f}  F1={best_cl_metrics['f1']:.4f}")
    print(f"  Outputs     : {OUT_DIR}")
    print(f"  metrics.json: {metrics_path}")


if __name__ == "__main__":
    main()
