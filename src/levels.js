const CHANNELS = ["master", "R", "G", "B", "A"];

export function identityLevels() {
  return { bp: 0, wp: 255, g: 1.0 };
}

export function defaultLevelsState() {
  const s = {};
  for (const c of CHANNELS) s[c] = identityLevels();
  return s;
}

export function isIdentity(s) {
  return s.bp === 0 && s.wp === 255 && Math.abs(s.g - 1.0) < 1e-6;
}

export function buildLut(bp, wp, gamma) {
  const lut = new Uint8ClampedArray(256);
  if (wp <= bp) {
    for (let i = 0; i < 256; i++) lut[i] = i >= wp ? 255 : 0;
    return lut;
  }
  const range = wp - bp;
  const invG = 1 / gamma;
  for (let i = 0; i < 256; i++) {
    if (i <= bp) { lut[i] = 0; continue; }
    if (i >= wp) { lut[i] = 255; continue; }
    const norm = (i - bp) / range;
    lut[i] = Math.round(255 * Math.pow(norm, invG));
  }
  return lut;
}

function combineLuts(a, b) {
  const out = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) out[i] = b[a[i]];
  return out;
}

export function applyLevels(rgba, state) {
  const masterLut = buildLut(state.master.bp, state.master.wp, state.master.g);
  const rLut = combineLuts(masterLut, buildLut(state.R.bp, state.R.wp, state.R.g));
  const gLut = combineLuts(masterLut, buildLut(state.G.bp, state.G.wp, state.G.g));
  const bLut = combineLuts(masterLut, buildLut(state.B.bp, state.B.wp, state.B.g));
  const aLut = buildLut(state.A.bp, state.A.wp, state.A.g);

  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = rLut[rgba[i]];
    out[i + 1] = gLut[rgba[i + 1]];
    out[i + 2] = bLut[rgba[i + 2]];
    out[i + 3] = aLut[rgba[i + 3]];
  }
  return out;
}

export function isAllIdentity(state) {
  for (const c of CHANNELS) if (!isIdentity(state[c])) return false;
  return true;
}

export function computeHistogram(rgba, channel) {
  const hist = new Uint32Array(256);
  if (channel === "master") {
    for (let i = 0; i < rgba.length; i += 4) {
      const lum = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114 + 500) / 1000;
      hist[Math.min(255, Math.max(0, Math.round(lum)))]++;
    }
  } else {
    const off = { R: 0, G: 1, B: 2, A: 3 }[channel];
    for (let i = 0; i < rgba.length; i += 4) hist[rgba[i + off]]++;
  }
  return hist;
}
