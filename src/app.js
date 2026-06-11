import { loadImage, saveImage, stripExtension } from "./imageIO.js";
import {
  detectLayout,
  channelsForLayout,
  defaultEnabled,
  buildDisplayRgba,
  buildChannelThumbnail,
  CHANNEL_LABEL,
} from "./channels.js";
import { rgbToLab } from "./color.js";
import {
  defaultLevelsState,
  applyLevels,
  isAllIdentity,
  computeHistogram,
} from "./levels.js";
import { drawHistogram } from "./histogram.js";
import { TripleSlider } from "./tripleSlider.js";
import { INTERPOLATORS, resize } from "./resize.js";
import { setupModal, openModal, closeModal } from "./modal.js";
import { PRESETS as FILTER_PRESETS, startConvolution } from "./filter.js";

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 3.0;
const FIT_PADDING = 0;

const els = {
  fileInput: document.getElementById("file-input"),
  saveBtn: document.getElementById("save-btn"),
  saveMenu: document.getElementById("save-menu"),
  saveDropdown: document.querySelector(".dropdown"),
  fileName: document.getElementById("file-name"),
  canvas: document.getElementById("canvas"),
  canvasWrap: document.getElementById("canvas-wrap"),
  emptyHint: document.getElementById("empty-hint"),
  workspace: document.querySelector(".workspace"),
  statusWidth: document.getElementById("status-width"),
  statusHeight: document.getElementById("status-height"),
  statusDepth: document.getElementById("status-depth"),
  statusFormat: document.getElementById("status-format"),
  statusMessage: document.getElementById("status-message"),
  channels: document.getElementById("channels"),
  picker: document.getElementById("picker"),
  toolBtns: document.querySelectorAll(".tool-btn"),
  levelsBtn: document.getElementById("levels-btn"),
  levelsDialog: document.getElementById("levels-dialog"),
  levelsClose: document.getElementById("levels-close"),
  levelsChannel: document.getElementById("levels-channel"),
  levelsLog: document.getElementById("levels-log"),
  levelsPreview: document.getElementById("levels-preview"),
  levelsReset: document.getElementById("levels-reset"),
  levelsCancel: document.getElementById("levels-cancel"),
  levelsApply: document.getElementById("levels-apply"),
  histogramCanvas: document.getElementById("histogram-canvas"),
  tripleSlider: document.getElementById("triple-slider"),
  numBp: document.getElementById("num-bp"),
  numG: document.getElementById("num-g"),
  numWp: document.getElementById("num-wp"),
  zoomRange: document.getElementById("zoom-range"),
  zoomValue: document.getElementById("zoom-value"),
  zoomFit: document.getElementById("zoom-fit"),
  resizeBtn: document.getElementById("resize-btn"),
  resizeDialog: document.getElementById("resize-dialog"),
  resizeClose: document.getElementById("resize-close"),
  resizeCancel: document.getElementById("resize-cancel"),
  resizeApply: document.getElementById("resize-apply"),
  resizeBefore: document.getElementById("resize-before"),
  resizeAfter: document.getElementById("resize-after"),
  resizeUnit: document.getElementById("resize-unit"),
  resizeLock: document.getElementById("resize-lock"),
  resizeWidth: document.getElementById("resize-width"),
  resizeHeight: document.getElementById("resize-height"),
  resizeInterp: document.getElementById("resize-interp"),
  resizeInterpHelp: document.getElementById("resize-interp-help"),
  resizeInterpDescription: document.getElementById("resize-interp-description"),
  resizeError: document.getElementById("resize-error"),
  filterBtn: document.getElementById("filter-btn"),
  filterDialog: document.getElementById("filter-dialog"),
  filterClose: document.getElementById("filter-close"),
  filterPreset: document.getElementById("filter-preset"),
  filterEdge: document.getElementById("filter-edge"),
  filterPreview: document.getElementById("filter-preview"),
  filterReset: document.getElementById("filter-reset"),
  filterCancel: document.getElementById("filter-cancel"),
  filterApply: document.getElementById("filter-apply"),
  filterStatus: document.getElementById("filter-status"),
  kernelGrid: document.getElementById("kernel-grid"),
};

const FORMAT_LABEL = { png: "PNG", jpg: "JPEG", gb7: "GB7" };

const state = {
  original: null,
  fileName: null,
  layout: null,
  enabled: defaultEnabled(),
  tool: "hand",
  levels: null,
  zoom: 1.0,
  fitMode: false,
  interp: "bilinear",
  resizeDlg: null,
  filter: null,
};

