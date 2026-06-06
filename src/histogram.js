const CHANNEL_COLOR = {
  master: "rgba(200, 200, 200, 0.9)",
  R: "rgba(231, 76, 60, 0.9)",
  G: "rgba(46, 204, 113, 0.9)",
  B: "rgba(52, 152, 219, 0.9)",
  A: "rgba(190, 190, 190, 0.9)",
};

export function drawHistogram(canvas, hist, channel, { log = false } = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, W, H);

  let max = 0;
  for (let i = 0; i < hist.length; i++) if (hist[i] > max) max = hist[i];
  if (max === 0) return;

  const logMax = Math.log(max + 1);
  const barW = W / 256;
  ctx.fillStyle = CHANNEL_COLOR[channel] || "#fff";
  for (let i = 0; i < 256; i++) {
    const count = hist[i];
    if (count === 0) continue;
    const t = log ? Math.log(count + 1) / logMax : count / max;
    const h = t * H;
    const x = i * barW;
    ctx.fillRect(x, H - h, barW + 0.5, h);
  }
}
