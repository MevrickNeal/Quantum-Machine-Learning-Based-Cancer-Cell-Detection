"""
PennyLane Quantum Neural Network for blood cancer classification.

Architecture:
  - AngleEmbedding (Rx gates) for feature encoding
  - StronglyEntanglingLayers ansatz (3 layers)
  - Optimized with Adam + scipy minimize
  - Framework: PennyLane (default.qubit statevector simulator)
"""

import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix,
)


def _metrics(y_true, y_pred, y_score=None):
    if y_score is None:
        y_score = y_pred.astype(float)
    try:
        auc = float(roc_auc_score(y_true, y_score))
    except Exception:
        auc = 0.5
    return {
        "accuracy":  float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall":    float(recall_score(y_true, y_pred, zero_division=0)),
        "f1":        float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc":   auc,
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
    }


def run_pennylane_qnn(X_train, X_test, y_train, y_test,
                      n_qubits: int = 4,
                      n_layers: int = 3,
                      n_epochs: int = 60,
                      batch_size: int = 16,
                      lr: float = 0.02):
    """
    Quantum Neural Network via PennyLane.

    Encoding : AngleEmbedding (Rx gates, rotations encoding)
    Ansatz   : StronglyEntanglingLayers (CNOT ring + single-qubit rotations)
    Output   : <Z> expectation on qubit 0  →  sigmoid → probability
    Loss     : Binary Cross-Entropy
    Optimizer: Adam (PennyLane)
    """
    try:
        import pennylane as qml
        from pennylane import numpy as pnp
    except ImportError as e:
        return {"status": "skipped", "reason": f"PennyLane import failed: {e}"}

    print(f"[QML/PennyLane-QNN] n_qubits={n_qubits}, layers={n_layers}, epochs={n_epochs}")

    n = min(n_qubits, X_train.shape[1])
    X_tr = X_train[:, :n].astype(np.float64)
    X_te = X_test[:, :n].astype(np.float64)
    y_tr = y_train.astype(np.float64)
    y_te = y_test.astype(np.float64)

    dev = qml.device("default.qubit", wires=n)

    @qml.qnode(dev, interface="autograd")
    def circuit(weights, x):
        qml.AngleEmbedding(x, wires=range(n), rotation="X")
        qml.StronglyEntanglingLayers(weights, wires=range(n))
        return qml.expval(qml.PauliZ(0))

    def sigmoid(z):
        return 1.0 / (1.0 + np.exp(-z))

    def predict_proba(weights, X):
        probs = []
        for x in X:
            z = circuit(weights, pnp.array(x, requires_grad=False))
            probs.append(float(sigmoid(float(z))))
        return np.array(probs)

    def bce_loss(weights, X_batch, y_batch):
        eps = 1e-7
        loss = 0.0
        for x, yi in zip(X_batch, y_batch):
            z = circuit(weights, pnp.array(x, requires_grad=False))
            p = sigmoid(float(z))
            p = np.clip(p, eps, 1 - eps)
            loss += -(yi * np.log(p) + (1 - yi) * np.log(1 - p))
        return loss / len(y_batch)

    # Initialize weights
    weight_shape = qml.StronglyEntanglingLayers.shape(n_layers=n_layers, n_wires=n)
    weights = pnp.random.normal(0, np.pi / 4, weight_shape, requires_grad=True)

    opt = qml.AdamOptimizer(stepsize=lr)
    rng = np.random.RandomState(42)

    history = []
    for epoch in range(n_epochs):
        # Mini-batch
        idx = rng.choice(len(X_tr), size=min(batch_size, len(X_tr)), replace=False)
        X_b = X_tr[idx]
        y_b = y_tr[idx]

        def cost(w):
            return bce_loss(w, X_b, y_b)

        weights, loss_val = opt.step_and_cost(cost, weights)
        history.append(float(loss_val))

        if (epoch + 1) % 20 == 0:
            train_proba = predict_proba(weights, X_tr)
            train_preds = (train_proba >= 0.5).astype(int)
            train_acc = float(accuracy_score(y_train.astype(int), train_preds))
            print(f"[QML/PennyLane-QNN]  epoch {epoch+1:>3}/{n_epochs}"
                  f"  loss={loss_val:.4f}  train_acc={train_acc:.4f}")

    # Evaluate
    probas = predict_proba(weights, X_te)
    preds  = (probas >= 0.5).astype(int)
    m = _metrics(y_test, preds, probas)
    print(f"[QML/PennyLane-QNN] FINAL Acc={m['accuracy']:.4f}  F1={m['f1']:.4f}  AUC={m['roc_auc']:.4f}")

    return {
        "status":   "ok",
        "metrics":  m,
        "n_qubits": n,
        "n_layers": n_layers,
        "n_epochs": n_epochs,
        "loss_history": history,
        "circuit":  f"AngleEmbedding(Rx) + StronglyEntanglingLayers({n_layers} layers)",
        "_scores":  probas.tolist(),
    }
