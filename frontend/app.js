/**
 * Quantum Blood Cancer Detection — Frontend Application
 *
 * Connects to FastAPI backend on port 8888.
 * Falls back to static data/metrics.json when API is offline.
 */

const API = "http://127.0.0.1:8888";
let apiOnline = false;
let metricsData = null;
let clinicalMeta = null;
let currentRiskResult = null;

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  initParticleCanvas();
  initScrollAnimations();
  await checkApiHealth();
  await Promise.all([
    loadMetrics(),
    loadClinicalMeta(),
    loadShapData(),
  ]);
  setupFormEvents();
});

// ─── API Health ──────────────────────────────────────────────────────────────

async function checkApiHealth() {
  const dot  = document.getElementById("api-dot");
  const text = document.getElementById("api-status-text");
  try {
    const h = await apiFetch("/health");
    apiOnline = true;
    dot.className  = "api-dot online";
    text.textContent = "API Online" + (h.clinical_model_loaded ? " · Model Ready" : " · Run train.py");
  } catch {
    apiOnline = false;
    dot.className  = "api-dot offline";
    text.textContent = "API Offline — using static data";
  }
}

// ─── Metrics / Comparison ────────────────────────────────────────────────────

async function loadMetrics() {
  let data = null;

  if (apiOnline) {
    try { data = await apiFetch("/metrics"); } catch {}
  }
  if (!data) {
    try {
      const res = await fetch("./data/metrics.json");
      data = await res.json();
    } catch { return; }
  }

  metricsData = data;
  populateKpis(data);
  populateComparisonTable(data);
  populateQuantumMetrics(data);
  showComparisonContent();
}

function populateKpis(data) {
  const info = data.dataset_info || {};
  animateCounter("#kpi-samples .kpi-value",  info.n_samples           || 72);
  animateCounter("#kpi-genes .kpi-value",     info.n_features_raw      || 7129);
  animateCounter("#kpi-models .kpi-value",    Object.keys(data.all_model_metrics || {}).length || 8);
  animateCounter("#kpi-qubits .kpi-value",    data.n_qubits            || 4);

  // Best AUC
  const allM = data.all_model_metrics || {};
  let bestAuc = 0;
  Object.values(allM).forEach(m => { if ((m.roc_auc || 0) > bestAuc) bestAuc = m.roc_auc; });
  const aucEl = document.getElementById("kpi-best-auc");
  if (aucEl) { aucEl.textContent = bestAuc > 0 ? bestAuc.toFixed(3) : "—"; }
}

function showComparisonContent() {
  const loading = document.getElementById("comparison-loading");
  const content = document.getElementById("comparison-content");
  if (loading) loading.hidden = true;
  if (content) content.hidden = false;
}

function populateComparisonTable(data) {
  const tbody = document.getElementById("metrics-tbody");
  if (!tbody) return;

  const classical = data.models?.classical || {};
  const quantumQ  = data.models?.quantum_qiskit || {};
  const quantumPL = data.models?.quantum_pennylane;

  // Find best per-column values
  const allMets = data.all_model_metrics || {};
  const bestVals = {};
  ["accuracy","precision","recall","f1","roc_auc"].forEach(k => {
    let best = 0;
    Object.values(allMets).forEach(m => { if ((m[k]||0) > best) best = m[k]; });
    bestVals[k] = best;
  });

  const rows = [];

  Object.entries(classical).forEach(([name, m]) => {
    rows.push({ name, m, type: "Classical" });
  });
  Object.entries(quantumQ).forEach(([name, res]) => {
    if (res?.status === "ok" && res.metrics)
      rows.push({ name, m: res.metrics, type: "Quantum (Qiskit)" });
  });
  if (quantumPL?.status === "ok" && quantumPL.metrics)
    rows.push({ name: "PennyLane QNN", m: quantumPL.metrics, type: "Quantum (PennyLane)" });

  tbody.innerHTML = rows.map(({ name, m, type }) => {
    const typeClass = type.startsWith("Quantum") ? "model-type-quantum" : "model-type-classical";
    const fmt = (v, k) => {
      const s = typeof v === "number" ? v.toFixed(4) : "—";
      const isBest = typeof v === "number" && Math.abs(v - bestVals[k]) < 0.0001;
      return isBest ? `<span class="best-cell">${s} ✓</span>` : s;
    };
    return `<tr>
      <td><strong>${name}</strong></td>
      <td><span class="${typeClass}">${type}</span></td>
      <td>${fmt(m.accuracy,  "accuracy")}</td>
      <td>${fmt(m.precision, "precision")}</td>
      <td>${fmt(m.recall,    "recall")}</td>
      <td>${fmt(m.f1,        "f1")}</td>
      <td>${fmt(m.roc_auc,   "roc_auc")}</td>
    </tr>`;
  }).join("");
}

