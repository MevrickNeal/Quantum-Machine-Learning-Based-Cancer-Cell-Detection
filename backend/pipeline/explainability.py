"""
SHAP-based explainability for the QML blood cancer pipeline.

Generates:
  - Feature importance ranking (SHAP values for Random Forest)
  - SHAP bar chart PNG
  - Feature importance JSON (for web dashboard)
"""

import json
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "outputs"


def compute_shap_importances(model, X_train, X_test, feature_names, output_dir=None):
    """
    Compute SHAP feature importances using TreeExplainer.

    Returns:
        importance_dict : {feature_name: mean_abs_shap}
        shap_values     : raw SHAP matrix
    """
    out = Path(output_dir) if output_dir else OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)

    try:
        import shap
    except ImportError:
        print("[SHAP] shap not installed — using feature_importances_ fallback")
        return _fallback_importances(model, feature_names, out)

    # Use TreeExplainer for tree-based models
    try:
        explainer   = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_test)

        # For binary classification shap_values may be a list [class0, class1]
        if isinstance(shap_values, list):
            sv = np.array(shap_values[1])
        else:
            sv = np.array(shap_values)

        # Ensure 2D
        if sv.ndim == 1:
            sv = sv.reshape(1, -1)

        mean_abs = np.abs(sv).mean(axis=0)
        # Flatten in case of extra dimensions
        mean_abs = np.asarray(mean_abs).flatten()
    except Exception as e:
        print(f"[SHAP] TreeExplainer failed ({e}) — using feature_importances_")
        return _fallback_importances(model, feature_names, out)

    importance_dict = {
        feat: float(imp)
        for feat, imp in zip(feature_names, mean_abs)
    }

    # Sort by importance
    sorted_items = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)

    # Save JSON
    with open(out / "shap_importances.json", "w") as f:
        json.dump({"shap_importances": dict(sorted_items[:20])}, f, indent=2)

    # Plot
    _plot_shap_bar(sorted_items[:15], out / "shap_bar.png")

    print(f"[SHAP] Top 5 features: {[k for k, _ in sorted_items[:5]]}")
    return importance_dict, sv


def _fallback_importances(model, feature_names, out):
    """Use sklearn feature_importances_ if SHAP fails."""
    try:
        importances = getattr(model, "feature_importances_", None)
        if importances is None:
            # Try getting underlying model from pipeline
            if hasattr(model, "named_steps"):
                for step in model.named_steps.values():
                    importances = getattr(step, "feature_importances_", None)
                    if importances is not None:
                        break
        if importances is None:
            return {}, None

        n = min(len(feature_names), len(importances))
        importance_dict = {
            feature_names[i]: float(importances[i]) for i in range(n)
        }
        sorted_items = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)

        with open(out / "shap_importances.json", "w") as f:
            json.dump({"shap_importances": dict(sorted_items[:20])}, f, indent=2)

        _plot_shap_bar(sorted_items[:15], out / "shap_bar.png")
        return importance_dict, None

    except Exception as e:
        print(f"[SHAP] Fallback also failed: {e}")
        return {}, None


def _plot_shap_bar(sorted_items, out_path):
    """Horizontal bar chart of top feature importances."""
    if not sorted_items:
        return

    features = [k for k, _ in sorted_items]
    values   = [v for _, v in sorted_items]

    fig, ax = plt.subplots(figsize=(10, 6))
    fig.patch.set_facecolor("#0b0b1a")
    ax.set_facecolor("#0b0b1a")

    # Color gradient based on importance
    colors = plt.cm.plasma(np.linspace(0.3, 0.9, len(features)))[::-1]
    bars = ax.barh(range(len(features)), values, color=colors, edgecolor="none", height=0.7)

    ax.set_yticks(range(len(features)))
    ax.set_yticklabels(features, color="white", fontsize=9)
    ax.set_xlabel("Mean |SHAP Value| / Feature Importance", color="white", fontsize=10)
    ax.set_title("Top Predictive Features — Gene Expression", color="white", fontsize=13, pad=12)
    ax.tick_params(axis="x", colors="white")
    ax.spines[:].set_color("#333355")

    # Value labels
    for bar, val in zip(bars, values):
        ax.text(bar.get_width() + max(values) * 0.01, bar.get_y() + bar.get_height() / 2,
                f"{val:.4f}", va="center", ha="left", color="white", fontsize=8)

    fig.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"[SHAP] Saved bar chart → {out_path}")


