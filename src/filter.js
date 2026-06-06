export const PRESETS = {
  identity: {
    label: "Тождественное",
    kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  },
  sharpen: {
    label: "Повышение резкости",
    kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  },
  gaussian: {
    label: "Гаусс 3×3",
    kernel: [1 / 16, 2 / 16, 1 / 16, 2 / 16, 4 / 16, 2 / 16, 1 / 16, 2 / 16, 1 / 16],
  },
  box: {
    label: "Прямоугольное размытие",
    kernel: [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9],
  },
  prewittX: {
    label: "Прюитт по X (вертикальные границы)",
    kernel: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
  },
  prewittY: {
    label: "Прюитт по Y (горизонтальные границы)",
    kernel: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
  },
};

export const CHANNEL_OFFSET = { R: 0, G: 1, B: 2, A: 3 };

export const EDGE_LABEL = {
  copy: "Копирование (replicate)",
  black: "Чёрный",
  white: "Белый",
};

function sample(rgba, w, h, x, y, c, edge) {
  if (x >= 0 && x < w && y >= 0 && y < h) return rgba[(y * w + x) * 4 + c];
  if (edge === "copy") {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return rgba[(cy * w + cx) * 4 + c];
  }
  if (edge === "white") return 255;
  return 0;
}

function convolveRange(src, dst, w, h, kernel, channels, edge, y0, y1) {
  const k0 = kernel[0], k1 = kernel[1], k2 = kernel[2];
  const k3 = kernel[3], k4 = kernel[4], k5 = kernel[5];
  const k6 = kernel[6], k7 = kernel[7], k8 = kernel[8];

  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      for (let i = 0; i < channels.length; i++) {
        const c = channels[i];
        const s =
          k0 * sample(src, w, h, x - 1, y - 1, c, edge) +
          k1 * sample(src, w, h, x,     y - 1, c, edge) +
          k2 * sample(src, w, h, x + 1, y - 1, c, edge) +
          k3 * sample(src, w, h, x - 1, y,     c, edge) +
          k4 * sample(src, w, h, x,     y,     c, edge) +
          k5 * sample(src, w, h, x + 1, y,     c, edge) +
          k6 * sample(src, w, h, x - 1, y + 1, c, edge) +
          k7 * sample(src, w, h, x,     y + 1, c, edge) +
          k8 * sample(src, w, h, x + 1, y + 1, c, edge);
        dst[o + c] = s;
      }
    }
  }
}

export function startConvolution(rgba, w, h, kernel, enabledChannels, edge, { onProgress, onDone, onCancel } = {}) {
  const job = { cancelled: false };
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  const channels = enabledChannels.map((c) => CHANNEL_OFFSET[c]);

  const PIXELS_PER_CHUNK = 60000;
  const rowsPerChunk = Math.max(1, Math.floor(PIXELS_PER_CHUNK / Math.max(1, w)));

  (async () => {
    for (let y0 = 0; y0 < h; y0 += rowsPerChunk) {
      if (job.cancelled) { onCancel?.(); return; }
      const y1 = Math.min(h, y0 + rowsPerChunk);
      convolveRange(rgba, out, w, h, kernel, channels, edge, y0, y1);
      if (onProgress) onProgress(y1 / h);
      if (y1 < h) await new Promise((r) => setTimeout(r, 0));
    }
    if (!job.cancelled) onDone?.(out);
  })();

  return job;
}