function populateQuantumMetrics(data) {
  const quantumQ  = data.models?.quantum_qiskit || {};
  const quantumPL = data.models?.quantum_pennylane;

  function setMetrics(id, m) {
    const el = document.getElementById(id);
    if (!el || !m) return;
    el.innerHTML = [
      `<span class="im-badge">Acc <span>${(m.accuracy||0).toFixed(3)}</span></span>`,
      `<span class="im-badge">F1 <span>${(m.f1||0).toFixed(3)}</span></span>`,
      `<span class="im-badge">AUC <span>${(m.roc_auc||0).toFixed(3)}</span></span>`,
    ].join("");
  }

  const vqc  = quantumQ["VQC (Qiskit)"];
  const qsvm = quantumQ["QSVM (Quantum Kernel)"];

  setMetrics("vqc-metrics",  vqc?.status  === "ok" ? vqc.metrics  : null);
  setMetrics("qsvm-metrics", qsvm?.status === "ok" ? qsvm.metrics : null);
  setMetrics("pl-metrics",   quantumPL?.status === "ok" ? quantumPL.metrics : null);

  // Confusion matrix images
  const cmGrid = document.getElementById("cm-grid");
  if (!cmGrid) return;
  const cmNames = Object.entries(quantumQ)
    .filter(([, r]) => r?.status === "ok")
    .map(([n]) => n);
  if (data.best_classical?.name) cmNames.unshift(data.best_classical.name);

  cmGrid.innerHTML = cmNames.map(name => {
    const safe = name.toLowerCase().replace(/[\s()]/g, n => n === " " ? "_" : "");
    const src  = apiOnline
      ? `${API}/assets/cm_${safe}.png`
      : `./assets/cm_${safe}.png`;
    return `<div class="glass-card cm-card">
      <h4>${name}</h4>
      <img src="${src}" alt="Confusion matrix ${name}" class="chart-img"
           onerror="this.style.display='none'" />
    </div>`;
  }).join("");
}

// ─── SHAP ────────────────────────────────────────────────────────────────────

async function loadShapData() {
  let shap = null;
  if (apiOnline) {
    try { shap = await apiFetch("/shap"); } catch {}
  }
  if (!shap) {
    try {
      const res = await fetch("./data/shap_importances.json");
      shap = await res.json();
    } catch { return; }
  }

  const imps = shap.shap_importances || {};
  const sorted = Object.entries(imps).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxVal = sorted[0]?.[1] || 1;

  const container = document.getElementById("shap-top-list");
  if (!container) return;
  container.innerHTML = sorted.map(([gene, val]) =>
    `<div class="shap-gene-row">
      <span class="shap-gene-name">${gene}</span>
      <div class="shap-bar-wrap">
        <div class="shap-bar-fill" style="width:${(val/maxVal*100).toFixed(1)}%"></div>
      </div>
      <span class="shap-val">${val.toFixed(4)}</span>
    </div>`
  ).join("");
}

// ─── Clinical Meta + Form ─────────────────────────────────────────────────────

async function loadClinicalMeta() {
  if (apiOnline) {
    try { clinicalMeta = await apiFetch("/clinical/meta"); } catch {}
  }
  if (!clinicalMeta) {
    // Hard-coded defaults matching clinical_model.py
    clinicalMeta = {
      feature_names: ["WBC (K/µL)","RBC (M/µL)","Hemoglobin (g/dL)","Hematocrit (%)","MCV (fL)","MCH (pg)","MCHC (g/dL)","Platelets (K/µL)","Neutrophils (%)","Lymphocytes (%)","Monocytes (%)","Eosinophils (%)","Basophils (%)","Blast Cells (%)"],
      feature_ranges: {"WBC (K/µL)":[0.1,500],"RBC (M/µL)":[1,7],"Hemoglobin (g/dL)":[3,22],"Hematocrit (%)":[10,62],"MCV (fL)":[50,125],"MCH (pg)":[15,42],"MCHC (g/dL)":[20,40],"Platelets (K/µL)":[5,1000],"Neutrophils (%)":[0,95],"Lymphocytes (%)":[0,98],"Monocytes (%)":[0,30],"Eosinophils (%)":[0,20],"Basophils (%)":[0,5],"Blast Cells (%)":[0,99]},
      normal_defaults: {"WBC (K/µL)":7.5,"RBC (M/µL)":4.8,"Hemoglobin (g/dL)":14,"Hematocrit (%)":42,"MCV (fL)":90,"MCH (pg)":30,"MCHC (g/dL)":34,"Platelets (K/µL)":260,"Neutrophils (%)":58,"Lymphocytes (%)":28,"Monocytes (%)":6,"Eosinophils (%)":3,"Basophils (%)":0.8,"Blast Cells (%)":0.3},
      reference_ranges: {"WBC (K/µL)":{"min":4.5,"max":11},"RBC (M/µL)":{"min":3.8,"max":6},"Hemoglobin (g/dL)":{"min":11.5,"max":17.5},"Hematocrit (%)":{"min":35,"max":52},"MCV (fL)":{"min":80,"max":100},"MCH (pg)":{"min":27,"max":33},"MCHC (g/dL)":{"min":31.5,"max":36},"Platelets (K/µL)":{"min":150,"max":400},"Neutrophils (%)":{"min":40,"max":75},"Lymphocytes (%)":{"min":20,"max":45},"Monocytes (%)":{"min":2,"max":10},"Eosinophils (%)":{"min":1,"max":6},"Basophils (%)":{"min":0,"max":1},"Blast Cells (%)":{"min":0,"max":2}},
    };
  }
  buildScreeningForm();
}

