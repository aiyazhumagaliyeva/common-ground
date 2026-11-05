// ============================================================
//  ROUNDED QR CODE
//  Draws a QR code as an SVG in the "soft" style:
//  - every square ("module") becomes a round dot
//  - dots that touch are joined, so they read as smooth blobs
//  - the 3 corner squares ("finder patterns") are rounded squares
//  - optional scan brackets around the code
//  All sizes are in "modules" (1 module = 1 small QR square).
// ============================================================
import QRCode from 'https://esm.sh/qrcode@1.5.4?target=es2020';

export const QR_STYLE = {
  ink: "#111111",        // color of the code
  paper: "transparent",  // background behind the code
  quiet: 2,              // empty margin around the code (keep ≥ 2 so phones can read it)
  dot: 0.92,             // dot size (1 = touching). Below 0.8 gets hard to scan
  finderRadius: 2.2,     // roundness of the big corner squares
  brackets: true,        // the 4 corner brackets
  bracketGap: 1.2,       // distance between code and brackets
  bracketLength: 3.5,    // length of each bracket arm
  bracketWidth: 0.55,    // line thickness of brackets
};

export function drawQR(container, text, style = {}) {
  const s = { ...QR_STYLE, ...style };
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.modules.get(r, c);
  const inFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  const pad = s.quiet + (s.brackets ? s.bracketGap + s.bracketWidth : 0);
  const total = n + pad * 2;
  const R = s.dot / 2;
  let shapes = "";

  // 1. dots + bridges between neighbours (makes the smooth "blob" shapes)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c) || inFinder(r, c)) continue;
      const x = c + pad + 0.5, y = r + pad + 0.5;
      shapes += `<circle cx="${x}" cy="${y}" r="${R}"/>`;
      if (dark(r, c + 1) && !inFinder(r, c + 1))
        shapes += `<rect x="${x}" y="${y - R}" width="1" height="${s.dot}"/>`;
      if (dark(r + 1, c) && !inFinder(r + 1, c))
        shapes += `<rect x="${x - R}" y="${y}" width="${s.dot}" height="1"/>`;
      // 2×2 block → fill the gap in the middle so it becomes one solid blob
      if (dark(r, c + 1) && dark(r + 1, c) && dark(r + 1, c + 1) &&
          !inFinder(r + 1, c + 1) && !inFinder(r, c + 1) && !inFinder(r + 1, c))
        shapes += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }

  // 2. the three corner squares, rounded
  const finder = (r0, c0) => {
    const x = c0 + pad, y = r0 + pad, k = s.finderRadius;
    return (
      // outer ring = big rounded square with a rounded hole (even-odd fill)
      `<path fill-rule="evenodd" d="${rr(x, y, 7, 7, k)} ${rr(x + 1, y + 1, 5, 5, k * 0.6)}"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${k * 0.45}"/>`
    );
  };
  shapes += finder(0, 0) + finder(0, n - 7) + finder(n - 7, 0);

  // 3. scan brackets in the corners
  let brackets = "";
  if (s.brackets) {
    const o = s.bracketWidth / 2, L = s.bracketLength;
    const a = o, b = total - o;               // outer edges
    const corner = (x, y, dx, dy) =>
      `<path d="M ${x} ${y + dy * L} V ${y + dy * 1.2} Q ${x} ${y} ${x + dx * 1.2} ${y} H ${x + dx * L}"/>`;
    brackets =
      `<g fill="none" stroke="${s.ink}" stroke-width="${s.bracketWidth}" stroke-linecap="round">` +
      corner(a, a, 1, 1) + corner(b, a, -1, 1) + corner(a, b, 1, -1) + corner(b, b, -1, -1) +
      `</g>`;
  }

  container.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="100%" height="100%" shape-rendering="geometricPrecision">` +
    (s.paper !== "transparent" ? `<rect width="${total}" height="${total}" fill="${s.paper}"/>` : "") +
    `<g fill="${s.ink}">${shapes}</g>${brackets}</svg>`;
}

// rounded-rectangle path
function rr(x, y, w, h, r) {
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} ` +
         `Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} ` +
         `V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}
