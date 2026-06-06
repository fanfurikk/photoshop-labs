const SIGNATURE = [0x47, 0x42, 0x37, 0x1d];
const VERSION = 0x01;
const HEADER_SIZE = 12;

export class Gb7DecodeError extends Error {}

export function decodeGb7(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Gb7DecodeError("Файл слишком короткий: нет заголовка GB7");
  }
  for (let i = 0; i < 4; i++) {
    if (view.getUint8(i) !== SIGNATURE[i]) {
      throw new Gb7DecodeError("Неверная сигнатура GB7");
    }
  }

  const version = view.getUint8(4);
  if (version !== VERSION) {
    throw new Gb7DecodeError(`Неподдерживаемая версия GB7: ${version}`);
  }

  const flags = view.getUint8(5);
  const hasMask = (flags & 0x01) === 0x01;

  const width = view.getUint16(6, false);
  const height = view.getUint16(8, false);

  const pixelCount = width * height;
  if (buffer.byteLength < HEADER_SIZE + pixelCount) {
    throw new Gb7DecodeError(
      `Недостаточно данных пикселей: ожидалось ${pixelCount}, есть ${buffer.byteLength - HEADER_SIZE}`
    );
  }

  const pixels = new Uint8Array(buffer, HEADER_SIZE, pixelCount);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const byte = pixels[i];
    const gray7 = byte & 0x7f;
    const gray8 = (gray7 << 1) | (gray7 >> 6);
    const maskBit = (byte & 0x80) !== 0;

    const off = i * 4;
    rgba[off] = gray8;
    rgba[off + 1] = gray8;
    rgba[off + 2] = gray8;
    rgba[off + 3] = !hasMask || maskBit ? 255 : 0;
  }

  return {
    width,
    height,
    hasMask,
    rgba,
    colorDepth: hasMask ? 8 : 7,
  };
}

export function encodeGb7(rgba, width, height, { includeMask = false } = {}) {
  if (width <= 0 || height <= 0 || width > 0xffff || height > 0xffff) {
    throw new Error("Размеры выходят за пределы GB7 (1..65535)");
  }
  const pixelCount = width * height;
  if (rgba.length !== pixelCount * 4) {
    throw new Error("RGBA-буфер не соответствует размерам изображения");
  }

  const buffer = new ArrayBuffer(HEADER_SIZE + pixelCount);
  const view = new DataView(buffer);
  for (let i = 0; i < 4; i++) view.setUint8(i, SIGNATURE[i]);
  view.setUint8(4, VERSION);
  view.setUint8(5, includeMask ? 0x01 : 0x00);
  view.setUint16(6, width, false);
  view.setUint16(8, height, false);
  view.setUint16(10, 0, false);

  const out = new Uint8Array(buffer, HEADER_SIZE, pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];
    const a = rgba[off + 3];
    const luma = (r * 299 + g * 587 + b * 114 + 500) / 1000;
    const gray7 = Math.min(127, Math.max(0, Math.round(luma / 2)));

    if (includeMask) {
      const maskBit = a >= 128 ? 0x80 : 0x00;
      out[i] = maskBit | gray7;
    } else {
      out[i] = gray7;
    }
  }

  return buffer;
}
