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

const els = {
  fileInput: document.getElementById("file-input"),
  saveBtn: document.getElementById("save-btn"),
  saveMenu: document.getElementById("save-menu"),
  saveDropdown: document.querySelector(".dropdown"),
  fileName: document.getElementById("file-name"),
  canvas: document.getElementById("canvas"),
  canvasWrap: document.getElementById("canvas-wrap"),
  emptyHint: document.getElementById("empty-hint"),
  statusWidth: document.getElementById("status-width"),
  statusHeight: document.getElementById("status-height"),
  statusDepth: document.getElementById("status-depth"),
  statusFormat: document.getElementById("status-format"),
  statusMessage: document.getElementById("status-message"),
  channels: document.getElementById("channels"),
  picker: document.getElementById("picker"),
  toolBtns: document.querySelectorAll(".tool-btn"),
};

const FORMAT_LABEL = { png: "PNG", jpg: "JPEG", gb7: "GB7" };

const state = {
  original: null,
  fileName: null,
  layout: null,
  enabled: defaultEnabled(),
  tool: "hand",
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

function rerender() {
  if (!state.original) return;
  const display = buildDisplayRgba(state.original, state.layout, state.enabled);
  paintCanvas(display, state.original.width, state.original.height);
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
  const sx = els.canvas.width / rect.width;
  const sy = els.canvas.height / rect.height;
  const x = Math.floor((event.clientX - rect.left) * sx);
  const y = Math.floor((event.clientY - rect.top) * sy);
  if (x < 0 || y < 0 || x >= els.canvas.width || y >= els.canvas.height) return null;
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
    rerender();
    updateStatusBar(image);
    renderChannelsPanel();
    els.picker.innerHTML = '<p class="panel-hint">Выберите инструмент «Пипетка» и кликните по изображению.</p>';
    els.saveBtn.disabled = false;
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
