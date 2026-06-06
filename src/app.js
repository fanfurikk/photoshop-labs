import { loadImage, saveImage, stripExtension } from "./imageIO.js";

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
};

const FORMAT_LABEL = {
  png: "PNG",
  jpg: "JPEG",
  gb7: "GB7",
};

const state = {
  image: null,
  fileName: null,
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

function renderImage(image) {
  const { width, height, rgba } = image;
  els.canvas.width = width;
  els.canvas.height = height;
  const ctx = els.canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  els.canvas.classList.add("loaded");
  els.emptyHint.style.display = "none";
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

async function handleFile(file) {
  if (!file) return;
  setStatus("Загрузка…");
  try {
    const image = await loadImage(file);
    state.image = image;
    state.fileName = file.name;
    els.fileName.textContent = file.name;
    renderImage(image);
    updateStatusBar(image);
    els.saveBtn.disabled = false;
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Ошибка: ${err.message}`, true);
  }
}

async function handleSave(format) {
  if (!state.image) return;
  try {
    const base = state.fileName ? stripExtension(state.fileName) : "image";
    await saveImage(state.image, format, base);
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
