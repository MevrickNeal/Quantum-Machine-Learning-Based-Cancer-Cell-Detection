"""
Classical baseline models for the QML comparison study.

Models:
  - Logistic Regression (L2)
  - SVM with RBF kernel (probability calibrated)
  - Random Forest (300 trees)
  - Gradient Boosting (XGB-style)
  - MLP Neural Network
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix,
)


def compute_metrics(y_true, y_pred, y_proba):
    return {
        "accuracy":  float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall":    float(recall_score(y_true, y_pred, zero_division=0)),
        "f1":        float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc":   float(roc_auc_score(y_true, y_proba)),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
    }


def run_classical_models(X_train, X_test, y_train, y_test):
    """
    Train and evaluate all classical baseline models.

    Returns:
        results : dict[str, metrics_dict]
        trained  : dict[str, fitted_model]
    """
    models = {
        "Logistic Regression": Pipeline([
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(C=1.0, max_iter=3000, random_state=42)),
        ]),
        "SVM (RBF)": Pipeline([
            ("scaler", StandardScaler()),
            ("model", SVC(kernel="rbf", C=10.0, gamma="scale",
                          probability=True, random_state=42)),
        ]),
        "Random Forest": RandomForestClassifier(
            n_estimators=300, max_depth=None,
            min_samples_split=2, random_state=42, n_jobs=-1,
        ),
        "Gradient Boosting": GradientBoostingClassifier(
            n_estimators=200, max_depth=3, learning_rate=0.05,
            subsample=0.8, random_state=42,
        ),
        "MLP (Neural Net)": Pipeline([
            ("scaler", StandardScaler()),
            ("model", MLPClassifier(
                hidden_layer_sizes=(128, 64, 32),
                activation="relu", solver="adam",
                max_iter=500, early_stopping=True,
                random_state=42,
            )),
        ]),
    }

    results, trained = {}, {}
    for name, model in models.items():
        print(f"[classical] Training {name} ...")
        model.fit(X_train, y_train)
        preds  = model.predict(X_test)
        probas = model.predict_proba(X_test)[:, 1]
        m = compute_metrics(y_test, preds, probas)
        results[name] = m
        trained[name] = model
        print(f"[classical]   Acc={m['accuracy']:.4f}  F1={m['f1']:.4f}  AUC={m['roc_auc']:.4f}")

    return results, trained


def get_best_classical(results: dict) -> tuple:
    """Return (name, metrics) for the model with highest ROC-AUC."""
    best = max(results.items(), key=lambda kv: kv[1]["roc_auc"])
    return best