function setStatus(msg, isError = false) {
  els.statusMessage.textContent = msg || "";
  els.statusMessage.style.color = isError ? "#ffd0d0" : "";
  if (msg && !isError) {
    setTimeout(() => {
      if (els.statusMessage.textContent === msg) els.statusMessage.textContent = "";
    }, 3000);
  }
}

function paintCanvas(rgba, width, height) {
  els.canvas.width = width;
  els.canvas.height = height;
  const ctx = els.canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  els.canvas.classList.add("loaded");
  els.emptyHint.style.display = "none";
}

function leveledSourceRgba() {
  if (!state.original) return null;
  if (state.levels && state.levels.preview && !isAllIdentity(state.levels.settings)) {
    return applyLevels(state.original.rgba, state.levels.settings);
  }
  if (state.filter && state.filter.preview && state.filter.cached) {
    return state.filter.cached;
  }
  return state.original.rgba;
}

function rerender() {
  if (!state.original) return;
  const src = leveledSourceRgba();
  const filtered = buildDisplayRgba(
    { ...state.original, rgba: src },
    state.layout,
    state.enabled
  );
  const { width: ow, height: oh } = state.original;
  const dw = Math.max(1, Math.round(ow * state.zoom));
  const dh = Math.max(1, Math.round(oh * state.zoom));
  const display =
    dw === ow && dh === oh ? filtered : resize(filtered, ow, oh, dw, dh, state.interp);
  paintCanvas(display, dw, dh);
}

let pendingRaf = null;
function scheduleRerender() {
  if (pendingRaf != null) return;
  pendingRaf = requestAnimationFrame(() => {
    pendingRaf = null;
    rerender();
  });
}

function updateStatusBar(image) {
  els.statusWidth.textContent = `${image.width} px`;
  els.statusHeight.textContent = `${image.height} px`;
  if (image.format === "gb7") {
    els.statusDepth.textContent = image.hasMask ? "7 бит + 1 бит маски" : "7 бит";
  } else {
    els.statusDepth.textContent = `${image.colorDepth} бит`;
  }
  els.statusFormat.textContent = FORMAT_LABEL[image.format] || image.format;
}

function setZoom(z, { reflectInSlider = true } = {}) {
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  const pct = Math.round(state.zoom * 100);
  els.zoomValue.textContent = `${pct}%`;
  if (reflectInSlider) els.zoomRange.value = String(pct);
  scheduleRerender();
}