const FIELD_KEYS = {
  "WBC (K/µL)":        "wbc",
  "RBC (M/µL)":        "rbc",
  "Hemoglobin (g/dL)": "hemoglobin",
  "Hematocrit (%)":    "hematocrit",
  "MCV (fL)":          "mcv",
  "MCH (pg)":          "mch",
  "MCHC (g/dL)":       "mchc",
  "Platelets (K/µL)":  "platelets",
  "Neutrophils (%)":   "neutrophils",
  "Lymphocytes (%)":   "lymphocytes",
  "Monocytes (%)":     "monocytes",
  "Eosinophils (%)":   "eosinophils",
  "Basophils (%)":     "basophils",
  "Blast Cells (%)":   "blast_cells",
};

function buildScreeningForm() {
  const form = document.getElementById("screening-form");
  if (!form || !clinicalMeta) return;

  const features = clinicalMeta.feature_names || [];
  const ranges   = clinicalMeta.feature_ranges || {};
  const defaults = clinicalMeta.normal_defaults || {};
  const refs     = clinicalMeta.reference_ranges || {};

  form.innerHTML = `<div class="cbc-grid">${features.map(feat => {
    const [lo, hi] = ranges[feat] || [0, 100];
    const def = defaults[feat] ?? ((lo + hi) / 2);
    const id  = "cbc_" + feat.replace(/[^a-z0-9]/gi, "_");
    const ref = refs[feat] || {};
    const refStr = ref.min !== undefined
      ? `Normal: ${ref.min}–${ref.max}`
      : "";
    return `<div class="cbc-row" title="${refStr}">
      <label for="${id}">${feat} <span style="color:var(--text-muted);font-weight:400">${refStr}</span></label>
      <div class="cbc-input-inline">
        <input type="range" id="${id}_range"
               min="${lo}" max="${hi}" step="${stepFor(lo, hi)}"
               value="${def}"
               data-feature="${feat}"
               oninput="syncNum(this, '${id}_num')" />
        <span class="num-display" id="${id}_num">${def}</span>
        <span class="unit-label">${feat.match(/\(([^)]+)\)/)?.[1] || ""}</span>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function stepFor(lo, hi) {
  const range = hi - lo;
  if (range <= 5) return 0.1;
  if (range <= 50) return 0.5;
  return 1;
}

function syncNum(rangeEl, numId) {
  const numEl = document.getElementById(numId);
  if (numEl) numEl.textContent = parseFloat(rangeEl.value).toFixed(1);
}

function readFormValues() {
  const result = {};
  const form = document.getElementById("screening-form");
  if (!form) return result;
  form.querySelectorAll('input[type="range"]').forEach(el => {
    const feat = el.dataset.feature;
    const key  = FIELD_KEYS[feat];
    if (key) result[key] = parseFloat(el.value);
  });
  return result;
}

function resetFormToDefaults() {
  if (!clinicalMeta) return;
  const defaults = clinicalMeta.normal_defaults || {};
  const form = document.getElementById("screening-form");
  if (!form) return;
  form.querySelectorAll('input[type="range"]').forEach(el => {
    const feat = el.dataset.feature;
    if (feat && defaults[feat] !== undefined) {
      el.value = defaults[feat];
      const numId = el.id.replace("_range", "_num");
      const numEl = document.getElementById(numId);
      if (numEl) numEl.textContent = parseFloat(defaults[feat]).toFixed(1);
    }
  });
}

