const ALL_CHANNELS = ["Y", "R", "G", "B", "A"];

export function detectLayout(image) {
  if (image.format === "gb7") {
    return image.hasMask ? "YA" : "Y";
  }
  const rgba = image.rgba;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) return "RGBA";
  }
  return "RGB";
}

export function channelsForLayout(layout) {
  switch (layout) {
    case "Y": return ["Y"];
    case "YA": return ["Y", "A"];
    case "RGB": return ["R", "G", "B"];
    case "RGBA": return ["R", "G", "B", "A"];
    default: return [];
  }
}

export function defaultEnabled() {
  const e = {};
  for (const c of ALL_CHANNELS) e[c] = true;
  return e;
}

export function buildDisplayRgba(image, layout, enabled) {
  const src = image.rgba;
  const out = new Uint8ClampedArray(src.length);
  const pixels = src.length >> 2;

  if (layout === "Y" || layout === "YA") {
    const yOn = enabled.Y;
    const aOn = layout === "YA" && enabled.A;
    const maskOnly = !yOn && aOn;
    for (let i = 0; i < pixels; i++) {
      const o = i << 2;
      if (maskOnly) {
        const a = src[o + 3];
        out[o] = out[o + 1] = out[o + 2] = a;
        out[o + 3] = 255;
      } else {
        const y = yOn ? src[o] : 0;
        out[o] = out[o + 1] = out[o + 2] = y;
        out[o + 3] = layout === "YA" ? (aOn ? src[o + 3] : 255) : 255;
      }
    }
    return out;
  }

  const rOn = enabled.R, gOn = enabled.G, bOn = enabled.B;
  const aOn = layout === "RGBA" && enabled.A;
  const maskOnly = !rOn && !gOn && !bOn && aOn;
  for (let i = 0; i < pixels; i++) {
    const o = i << 2;
    if (maskOnly) {
      const a = src[o + 3];
      out[o] = out[o + 1] = out[o + 2] = a;
      out[o + 3] = 255;
    } else {
      out[o] = rOn ? src[o] : 0;
      out[o + 1] = gOn ? src[o + 1] : 0;
      out[o + 2] = bOn ? src[o + 2] : 0;
      out[o + 3] = layout === "RGBA" ? (aOn ? src[o + 3] : 255) : 255;
    }
  }
  return out;
}

export function buildChannelThumbnail(image, channel, thumbW, thumbH) {
  const { rgba, width, height } = image;
  const out = new Uint8ClampedArray(thumbW * thumbH * 4);
  for (let ty = 0; ty < thumbH; ty++) {
    const sy = Math.floor((ty * height) / thumbH);
    for (let tx = 0; tx < thumbW; tx++) {
      const sx = Math.floor((tx * width) / thumbW);
      const so = (sy * width + sx) << 2;
      const to = (ty * thumbW + tx) << 2;
      const r = rgba[so], g = rgba[so + 1], b = rgba[so + 2], a = rgba[so + 3];

      let or = 0, og = 0, ob = 0;
      switch (channel) {
        case "Y": or = og = ob = r; break;
        case "R": or = r; break;
        case "G": og = g; break;
        case "B": ob = b; break;
        case "A": or = og = ob = a; break;
      }
      out[to] = or;
      out[to + 1] = og;
      out[to + 2] = ob;
      out[to + 3] = 255;
    }
  }
  return out;
}

export const CHANNEL_LABEL = {
  Y: "Grayscale",
  R: "Red",
  G: "Green",
  B: "Blue",
  A: "Alpha",
};