def plot_roc_curves(y_test, model_scores: dict, output_dir=None):
    """
    Overlay ROC curves for all models (classical + quantum).

    Args:
        model_scores : {model_name: y_score_array}
    """
    from sklearn.metrics import roc_curve, auc

    out = Path(output_dir) if output_dir else OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(9, 7))
    fig.patch.set_facecolor("#0b0b1a")
    ax.set_facecolor("#0b0b1a")

    palette = [
        "#6c63ff", "#00d4ff", "#00ff94",
        "#ffd700", "#ff8c00", "#ff3366", "#e040fb",
    ]

    for i, (name, scores) in enumerate(model_scores.items()):
        try:
            fpr, tpr, _ = roc_curve(y_test, scores)
            roc_auc = auc(fpr, tpr)
            color = palette[i % len(palette)]
            ax.plot(fpr, tpr, color=color, linewidth=2,
                    label=f"{name}  (AUC = {roc_auc:.3f})")
        except Exception:
            continue

    ax.plot([0, 1], [0, 1], "w--", linewidth=1, alpha=0.4, label="Random Classifier")
    ax.set_xlabel("False Positive Rate", color="white", fontsize=11)
    ax.set_ylabel("True Positive Rate", color="white", fontsize=11)
    ax.set_title("ROC Curve Comparison — Classical vs Quantum Models",
                 color="white", fontsize=13, pad=14)
    ax.tick_params(colors="white")
    ax.spines[:].set_color("#333355")
    ax.grid(alpha=0.1, color="white")
    ax.legend(loc="lower right", framealpha=0.2, labelcolor="white", fontsize=9)

    fig.tight_layout()
    out_path = out / "roc_curves.png"
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"[SHAP] Saved ROC curves → {out_path}")
    return out_path


def plot_confusion_matrix(y_test, y_pred, model_name, output_dir=None):
    from sklearn.metrics import confusion_matrix as cm_fn
    import seaborn as sns

    out = Path(output_dir) if output_dir else OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)

    cm = cm_fn(y_test, y_pred)
    fig, ax = plt.subplots(figsize=(5, 4))
    fig.patch.set_facecolor("#0b0b1a")
    ax.set_facecolor("#0b0b1a")

    try:
        sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=ax,
                    xticklabels=["Healthy/ALL", "AML"],
                    yticklabels=["Healthy/ALL", "AML"],
                    linewidths=0.5, linecolor="#0b0b1a")
    except Exception:
        ax.imshow(cm, cmap="Blues")
        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                ax.text(j, i, str(cm[i, j]), ha="center", va="center", color="black")

    ax.set_title(f"Confusion Matrix — {model_name}", color="white", pad=10)
    ax.set_xlabel("Predicted", color="white")
    ax.set_ylabel("Actual", color="white")
    ax.tick_params(colors="white")

    safe_name = model_name.lower().replace(" ", "_").replace("(", "").replace(")", "")
    out_path = out / f"cm_{safe_name}.png"
    fig.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return out_path


def plot_model_comparison_bar(all_metrics: dict, output_dir=None):
    """grouped bar chart: Accuracy / F1 / AUC for all models."""
    out = Path(output_dir) if output_dir else OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)

    model_names = list(all_metrics.keys())
    accs  = [all_metrics[m].get("accuracy", 0)  for m in model_names]
    f1s   = [all_metrics[m].get("f1", 0)         for m in model_names]
    aucs  = [all_metrics[m].get("roc_auc", 0)    for m in model_names]

    x = np.arange(len(model_names))
    w = 0.25

    fig, ax = plt.subplots(figsize=(14, 6))
    fig.patch.set_facecolor("#0b0b1a")
    ax.set_facecolor("#0b0b1a")

    ax.bar(x - w, accs, w, label="Accuracy", color="#6c63ff", alpha=0.9)
    ax.bar(x,     f1s,  w, label="F1 Score", color="#00d4ff", alpha=0.9)
    ax.bar(x + w, aucs, w, label="ROC-AUC",  color="#00ff94", alpha=0.9)

    ax.set_xticks(x)
    ax.set_xticklabels(model_names, rotation=22, ha="right", color="white", fontsize=9)
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("Score", color="white", fontsize=11)
    ax.set_title("Model Performance Comparison — Classical vs Quantum ML",
                 color="white", fontsize=13, pad=14)
    ax.tick_params(colors="white")
    ax.spines[:].set_color("#333355")
    ax.grid(axis="y", alpha=0.1, color="white")
    ax.legend(framealpha=0.2, labelcolor="white")

    # Value annotations
    for bars in [
        ax.patches[:len(model_names)],
        ax.patches[len(model_names):2*len(model_names)],
        ax.patches[2*len(model_names):],
    ]:
        for bar in bars:
            h = bar.get_height()
            if h > 0.01:
                ax.text(bar.get_x() + bar.get_width() / 2, h + 0.01,
                        f"{h:.2f}", ha="center", va="bottom", color="white", fontsize=7.5)

    fig.tight_layout()
    out_path = out / "model_comparison.png"
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"[viz] Saved model comparison bar → {out_path}")
    return out_path