function loadHighRiskDemo() {
  const highRisk = {
    "WBC (K/µL)":        120.0,
    "RBC (M/µL)":        2.5,
    "Hemoglobin (g/dL)": 7.0,
    "Hematocrit (%)":    21.0,
    "MCV (fL)":          85.0,
    "MCH (pg)":          28.0,
    "MCHC (g/dL)":       33.0,
    "Platelets (K/µL)":  35.0,
    "Neutrophils (%)":   8.0,
    "Lymphocytes (%)":   78.0,
    "Monocytes (%)":     9.0,
    "Eosinophils (%)":   1.5,
    "Basophils (%)":     1.2,
    "Blast Cells (%)":   62.0,
  };
  const form = document.getElementById("screening-form");
  if (!form) return;
  form.querySelectorAll('input[type="range"]').forEach(el => {
    const feat = el.dataset.feature;
    if (feat && highRisk[feat] !== undefined) {
      const val = Math.min(parseFloat(el.max), Math.max(parseFloat(el.min), highRisk[feat]));
      el.value = val;
      const numId = el.id.replace("_range", "_num");
      const numEl = document.getElementById(numId);
      if (numEl) numEl.textContent = val.toFixed(1);
    }
  });
}

function setupFormEvents() {
  document.getElementById("btn-analyze")?.addEventListener("click", runAnalysis);
  document.getElementById("btn-reset")?.addEventListener("click",   resetFormToDefaults);
  document.getElementById("btn-demo-high")?.addEventListener("click", loadHighRiskDemo);
}

// ─── Analysis ────────────────────────────────────────────────────────────────

