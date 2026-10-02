"use strict";
// Dead Ends · Relief (mode Sommet) : altitudes, pentes et effet sur la vitesse

/* ---------------- Altitudes ----------------
   L'hôte récupère une grille d'altitudes (Open-Meteo, modèle Copernicus 90 m) pendant le choix des classes
   et l'envoie à tous avec le départ. Sans réseau (ou en carte générée), un relief simulé la remplace. */
const ELEV_API = "https://api.open-meteo.com/v1/elevation";
let reliefJob = null; // { key, promise }

function reliefBox() {
  const c = zone ? toXY(L.latLng(zone.lat, zone.lon)) : { x: 0, y: 0 }, r = ((zone && zone.r) || 1500) * 1.1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < G.N; i++) { const x = G.X[i], y = G.Y[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0: Math.max(x0, c.x - r), y0: Math.max(y0, c.y - r), x1: Math.min(x1, c.x + r), y1: Math.min(y1, c.y + r) };
}
function reliefGrid() {
  const b = reliefBox(), W = Math.max(1, b.x1 - b.x0), H = Math.max(1, b.y1 - b.y0);
  const step = Math.max(45, Math.sqrt((W * H) / 900));
  return { x0: Math.round(b.x0), y0: Math.round(b.y0), step: Math.round(step), nx: Math.ceil(W / step) + 1, ny: Math.ceil(H / step) + 1 };
}
async function fetchRelief() {
  const g = reliefGrid(), pts = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const ll = toLL(g.x0 + i * g.step, g.y0 + j * g.step); pts.push([ll.lat.toFixed(5), ll.lng.toFixed(5)]); }
  const h = new Array(pts.length);
  const batches = []; for (let k = 0; k < pts.length; k += 100) batches.push(k);
  const one = async (k) => {
    const part = pts.slice(k, k + 100);
    const url = `${ELEV_API}?latitude=${part.map((p) => p[0]).join(",")}&longitude=${part.map((p) => p[1]).join(",")}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
        const res = await fetch(url, { signal: ctl.signal }); clearTimeout(to);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json(); if (!Array.isArray(j.elevation) || j.elevation.length !== part.length) throw new Error("réponse incomplète");
        j.elevation.forEach((v, i) => { h[k + i] = Math.round(+v || 0); }); return;
      } catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); }
    }
  };
  let next = 0; const worker = async () => { while (next < batches.length) await one(batches[next++]); };
  await Promise.all([worker(), worker(), worker()]);
  return { ...g, h, real: true };
}
// Relief simulé : quelques collines douces (jusqu'à ~60 m)
function fakeRelief(seed) {
  const g = reliefGrid(), rnd = mulberry32(seed || 7), hills = [];
  const W = (g.nx - 1) * g.step, H = (g.ny - 1) * g.step;
  for (let k = 0; k < 5; k++) hills.push({ x: g.x0 + rnd() * W, y: g.y0 + rnd() * H, a: 15 + rnd() * 45, s: 250 + rnd() * 500 });
  const h = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = g.x0 + i * g.step, y = g.y0 + j * g.step; let v = 20;
    for (const c of hills) v += c.a * Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / (2 * c.s * c.s));
    h.push(Math.round(v));
  }
  return { ...g, h, real: false };
}
// Lancé par l'hôte dès l'écran des classes, pour que le relief soit prêt au départ
function prepareRelief() {
  if (!isHost || !G || gameMode !== "sommet") return null;
  const key = `${G.N}_${zone && zone.lat}_${zone && zone.lon}_${zone && zone.r}`;
  if (reliefJob && reliefJob.key === key) return reliefJob.promise;
  const promise = (zone && !zone.fake ? fetchRelief() : Promise.reject(new Error("carte générée")))
    .catch((e) => { console.warn("Relief : altitudes indisponibles, relief simulé", e); return fakeRelief(G.N); });
  reliefJob = { key, promise };
  return promise;
}
// Altitude en un point (interpolation bilinéaire)
function elevAt(x, y) {
  const E = G && G.elev; if (!E) return 0;
  const fx = Math.min(E.nx - 1.001, Math.max(0, (x - E.x0) / E.step)), fy = Math.min(E.ny - 1.001, Math.max(0, (y - E.y0) / E.step));
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, H = E.h, w = E.nx;
  return (H[j * w + i] * (1 - u) + H[j * w + i + 1] * u) * (1 - v) + (H[(j + 1) * w + i] * (1 - u) + H[(j + 1) * w + i + 1] * u) * v;
}
// Pente (en fraction : 0,08 = 8 %) dans la direction où va l'entité
function gradeOf(ent) {
  if (!G || !G.elev || !ent.route || !ent.route.length) return 0;
  const w = ent.route[0], dx = w.x - ent.x, dy = w.y - ent.y, d = Math.hypot(dx, dy);
  if (d < 0.5) return 0;
  const k = Math.min(15, d);
  return (elevAt(ent.x + (dx / d) * k, ent.y + (dy / d) * k) - elevAt(ent.x, ent.y)) / k;
}
// Effet de la pente sur la vitesse : on ralentit en montée, on accélère un peu en descente
function slopeMul(g) {
  if (g > 0) return Math.max(CFG.slopeMin, 1 / (1 + CFG.slopeUp * g));
  return Math.min(CFG.slopeMax, 1 - CFG.slopeDown * g);
}
// Point le plus haut de la zone, accessible par les rues et assez loin du départ
function pickSummit() {
  let best = -1, bh = -Infinity;
  const sx = G.X[G.spawn], sy = G.Y[G.spawn], r = ((zone && zone.r) || 1500);
  const F = { dist: new Float64Array(G.N), next: new Int32Array(G.N), owner: new Int16Array(G.N) };
  computeField([{ x: sx, y: sy, a: G.spawn, b: G.spawn }], F); // accessible à pied depuis le départ
  for (const minD of [CFG.summitMin, CFG.summitMin / 2, 0]) {
    for (let n = 0; n < G.N; n++) {
      if (!isFinite(F.dist[n])) continue;
      const d = hyp(G.X[n], G.Y[n], sx, sy); if (d < minD || d > r) continue;
      const h = elevAt(G.X[n], G.Y[n]); if (h > bh) { bh = h; best = n; }
    }
    if (best >= 0) break;
  }
  return best >= 0 ? best : G.spawn;
}