function computeFitZoom() {
  if (!state.original) return 1.0;
  const w = els.workspace.clientWidth - 2 * FIT_PADDING;
  const h = els.workspace.clientHeight - 2 * FIT_PADDING;
  if (w <= 0 || h <= 0) return 1.0;
  const z = Math.min(w / state.original.width, h / state.original.height);
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

function renderChannelsPanel() {
  els.channels.innerHTML = "";
  if (!state.original) {
    els.channels.innerHTML = '<p class="panel-hint">Загрузите изображение, чтобы увидеть каналы.</p>';
    return;
  }

  const list = channelsForLayout(state.layout);
  const { width, height } = state.original;
  const maxSide = 96;
  const ratio = Math.min(maxSide / width, maxSide / height, 1);
  const tw = Math.max(1, Math.round(width * ratio));
  const th = Math.max(1, Math.round(height * ratio));

  for (const ch of list) {
    const thumb = buildChannelThumbnail(state.original, ch, tw, th);
    const card = document.createElement("div");
    card.className = "channel-card" + (state.enabled[ch] ? " active" : " disabled");
    card.dataset.channel = ch;

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    canvas.getContext("2d").putImageData(new ImageData(thumb, tw, th), 0, 0);

    const label = document.createElement("div");
    label.className = "channel-label";
    label.innerHTML = `<span class="channel-dot ${ch}"></span>${CHANNEL_LABEL[ch]}`;

    card.appendChild(canvas);
    card.appendChild(label);
    els.channels.appendChild(card);
  }
}

function refreshChannelCardStates() {
  els.channels.querySelectorAll(".channel-card").forEach((card) => {
    const ch = card.dataset.channel;
    card.classList.toggle("active", !!state.enabled[ch]);
    card.classList.toggle("disabled", !state.enabled[ch]);
  });
}

function setTool(name) {
  state.tool = name;
  els.toolBtns.forEach((b) => b.classList.toggle("active", b.dataset.tool === name));
  els.canvas.classList.toggle("tool-eyedropper", name === "eyedropper");
}

function canvasToImagePixel(event) {
  const rect = els.canvas.getBoundingClientRect();
  const sx = state.original.width / rect.width;
  const sy = state.original.height / rect.height;
  const x = Math.floor((event.clientX - rect.left) * sx);
  const y = Math.floor((event.clientY - rect.top) * sy);
  if (x < 0 || y < 0 || x >= state.original.width || y >= state.original.height) return null;
  return { x, y };
}

function samplePixel(x, y) {
  const { rgba, width } = state.original;
  const o = (y * width + x) << 2;
  return { r: rgba[o], g: rgba[o + 1], b: rgba[o + 2], a: rgba[o + 3] };
}

function renderPickerInfo(pt, rgb) {
  const { L, a, b } = rgbToLab(rgb.r, rgb.g, rgb.b);
  const hex = "#" + [rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("");
  els.picker.innerHTML = `
    <div class="picker-swatch">
      <div class="chip" style="background: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})"></div>
      <div>
        <div class="hex">${hex.toUpperCase()}</div>
        <div class="picker-row"><span class="label">Alpha</span><span class="value">${rgb.a}</span></div>
      </div>
    </div>
    <div class="picker-row"><span class="label">X, Y</span><span class="value">${pt.x}, ${pt.y}</span></div>
    <div class="picker-row"><span class="label">R</span><span class="value">${rgb.r}</span></div>
    <div class="picker-row"><span class="label">G</span><span class="value">${rgb.g}</span></div>
    <div class="picker-row"><span class="label">B</span><span class="value">${rgb.b}</span></div>
    <div class="picker-row"><span class="label">L*</span><span class="value">${L.toFixed(2)}</span></div>
    <div class="picker-row"><span class="label">a*</span><span class="value">${a.toFixed(2)}</span></div>
    <div class="picker-row"><span class="label">b*</span><span class="value">${b.toFixed(2)}</span></div>
  `;
}

const tripleSlider = new TripleSlider(els.tripleSlider, (bp, g, wp) => {
  if (!state.levels) return;
  const ch = state.levels.channel;
  state.levels.settings[ch] = { bp, g, wp };
  syncNumberInputs();
  if (state.levels.preview) scheduleRerender();
});

function syncNumberInputs() {
  els.numBp.value = String(tripleSlider.bp);
  els.numG.value = tripleSlider.g.toFixed(2);
  els.numWp.value = String(tripleSlider.wp);
}

function applySliderToActiveChannel() {
  if (!state.levels) return;
  const ch = state.levels.channel;
  const s = state.levels.settings[ch];
  tripleSlider.setValues(s.bp, s.g, s.wp);
  syncNumberInputs();
}

function redrawHistogram() {
  if (!state.levels) return;
  const ch = state.levels.channel;
  const hist = state.levels.histograms[ch];
  drawHistogram(els.histogramCanvas, hist, ch, { log: state.levels.log });
}

function levelsChannelsForLayout(layout) {
  switch (layout) {
    case "Y": return [["master", "Grayscale"]];
    case "YA": return [["master", "Grayscale"], ["A", "Alpha"]];
    case "RGB": return [["master", "Master (RGB)"], ["R", "Red"], ["G", "Green"], ["B", "Blue"]];
    case "RGBA": return [["master", "Master (RGB)"], ["R", "Red"], ["G", "Green"], ["B", "Blue"], ["A", "Alpha"]];
    default: return [["master", "Master (RGB)"]];
  }
}

function populateLevelsChannels(layout) {
  els.levelsChannel.innerHTML = "";
  for (const [value, label] of levelsChannelsForLayout(layout)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    els.levelsChannel.appendChild(opt);
  }
}

function openLevelsDialog() {
  if (!state.original) return;
  const histograms = {};
  for (const c of ["master", "R", "G", "B", "A"]) {
    histograms[c] = computeHistogram(state.original.rgba, c);
  }
  state.levels = {
    settings: defaultLevelsState(),
    channel: "master",
    log: false,
    preview: true,
    histograms,
  };
  populateLevelsChannels(state.layout);
  els.levelsChannel.value = "master";
  els.levelsLog.checked = false;
  els.levelsPreview.checked = true;
  openModal(els.levelsDialog);
  requestAnimationFrame(() => {
    applySliderToActiveChannel();
    redrawHistogram();
  });
}

function closeLevelsDialog() {
  state.levels = null;
  closeModal(els.levelsDialog);
  rerender();
}

function applyLevelsToImage() {
  if (!state.levels || !state.original) return;
  if (!isAllIdentity(state.levels.settings)) {
    const out = applyLevels(state.original.rgba, state.levels.settings);
    state.original = { ...state.original, rgba: out };
    renderChannelsPanel();
  }
  closeLevelsDialog();
  setStatus("Уровни применены");
}

setupModal(els.levelsDialog, { onClose: closeLevelsDialog });

els.levelsBtn.addEventListener("click", openLevelsDialog);
els.levelsClose.addEventListener("click", closeLevelsDialog);
els.levelsCancel.addEventListener("click", closeLevelsDialog);
els.levelsApply.addEventListener("click", applyLevelsToImage);

els.levelsReset.addEventListener("click", () => {
  if (!state.levels) return;
  state.levels.settings = defaultLevelsState();
  applySliderToActiveChannel();
  if (state.levels.preview) scheduleRerender();
});

els.levelsChannel.addEventListener("change", (e) => {
  if (!state.levels) return;
  state.levels.channel = e.target.value;
  applySliderToActiveChannel();
  redrawHistogram();
});

els.levelsLog.addEventListener("change", (e) => {
  if (!state.levels) return;
  state.levels.log = e.target.checked;
  redrawHistogram();
});

els.levelsPreview.addEventListener("change", (e) => {
  if (!state.levels) return;
  state.levels.preview = e.target.checked;
  rerender();
});

function commitNumberInput(which) {
  if (!state.levels) return;
  const ch = state.levels.channel;
  const s = state.levels.settings[ch];
  let bp = s.bp, g = s.g, wp = s.wp;
  if (which === "bp") {
    const v = parseInt(els.numBp.value, 10);
    if (!Number.isFinite(v)) return;
    bp = Math.max(0, Math.min(wp - 1, v));
  } else if (which === "wp") {
    const v = parseInt(els.numWp.value, 10);
    if (!Number.isFinite(v)) return;
    wp = Math.max(bp + 1, Math.min(255, v));
  } else if (which === "g") {
    const v = parseFloat(els.numG.value);
    if (!Number.isFinite(v)) return;
    g = Math.max(0.1, Math.min(9.9, v));
  }
  state.levels.settings[ch] = { bp, g, wp };
  tripleSlider.setValues(bp, g, wp);
  syncNumberInputs();
  if (state.levels.preview) scheduleRerender();
}

els.numBp.addEventListener("change", () => commitNumberInput("bp"));
els.numG.addEventListener("change", () => commitNumberInput("g"));
els.numWp.addEventListener("change", () => commitNumberInput("wp"));

function megaPixels(w, h) {
  return ((w * h) / 1_000_000).toFixed(2);
}

function fmtPct(n) {
  return parseFloat(n.toFixed(2)).toString();
}

function formatDims(w, h, unit) {
  if (unit === "percent") {
    return {
      w: fmtPct((w / state.resizeDlg.srcW) * 100),
      h: fmtPct((h / state.resizeDlg.srcH) * 100),
    };
  }
  return { w: String(w), h: String(h) };
}

function parseDim(value, unit, srcDim) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === "percent") {
    if (n > 1000) return null;
    return Math.max(1, Math.round((n / 100) * srcDim));
  }
  if (n > 16384) return null;
  return Math.max(1, Math.round(n));
}