async function runAnalysis() {
  const placeholder = document.getElementById("risk-placeholder");
  const resultEl    = document.getElementById("risk-result");
  const loadingEl   = document.getElementById("risk-loading");

  if (placeholder) placeholder.hidden = true;
  if (resultEl)    resultEl.hidden    = true;
  if (loadingEl)   loadingEl.hidden   = false;

  const values = readFormValues();

  let result = null;

  if (apiOnline) {
    try {
      result = await apiFetch("/clinical/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch (e) {
      console.warn("API predict failed:", e);
    }
  }

  if (!result) result = clientSideRisk(values);

  currentRiskResult = result;

  if (loadingEl) loadingEl.hidden = true;
  displayRiskResult(result);
}

function clientSideRisk(values) {
  // Lightweight heuristic fallback (no backend needed)
  const blast  = values.blast_cells || 0;
  const wbc    = values.wbc         || 7.5;
  const lymph  = values.lymphocytes || 28;
  const hgb    = values.hemoglobin  || 14;
  const plt    = values.platelets   || 260;

  let score = 0;
  if (blast > 20)  score += 0.4;
  else if (blast > 5) score += 0.2;
  if (wbc > 50)    score += 0.2;
  else if (wbc > 15) score += 0.1;
  if (lymph > 70)  score += 0.15;
  if (hgb < 9)     score += 0.1;
  if (plt < 80)    score += 0.1;
  score = Math.min(score, 0.99);

  const refs = clinicalMeta?.reference_ranges || {};
  const factors = Object.entries(values).map(([key, val]) => {
    const feat = Object.entries(FIELD_KEYS).find(([, k]) => k === key)?.[0] || key;
    const ref  = refs[feat] || {};
    let concern = "NORMAL";
    if (ref.min !== undefined) {
      if (val < ref.min) concern = "LOW";
      else if (val > ref.max) concern = "HIGH";
    }
    return { feature: feat, value: val, concern };
  }).sort((a, b) => {
    const o = { HIGH: 0, LOW: 1, NORMAL: 2 };
    return (o[a.concern] || 2) - (o[b.concern] || 2);
  });

  let level, label, color;
  if      (score < 0.25) { level = "LOW";      label = "Low Risk — Normal Pattern Detected";              color = "#00ff94"; }
  else if (score < 0.55) { level = "MODERATE"; label = "Moderate Risk — Further Evaluation Recommended"; color = "#ffd700"; }
  else if (score < 0.80) { level = "HIGH";     label = "High Risk — Urgent Medical Consultation";         color = "#ff8c00"; }
  else                   { level = "CRITICAL"; label = "Critical Risk — Immediate Hematologist Referral"; color = "#ff3366"; }

  return { risk_score: score, risk_level: level, risk_label: label, risk_color: color, contributing_factors: factors };
}

function displayRiskResult(result) {
  const resultEl = document.getElementById("risk-result");
  if (!resultEl) return;
  resultEl.hidden = false;

  const score   = result.risk_score  || 0;
  const level   = result.risk_level  || "LOW";
  const label   = result.risk_label  || "";
  const color   = result.risk_color  || "#00ff94";
  const factors = result.contributing_factors || [];

  // Gauge
  animateGauge(score, color);

  const badge = document.getElementById("risk-level-badge");
  if (badge) {
    badge.textContent = level;
    badge.style.background = color + "22";
    badge.style.color      = color;
    badge.style.border     = `1px solid ${color}60`;
  }
  const labelEl = document.getElementById("risk-label-text");
  if (labelEl) labelEl.textContent = label;

  // Factors
  const factorsList = document.getElementById("factors-list");
  if (factorsList) {
    factorsList.innerHTML = factors.slice(0, 12).map(f =>
      `<div class="factor-row">
        <span class="factor-name">${f.feature}</span>
        <span class="factor-value">${typeof f.value === "number" ? f.value.toFixed(1) : f.value}</span>
        <span class="factor-badge ${f.concern}">${f.concern}</span>
      </div>`
    ).join("");
  }
}

function animateGauge(score, color) {
  const arc    = document.getElementById("gauge-arc");
  const needle = document.getElementById("gauge-needle");
  const pct    = document.getElementById("gauge-percent");

  if (!arc) return;

  const total = 251; // arc length for semicircle
  const fill  = score * total;

  arc.style.stroke        = color;
  arc.style.transition    = "stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)";
  arc.style.strokeDasharray = `${fill} ${total}`;

  // Needle position on arc
  // Arc from left (20,100) to right (180,100) — angle goes from 180° to 0°
  const angle = Math.PI - score * Math.PI; // radians
  const cx = 100 + 80 * Math.cos(angle);
  const cy = 100 - 80 * Math.sin(angle);
  if (needle) { needle.setAttribute("cx", cx.toFixed(1)); needle.setAttribute("cy", cy.toFixed(1)); needle.style.fill = color; }

  // Animate counter
  const start = Date.now();
  const dur   = 1200;
  function tick() {
    const t  = Math.min((Date.now() - start) / dur, 1);
    const e  = 1 - Math.pow(1 - t, 3); // ease out cubic
    const v  = Math.round(e * score * 100);
    if (pct) pct.textContent = v + "%";
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Animated counters ───────────────────────────────────────────────────────

function animateCounter(selector, target) {
  const el = document.querySelector(selector);
  if (!el) return;
  const isFloat = !Number.isInteger(target);
  const start   = Date.now();
  const dur     = 1600;
  function tick() {
    const t = Math.min((Date.now() - start) / dur, 1);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = isFloat
      ? (e * target).toFixed(3)
      : Math.round(e * target).toLocaleString();
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Scroll animations ───────────────────────────────────────────────────────

function initScrollAnimations() {
  document.querySelectorAll(
    ".glass-card, .kpi-card, .pipe-step, .quantum-card, .section-header"
  ).forEach(el => el.classList.add("animate-in"));

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
  }, { threshold: 0.1 });

  document.querySelectorAll(".animate-in").forEach(el => observer.observe(el));
}

// ─── Quantum particle canvas ──────────────────────────────────────────────────

function initParticleCanvas() {
  const canvas = document.getElementById("quantum-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const COLORS = ["#6c63ff", "#00d4ff", "#00ff94", "#ffd700", "#e040fb"];
  const NUM_PARTICLES = 70;
  const NUM_CONNECTIONS = 80;

  const particles = Array.from({ length: NUM_PARTICLES }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * canvas.height,
    vx:   (Math.random() - 0.5) * 0.4,
    vy:   (Math.random() - 0.5) * 0.4,
    r:    Math.random() * 2 + 1,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    phase: Math.random() * Math.PI * 2,
  }));

  function frame(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update positions
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    });

    // Draw connections (closest pairs)
    for (let i = 0; i < NUM_PARTICLES; i++) {
      for (let j = i + 1; j < NUM_PARTICLES && j < i + 8; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 140) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(108,99,255,${((1 - d / 140) * 0.15).toFixed(3)})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }

    // Draw particles
    particles.forEach((p, i) => {
      const pulse    = Math.sin(t * 0.002 + p.phase) * 0.5 + 0.5;
      const alpha    = (0.4 + pulse * 0.5).toFixed(2);
      const grd      = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
      grd.addColorStop(0, p.color);
      grd.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${hexToRgb(p.color)},${alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}` : "108,99,255";
}
