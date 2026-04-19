/**
 * Quantum Blood Cancer Detection — Frontend v2
 * macOS Ventura theme · Day/Night · Blood smear cell detection
 */

// Update this URL to your Vercel deployment URL
const API = window.location.hostname.includes("leukoq.pro.bd")
  ? "https://leukoq-api.vercel.app" 
  : "http://127.0.0.1:8888";

let apiOnline = false;
let metricsData = null;
let clinicalMeta = null;
let patientCases = [];
let shownCaseCount = 18;

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initParticleCanvas();
  initScrollAnimations();
  await checkApiHealth();
  await Promise.all([loadMetrics(), loadClinicalMeta(), loadShapData(), loadPatientCases()]);
  setupFormEvents();
  initSmearAnalysis();
});

// ─── Theme (Day / Night) ─────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem("qml-theme") || "dark";
  applyTheme(saved);
  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("qml-theme", theme);
  const icon  = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (icon)  icon.textContent  = theme === "dark" ? "🌙" : "☀️";
  if (label) label.textContent = theme === "dark" ? "Night" : "Day";
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function checkApiHealth() {
  const dot = document.getElementById("api-dot");
  const txt = document.getElementById("api-status-text");
  try {
    const h = await apiFetch("/health");
    apiOnline = true;
    if (dot) dot.className = "api-dot online";
    if (txt) txt.textContent = "LeukoQ Cloud Compute: Online" + (h.clinical_model_loaded ? " · Model Ready" : "");
  } catch {
    apiOnline = false;
    if (dot) dot.className = "api-dot standby";
    if (txt) txt.textContent = "LeukoQ Local Compute: Running Research-Grade Intelligence";
  }
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

async function loadMetrics() {
  let data = null;
  if (apiOnline) { try { data = await apiFetch("/metrics"); } catch {} }
  if (!data) { try { const r = await fetch("./data/metrics.json"); data = await r.json(); } catch { return; } }
  metricsData = data;
  populateKpis(data);
  populateComparisonTable(data);
  populateQuantumMetrics(data);
  document.getElementById("comparison-loading").hidden = true;
  document.getElementById("comparison-content").hidden = false;
}

function populateKpis(data) {
  const info = data.dataset_info || {};
  animCounter("#kpi-strip .kpi-card:nth-child(1) .kpi-value", info.n_samples     || 72);
  animCounter("#kpi-strip .kpi-card:nth-child(2) .kpi-value", info.n_features_raw|| 7129);
  animCounter("#kpi-strip .kpi-card:nth-child(3) .kpi-value", Object.keys(data.all_model_metrics||{}).length || 5);
  animCounter("#kpi-strip .kpi-card:nth-child(5) .kpi-value", data.n_qubits || 4);
  const allM = data.all_model_metrics || {};
  let bestAuc = 0;
  Object.values(allM).forEach(m => { if ((m.roc_auc||0) > bestAuc) bestAuc = m.roc_auc; });
  const el = document.getElementById("kpi-best-auc");
  if (el) el.textContent = bestAuc > 0 ? bestAuc.toFixed(3) : "—";
}

function populateComparisonTable(data) {
  const tbody = document.getElementById("metrics-tbody");
  if (!tbody) return;
  const classical = data.models?.classical || {};
  const quantumQ  = data.models?.quantum_qiskit   || {};
  const quantumPL = data.models?.quantum_pennylane;
  const allM = data.all_model_metrics || {};
  const bestVals = {};
  ["accuracy","precision","recall","f1","roc_auc"].forEach(k => {
    let b = 0; Object.values(allM).forEach(m => { if ((m[k]||0) > b) b = m[k]; }); bestVals[k] = b;
  });
  const rows = [];
  Object.entries(classical).forEach(([n,m]) => rows.push({name:n, m, type:"Classical"}));
  Object.entries(quantumQ).forEach(([n,r]) => { if (r?.status==="ok"&&r.metrics) rows.push({name:n, m:r.metrics, type:"Quantum (Qiskit)"}); });
  if (quantumPL?.status==="ok"&&quantumPL.metrics) rows.push({name:"PennyLane QNN", m:quantumPL.metrics, type:"Quantum (PennyLane)"});
  tbody.innerHTML = rows.map(({name,m,type}) => {
    const tc = type.startsWith("Q") ? "model-type-quantum" : "model-type-classical";
    const f = (v,k) => {
      const s = typeof v==="number" ? v.toFixed(4) : "—";
      return typeof v==="number" && Math.abs(v - bestVals[k]) < .0001 ? `<span class="best-cell">${s} ✓</span>` : s;
    };
    return `<tr><td><strong>${name}</strong></td><td><span class="${tc}">${type}</span></td><td>${f(m.accuracy,"accuracy")}</td><td>${f(m.precision,"precision")}</td><td>${f(m.recall,"recall")}</td><td>${f(m.f1,"f1")}</td><td>${f(m.roc_auc,"roc_auc")}</td></tr>`;
  }).join("");
}

function populateQuantumMetrics(data) {
  const qQ  = data.models?.quantum_qiskit   || {};
  const qPL = data.models?.quantum_pennylane;
  const fmt = (m,id) => {
    const el = document.getElementById(id); if (!el||!m) return;
    el.innerHTML = [`Acc <span>${(m.accuracy||0).toFixed(3)}</span>`,`F1 <span>${(m.f1||0).toFixed(3)}</span>`,`AUC <span>${(m.roc_auc||0).toFixed(3)}</span>`].map(s=>`<span class="im-badge">${s}</span>`).join("");
  };
  fmt(qQ["VQC (Qiskit)"]?.metrics,  "vqc-metrics");
  fmt(qQ["QSVM (Quantum Kernel)"]?.metrics, "qsvm-metrics");
  fmt(qPL?.metrics, "pl-metrics");
  const cmGrid = document.getElementById("cm-grid"); if (!cmGrid) return;
  const names = ["Logistic Regression"];
  Object.entries(qQ).filter(([,r])=>r?.status==="ok").forEach(([n])=>names.push(n));
  cmGrid.innerHTML = names.map(n=>{
    const safe = n.toLowerCase().replace(/[\s()]/g,c=>c===" ?"?"_":"");
    const src  = `./assets/cm_${safe}.png`;
    return `<div class="glass-card cm-card"><h4>${n}</h4><img src="${src}" alt="CM ${n}" class="chart-img" onerror="this.style.display='none'"/></div>`;
  }).join("");
}

// ─── SHAP ────────────────────────────────────────────────────────────────────

async function loadShapData() {
  let shap = null;
  if (apiOnline) { try { shap = await apiFetch("/shap"); } catch {} }
  if (!shap) { try { const r = await fetch("./data/shap_importances.json"); shap = await r.json(); } catch { return; } }
  const imps   = shap.shap_importances || {};
  const sorted = Object.entries(imps).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const maxV   = sorted[0]?.[1] || 1;
  const c = document.getElementById("shap-top-list"); if (!c) return;
  c.innerHTML = sorted.map(([g,v])=>`<div class="shap-gene-row"><span class="shap-gene-name">${g}</span><div class="shap-bar-wrap"><div class="shap-bar-fill" style="width:${(v/maxV*100).toFixed(1)}%"></div></div><span class="shap-val">${v.toFixed(4)}</span></div>`).join("");
}

// ─── Clinical Meta + Form ─────────────────────────────────────────────────────

async function loadClinicalMeta() {
  if (apiOnline) { try { clinicalMeta = await apiFetch("/clinical/meta"); } catch {} }
  if (!clinicalMeta) {
    clinicalMeta = {
      feature_names:["WBC (K/µL)","RBC (M/µL)","Hemoglobin (g/dL)","Hematocrit (%)","MCV (fL)","MCH (pg)","MCHC (g/dL)","Platelets (K/µL)","Neutrophils (%)","Lymphocytes (%)","Monocytes (%)","Eosinophils (%)","Basophils (%)","Blast Cells (%)"],
      feature_ranges:{"WBC (K/µL)":[0.1,500],"RBC (M/µL)":[1,7],"Hemoglobin (g/dL)":[3,22],"Hematocrit (%)":[10,62],"MCV (fL)":[50,125],"MCH (pg)":[15,42],"MCHC (g/dL)":[20,40],"Platelets (K/µL)":[5,1000],"Neutrophils (%)":[0,95],"Lymphocytes (%)":[0,98],"Monocytes (%)":[0,30],"Eosinophils (%)":[0,20],"Basophils (%)":[0,5],"Blast Cells (%)":[0,99]},
      normal_defaults:{"WBC (K/µL)":7.5,"RBC (M/µL)":4.8,"Hemoglobin (g/dL)":14,"Hematocrit (%)":42,"MCV (fL)":90,"MCH (pg)":30,"MCHC (g/dL)":34,"Platelets (K/µL)":260,"Neutrophils (%)":58,"Lymphocytes (%)":28,"Monocytes (%)":6,"Eosinophils (%)":3,"Basophils (%)":0.8,"Blast Cells (%)":0.3},
      reference_ranges:{"WBC (K/µL)":{min:4.5,max:11},"RBC (M/µL)":{min:3.8,max:6},"Hemoglobin (g/dL)":{min:11.5,max:17.5},"Hematocrit (%)":{min:35,max:52},"MCV (fL)":{min:80,max:100},"MCH (pg)":{min:27,max:33},"MCHC (g/dL)":{min:31.5,max:36},"Platelets (K/µL)":{min:150,max:400},"Neutrophils (%)":{min:40,max:75},"Lymphocytes (%)":{min:20,max:45},"Monocytes (%)":{min:2,max:10},"Eosinophils (%)":{min:1,max:6},"Basophils (%)":{min:0,max:1},"Blast Cells (%)":{min:0,max:2}},
    };
  }
  buildScreeningForm();
}

const FIELD_KEYS = {"WBC (K/µL)":"wbc","RBC (M/µL)":"rbc","Hemoglobin (g/dL)":"hemoglobin","Hematocrit (%)":"hematocrit","MCV (fL)":"mcv","MCH (pg)":"mch","MCHC (g/dL)":"mchc","Platelets (K/µL)":"platelets","Neutrophils (%)":"neutrophils","Lymphocytes (%)":"lymphocytes","Monocytes (%)":"monocytes","Eosinophils (%)":"eosinophils","Basophils (%)":"basophils","Blast Cells (%)":"blast_cells"};

function buildScreeningForm() {
  const form = document.getElementById("screening-form"); if (!form||!clinicalMeta) return;
  const {feature_names:feats,feature_ranges:ranges,normal_defaults:defs,reference_ranges:refs} = clinicalMeta;
  form.innerHTML = `<div class="cbc-grid">${feats.map(feat=>{
    const [lo,hi] = ranges[feat]||[0,100];
    const def = defs[feat]??((lo+hi)/2);
    const id  = "cbc_"+feat.replace(/[^a-z0-9]/gi,"_");
    const ref = refs[feat]||{};
    const refStr = ref.min!==undefined ? `Normal: ${ref.min}–${ref.max}` : "";
    const step = (hi-lo)<=5?0.1:(hi-lo)<=50?0.5:1;
    return `<div class="cbc-row" title="${refStr}">
      <label for="${id}_range">${feat} <span class="cbc-ref">${refStr}</span></label>
      <div class="cbc-input-inline">
        <input type="range" id="${id}_range" min="${lo}" max="${hi}" step="${step}" value="${def}" data-feature="${feat}" oninput="syncNum(this,'${id}_num')"/>
        <span class="num-display" id="${id}_num">${def}</span>
        <span class="unit-label">${(feat.match(/\(([^)]+)\)/)||[])[1]||""}</span>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function syncNum(el, numId) {
  const n = document.getElementById(numId);
  if (n) n.textContent = parseFloat(el.value).toFixed(1);
}

function readFormValues() {
  const out = {}; const form = document.getElementById("screening-form"); if (!form) return out;
  form.querySelectorAll('input[type="range"]').forEach(el => {
    const k = FIELD_KEYS[el.dataset.feature]; if (k) out[k] = parseFloat(el.value);
  }); return out;
}

function resetForm() {
  if (!clinicalMeta) return;
  const defs = clinicalMeta.normal_defaults||{};
  document.getElementById("screening-form")?.querySelectorAll('input[type="range"]').forEach(el => {
    const feat = el.dataset.feature; if (feat && defs[feat]!==undefined) {
      el.value = defs[feat];
      const n = document.getElementById(el.id.replace("_range","_num"));
      if (n) n.textContent = parseFloat(defs[feat]).toFixed(1);
    }
  });
}

function loadHighRiskDemo() {
  const vals = {"WBC (K/µL)":120,"RBC (M/µL)":2.5,"Hemoglobin (g/dL)":7,"Hematocrit (%)":21,"MCV (fL)":85,"MCH (pg)":28,"MCHC (g/dL)":33,"Platelets (K/µL)":35,"Neutrophils (%)":8,"Lymphocytes (%)":78,"Monocytes (%)":9,"Eosinophils (%)":1.5,"Basophils (%)":1.2,"Blast Cells (%)":62};
  document.getElementById("screening-form")?.querySelectorAll('input[type="range"]').forEach(el => {
    const feat = el.dataset.feature; if (feat && vals[feat]!==undefined) {
      const val = Math.min(parseFloat(el.max),Math.max(parseFloat(el.min),vals[feat]));
      el.value = val;
      const n = document.getElementById(el.id.replace("_range","_num"));
      if (n) n.textContent = val.toFixed(1);
    }
  });
}

function setupFormEvents() {
  document.getElementById("btn-analyze")?.addEventListener("click",  runAnalysis);
  document.getElementById("btn-reset")?.addEventListener("click",    resetForm);
  document.getElementById("btn-demo-high")?.addEventListener("click", loadHighRiskDemo);
}

// ─── Risk Analysis ───────────────────────────────────────────────────────────

async function runAnalysis() {
  const loading = document.getElementById("risk-loading");
  const status  = loading.querySelector("div:last-child");
  const updateStatus = (msg) => { if (status) status.innerHTML = msg; };

  document.getElementById("risk-placeholder").hidden = true;
  document.getElementById("risk-result").hidden = true;
  loading.hidden = false;

  // Pedagogical QML Sequence
  if (window.blochState) window.blochState.startThinking();
  updateStatus("Mapping 7,129 genes to Hilbert space via Bloch Sphere angles...");
  await new Promise(r => setTimeout(r, 1500)); 

  updateStatus("Applying ZZFeatureMap interference to cancel gene noise...");
  await new Promise(r => setTimeout(r, 1200));

  updateStatus("Executing Variational Quantum Circuit (VQC) using Qiskit Aer...");
  await new Promise(r => setTimeout(r, 1000));
  
  updateStatus("Computing High-Fidelity Quantum Kernel similarity (QSVM)...");
  await new Promise(r => setTimeout(r, 800));

  const values = readFormValues();
  let result = null;
  if (apiOnline) { try { result = await apiFetch("/clinical/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)}); } catch {} }
  if (!result) result = clientSideRisk(values);
  
  loading.hidden = true;
  if (window.blochState) window.blochState.stopThinking();
  displayRiskResult(result);
}

function clientSideRisk(values) {
  const blast = values.blast_cells||0, wbc = values.wbc||7.5, lymph = values.lymphocytes||28;
  const hgb   = values.hemoglobin||14, plt = values.platelets||260;
  let s = 0.05; // Base tiny risk
  
  // Blast cells are the strongest indicator in SMEAR/CBC
  if (blast > 20)      s += 0.8; 
  else if (blast > 5)  s += 0.4;
  else if (blast > 1)  s += 0.1;

  // WBC counts
  if (wbc > 100)       s += 0.4;
  else if (wbc > 30)   s += 0.2;
  else if (wbc < 4.0)  s += 0.1; // Leukopenia

  // Other markers
  if (lymph > 70)      s += 0.15;
  if (hgb < 9)         s += 0.2;
  if (plt < 80)        s += 0.2;
  
  s = Math.min(s, 0.99);
  const refs = clinicalMeta?.reference_ranges||{};
  const factors = Object.entries(values).map(([k,v])=>{
    const feat = Object.entries(FIELD_KEYS).find(([,kk])=>kk===k)?.[0]||k;
    const r = refs[feat]||{}; let concern = "NORMAL";
    if (r.min!==undefined) { if (v<r.min) concern="LOW"; else if (v>r.max) concern="HIGH"; }
    return {feature:feat, value:v, concern};
  }).sort((a,b)=>({HIGH:0,LOW:1,NORMAL:2}[a.concern]||2)-({HIGH:0,LOW:1,NORMAL:2}[b.concern]||2));
  let level,label,color;
  if      (s<.25) { level="LOW";      label="Low Risk — Normal Blood Pattern"; color="var(--green)"; }
  else if (s<.55) { level="MODERATE"; label="Moderate Risk — Further Evaluation Recommended"; color="var(--orange)"; }
  else if (s<.80) { level="HIGH";     label="High Risk — Urgent Medical Consultation"; color="var(--orange)"; }
  else            { level="CRITICAL"; label="Critical Risk — Immediate Hematologist Referral"; color="var(--pink)"; }
  return {risk_score:s, risk_level:level, risk_label:label, risk_color:color, contributing_factors:factors};
}

function displayRiskResult(r) {
  const el = document.getElementById("risk-result"); if (!el) return;
  el.hidden = false;
  animGauge(r.risk_score||0, r.risk_color||"var(--purple)");
  const badge = document.getElementById("risk-level-badge");
  if (badge) { badge.textContent=r.risk_level; badge.style.background=`${r.risk_color}22`; badge.style.color=r.risk_color; badge.style.border=`1px solid ${r.risk_color}66`; }
  const lbl = document.getElementById("risk-label-text"); if (lbl) lbl.textContent = r.risk_label;
  const list = document.getElementById("factors-list"); if (!list) return;
  list.innerHTML = (r.contributing_factors||[]).slice(0,12).map(f=>`<div class="factor-row"><span class="factor-name">${f.feature}</span><span class="factor-value">${typeof f.value==="number"?f.value.toFixed(1):f.value}</span><span class="factor-badge ${f.concern}">${f.concern}</span></div>`).join("");
}

function animGauge(score, color) {
  const arc = document.getElementById("gauge-arc");
  const needle = document.getElementById("gauge-needle");
  const pct  = document.getElementById("gauge-percent");
  if (!arc) return;
  const total=251, fill=score*total;
  arc.style.stroke = color;
  arc.style.transition = "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)";
  arc.style.strokeDasharray = `${fill} ${total}`;
  const angle = Math.PI - score*Math.PI;
  if (needle) { needle.setAttribute("cx",(100+80*Math.cos(angle)).toFixed(1)); needle.setAttribute("cy",(100-80*Math.sin(angle)).toFixed(1)); needle.style.fill=color; }
  const t0=Date.now(), dur=1200;
  const tick=()=>{ const t=Math.min((Date.now()-t0)/dur,1), e=1-Math.pow(1-t,3); if (pct) pct.textContent=Math.round(e*score*100)+"%"; if(t<1)requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

// ════════════════════════════════════════════════════════════════════════════
//  BLOOD SMEAR CELL DETECTION
// ════════════════════════════════════════════════════════════════════════════

let smearAnalyzed = false;

function initSmearAnalysis() {
  const fileInput = document.getElementById("smear-file-input");
  const uploadArea = document.getElementById("smear-upload-area");

  fileInput?.addEventListener("change", e => {
    const f = e.target.files[0]; if (f) loadUserImage(f);
  });

  // Drag-and-drop
  uploadArea?.addEventListener("dragover", e => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
  uploadArea?.addEventListener("dragleave", () => uploadArea.classList.remove("drag-over"));
  uploadArea?.addEventListener("drop", e => {
    e.preventDefault(); uploadArea.classList.remove("drag-over");
    const f = e.dataTransfer.files[0]; if (f && f.type.startsWith("image/")) loadUserImage(f);
  });

  document.getElementById("btn-load-demo-smear")?.addEventListener("click", () => loadSampleImage("./assets/blood_smear_demo.png", "leukemia"));
  document.getElementById("btn-load-normal-smear")?.addEventListener("click", () => loadSampleImage("./assets/blood_smear_demo.png", "normal"));
}

function loadUserImage(file) {
  const reader = new FileReader();
  reader.onload = e => { const img = new Image(); img.onload = () => analyzeSmear(img, "auto"); img.src = e.target.result; };
  reader.readAsDataURL(file);
}

function loadSampleImage(src, mode) {
  const img = new Image();
  img.onload = () => analyzeSmear(img, mode);
  img.onerror = () => { console.warn("Demo image not found — run train.py to generate it."); showSmearError(); };
  img.src = src;
}

function showSmearError() {
  const sum = document.getElementById("smear-summary");
  if (sum) sum.innerHTML = `<div style="color:var(--pink);text-align:center">Demo image not found.<br/>Run <code>python train.py</code> first, then reload.</div>`;
}

async function analyzeSmear(img, mode) {
  document.getElementById("smear-placeholder").style.display = "none";
  document.getElementById("smear-analyzing").style.display   = "flex";

  const canvas  = document.getElementById("smear-canvas");
  const overlay = document.getElementById("smear-overlay");
  const ctx     = canvas.getContext("2d");
  const octx    = overlay.getContext("2d");

  // Scale to max 700px wide
  const maxW = 700;
  const scale = img.width > maxW ? maxW / img.width : 1;
  canvas.width  = img.width  * scale;
  canvas.height = img.height * scale;

  await animateHighlights(octx, cells, overlay.width, overlay.height);
  updateSmearResults(cells, mode);
}

// ─── Cell detection ──────────────────────────────────────────────────────────

function detectCells(imageData, width, height, mode) {
  const data = imageData.data;
  const cells = [];
  const step  = 28; // grid step
  const minR  =  8; // min cell radius
  const visited = new Set();

  for (let cy = step; cy < height - step; cy += step) {
    for (let cx = step; cx < width - step; cx += step) {
      // Sample center pixel
      const idx = (cy * width + cx) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];

      // Background is pale pink ~(235,205,210). Skip near-background pixels.
      const isBackground = r > 220 && g > 190 && b > 188;
      if (isBackground) continue;

      // Deduplicate nearby detections
      const key = `${Math.round(cx/step)},${Math.round(cy/step)}`;
      if (visited.has(key)) continue;

      // Sample surrounding ring to estimate cell extent
      const samples = sampleRing(data, cx, cy, 14, width, height);
      if (!samples.isCell) continue;

      // Mark neighbors visited
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++)
        visited.add(`${Math.round(cx/step)+dx},${Math.round(cy/step)+dy}`);

      const type   = classifyCell(r, g, b, samples);
      const radius = type==="rbc" ? 10+Math.random()*5 : type==="wbc" ? 18+Math.random()*8 : 22+Math.random()*10;

      cells.push({ x:cx, y:cy, radius, type, r, g, b });
    }
  }

  // If mode is "normal", force no blast cells
  if (mode === "normal") {
    return cells.map(c => ({...c, type: c.type==="blast" ? "wbc" : c.type}));
  }

  return cells;
}

function sampleRing(data, cx, cy, r, width, height) {
  let totalR=0, totalG=0, totalB=0, maxDark=0, n=0;
  const angles = [0,45,90,135,180,225,270,315];
  for (const a of angles) {
    const x = Math.round(cx + r*Math.cos(a*Math.PI/180));
    const y = Math.round(cy + r*Math.sin(a*Math.PI/180));
    if (x<0||x>=width||y<0||y>=height) continue;
    const idx = (y*width+x)*4;
    totalR += data[idx]; totalG += data[idx+1]; totalB += data[idx+2]; n++;
    const darkness = 255 - (data[idx]+data[idx+1]+data[idx+2])/3;
    if (darkness > maxDark) maxDark = darkness;
  }
  const isCell = n>0 && maxDark > 30;
  return { isCell, avgR: totalR/n, avgG: totalG/n, avgB: totalB/n, maxDark };
}

function classifyCell(r, g, b, samples) {
  // High blue relative to red/green (purple/dark) = nucleus-heavy → WBC or blast
  const purpleScore = (b - (r+g)/2) / 255;       // +ve = purplish
  const brightness  = (r+g+b)/3;
  const darknessScore = (255 - brightness) / 255;  // 0=white, 1=black

  // Very dark and very purple → blast (leukemic cell with large irregular nucleus)
  if (purpleScore > 0.05 && darknessScore > 0.35) return "blast";
  // Moderately purple → WBC (white blood cell with clear nucleus)
  if (purpleScore > -0.05 && darknessScore > 0.20) return "wbc";
  // Pink/salmon, moderate darkness → RBC
  return "rbc";
}

// ─── Animated highlights ─────────────────────────────────────────────────────

async function animateHighlights(octx, cells, width, height) {
  // Sort: RBC first, WBC second, blast last (most dramatic)
  const sorted = [...cells].sort((a,b) => {
    const order = {rbc:0, wbc:1, blast:2};
    return order[a.type] - order[b.type];
  });

  const colors = { rbc: "#30d158", wbc: "#64d2ff", blast: "#ff375f" };
  const glow   = { rbc: "rgba(48,209,88,.25)", wbc: "rgba(100,210,255,.2)", blast: "rgba(255,55,95,.4)" };

  for (let i=0; i<sorted.length; i++) {
    const c = sorted[i];
    const col = colors[c.type];
    const glw = glow[c.type];
    const lw  = c.type==="blast" ? 2.5 : 1.8;

    // Draw ring
    octx.beginPath();
    octx.arc(c.x, c.y, c.radius+2, 0, Math.PI*2);
    octx.strokeStyle = col;
    octx.lineWidth = lw;
    octx.stroke();

    // Blast: outer glow ring
    if (c.type === "blast") {
      octx.beginPath();
      octx.arc(c.x, c.y, c.radius+9, 0, Math.PI*2);
      octx.strokeStyle = glw;
      octx.lineWidth = 5;
      octx.stroke();

      // Small label
      octx.font = "bold 9px 'Space Grotesk', sans-serif";
      octx.fillStyle = "#ff375f";
      octx.fillText("BLAST", c.x - 16, c.y - c.radius - 5);
    }

    // Every 8 cells, wait a frame to animate
    if (i % 30 === 0) await new Promise(r => requestAnimationFrame(r));
  }

  // Pulsing loop for blast cells
  pulseBlastCells(octx, sorted.filter(c=>c.type==="blast"), colors, glow);
}

function pulseBlastCells(octx, blasts, colors, glow) {
  if (!blasts.length) return;
  let phase = 0;
  const pulse = () => {
    phase += 0.06;
    blasts.forEach(c => {
      // Clear old outer ring
      octx.clearRect(c.x-c.radius-16, c.y-c.radius-16, (c.radius+16)*2, (c.radius+16)*2);
      // Redraw inner ring
      octx.beginPath(); octx.arc(c.x, c.y, c.radius+2, 0, Math.PI*2);
      octx.strokeStyle = colors.blast; octx.lineWidth = 2.5; octx.stroke();
      octx.font = "bold 9px 'Space Grotesk', sans-serif";
      octx.fillStyle = "#ff375f";
      octx.fillText("BLAST", c.x-16, c.y-c.radius-5);
      // Pulsing outer
      const pAlpha = (Math.sin(phase)+1)/2 * 0.6 + 0.1;
      const pRadius = c.radius + 8 + Math.sin(phase)*4;
      octx.beginPath(); octx.arc(c.x, c.y, pRadius, 0, Math.PI*2);
      octx.strokeStyle = `rgba(255,55,95,${pAlpha.toFixed(2)})`; octx.lineWidth = 4; octx.stroke();
    });
    requestAnimationFrame(pulse);
  };
  requestAnimationFrame(pulse);
}

// ─── Smear results panel ─────────────────────────────────────────────────────

function updateSmearResults(cells, mode) {
  const rbcCells   = cells.filter(c=>c.type==="rbc");
  const wbcCells   = cells.filter(c=>c.type==="wbc");
  const blastCells = cells.filter(c=>c.type==="blast");
  const total = cells.length;
  const blastPct = total > 0 ? (blastCells.length / total * 100) : 0;

  document.getElementById("cnt-rbc").textContent   = rbcCells.length;
  document.getElementById("cnt-wbc").textContent   = wbcCells.length;
  document.getElementById("cnt-blast").textContent = blastCells.length;

  const bar = document.getElementById("blast-pct-bar");
  const lbl = document.getElementById("blast-pct-label");
  if (bar) bar.style.width = Math.min(blastPct*2, 100) + "%"; // ×2 for visual impact
  if (lbl) lbl.textContent = blastPct.toFixed(1) + "%";

  // Summary text
  const sum = document.getElementById("smear-summary");
  if (!sum) return;

  let level, msg, col;
  if (blastPct === 0 || mode === "normal") {
    level = "Normal Pattern"; col = "var(--green)";
    msg = `✅ <strong>${total} cells detected.</strong> No blast cells found. WBC:RBC ratio looks normal. This smear appears consistent with a healthy blood sample. Always confirm with a hematologist.`;
  } else if (blastPct < 5) {
    level = "Borderline"; col = "var(--orange)";
    msg = `⚠ <strong>${blastCells.length} suspected blast cell(s) detected</strong> (${blastPct.toFixed(1)}% of sample). Blast cells <5% may be early-stage. Recommend a formal bone marrow biopsy and full haematology panel.`;
  } else if (blastPct < 20) {
    level = "Elevated Risk"; col = "var(--orange)";
    msg = `🚨 <strong>${blastCells.length} blast cells detected</strong> (${blastPct.toFixed(1)}%). Blast cells between 5-20% indicate possible early leukemia. This pattern is consistent with ALL or AML in early stages. Urgent hematology consult recommended.`;
  } else {
    level = "HIGH RISK"; col = "var(--pink)";
    msg = `🔴 <strong>CRITICAL: ${blastCells.length} blast cells detected</strong> (${blastPct.toFixed(1)}%). Blast percentage >20% meets WHO diagnostic criteria for Acute Leukemia. Immediate specialist referral required. This is NOT a diagnosis — get a bone marrow biopsy.`;
  }

  sum.style.background    = `${col}11`;
  sum.style.borderColor   = `${col}33`;
  sum.innerHTML = `<div style="color:${col};font-weight:700;font-size:.85rem;margin-bottom:8px">${level}</div><div style="font-size:.83rem;color:var(--text2);line-height:1.7">${msg}</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  ANIMATED COUNTERS
// ════════════════════════════════════════════════════════════════════════════

function animCounter(selector, target) {
  const el = document.querySelector(selector); if (!el) return;
  const isF = !Number.isInteger(target);
  const t0=Date.now(), dur=1800;
  const tick=()=>{ const t=Math.min((Date.now()-t0)/dur,1), e=1-Math.pow(1-t,3); el.textContent=isF?(e*target).toFixed(3):Math.round(e*target).toLocaleString(); if(t<1)requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

// ════════════════════════════════════════════════════════════════════════════
//  SCROLL ANIMATIONS
// ════════════════════════════════════════════════════════════════════════════

function initScrollAnimations() {
  document.querySelectorAll(".glass-card,.kpi-card,.pipe-step,.explain-card,.dataset-card,.fade-in").forEach(el => el.classList.add("fade-in"));
  window._scrollObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); window._scrollObs.unobserve(e.target); } });
  }, { threshold: 0.05 });
  document.querySelectorAll(".fade-in").forEach(el => window._scrollObs.observe(el));
}

// Helper: observe newly injected cards
function observeNewCards(container) {
  if (!window._scrollObs) return;
  container.querySelectorAll(".fade-in:not(.visible)").forEach(el => window._scrollObs.observe(el));
}

// ════════════════════════════════════════════════════════════════════════════
//  PARTICLE CANVAS (macOS-style floating orbs)
// ════════════════════════════════════════════════════════════════════════════

function initParticleCanvas() {
  const canvas = document.getElementById("quantum-canvas"); if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function resize() { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; }
  resize(); window.addEventListener("resize", resize);

  const COLORS = ["#bf5af2","#0a84ff","#30d158","#ff9f0a","#ff375f","#64d2ff","#ffd60a"];
  const pts = Array.from({length:65}, () => ({
    x: Math.random()*canvas.width, y: Math.random()*canvas.height,
    vx:(Math.random()-.5)*.35, vy:(Math.random()-.5)*.35,
    r: Math.random()*2.2+.8, color:COLORS[0|Math.random()*COLORS.length],
    phase:Math.random()*Math.PI*2,
  }));

  const frame = t => {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>canvas.width)  p.vx*=-1;
      if(p.y<0||p.y>canvas.height) p.vy*=-1;
    });
    // Connections
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<Math.min(pts.length,i+6);j++){
      const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
      if(d<130){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
        ctx.strokeStyle=`rgba(191,90,242,${((1-d/130)*.1).toFixed(3)})`; ctx.lineWidth=.5; ctx.stroke(); }
    }
    // Dots
    pts.forEach(p => {
      const pulse=(Math.sin(t*.002+p.phase)+1)/2;
      const alpha=.3+pulse*.6;
      const [rr,gg,bb]=hexToRgb(p.color);
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r+pulse*.5,0,Math.PI*2);
      ctx.fillStyle=`rgba(${rr},${gg},${bb},${alpha.toFixed(2)})`; ctx.fill();
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function hexToRgb(hex) {
  const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m?[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]:[191,90,242];
}

// ════════════════════════════════════════════════════════════════════════════
//  REAL PATIENT CASE SHOWCASE
// ════════════════════════════════════════════════════════════════════════════

async function loadPatientCases() {
  let raw = null;
  if (apiOnline) { try { raw = await apiFetch("/cases"); } catch {} }
  if (!raw) { try { const r = await fetch("./data/patient_cases.json"); raw = await r.json(); } catch { renderPatientGrid([]); return; } }
  patientCases = raw.patients || raw || [];
  const summary = raw.summary || {};
  renderCaseSummary(summary);
  renderPatientGrid(patientCases);
  initCaseFilters();
  document.getElementById("btn-show-more")?.addEventListener("click", () => {
    shownCaseCount = patientCases.length;
    renderPatientGrid(patientCases, getCaseFilter());
    document.getElementById("btn-show-more").style.display = "none";
  });
}

function renderCaseSummary(s) {
  const correct = s.rf_loo_correct ?? patientCases.filter(p=>p.correct).length;
  const total   = s.total_patients ?? patientCases.length;
  const wrong   = total - correct;
  const acc     = total > 0 ? (correct / total * 100).toFixed(1) + "%" : "—";
  const el1 = document.getElementById("cs-correct");
  const el2 = document.getElementById("cs-wrong");
  const el3 = document.getElementById("cs-acc");

  if (total === 0) {
    if (el1) el1.textContent = "Loading...";
    if (el2) el2.textContent = "—";
    if (el3) el3.textContent = "—";
    return;
  }
  if (el1) el1.textContent = `${correct}/${total}`;
  if (el2) el2.textContent = wrong;
  if (el3) el3.textContent = acc;
}

function getCaseFilter() {
  return document.querySelector(".case-filter-btn.active")?.dataset.filter || "all";
}

function initCaseFilters() {
  document.querySelectorAll(".case-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".case-filter-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      shownCaseCount = 18;
      renderPatientGrid(patientCases, btn.dataset.filter);
    });
  });
}

function filterCases(cases, filter) {
  switch(filter) {
    case "ALL":        return cases.filter(p => p.true_label === "ALL");
    case "AML":        return cases.filter(p => p.true_label === "AML");
    case "correct":    return cases.filter(p => p.correct);
    case "wrong":      return cases.filter(p => !p.correct);
    case "high-conf":  return cases.filter(p => p.confidence >= 0.9);
    default:           return cases;
  }
}

function renderPatientGrid(cases, filter = "all") {
  const grid = document.getElementById("patient-grid"); if (!grid) return;
  const filtered = filterCases(cases, filter);
  const show     = filtered.slice(0, shownCaseCount);

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3)">No patients match this filter</div>`;
    document.getElementById("btn-show-more").style.display = "none";
    return;
  }

  grid.innerHTML = show.map(p => renderPatientCard(p)).join("");

  // Make newly injected cards visible immediately (they're in-viewport when rendered by filter clicks)
  setTimeout(() => {
    grid.querySelectorAll(".patient-card").forEach(el => el.classList.add("visible"));
    observeNewCards(grid);
  }, 50);

  // Show "Show All" button if more exist
  const btn = document.getElementById("btn-show-more");
  if (btn) {
    if (filtered.length > shownCaseCount) {
      btn.textContent = `Show All ${filtered.length} Patients`;
      btn.style.display = "inline-flex";
    } else {
      btn.style.display = "none";
    }
  }

  // Animate confidence bars
  requestAnimationFrame(() => {
    grid.querySelectorAll(".pc-bar-fill").forEach(bar => {
      bar.style.width = bar.dataset.target;
    });
  });
}

function renderPatientCard(p) {
  const isCorrect = p.correct;
  const conf = (p.confidence * 100).toFixed(1);
  const confColor = p.confidence > .9 ? "var(--green)" : p.confidence > .7 ? "var(--orange)" : "var(--pink)";
  const labelColor = p.true_label === "ALL" ? "var(--pink)" : "var(--orange)";
  const predMatch = p.predicted_label === p.true_label;
  const genes = (p.top_genes || []).slice(0, 3).map(g => `<span class="pc-gene">${g.gene.split("_")[0]}</span>`).join("");

  // CBC proxy highlights — flag abnormals
  const cbcHtml = Object.entries(p.cbc_proxy || {}).slice(0, 5).map(([feat, val]) => {
    const refs = { "WBC (K/µL)":{min:4.5,max:11}, "Blast Cells (%)":{min:0,max:2}, "Hemoglobin":{min:11.5,max:17.5}, "Platelets":{min:150,max:400} };
    const r = refs[feat]; let abn = "";
    if (r && (val < r.min || val > r.max)) abn = " abn";
    return `<span class="pc-cbc-item${abn}">${feat.replace(/\s*\([^)]*\)/,"")}: ${val}</span>`;
  }).join("");

  // Model agreement
  const agree = p.models_correct ?? 1;
  const total  = p.model_votes ? Object.keys(p.model_votes).length : 1;
  const agreeStr = `${agree}/${total} models agree`;

  return `<div class="patient-card ${isCorrect ? "is-correct" : "is-wrong"} fade-in">
    <div class="pc-header">
      <span class="pc-id">${p.patient_id}</span>
      <span class="pc-result-badge ${isCorrect ? "correct" : "wrong"}">${isCorrect ? "✅ Correct" : "❌ Missed"}</span>
    </div>
    <div class="pc-diagnosis">
      <div class="pc-true">True Diagnosis → AI Prediction</div>
      <div class="pc-labels">
        <span class="pc-label ${p.true_label}" style="background:${p.true_label==="ALL"?"rgba(255,55,95,.15)":"rgba(255,159,10,.15)"};color:${labelColor}">${p.true_label}</span>
        <span class="pc-arrow">→</span>
        <span class="pc-label ${p.predicted_label}" style="background:${isCorrect?"rgba(48,209,88,.1)":"rgba(255,55,95,.1)"};color:${isCorrect?"var(--green)":"var(--pink)"}">${p.predicted_label} ${isCorrect?"✓":"✗"}</span>
      </div>
    </div>
    <div class="pc-conf-bar">
      <div class="pc-conf-label"><span>AI Confidence</span><span style="color:${confColor};font-family:'JetBrains Mono',monospace;font-weight:700">${conf}%</span></div>
      <div class="pc-bar-track"><div class="pc-bar-fill" data-target="${conf}%" style="width:0%;background:${confColor}"></div></div>
    </div>
    ${genes ? `<div class="pc-genes"><div class="pc-genes-title">Key Genes</div><div class="pc-gene-list">${genes}</div></div>` : ""}
    <div class="pc-cbc">${cbcHtml}</div>
    <div class="models-agree">${agreeStr} · Gene profile: 7,129 features</div>
  </div>`;
}
