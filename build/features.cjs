// Compute artwork descriptors with the same code the browser uses, write site/data/met-data.js
const fs = require('fs');
require('../site/features.js');
const { S, DIM, describe } = globalThis.MetFeatures;
// Read straight from the fetch cache (works while fetching is still in progress).
const dir = __dirname + '/cache/';
const ids = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.ext.json')).map((f) => f.slice(0, -5));
const meta = ids.map((id) => JSON.parse(fs.readFileSync(dir + id + '.json', 'utf8')));
const px = Buffer.concat(ids.map((id) => fs.readFileSync(dir + id + '.bin')));
const N = meta.length, P = S * S;
const q = Buffer.alloc(N * DIM);
const items = [];
for (let n = 0; n < N; n++) {
  const gray = px.subarray(n * 2 * P, n * 2 * P + P), mask = px.subarray(n * 2 * P + P, (n + 1) * 2 * P);
  const f = describe(gray, mask);
  let mx = 0; for (const v of f) mx = Math.max(mx, v);
  mx = mx || 1;
  for (let i = 0; i < DIM; i++) q[n * DIM + i] = Math.round((f[i] / mx) * 255);
  const m = meta[n];
  const extPath = dir + m.id + '.ext.json';
  const e = fs.existsSync(extPath) ? JSON.parse(fs.readFileSync(extPath, 'utf8')) : {};
  items.push({
    id: m.id, t: m.t, a: m.a, d: m.d, img: m.img, url: m.url, r: +(m.w / m.h).toFixed(3), k: +(mx / 255).toFixed(6),
    nat: e.artistNationality || '', med: e.medium || '', cul: e.culture || '', dim: e.dimensions || '',
    cls: e.classification || '', dep: e.department || '',
    desc: e.desc || '', src: e.descSrc || '',
  });
}
fs.writeFileSync(__dirname + '/../site/data/met-data.js',
  'window.MET_DATA=' + JSON.stringify({ dim: DIM, items, feats: q.toString('base64') }) + ';\n');
console.log('wrote', N, 'items,', (q.length / 1024).toFixed(0), 'KB features');
