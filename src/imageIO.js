import { decodeGb7, encodeGb7 } from "./gb7.js";

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Ошибка чтения файла"));
    reader.readAsArrayBuffer(file);
  });
}

function detectFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".gb7")) return "gb7";
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function pngColorDepth(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 26) return null;
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== PNG_SIGNATURE[i]) return null;
  }
  if (
    view.getUint8(12) !== 0x49 || view.getUint8(13) !== 0x48 ||
    view.getUint8(14) !== 0x44 || view.getUint8(15) !== 0x52
  ) {
    return null;
  }
  const bitDepth = view.getUint8(24);
  const colorType = view.getUint8(25);
  if (colorType === 3) return bitDepth;
  const channels = PNG_CHANNELS[colorType];
  if (!channels) return null;
  return bitDepth * channels;
}

async function decodeBrowserImage(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Не удалось декодировать изображение"));
        el.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { width: canvas.width, height: canvas.height, rgba: data.data };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { width: canvas.width, height: canvas.height, rgba: data.data };
}

export async function loadImage(file) {
  const format = detectFormat(file);
  if (!format) throw new Error("Неподдерживаемый формат файла");

  if (format === "gb7") {
    const buf = await readAsArrayBuffer(file);
    const { width, height, rgba, hasMask, colorDepth } = decodeGb7(buf);
    return { width, height, rgba, format: "gb7", colorDepth, hasMask };
  }

  let colorDepth = format === "jpg" ? 24 : 32;
  if (format === "png") {
    const buf = await readAsArrayBuffer(file);
    const depth = pngColorDepth(buf);
    if (depth != null) colorDepth = depth;
  }

  const { width, height, rgba } = await decodeBrowserImage(file);
  return {
    width,
    height,
    rgba,
    format,
    colorDepth,
    hasMask: false,
  };
}

function canvasFromRgba(rgba, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось закодировать изображение"))),
      mime,
      quality
    );
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveImage(image, format, baseName = "image") {
  const { width, height, rgba } = image;

  if (format === "gb7" || format === "gb7-mask") {
    const buf = encodeGb7(rgba, width, height, { includeMask: format === "gb7-mask" });
    triggerDownload(new Blob([buf], { type: "application/octet-stream" }), `${baseName}.gb7`);
    return;
  }

  const canvas = canvasFromRgba(rgba, width, height);
  if (format === "png") {
    const blob = await canvasToBlob(canvas, "image/png");
    triggerDownload(blob, `${baseName}.png`);
    return;
  }
  if (format === "jpg") {
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    triggerDownload(blob, `${baseName}.jpg`);
    return;
  }

  throw new Error(`Неизвестный формат сохранения: ${format}`);
}

export function stripExtension(name) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}
