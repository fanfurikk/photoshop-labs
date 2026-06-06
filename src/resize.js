function resizeNearest(src, srcW, srcH, dstW, dstH) {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    const sy = Math.min(srcH - 1, Math.max(0, Math.floor((dy + 0.5) * scaleY)));
    const rowSrc = sy * srcW;
    const rowDst = dy * dstW;
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.min(srcW - 1, Math.max(0, Math.floor((dx + 0.5) * scaleX)));
      const so = (rowSrc + sx) << 2;
      const dorig = (rowDst + dx) << 2;
      out[dorig] = src[so];
      out[dorig + 1] = src[so + 1];
      out[dorig + 2] = src[so + 2];
      out[dorig + 3] = src[so + 3];
    }
  }
  return out;
}

function resizeBilinear(src, srcW, srcH, dstW, dstH) {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    const fy = (dy + 0.5) * scaleY - 0.5;
    const sy0 = Math.max(0, Math.floor(fy));
    const sy1 = Math.min(srcH - 1, sy0 + 1);
    const ty = Math.max(0, Math.min(1, fy - sy0));
    const ity = 1 - ty;
    const row0 = sy0 * srcW;
    const row1 = sy1 * srcW;
    const rowDst = dy * dstW;
    for (let dx = 0; dx < dstW; dx++) {
      const fx = (dx + 0.5) * scaleX - 0.5;
      const sx0 = Math.max(0, Math.floor(fx));
      const sx1 = Math.min(srcW - 1, sx0 + 1);
      const tx = Math.max(0, Math.min(1, fx - sx0));
      const itx = 1 - tx;

      const w00 = itx * ity;
      const w01 = tx * ity;
      const w10 = itx * ty;
      const w11 = tx * ty;

      const o00 = (row0 + sx0) << 2;
      const o01 = (row0 + sx1) << 2;
      const o10 = (row1 + sx0) << 2;
      const o11 = (row1 + sx1) << 2;
      const dorig = (rowDst + dx) << 2;

      out[dorig]     = src[o00]     * w00 + src[o01]     * w01 + src[o10]     * w10 + src[o11]     * w11;
      out[dorig + 1] = src[o00 + 1] * w00 + src[o01 + 1] * w01 + src[o10 + 1] * w10 + src[o11 + 1] * w11;
      out[dorig + 2] = src[o00 + 2] * w00 + src[o01 + 2] * w01 + src[o10 + 2] * w10 + src[o11 + 2] * w11;
      out[dorig + 3] = src[o00 + 3] * w00 + src[o01 + 3] * w01 + src[o10 + 3] * w10 + src[o11 + 3] * w11;
    }
  }
  return out;
}

export const INTERPOLATORS = {
  bilinear: {
    label: "Билинейная",
    description:
      "Усредняет 4 соседних пикселя с весами, обратно пропорциональными расстоянию. Даёт сглаженный результат без зубчатых границ. Хороший выбор для фотографий и при уменьшении изображения.",
    resize: resizeBilinear,
  },
  nearest: {
    label: "Ближайший сосед",
    description:
      "Берёт значение ближайшего исходного пикселя без сглаживания. Сохраняет резкие границы и точные цвета. Подходит для пиксель-арта и масштабирования изображений с чёткими краями.",
    resize: resizeNearest,
  },
};

export function resize(srcRgba, srcW, srcH, dstW, dstH, method = "bilinear") {
  const entry = INTERPOLATORS[method];
  if (!entry) throw new Error(`Неизвестный метод интерполяции: ${method}`);
  return entry.resize(srcRgba, srcW, srcH, dstW, dstH);
}