function updateResizeStats() {
  if (!state.resizeDlg) return;
  const { srcW, srcH, dstW, dstH } = state.resizeDlg;
  els.resizeBefore.textContent = `${megaPixels(srcW, srcH)} Mpx (${srcW}×${srcH})`;
  els.resizeAfter.textContent = `${megaPixels(dstW, dstH)} Mpx (${dstW}×${dstH})`;
}

function refreshResizeDialog({ skipField } = {}) {
  if (!state.resizeDlg) return;
  const { dstW, dstH, unit, interp } = state.resizeDlg;
  const dims = formatDims(dstW, dstH, unit);
  if (skipField !== "w") els.resizeWidth.value = dims.w;
  if (skipField !== "h") els.resizeHeight.value = dims.h;
  els.resizeInterp.value = interp;
  els.resizeInterpDescription.textContent = INTERPOLATORS[interp].description;
  els.resizeInterpHelp.title = INTERPOLATORS[interp].description;
  els.resizeError.textContent = "";
  updateResizeStats();
}

function openResizeDialog() {
  if (!state.original) return;
  state.resizeDlg = {
    srcW: state.original.width,
    srcH: state.original.height,
    dstW: state.original.width,
    dstH: state.original.height,
    unit: "percent",
    lock: true,
    interp: state.interp,
  };
  els.resizeUnit.value = "percent";
  els.resizeLock.checked = true;
  refreshResizeDialog();
  openModal(els.resizeDialog);
}

