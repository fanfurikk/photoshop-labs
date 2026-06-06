function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const Xn = 0.95047;
const Yn = 1.0;
const Zn = 1.08883;
const DELTA3 = Math.pow(6 / 29, 3);
const KAPPA = Math.pow(29 / 6, 2) / 3;

function labF(t) {
  return t > DELTA3 ? Math.cbrt(t) : t * KAPPA + 4 / 29;
}

export function rgbToLab(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  const fx = labF(X / Xn);
  const fy = labF(Y / Yn);
  const fz = labF(Z / Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}
