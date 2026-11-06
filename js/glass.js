// ============================================================
//  LIQUID GLASS — the web version of Figma's "Glass" effect
//  Values copied from Figma (prototype-2 → color-ref → menu):
//    frost 4 · refraction 1 · depth 9 · light −45° · light 80% · dispersion 0.13 · splay 1
//  How it works:
//   - refraction + depth: near the edge (the "depth" band) the background is bent,
//     like looking through the rim of a glass lens (SVG displacement map)
//   - dispersion: red / green / blue bend slightly differently (rainbow edge)
//   - frost: a soft blur of what's behind
//   - light: a bright rim on the lit side (−45° = top-left), weaker on the other (splay)
//  Chrome / Edge get the full effect. Safari / Firefox can't bend the
//  background yet, so they get frost + light only.
// ============================================================

export const GLASS = {
  frost: 4,          // blur of the background (px)
  refraction: 1,     // how strongly the edge bends the background (0–1)
  depth: 9,          // width of the bending rim (px)
  lightAngle: -45,   // where the light comes from (degrees, −45 = top-left)
  light: 0.8,        // brightness of the rim light (0–1)
  dispersion: 0.13,  // rainbow split at the edge (0–1)
  splay: 1,          // light on the opposite side too (0–1)
};

const isChromium = !!(navigator.userAgentData && navigator.userAgentData.brands
  .some(b => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)));

let count = 0;

export function makeGlass(el, g = GLASS) {
  const id = "cg-glass-" + (++count);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.setAttribute("aria-hidden", "true");
  document.body.appendChild(svg);

  // light: bright rim on the lit side, softer rim opposite (splay), glow inside the depth band
  const a = (g.lightAngle * Math.PI) / 180;
  const lx = Math.cos(a), ly = Math.sin(a);              // −45° → light from top-left
  const dx = (-lx * 1.5).toFixed(2), dy = (ly * 1.5).toFixed(2);
  el.style.boxShadow = [
    `inset ${dx}px ${dy}px 1px -0.5px rgba(255,255,255,${g.light})`,
    `inset ${-dx}px ${-dy}px 1px -0.5px rgba(255,255,255,${(g.light * 0.45 * g.splay).toFixed(2)})`,
    `inset 0 0 ${g.depth}px rgba(255,255,255,${(0.18 * g.light).toFixed(2)})`,
  ].join(", ");

  const frostOnly = `blur(${g.frost}px)`;
  el.style.backdropFilter = el.style.webkitBackdropFilter = frostOnly;
  if (!isChromium) return;

  function build() {
    const r = el.getBoundingClientRect();
    const W = Math.max(2, Math.round(r.width)), H = Math.max(2, Math.round(r.height));
    const R = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, H / 2, W / 2);
    const D = g.depth;

    // displacement map: each pixel says which way (and how far) to bend.
    // red = left/right, green = up/down, 128 = no bending
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d"), img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // distance to the rounded-rectangle edge + direction pointing inward
        const px = x + 0.5, py = y + 0.5;
        const cx = Math.min(Math.max(px, R), W - R), cy = Math.min(Math.max(py, R), H - R);
        let nx = 0, ny = 0, dist;
        if ((px < R || px > W - R) && (py < R || py > H - R)) {     // in a rounded corner
          const vx = px - cx, vy = py - cy, L = Math.hypot(vx, vy) || 1;
          dist = R - L; nx = -vx / L; ny = -vy / L;
        } else {                                                   // along a straight side
          const dl = px, dr = W - px, dt = py, db = H - py;
          dist = Math.min(dl, dr, dt, db);
          if (dist === dl) nx = 1; else if (dist === dr) nx = -1; else if (dist === dt) ny = 1; else ny = -1;
        }
        const k = dist < D ? Math.pow(1 - Math.max(0, dist) / D, 2) : 0;   // strongest at the rim
        const i = (y * W + x) * 4;
        d[i] = 128 + nx * k * 127;
        d[i + 1] = 128 + ny * k * 127;
        d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const S = D * 2.2 * g.refraction;                   // max shift in px
    const s = (m) => (S * m).toFixed(2);
    const disp = g.dispersion;
    svg.innerHTML = `
      <filter id="${id}" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage href="${c.toDataURL()}" x="0" y="0" width="${W}" height="${H}" result="map" preserveAspectRatio="none"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="${g.frost / 2}" result="frost"/>
        <feDisplacementMap in="frost" in2="map" scale="${s(1 + disp)}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
        <feDisplacementMap in="frost" in2="map" scale="${s(1)}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
        <feDisplacementMap in="frost" in2="map" scale="${s(1 - disp)}" xChannelSelector="R" yChannelSelector="G" result="db"/>
        <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
        <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
        <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
        <feBlend in="r" in2="g" mode="screen" result="rg"/>
        <feBlend in="rg" in2="b" mode="screen"/>
      </filter>`;
    el.style.backdropFilter = el.style.webkitBackdropFilter = `url(#${id})`;
  }
  build();
  new ResizeObserver(() => requestAnimationFrame(build)).observe(el);
}