function closeResizeDialog() {
  state.resizeDlg = null;
  closeModal(els.resizeDialog);
}

function applyResizeToImage() {
  if (!state.resizeDlg || !state.original) return;
  const { dstW, dstH, interp } = state.resizeDlg;
  if (dstW < 1 || dstH < 1 || dstW > 16384 || dstH > 16384) {
    els.resizeError.textContent = "Размеры должны быть в диапазоне 1..16384";
    return;
  }
  if (dstW === state.original.width && dstH === state.original.height) {
    closeResizeDialog();
    return;
  }
  const resized = resize(
    state.original.rgba,
    state.original.width,
    state.original.height,
    dstW,
    dstH,
    interp
  );
  state.original = { ...state.original, rgba: resized, width: dstW, height: dstH };
  updateStatusBar(state.original);
  renderChannelsPanel();
  state.interp = interp;
  scheduleRerender();
  closeResizeDialog();
  setStatus(`Размер изменён: ${dstW}×${dstH} (${INTERPOLATORS[interp].label})`);
}

setupModal(els.resizeDialog, { onClose: closeResizeDialog });

els.resizeBtn.addEventListener("click", openResizeDialog);
els.resizeClose.addEventListener("click", closeResizeDialog);
els.resizeCancel.addEventListener("click", closeResizeDialog);
els.resizeApply.addEventListener("click", applyResizeToImage);

els.resizeUnit.addEventListener("change", (e) => {
  if (!state.resizeDlg) return;
  state.resizeDlg.unit = e.target.value;
  refreshResizeDialog();
});

els.resizeLock.addEventListener("change", (e) => {
  if (!state.resizeDlg) return;
  state.resizeDlg.lock = e.target.checked;
});

els.resizeInterp.addEventListener("change", (e) => {
  if (!state.resizeDlg) return;
  state.resizeDlg.interp = e.target.value;
  refreshResizeDialog();
});

function onResizeDimInput(which) {
  if (!state.resizeDlg) return;
  const dlg = state.resizeDlg;
  const ratio = dlg.srcW / dlg.srcH;
  if (which === "w") {
    const v = parseDim(els.resizeWidth.value, dlg.unit, dlg.srcW);
    if (v == null) {
      els.resizeError.textContent = "Некорректная ширина";
      return;
    }
    dlg.dstW = v;
    if (dlg.lock) dlg.dstH = Math.max(1, Math.round(v / ratio));
  } else {
    const v = parseDim(els.resizeHeight.value, dlg.unit, dlg.srcH);
    if (v == null) {
      els.resizeError.textContent = "Некорректная высота";
      return;
    }
    dlg.dstH = v;
    if (dlg.lock) dlg.dstW = Math.max(1, Math.round(v * ratio));
  }
  els.resizeError.textContent = "";
  updateResizeStats();
  if (dlg.lock) {
    const dims = formatDims(dlg.dstW, dlg.dstH, dlg.unit);
    if (which === "w") els.resizeHeight.value = dims.h;
    else els.resizeWidth.value = dims.w;
  }
}

els.resizeWidth.addEventListener("input", () => onResizeDimInput("w"));
els.resizeHeight.addEventListener("input", () => onResizeDimInput("h"));

function fmtKernel(v) {
  return parseFloat(v.toPrecision(5)).toString();
}

function populateFilterPresets() {
  els.filterPreset.innerHTML = "";
  for (const [key, p] of Object.entries(FILTER_PRESETS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = p.label;
    els.filterPreset.appendChild(opt);
  }
}

function buildKernelGrid() {
  els.kernelGrid.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.dataset.i = String(i);
    input.addEventListener("change", () => {
      if (!state.filter) return;
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) {
        input.value = fmtKernel(state.filter.kernel[i]);
        return;
      }
      state.filter.kernel[i] = v;
      els.filterPreset.value = "";
      schedulePreview();
    });
    els.kernelGrid.appendChild(input);
  }
}

