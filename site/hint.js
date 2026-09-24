// Example sketches that draw themselves on the empty pad, picked at random.
(() => {
  const svg = document.getElementById('hint');
  const NS = 'http://www.w3.org/2000/svg';

  // Coordinates in a 100x100 pad. `smooth` strokes are curves, the others keep sharp corners.
  const spiral = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, a = -Math.PI / 2 - t * Math.PI * 2 * 2.6;
    const cx = 51.5 - 15 * t, cy = 45 + 15 * t;
    spiral.push([cx + Math.cos(a) * (3 + 20 * t), cy + Math.sin(a) * (4 + 16 * t)]);
  }
  const SKETCHES = [
    [{ smooth: true, pts: [[16.4, 24.1], [24, 16], [29.6, 17.5], [26, 28], [17.1, 39], [18, 46], [26, 43], [37.4, 32.7], [46.7, 27.7], [52.2, 33.5], [45, 44], [37.4, 53], [38, 59.5], [44, 59], [55, 51], [62.3, 46.7], [68.5, 44.4], [76.3, 49.8], [74.8, 62.3], [65.4, 68.5], [52, 74.5], [48.3, 81], [52, 85], [62, 84.5], [72, 80], [84, 71]] }],
    [{ smooth: false, pts: [[19.5, 51.4], [27.3, 28], [22.6, 74.8], [41.3, 49.8], [49.8, 67], [41.3, 36.6], [72.4, 44.4], [61.5, 23.4], [85.7, 37.4], [67, 71.7], [59.2, 61.5]] }],
    [
      { smooth: true, pts: spiral },
      { smooth: true, pts: [[53, 60.5], [62.6, 66.2], [73.5, 62.3], [78.5, 46.7], [79, 20.2], [81.3, 17.9], [83.3, 24.9], [82, 51.4], [81.3, 77.9]] },
    ],
  ];

  // Catmull-Rom -> cubic Bézier, so the curves pass through every point.
  function pathData({ pts, smooth }) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    if (!smooth) return d + pts.slice(1).map((p) => `L${p[0]} ${p[1]}`).join('');
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let last = -1;

  async function loop() {
    for (;;) {
      let i;
      do { i = Math.floor(Math.random() * SKETCHES.length); } while (i === last && SKETCHES.length > 1);
      last = i;
      const g = document.createElementNS(NS, 'g');
      svg.replaceChildren(g);
      const paths = SKETCHES[i].map((stroke) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', pathData(stroke));
        g.appendChild(p);
        const len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        return { p, len };
      });
      await wait(500);
      for (const { p, len } of paths) {
        // Roughly constant pen speed, like a hand drawing.
        await p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: Math.max(500, len * 9), easing: 'cubic-bezier(.45,0,.35,1)', fill: 'forwards' }).finished;
        await wait(150);
      }
      await wait(1400);
      g.style.opacity = '0';
      await wait(700);
    }
  }
  loop();
})();
