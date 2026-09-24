// Shape descriptor shared by the browser (user drawing) and the build script (artworks).
// Input: 96x96 grayscale (0-255) + optional validity mask. Output: L2-normalized
// grid of oriented edge energy (16x16 cells x 4 orientations = 1024 dims).
(function (root) {
  const S = 96, CELL = 6, G = S / CELL, NB = 4, DIM = G * G * NB;

  function describe(gray, mask) {
    const mag = new Float32Array(S * S), ang = new Float32Array(S * S);
    const ok = (i) => !mask || mask[i];
    const vals = [];
    for (let y = 1; y < S - 1; y++) {
      for (let x = 1; x < S - 1; x++) {
        const i = y * S + x;
        if (mask && !(ok(i - S - 1) && ok(i - S + 1) && ok(i + S - 1) && ok(i + S + 1) && ok(i - 1) && ok(i + 1) && ok(i - S) && ok(i + S))) continue;
        const a = gray[i - S - 1], b = gray[i - S], c = gray[i - S + 1];
        const d = gray[i - 1], f = gray[i + 1];
        const g = gray[i + S - 1], h = gray[i + S], k = gray[i + S + 1];
        const gx = (c + 2 * f + k) - (a + 2 * d + g);
        const gy = (g + 2 * h + k) - (a + 2 * b + c);
        const m = Math.hypot(gx, gy);
        if (m < 8) continue;
        mag[i] = m;
        let t = Math.atan2(gy, gx);
        if (t < 0) t += Math.PI;
        ang[i] = t;
        vals.push(m);
      }
    }
    const out = new Float32Array(DIM);
    if (!vals.length) return out;
    vals.sort((p, q) => p - q);
    const ref = vals[Math.floor(vals.length * 0.9)] || 1;

    // Soft-binned orientation histogram per cell.
    const hist = new Float32Array(DIM);
    for (let i = 0; i < S * S; i++) {
      if (!mag[i]) continue;
      let m = Math.min(1, mag[i] / ref);
      m = m * m; // favour strong contours over texture
      const x = i % S, y = (i / S) | 0;
      const cell = ((y / CELL) | 0) * G + ((x / CELL) | 0);
      const fb = (ang[i] / Math.PI) * NB;
      const b0 = Math.floor(fb) % NB, b1 = (b0 + 1) % NB, w1 = fb - Math.floor(fb);
      hist[cell * NB + b0] += m * (1 - w1);
      hist[cell * NB + b1] += m * w1;
    }
    // Spatial blur [1 2 1] for positional tolerance.
    const K = [1, 2, 1];
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) for (let b = 0; b < NB; b++) {
      let s = 0, ws = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = cy + dy, xx = cx + dx;
        if (yy < 0 || yy >= G || xx < 0 || xx >= G) continue;
        const w = K[dy + 1] * K[dx + 1];
        s += w * hist[(yy * G + xx) * NB + b]; ws += w;
      }
      out[(cy * G + cx) * NB + b] = Math.sqrt(s / ws);
    }
    let n = 0;
    for (let i = 0; i < DIM; i++) n += out[i] * out[i];
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < DIM; i++) out[i] /= n;
    return out;
  }

  root.MetFeatures = { S, DIM, describe };
})(typeof window !== 'undefined' ? window : globalThis);
