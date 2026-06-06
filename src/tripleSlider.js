export class TripleSlider {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.bp = 0;
    this.wp = 255;
    this.g = 1.0;
    this.thumbBp = root.querySelector('[data-handle="bp"]');
    this.thumbG = root.querySelector('[data-handle="g"]');
    this.thumbWp = root.querySelector('[data-handle="wp"]');
    this.attach();
  }

  setValues(bp, g, wp) {
    this.bp = bp;
    this.g = g;
    this.wp = wp;
    this.updatePositions();
  }

  updatePositions() {
    const w = this.root.clientWidth;
    if (w === 0) return;
    const bpX = (this.bp / 255) * w;
    const wpX = (this.wp / 255) * w;
    const t = Math.pow(0.5, this.g);
    const gX = bpX + t * (wpX - bpX);
    this.thumbBp.style.left = bpX + "px";
    this.thumbG.style.left = gX + "px";
    this.thumbWp.style.left = wpX + "px";
  }

  attach() {
    for (const [which, el] of [["bp", this.thumbBp], ["g", this.thumbG], ["wp", this.thumbWp]]) {
      el.addEventListener("pointerdown", (e) => this.beginDrag(which, e));
    }
  }

  beginDrag(which, ev) {
    ev.preventDefault();
    const rect = this.root.getBoundingClientRect();

    const move = (e) => {
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      if (which === "bp") {
        const v = Math.round((x / rect.width) * 255);
        this.bp = Math.min(v, this.wp - 1);
      } else if (which === "wp") {
        const v = Math.round((x / rect.width) * 255);
        this.wp = Math.max(v, this.bp + 1);
      } else {
        const bpX = (this.bp / 255) * rect.width;
        const wpX = (this.wp / 255) * rect.width;
        const clamped = Math.max(bpX + 0.5, Math.min(wpX - 0.5, x));
        const t = (clamped - bpX) / (wpX - bpX);
        const tClamped = Math.max(0.001, Math.min(0.999, t));
        let g = Math.log(tClamped) / Math.log(0.5);
        g = Math.max(0.1, Math.min(9.9, g));
        this.g = Math.round(g * 100) / 100;
      }
      this.updatePositions();
      this.onChange(this.bp, this.g, this.wp);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
}
