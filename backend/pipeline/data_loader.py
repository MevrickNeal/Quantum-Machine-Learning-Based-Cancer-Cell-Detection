"""
Data loading and preprocessing for the QML Blood Cancer Detection pipeline.

Dataset: OpenML 'leukemia' (7129 gene expression features, 72 samples)
         Binary: ALL (Acute Lymphoblastic Leukemia) vs AML (Acute Myeloid Leukemia)
"""

import json
import numpy as np
from pathlib import Path
from sklearn.datasets import fetch_openml
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.preprocessing import MinMaxScaler, QuantileTransformer, StandardScaler
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.decomposition import PCA

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "outputs"


def load_leukemia_dataset():
    """Load OpenML leukemia gene expression dataset.

    Returns:
        X : (72, 7129) float64 gene expression matrix
        y : (72,) int  — 0=ALL, 1=AML
        class_names : list[str]
        feature_names : list[str]
    """
    print("[data] Fetching OpenML leukemia dataset ...")
    data = fetch_openml(name="leukemia", version=1, as_frame=False, parser="auto")
    X = data.data.astype(np.float64)
    y_raw = np.array(data.target)
    classes = sorted(np.unique(y_raw))
    y = (y_raw == classes[1]).astype(int)

    feature_names = (
        list(data.feature_names)
        if hasattr(data, "feature_names") and data.feature_names is not None
        else [f"gene_{i}" for i in range(X.shape[1])]
    )
    print(f"[data] Shape: {X.shape}  Classes: {classes}")
    return X, y, list(classes), feature_names


def preprocess_for_classical(X, y, n_features=64, random_state=42):
    """Feature selection + scaling pipeline for classical models."""
    qt = QuantileTransformer(output_distribution="normal", random_state=random_state)
    X_norm = qt.fit_transform(X)

    selector = SelectKBest(score_func=f_classif, k=min(n_features, X.shape[1]))
    X_sel = selector.fit_transform(X_norm, y)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_sel)

    selected_idx = selector.get_support(indices=True)
    return X_scaled, selector, scaler, qt, selected_idx


def preprocess_for_quantum(X, y, n_qubits=4, random_state=42,
                            selector=None, scaler_qt=None):
    """Reduce features to n_qubits dimensions, scaled to [0, 2π] for angle encoding."""
    # Reuse the already-computed quantile normalization if provided
    if scaler_qt is not None:
        X_norm = scaler_qt.transform(X)
    else:
        qt = QuantileTransformer(output_distribution="normal", random_state=random_state)
        X_norm = qt.fit_transform(X)

    # Select best features
    if selector is not None:
        X_sel = selector.transform(X_norm)
    else:
        sel = SelectKBest(score_func=f_classif, k=min(16, X.shape[1]))
        X_sel = sel.fit_transform(X_norm, y)

    # PCA to n_qubits dimensions
    n_components = min(n_qubits, X_sel.shape[1], X_sel.shape[0] - 1)
    pca = PCA(n_components=n_components, random_state=random_state)
    X_pca = pca.fit_transform(X_sel)

    # Scale to [0, 2π] for angle embedding
    angle_scaler = MinMaxScaler(feature_range=(0, 2 * np.pi))
    X_angles = angle_scaler.fit_transform(X_pca)

    explained = float(np.sum(pca.explained_variance_ratio_))
    print(f"[data] Quantum: {n_qubits} qubits, PCA explains {explained:.1%} variance")
    return X_angles, pca, angle_scaler, explained


def get_train_test_split(X, y, test_size=0.2, random_state=42):
    return train_test_split(X, y, test_size=test_size, stratify=y, random_state=random_state)


def save_dataset_info(X, y, class_names, feature_names, selected_idx, output_dir=None):
    out = output_dir or OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    info = {
        "dataset": "OpenML leukemia (ALL vs AML)",
        "n_samples": int(X.shape[0]),
        "n_features_raw": int(len(feature_names)),
        "classes": class_names,
        "class_distribution": {
            class_names[0]: int((y == 0).sum()),
            class_names[1]: int((y == 1).sum()),
        },
        "top_selected_genes": [feature_names[i] for i in selected_idx[:10]],
    }
    with open(out / "dataset_info.json", "w") as f:
        json.dump(info, f, indent=2)
    return info