function setKernelInputs(kernel) {
  const inputs = els.kernelGrid.querySelectorAll("input");
  inputs.forEach((inp, i) => { inp.value = fmtKernel(kernel[i] ?? 0); });
}

function getEnabledFilterChannels() {
  const out = [];
  els.filterDialog.querySelectorAll('[data-ch]').forEach((cb) => {
    if (cb.checked) out.push(cb.dataset.ch);
  });
  return out;
}

function setFilterStatus(msg, busy = false) {
  els.filterStatus.textContent = msg || "";
  els.filterStatus.classList.toggle("busy", busy);
}

let filterJob = null;
function cancelFilterJob() {
  if (filterJob) {
    filterJob.cancelled = true;
    filterJob = null;
  }
}

function schedulePreview() {
  if (!state.filter || !state.original) return;
  if (!state.filter.preview) {
    cancelFilterJob();
    state.filter.cached = null;
    rerender();
    return;
  }
  const channels = getEnabledFilterChannels();
  if (channels.length === 0) {
    cancelFilterJob();
    state.filter.cached = null;
    rerender();
    setFilterStatus("Не выбран ни один канал");
    return;
  }
  cancelFilterJob();
  setFilterStatus("Вычисление…", true);
  const { width, height, rgba } = state.original;
  const kernel = state.filter.kernel.slice();
  const edge = state.filter.edge;
  filterJob = startConvolution(rgba, width, height, kernel, channels, edge, {
    onProgress: (p) => {
      setFilterStatus(`Вычисление… ${Math.round(p * 100)}%`, true);
    },
    onDone: (out) => {
      filterJob = null;
      state.filter.cached = out;
      setFilterStatus("");
      rerender();
    },
  });
}

function openFilterDialog() {
  if (!state.original) return;
  state.filter = {
    preset: "identity",
    kernel: [...FILTER_PRESETS.identity.kernel],
    edge: "copy",
    preview: true,
    cached: null,
  };
  els.filterPreset.value = "identity";
  els.filterEdge.value = "copy";
  els.filterPreview.checked = true;
  els.filterDialog.querySelectorAll('[data-ch]').forEach((cb) => {
    cb.checked = cb.dataset.ch !== "A";
  });
  setKernelInputs(state.filter.kernel);
  setFilterStatus("");
  openModal(els.filterDialog);
  schedulePreview();
}

function closeFilterDialog() {
  cancelFilterJob();
  state.filter = null;
  setFilterStatus("");
  closeModal(els.filterDialog);
  rerender();
}

function applyFilterToImage() {
  if (!state.filter || !state.original) return;
  const channels = getEnabledFilterChannels();
  if (channels.length === 0) {
    setFilterStatus("Не выбран ни один канал");
    return;
  }
  els.filterApply.disabled = true;
  els.filterReset.disabled = true;
  els.filterCancel.disabled = true;
  els.filterClose.disabled = true;
  setFilterStatus("Применение…", true);

  cancelFilterJob();
  const { width, height, rgba } = state.original;
  const kernel = state.filter.kernel.slice();
  const edge = state.filter.edge;

  filterJob = startConvolution(rgba, width, height, kernel, channels, edge, {
    onProgress: (p) => setFilterStatus(`Применение… ${Math.round(p * 100)}%`, true),
    onDone: (out) => {
      filterJob = null;
      state.original = { ...state.original, rgba: out };
      els.filterApply.disabled = false;
      els.filterReset.disabled = false;
      els.filterCancel.disabled = false;
      els.filterClose.disabled = false;
      renderChannelsPanel();
      closeFilterDialog();
      setStatus("Фильтр применён");
    },
  });
}

setupModal(els.filterDialog, { onClose: closeFilterDialog });

els.filterBtn.addEventListener("click", openFilterDialog);
els.filterClose.addEventListener("click", closeFilterDialog);
els.filterCancel.addEventListener("click", closeFilterDialog);
els.filterApply.addEventListener("click", applyFilterToImage);

els.filterReset.addEventListener("click", () => {
  if (!state.filter) return;
  state.filter.preset = "identity";
  state.filter.kernel = [...FILTER_PRESETS.identity.kernel];
  state.filter.edge = "copy";
  els.filterPreset.value = "identity";
  els.filterEdge.value = "copy";
  els.filterDialog.querySelectorAll('[data-ch]').forEach((cb) => {
    cb.checked = cb.dataset.ch !== "A";
  });
  setKernelInputs(state.filter.kernel);
  schedulePreview();
});

