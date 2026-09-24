(() => {
  const { S, DIM, describe } = window.MetFeatures;
  const DATA = window.MET_DATA;
  const MAX = 30, MIN = 9;
  const CENTERING = 0.8; // how much of the collection's "average" edge layout to subtract

  // ---------- Artwork descriptors ----------
  const items = DATA.items;
  const N = items.length;
  const raw = Uint8Array.from(atob(DATA.feats), (c) => c.charCodeAt(0));
  const vecs = new Float32Array(N * DIM);
  const mean = new Float32Array(DIM);
  for (let n = 0; n < N; n++) {
    const k = items[n].k;
    for (let i = 0; i < DIM; i++) {
      const v = raw[n * DIM + i] * k;
      vecs[n * DIM + i] = v; mean[i] += v / N;
    }
  }
  for (let n = 0; n < N; n++) {
    let norm = 0;
    for (let i = 0; i < DIM; i++) {
      const v = vecs[n * DIM + i] - CENTERING * mean[i];
      vecs[n * DIM + i] = v; norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < DIM; i++) vecs[n * DIM + i] /= norm;
  }

  // ---------- Drawing pad ----------
  const pad = document.getElementById('pad');
  const canvas = document.getElementById('draw');
  const ctx = canvas.getContext('2d');
  const hint = document.getElementById('hint');
  const undoBtn = document.getElementById('undo');
  const tools = document.querySelector('.tools');
  let strokes = [];
  let current = null;
  let lastLive = 0;
  const LINE = 7 / 348; // default stroke width as a fraction of the pad size (7px on the 348px mockup pad)
  // Pen size, changed with the ↑ / ↓ keys; each stroke keeps the width it was drawn with.
  const PEN_MIN = 2 / 348, PEN_MAX = 40 / 348;
  let pen = LINE;
  const sizeCue = document.getElementById('pen-size');

  function sizeCanvas() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    render();
  }

  function trace(c, pts, size) {
    c.beginPath();
    c.moveTo(pts[0][0] * size, pts[0][1] * size);
    if (pts.length === 1) c.lineTo(pts[0][0] * size + 0.01, pts[0][1] * size);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      c.quadraticCurveTo(pts[i][0] * size, pts[i][1] * size, mx * size, my * size);
    }
    if (pts.length > 1) { const p = pts[pts.length - 1]; c.lineTo(p[0] * size, p[1] * size); }
    c.stroke();
  }

  function paint(c, size, bg) {
    c.clearRect(0, 0, size, size);
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, size, size); }
    c.strokeStyle = '#000'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of current ? [...strokes, current] : strokes) {
      c.lineWidth = Math.max(1, (s.w || LINE) * size);
      trace(c, s, size);
    }
  }

  function render() {
    paint(ctx, canvas.width);
    hint.classList.toggle('hide', strokes.length > 0 || !!current);
    undoBtn.disabled = !strokes.length;
    tools.classList.toggle('hidden', !strokes.length && !current);
  }

  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    closePanel();
    current = [pt(e)]; current.w = pen; render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) current.push(pt(ev));
    render();
    // Results follow the drawing as it evolves.
    const now = performance.now();
    if (now - lastLive > 280) { lastLive = now; update(); }
  });
  const end = () => {
    if (!current) return;
    strokes.push(current); current = null;
    render(); update();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  undoBtn.addEventListener('click', () => { closePanel(); strokes.pop(); render(); update(); });
  document.getElementById('clear').addEventListener('click', () => { closePanel(); strokes = []; render(); update(); });
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); strokes.pop(); render(); update(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      pen = Math.min(PEN_MAX, Math.max(PEN_MIN, pen * (e.key === 'ArrowUp' ? 1.25 : 0.8)));
      showPenSize();
    }
  });

  // Brief cue in the middle of the pad showing the new pen size.
  let cueTimer;
  function showPenSize() {
    const d = pen * pad.getBoundingClientRect().width;
    sizeCue.style.width = sizeCue.style.height = d + 'px';
    sizeCue.classList.add('show');
    clearTimeout(cueTimer);
    cueTimer = setTimeout(() => sizeCue.classList.remove('show'), 700);
  }

  // ---------- Matching ----------
  const off = document.createElement('canvas');
  off.width = off.height = S;
  const offCtx = off.getContext('2d', { willReadFrequently: true });

  function drawingDescriptor() {
    paint(offCtx, S, '#fff');
    const px = offCtx.getImageData(0, 0, S, S).data;
    const gray = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) gray[i] = px[i * 4];
    return describe(gray, null);
  }

  function inkLength() {
    let len = 0;
    for (const s of current ? [...strokes, current] : strokes) for (let i = 1; i < s.length; i++) len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    return len;
  }

  function rank() {
    const d = drawingDescriptor();
    const scores = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      let s = 0; const o = n * DIM;
      for (let i = 0; i < DIM; i++) s += d[i] * vecs[o + i];
      scores[n] = s;
    }
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
    // The more detailed the drawing, the tighter the selection.
    const detail = inkLength();
    const count = Math.max(MIN, Math.min(MAX, Math.round(MAX + 1 - 1.4 * detail - 1.5 * (strokes.length + (current ? 1 : 0) - 1))));
    return order.slice(0, count).map((n) => ({ n, score: scores[n] }));
  }

  // ---------- Layout ----------
  const wall = document.getElementById('wall');
  const shown = new Map(); // n -> { el, box }
  const GAP = 0;      // artworks may touch each other, as in the mockups
  // Each artwork keeps its own spacing: about half of them sit flush against a neighbour, the rest keep a small random gap.
  const spacing = new Map();
  // Each artwork also gets its own random spot on the page, so the wall spreads out irregularly
  // instead of packing around the pad.
  const anchors = new Map();
  const anchorOf = (n) => {
    if (!anchors.has(n)) anchors.set(n, { u: 0.02 + Math.random() * 0.96, v: 0.02 + Math.random() * 0.96 });
    return anchors.get(n);
  };
  const spacingOf = (n) => {
    if (!spacing.has(n)) spacing.set(n, Math.random() < 0.55 ? 0 : 6 + Math.random() * 26);
    return spacing.get(n);
  };
  // Clear space kept around the drawing pad: 60px, plus room for the parallax drift (10px) and the float (~1px),
  // so the visible gap never drops below 60px.
  const PAD_SPACE = 60;
  const PAD_GAP = PAD_SPACE + 10 + 2;

  const overlaps = (a, b, g = GAP) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;

  function layout(selection) {
    const W = window.innerWidth, H = window.innerHeight;
    const pr = pad.getBoundingClientRect();
    const padBox = { x: pr.left - PAD_GAP + GAP, y: pr.top - PAD_GAP + GAP, w: pr.width + 2 * (PAD_GAP - GAP), h: pr.height + 2 * (PAD_GAP - GAP) };
    const cx = pr.left + pr.width / 2, cy = pr.top + pr.height / 2;
    const free = W * H - padBox.w * padBox.h;
    const k = selection.length;
    // Size follows similarity: the best match gets ~6x the surface of the weakest one shown.
    const top = selection[0].score, low = selection[k - 1].score, span = Math.max(1e-6, top - low);
    // Steep curve: the few closest matches are much bigger, weaker ones drop off quickly to small tiles
    // (best match ~6x the side of the weakest one shown).
    const weights = selection.map((s, i) => (0.06 + 3 * Math.pow((s.score - low) / span, 2.4)) * (i === 0 ? 1.5 : 1));
    const wsum = weights.reduce((a, b) => a + b, 0);
    // Covered surface grows with the number of results: a full wall (~78%) at 30, but a sparse, airy one
    // when the selection has narrowed down to a few artworks.
    const fill = Math.min(1, k / MAX);
    const budget = free * (0.16 + 0.62 * fill * fill);
    const maxSide = Math.min(W, H) * 0.5;
    const minSide = Math.min(W, H) * 0.06; // keep the smallest tiles readable

    const placed = [padBox];
    const result = [];
    selection.forEach((sel, i) => {
      const it = items[sel.n];
      const prev = shown.get(sel.n)?.box;
      // Target = the artwork's own random spot; the very best matches lean a little toward the pad.
      // With few results nobody leans in, so they stay scattered across the page.
      const a = anchorOf(sel.n), lean = (i < 3 ? 0.35 : i < 8 ? 0.15 : 0) * fill * fill;
      const tx = a.u * W + (cx - a.u * W) * lean, ty = a.v * H + (cy - a.v * H) * lean;
      let area = (budget * weights[i]) / wsum;
      for (let attempt = 0; attempt < 5; attempt++, area *= 0.72) {
        let w = Math.sqrt(area * it.r), h = Math.sqrt(area / it.r);
        const f = Math.min(1, maxSide / Math.max(w, h)); w *= f; h *= f;
        const g = Math.max(1, minSide / Math.min(w, h)); w *= g; h *= g;
        let best = null, bestCost = Infinity;
        const tryAt = (x, y) => {
          const b = { x, y, w, h };
          if (x < -w * 0.3 || y < -h * 0.3 || x + w > W + w * 0.3 || y + h > H + h * 0.3) return;
          if (placed.some((p) => overlaps(b, p))) return;
          // Pull toward the artwork's own spot; existing artworks also resist moving far (smooth evolution).
          let cost = Math.hypot(x + w / 2 - tx, y + h / 2 - ty);
          if (prev) cost += 0.7 * Math.hypot(x + w / 2 - prev.x - prev.w / 2, y + h / 2 - prev.y - prev.h / 2);
          if (cost < bestCost) { bestCost = cost; best = b; }
        };
        if (prev) tryAt(prev.x + prev.w / 2 - w / 2, prev.y + prev.h / 2 - h / 2);
        for (let c = 0; c < 450; c++) tryAt(Math.random() * (W + w * 0.6) - w * 0.3, Math.random() * (H + h * 0.6) - h * 0.3);
        if (best) {
          nudge(best, placed, tx, ty, spacingOf(sel.n));
          placed.push(best); result.push({ ...sel, box: best });
          return;
        }
      }
    });
    return result;
  }

  // Slide a box toward its target spot until it meets a neighbour (or gets there): some artworks end up
  // flush against each other, others stay isolated.
  function nudge(b, placed, cx, cy, gap) {
    // placed[0] is the pad (already includes its margin); other artworks are kept `gap` px away.
    const hits = (nb) => placed.some((p, i) => overlaps(nb, p, i === 0 ? 0 : gap));
    for (const step of [4, 1]) { // coarse then fine, so "touching" really means touching
      for (let s = 0; s < 200; s++) {
        const dx = cx - (b.x + b.w / 2), dy = cy - (b.y + b.h / 2), d = Math.hypot(dx, dy);
        if (d < step) return;
        const nb = { ...b, x: b.x + (dx / d) * step, y: b.y + (dy / d) * step };
        if (hits(nb)) break;
        b.x = nb.x; b.y = nb.y;
      }
    }
  }


  function apply(result) {
    const keep = new Set(result.map((r) => r.n));
    for (const [n, s] of shown) {
      if (keep.has(n)) continue;
      s.el.classList.remove('in', 'focused'); s.el.classList.add('out');
      setTimeout(() => s.el.remove(), 650);
      shown.delete(n);
      if (opened === n) closePanel(); else if (focused === n) unfocus();
    }
    // First drawing on an empty wall: artworks fly in from outside the window, one after another,
    // each along the line from the pad through its final spot.
    const reveal = shown.size === 0 && result.length > 0;
    const pr = pad.getBoundingClientRect();
    const pcx = pr.left + pr.width / 2, pcy = pr.top + pr.height / 2;
    const t0 = performance.now();
    result.forEach((r, i) => {
      let s = shown.get(r.n);
      if (!s) {
        s = { depth: 0.35 + Math.random() * 0.65, box: r.box, pending: true };
        const d = Math.hypot(r.box.x + r.box.w / 2 - pcx, r.box.y + r.box.h / 2 - pcy);
        const showAt = reveal ? t0 + 80 + i * 45 + d * 0.25 + Math.random() * 160 : 0;
        s.el = makeArt(r.n, reveal, () => {
          // Image loaded and its turn has come: start from its current (off-screen) box, glide to the latest one.
          setTimeout(() => requestAnimationFrame(() => {
            if (!shown.has(r.n)) return;
            s.pending = false;
            setBox(s.el, s.box);
            s.el.classList.add('in');
            if (reveal) setTimeout(() => s.el.classList.remove('reveal'), 1500);
          }), Math.max(0, showAt - performance.now()));
        });
        setBox(s.el, reveal ? offscreen(r.box, pcx, pcy) : r.box);
        shown.set(r.n, s);
        parallaxOne(r.n, s);
      }
      if (!s.pending) setBox(s.el, r.box); // artworks still waiting to fly in pick up their latest box on arrival
      s.box = r.box;
      s.el.style.zIndex = String(MAX - i);
    });
  }

  // Same box pushed out of the window, along the direction from the pad centre through the box.
  function offscreen(b, pcx, pcy) {
    const W = window.innerWidth, H = window.innerHeight;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let ux = cx - pcx, uy = cy - pcy;
    const len = Math.hypot(ux, uy) || 1; ux /= len; uy /= len;
    const tx = ux > 0 ? (W - b.x) / ux : ux < 0 ? (b.x + b.w) / -ux : Infinity;
    const ty = uy > 0 ? (H - b.y) / uy : uy < 0 ? (b.y + b.h) / -uy : Infinity;
    const t = Math.min(tx, ty) + 40;
    return { ...b, x: b.x + ux * t, y: b.y + uy * t };
  }

  function makeArt(n, reveal, onReady) {
    const it = items[n];
    const el = document.createElement('figure');
    el.className = reveal ? 'art reveal' : 'art';
    const bob = document.createElement('div');
    bob.className = 'bob';
    bob.style.setProperty('--dur', (5 + Math.random() * 4).toFixed(2) + 's');
    bob.style.setProperty('--delay', (-Math.random() * 8).toFixed(2) + 's');
    const img = new Image();
    img.alt = [it.t, it.a].filter(Boolean).join(' — ');
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    img.onload = onReady;
    img.onerror = () => el.remove();
    img.src = it.img;
    bob.appendChild(img);
    el.appendChild(bob);
    el.addEventListener('mouseenter', () => { if (!current && !panning && opened === null) focus(n); });
    el.addEventListener('mouseleave', () => { if (opened === null) unfocus(); });
    el.addEventListener('click', () => {
      if (dragged) return; // the pointer was used to pan, not to pick
      opened === n ? closePanel() : openPanel(n);
    });
    wall.appendChild(el);
    return el;
  }

  function setBox(el, b) {
    el.style.left = b.x + 'px'; el.style.top = b.y + 'px';
    el.style.width = b.w + 'px'; el.style.height = b.h + 'px';
  }

  // ---------- Focus & description panel ----------
  // Placeholder: the same description for every artwork (text from the "art info" mockup).
  const PLACEHOLDER_DESC = 'Watkins, the consummate photographer of the American West, combined a virtuoso mastery of the difficult wet-plate negative process with a rigorous sense of pictorial structure. In 1863 he was hired to make a photographic survey of the quicksilver mining operations in New Almaden, near San Jose, California. Quicksilver—used to bond with, and weigh down, the finest particles of gold that might otherwise float away in the sluicing process—was essential to the gold-mining industry, and the mining of quicksilver itself became a profitable enterprise.\n\nWatkins\u2019s clients hoped to use his photographs to convince potential investors of the promise of the New Almaden site. To this end Watkins made numerous stereographic views documenting minute details of the mining process as well as mammoth views that were meant to show the town to its best possible advantage. Capitalizing on the calm of the hazy early morning and a picturesque vantage point, Watkins portrayed the mining camp as a charming mountain village possessing an appealing tidiness and an air of perfect tranquility.';
  const panel = document.getElementById('panel');
  let focused = null, opened = null;

  function focus(n) {
    if (focused !== null && focused !== n) shown.get(focused)?.el.classList.remove('focused');
    focused = n;
    shown.get(n)?.el.classList.add('focused');
    wall.classList.add('focus');
    document.body.classList.add('focusing');
  }
  function unfocus() {
    if (focused !== null) shown.get(focused)?.el.classList.remove('focused');
    focused = null;
    wall.classList.remove('focus');
    document.body.classList.remove('focusing');
  }

  function openPanel(n) {
    const it = items[n];
    focus(n);
    opened = n;
    wall.classList.add('open');
    document.body.classList.add('opened');
    shown.get(n)?.el.classList.add('opened');
    if (shown.get(n)) parallaxOne(n, shown.get(n));
    document.getElementById('p-title').textContent = it.t || 'Sans titre';
    document.getElementById('p-artist').textContent = [it.a, it.nat].filter(Boolean).join(' ') || it.cul || '';
    document.getElementById('p-date').textContent = it.d || '';
    document.getElementById('p-desc').textContent = PLACEHOLDER_DESC;
    const facts = document.getElementById('p-facts');
    facts.replaceChildren();
    const artist = it.a ? it.a + (it.nat ? ` (${it.nat})` : '') : '';
    for (const [label, v] of [['Title', it.t], ['Artist', artist], ['Date', it.d], ['Medium', it.med], ['Dimensions', it.dim],
      ['Culture', it.cul], ['Classification', it.cls], ['Department', it.dep]]) {
      if (!v) continue;
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = v;
      row.append(dt, dd); facts.append(row);
    }
    const links = document.getElementById('p-links');
    links.replaceChildren();
    const link = (href, text) => {
      const a = document.createElement('a');
      a.className = 'acc-link'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
      const label = document.createElement('span'); label.textContent = text;
      const arrow = document.createElement('span'); arrow.textContent = '↗';
      a.append(label, arrow); links.append(a);
    };
    if (it.url) link(it.url, 'Voir sur metmuseum.org');
    placePanel(n);
    panel.querySelector('.panel-body').scrollTop = 0;
    panel.classList.add('show');
    panel.setAttribute('aria-hidden', 'false');
  }

  // Description on the left of the pad, the chosen artwork enlarged on its right.
  const frame = document.getElementById('art-frame');
  function placePanel(n) {
    const W = window.innerWidth, H = window.innerHeight, M = 10; // 10px gutters, as in the mockup
    const pr = pad.getBoundingClientRect();
    const side = pr.left - 2 * M;
    const st = panel.style;
    const s = shown.get(n);
    if (side >= 280) {
      st.top = pr.top + 'px'; st.bottom = M + 'px'; st.left = M + 'px'; st.width = side + 'px'; st.right = '';
      // Right column: a frame matching the text panel, with the artwork inside it, top-left (same 9.5px inner padding).
      const fx = pr.right + M, fy = pr.top, fw = W - M - fx, fh = H - M - fy, P = 9.5;
      Object.assign(frame.style, { left: fx + 'px', top: fy + 'px', width: fw + 'px', height: fh + 'px' });
      frame.classList.add('show');
      if (s) {
        const it = items[n];
        const aw = fw - 2 * P, ah = fh - 2 * P;
        const w = Math.min(aw, ah * it.r), h = w / it.r;
        setBox(s.el, { x: fx + P, y: fy + P, w, h }); // top-left, like the text in the left panel
      }
    } else { // narrow screens: bottom sheet under the pad, artwork stays in place
      st.left = st.right = '8px'; st.width = ''; st.bottom = '8px';
      st.top = Math.min(pr.bottom + 8, H * 0.55) + 'px';
    }
  }

  function closePanel() {
    if (opened === null) return;
    const s = shown.get(opened);
    if (s) { s.el.classList.remove('opened'); setBox(s.el, s.box); }
    const was = opened;
    opened = null;
    if (s) parallaxOne(was, s);
    wall.classList.remove('open');
    document.body.classList.remove('opened');
    panel.classList.remove('show');
    panel.setAttribute('aria-hidden', 'true');
    frame.classList.remove('show');
    unfocus();
  }

  document.getElementById('veil').addEventListener('click', closePanel);
  const acc = document.getElementById('acc-overview');
  acc.querySelector('.acc-head').addEventListener('click', (e) => {
    const open = acc.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  // ---------- Parallax ----------
  // Once artworks are on screen they drift slightly against the mouse; each one has its own depth.
  const PARALLAX = 10; // max offset in px (PAD_GAP reserves this on top of the 60px around the pad)
  let mx = 0, my = 0, pxFrame = 0;
  function parallaxOne(n, s) {
    const k = opened === n ? 0 : s.depth * PARALLAX;
    s.el.style.setProperty('--px', (-mx * k).toFixed(2) + 'px');
    s.el.style.setProperty('--py', (-my * k).toFixed(2) + 'px');
  }
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
    if (!pxFrame) pxFrame = requestAnimationFrame(() => { pxFrame = 0; for (const [n, s] of shown) parallaxOne(n, s); });
  });

  // ---------- Click & hold to pan ----------
  // Dragging the wall shifts every artwork a little (with resistance), e.g. to see those under the header.
  // On release everything glides back, so the pad stays clear of artworks.
  let panning = false, dragged = false, panStart = null;
  const soft = (d, max) => max * Math.tanh(d / max);
  wall.addEventListener('pointerdown', (e) => {
    if (opened !== null || e.button !== 0) return;
    panStart = { x: e.clientX, y: e.clientY };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!panStart) return;
    const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (!panning) {
      if (Math.hypot(dx, dy) < 6) return;
      panning = dragged = true;
      unfocus();
      wall.classList.add('panning');
    }
    const maxX = Math.max(60, window.innerWidth * 0.05), maxY = Math.max(75, window.innerHeight * 0.09); // enough to peek under the header (64px)
    wall.style.setProperty('--pan-x', soft(dx, maxX).toFixed(1) + 'px');
    wall.style.setProperty('--pan-y', soft(dy, maxY).toFixed(1) + 'px');
  });
  const endPan = () => {
    panStart = null;
    if (!panning) return;
    panning = false;
    wall.classList.remove('panning');
    wall.style.setProperty('--pan-x', '0px');
    wall.style.setProperty('--pan-y', '0px');
    setTimeout(() => { dragged = false; }, 0); // let the click that ends the drag be ignored first
  };
  window.addEventListener('pointerup', endPan);
  window.addEventListener('pointercancel', endPan);

  function update() {
    apply(strokes.length || current ? layout(rank()) : []);
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { sizeCanvas(); update(); if (opened !== null) placePanel(opened); }, 150); });
  sizeCanvas();
  update();

  // Debug hook for testing from the console.
  window.__met = { rank, setStrokes: (s) => { strokes = s; render(); update(); }, openPanel: (i) => openPanel([...shown.keys()][i]) };
})();