els.filterPreset.addEventListener("change", (e) => {
  if (!state.filter) return;
  const key = e.target.value;
  const p = FILTER_PRESETS[key];
  if (!p) return;
  state.filter.preset = key;
  state.filter.kernel = [...p.kernel];
  setKernelInputs(state.filter.kernel);
  schedulePreview();
});

els.filterEdge.addEventListener("change", (e) => {
  if (!state.filter) return;
  state.filter.edge = e.target.value;
  schedulePreview();
});

els.filterPreview.addEventListener("change", (e) => {
  if (!state.filter) return;
  state.filter.preview = e.target.checked;
  if (!state.filter.preview) {
    cancelFilterJob();
    setFilterStatus("");
    rerender();
  } else {
    schedulePreview();
  }
});

els.filterDialog.querySelectorAll('[data-ch]').forEach((cb) => {
  cb.addEventListener("change", () => schedulePreview());
});

populateFilterPresets();
buildKernelGrid();

els.zoomRange.addEventListener("input", (e) => {
  const pct = parseInt(e.target.value, 10);
  state.fitMode = false;
  setZoom(pct / 100, { reflectInSlider: false });
});

els.zoomFit.addEventListener("click", () => {
  if (!state.original) return;
  state.fitMode = true;
  setZoom(computeFitZoom());
});

let resizeRaf = null;
window.addEventListener("resize", () => {
  if (!state.original || !state.fitMode) return;
  if (resizeRaf != null) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    setZoom(computeFitZoom());
  });
});

async function handleFile(file) {
  if (!file) return;
  setStatus("Загрузка…");
  try {
    const image = await loadImage(file);
    state.original = image;
    state.fileName = file.name;
    state.layout = detectLayout(image);
    state.enabled = defaultEnabled();
    els.fileName.textContent = file.name;
    updateStatusBar(image);
    renderChannelsPanel();
    els.picker.innerHTML = '<p class="panel-hint">Выберите инструмент «Пипетка» и кликните по изображению.</p>';
    els.saveBtn.disabled = false;
    els.levelsBtn.disabled = false;
    els.resizeBtn.disabled = false;
    els.filterBtn.disabled = false;
    els.zoomRange.disabled = false;
    state.fitMode = true;
    setZoom(computeFitZoom());
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Ошибка: ${err.message}`, true);
  }
}

async function handleSave(format) {
  if (!state.original) return;
  try {
    const base = state.fileName ? stripExtension(state.fileName) : "image";
    await saveImage(state.original, format, base);
    setStatus(`Сохранено: ${format.toUpperCase()}`);
  } catch (err) {
    console.error(err);
    setStatus(`Ошибка сохранения: ${err.message}`, true);
  }
}

els.fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  handleFile(file);
  e.target.value = "";
});

els.saveBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (els.saveBtn.disabled) return;
  els.saveDropdown.classList.toggle("open");
});

els.saveMenu.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-format]");
  if (!li) return;
  els.saveDropdown.classList.remove("open");
  handleSave(li.dataset.format);
});

document.addEventListener("click", () => {
  els.saveDropdown.classList.remove("open");
});

els.toolBtns.forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

els.channels.addEventListener("click", (e) => {
  const card = e.target.closest(".channel-card");
  if (!card) return;
  const ch = card.dataset.channel;
  state.enabled[ch] = !state.enabled[ch];
  refreshChannelCardStates();
  rerender();
});

els.canvas.addEventListener("click", (e) => {
  if (state.tool !== "eyedropper" || !state.original) return;
  const pt = canvasToImagePixel(e);
  if (!pt) return;
  const rgb = samplePixel(pt.x, pt.y);
  renderPickerInfo(pt, rgb);
});

["dragenter", "dragover"].forEach((evt) => {
  els.canvasWrap.addEventListener(evt, (e) => {
    e.preventDefault();
    els.canvasWrap.classList.add("drag-over");
  });
});
["dragleave", "drop"].forEach((evt) => {
  els.canvasWrap.addEventListener(evt, (e) => {
    e.preventDefault();
    if (evt === "dragleave" && e.target !== els.canvasWrap) return;
    els.canvasWrap.classList.remove("drag-over");
  });
});
els.canvasWrap.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

setTool("hand");
