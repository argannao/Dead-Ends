"use strict";
// Dead Ends · Graphe routier, itinéraires (A*, Dijkstra) et déplacement le long des rues

/* ---------------- Tas binaire (Dijkstra / A*) ---------------- */
class Heap {
  constructor() { this.k = []; this.v = []; this.topK = 0; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0]; this.topK = k[0];
    const lk = k.pop(), lv = v.pop(); const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) { const l = 2 * i + 1; if (l >= n) break; const r = l + 1; const m = (r < n && k[r] < k[l]) ? r : l; if (k[m] >= lk) break; k[i] = k[m]; v[i] = v[m]; i = m; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/* ---------------- Graphe routier ---------------- */
const MINOR = /^(footway|path|cycleway|steps|track|pedestrian|bridleway|corridor)$/;
function isMinor(t) { return !!t && (MINOR.test(t.highway || "") || t.service === "parking_aisle" || t.footway === "sidewalk"); }
function buildGraph(data, lat0, lon0, withPaths = true) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  const idOf = new Map(); const xs = [], ys = [];
  for (const el of data.elements) if (el.type === "node") { idOf.set(el.id, xs.length); xs.push((el.lon - lon0) * kx); ys.push((el.lat - lat0) * ky); }
  const nb = Array.from({ length: xs.length }, () => []);
  const seen = new Set(); const rawWays = [];
  for (const el of data.elements) {
    if (el.type !== "way" || !el.nodes) continue;
    const minor = isMinor(el.tags);
    if (minor && !withPaths) continue;
    const tg = el.tags || {};
    const lvl = tg.bridge && tg.bridge !== "no" ? 1 : (tg.tunnel && tg.tunnel !== "no") || tg.covered === "yes" ? -1 : 0; // pont, tunnel ou au sol
    const w = [];
    for (let i = 0; i < el.nodes.length; i++) {
      const a = idOf.get(el.nodes[i]);
      if (a === undefined) { if (w.length > 1) rawWays.push({ nodes: w.slice(), minor, lvl }); w.length = 0; continue; }
      if (w.length) {
        const b = w[w.length - 1];
        if (a !== b) { const key = a < b ? a + "_" + b : b + "_" + a; if (!seen.has(key)) { seen.add(key); nb[a].push(b); nb[b].push(a); } }
      }
      w.push(a);
    }
    if (w.length > 1) rawWays.push({ nodes: w, minor, lvl });
  }
  if (!xs.length) return null;
  // Plus grande composante accessible depuis le nœud le plus proche du point choisi
  let start = -1, bd = Infinity;
  for (let i = 0; i < xs.length; i++) { if (!nb[i].length) continue; const d = xs[i] * xs[i] + ys[i] * ys[i]; if (d < bd) { bd = d; start = i; } }
  if (start < 0) return null;
  const newId = new Int32Array(xs.length).fill(-1); const order = [start]; newId[start] = 0;
  for (let q = 0; q < order.length; q++) for (const m of nb[order[q]]) if (newId[m] < 0) { newId[m] = order.length; order.push(m); }
  const N = order.length;
  const X = new Float64Array(N), Y = new Float64Array(N);
  order.forEach((o, i) => { X[i] = xs[o]; Y[i] = ys[o]; });
  const deg = new Int32Array(N + 1);
  order.forEach((o, i) => { deg[i + 1] = nb[o].length; });
  for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
  const adjTo = new Int32Array(deg[N]), adjLen = new Float64Array(deg[N]);
  const EA = [], EB = [];
  order.forEach((o, i) => {
    let p = deg[i];
    for (const m of nb[o]) { const j = newId[m]; adjTo[p] = j; adjLen[p] = Math.max(0.01, hyp(X[i], Y[i], X[j], Y[j])); p++; if (i < j) { EA.push(i); EB.push(j); } }
  });
  // Tracés à afficher (seulement la composante jouable)
  const ways = [];
  for (const rw of rawWays) {
    let cur = [];
    const push = () => { if (cur.length > 1) ways.push({ nodes: cur, minor: rw.minor, lvl: rw.lvl }); };
    for (const o of rw.nodes) { const j = newId[o]; if (j < 0) { push(); cur = []; } else cur.push(j); }
    push();
  }
  const g = { N, X, Y, adjStart: deg, adjTo, adjLen, EA: Int32Array.from(EA), EB: Int32Array.from(EB), ways, lat0, lon0, kx, ky, spawn: 0 };
  buildGrid(g);
  // stamps pour la recherche de chemin
  g.gArr = new Float64Array(N); g.gStamp = new Int32Array(N); g.closed = new Int32Array(N); g.prev = new Int32Array(N); g.stamp = 0;
  g.dist = new Float64Array(N); g.next = new Int32Array(N); g.owner = new Int16Array(N);
  const mkField = () => ({ dist: new Float64Array(N), next: new Int32Array(N), owner: new Int16Array(N) });
  g.F2 = mkField(); g.F3 = mkField(); // champ « piste » (dernières positions connues) et champ « rabatteurs » (carrefours devant les joueurs)
  g.adjBlocked = new Uint8Array(g.adjTo.length); // rues bloquées par une barricade
  g.eLoadN = new Uint16Array(g.adjTo.length); g.eLoadT = new Float64Array(g.adjTo.length).fill(-99); // rues empruntées récemment par des zombies
  g.lureFields = new Map();                      // champs d'attraction (pétards, colline, ralliement de la horde)
  // Vrais carrefours (au moins 3 directions) : affichés en points pour distinguer un croisement d'un pont
  // (on n'affiche pas ceux qui se trouvent sous un pont, pour ne pas faire croire qu'on peut y tourner depuis le pont)
  const segs = [];
  for (const w of ways) if (w.lvl === 1) for (let k = 1; k < w.nodes.length; k++) segs.push([w.nodes[k - 1], w.nodes[k]]);
  const underBridge = (i) => segs.some(([a, b]) => {
    if (a === i || b === i) return false;
    const ax = X[a], ay = Y[a], vx = X[b] - ax, vy = Y[b] - ay, L2 = vx * vx + vy * vy;
    if (X[i] < Math.min(ax, X[b]) - 10 || X[i] > Math.max(ax, X[b]) + 10 || Y[i] < Math.min(ay, Y[b]) - 10 || Y[i] > Math.max(ay, Y[b]) + 10) return false;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((X[i] - ax) * vx + (Y[i] - ay) * vy) / L2)) : 0;
    return Math.hypot(X[i] - ax - vx * t, Y[i] - ay - vy * t) < 8;
  });
  const junc = []; for (let i = 0; i < N; i++) if (deg[i + 1] - deg[i] >= 3 && !(segs.length && underBridge(i))) junc.push(i);
  g.junc = Int32Array.from(junc);
  return g;
}
const CELL = 40;
function buildGrid(g) {
  const grid = new Map();
  for (let e = 0; e < g.EA.length; e++) {
    const a = g.EA[e], b = g.EB[e];
    const x0 = Math.floor(Math.min(g.X[a], g.X[b]) / CELL), x1 = Math.floor(Math.max(g.X[a], g.X[b]) / CELL);
    const y0 = Math.floor(Math.min(g.Y[a], g.Y[b]) / CELL), y1 = Math.floor(Math.max(g.Y[a], g.Y[b]) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = cx + "," + cy; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(e);
    }
  }
  g.grid = grid; g.eStamp = new Int32Array(g.EA.length); g.eS = 0;
}
// Point le plus proche sur une rue : {x, y, a, b, d}
function snap(x, y, maxR = 400) {
  const g = G; g.eS++;
  let best = null, bd = Infinity, be = -1;
  const cx0 = Math.floor(x / CELL), cy0 = Math.floor(y / CELL), R = Math.ceil(maxR / CELL);
  for (let r = 0; r <= R; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const l = g.grid.get((cx0 + dx) + "," + (cy0 + dy)); if (!l) continue;
      for (const e of l) {
        if (g.eStamp[e] === g.eS) continue; g.eStamp[e] = g.eS;
        const a = g.EA[e], b = g.EB[e];
        const ax = g.X[a], ay = g.Y[a], vx = g.X[b] - ax, vy = g.Y[b] - ay;
        const L2 = vx * vx + vy * vy;
        let t = L2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
        const px = ax + vx * t, py = ay + vy * t, d = hyp(x, y, px, py);
        if (d < bd) {
          bd = d; be = e;
          if (t === 0) best = { x: ax, y: ay, a, b: a };
          else if (t === 1) best = { x: g.X[b], y: g.Y[b], a: b, b };
          else best = { x: px, y: py, a, b };
        }
      }
    }
    if (best && bd < r * CELL) break;
  }
  if (best) { best.d = bd; best.ea = g.EA[be]; best.eb = g.EB[be]; }
  return best;
}
function sameEdge(P, Q) {
  if (P.a === P.b) return P.a === Q.a || P.a === Q.b;
  if (Q.a === Q.b) return Q.a === P.a || Q.a === P.b;
  return (P.a === Q.a && P.b === Q.b) || (P.a === Q.b && P.b === Q.a);
}
// A* entre deux positions (chacune posée sur une rue). Renvoie une liste de points de passage.
function route(S, T) {
  const g = G;
  const finalWp = { x: T.x, y: T.y, n: -1, ea: T.a, eb: T.b };
  if (sameEdge(S, T)) return [finalWp];
  const st = ++g.stamp; const H = new Heap();
  const h = (n) => hyp(g.X[n], g.Y[n], T.x, T.y);
  const seed = (n) => { const c = hyp(S.x, S.y, g.X[n], g.Y[n]); if (g.gStamp[n] !== st || c < g.gArr[n]) { g.gStamp[n] = st; g.gArr[n] = c; g.prev[n] = -1; H.push(c + h(n), n); } };
  seed(S.a); if (S.b !== S.a) seed(S.b);
  const extra = (n) => (n === T.a || n === T.b) ? hyp(g.X[n], g.Y[n], T.x, T.y) : -1;
  let best = Infinity, bestN = -1;
  while (H.size) {
    const n = H.pop(); if (H.topK >= best) break;
    if (g.closed[n] === st) continue; g.closed[n] = st;
    const gn = g.gArr[n]; const ex = extra(n);
    if (ex >= 0 && gn + ex < best) { best = gn + ex; bestN = n; }
    for (let p = g.adjStart[n]; p < g.adjStart[n + 1]; p++) {
      if (g.adjBlocked[p]) continue;
      const m = g.adjTo[p], c = gn + g.adjLen[p];
      if (g.gStamp[m] !== st || c < g.gArr[m]) { g.gStamp[m] = st; g.gArr[m] = c; g.prev[m] = n; H.push(c + h(m), m); }
    }
  }
  if (bestN < 0) return null;
  const nodes = []; for (let n = bestN; n >= 0; n = g.prev[n]) nodes.push(n);
  nodes.reverse();
  const wps = nodes.map((n) => ({ x: g.X[n], y: g.Y[n], n }));
  wps.push(finalWp);
  return wps;
}
// Champ de poursuite : distance de chaque carrefour au joueur + prochain carrefour à prendre
// Champ de poursuite : distance de chaque carrefour au joueur le plus proche (plusieurs sources),
// prochain carrefour à prendre, et joueur visé (owner = index dans la liste des cibles)
function computeField(srcs, F) {
  const g = G; F = F || g; const dist = F.dist, next = F.next, owner = F.owner; dist.fill(Infinity); next.fill(-1); owner.fill(-1);
  const H = new Heap();
  const seed = (n, i, P) => { const d = hyp(P.x, P.y, g.X[n], g.Y[n]); if (d < dist[n]) { dist[n] = d; next[n] = -1; owner[n] = i; H.push(d, n); } };
  srcs.forEach((P, i) => { seed(P.a, i, P); if (P.b !== P.a) seed(P.b, i, P); });
  while (H.size) {
    const n = H.pop(); const d = H.topK; if (d > dist[n]) continue;
    for (let p = g.adjStart[n]; p < g.adjStart[n + 1]; p++) {
      if (g.adjBlocked[p]) continue;
      const m = g.adjTo[p], c = d + g.adjLen[p];
      if (c < dist[m]) { dist[m] = c; next[m] = n; owner[m] = owner[n]; H.push(c, m); }
    }
  }
}

/* ---------------- Conversion coordonnées ---------------- */
const toLL = (x, y) => L.latLng(G.lat0 + y / G.ky, G.lon0 + x / G.kx);
const toXY = (ll) => ({ x: (ll.lng - G.lon0) * G.kx, y: (ll.lat - G.lat0) * G.ky });

/* ---------------- Déplacement le long des rues ---------------- */
function advance(ent, dist) {
  while (dist > 1e-9 && ent.route.length) {
    const w = ent.route[0];
    if (w.n >= 0) {
      if (ent.a === ent.b) { if (ent.a !== w.n) ent.b = w.n; }
      else if (w.n === ent.a) { ent.a = ent.b; ent.b = w.n; }
    } else { ent.a = w.ea; ent.b = w.eb; }
    const dx = w.x - ent.x, dy = w.y - ent.y, d = Math.hypot(dx, dy);
    if (d <= dist) {
      ent.x = w.x; ent.y = w.y; dist -= d; ent.route.shift();
      if (w.n >= 0) { ent.a = ent.b = w.n; }
      if (ent.trail !== undefined) ent.trail += d;
    } else {
      ent.x += dx / d * dist; ent.y += dy / d * dist;
      if (ent.trail !== undefined) ent.trail += dist;
      if (ent.dir !== undefined) ent.dir = Math.atan2(dy, dx);
      dist = 0;
    }
  }
  return dist;
}

/* =====================================================================
   MULTIJOUEUR
   L'hôte fait autorité : il choisit la zone, fait tourner les zombies et les vagues,
   détecte les captures et envoie l'état du monde 10 fois par seconde.
   Chaque joueur déplace son propre personnage sur sa copie de la carte et envoie sa position.
   Connexion directe entre navigateurs (WebRTC via PeerJS) : pas de serveur de jeu.
   ===================================================================== */
const COLORS = ["#ffad42", "#5ec8f2", "#b58cff", "#7ee081", "#ff7fb0", "#f2e35e", "#4fd1c5", "#ff9e6b"];
const MAX_PLAYERS = 8;
const NAME_STORE = "deadends.name";
const PEER_PREFIX = "deadends-v1-";
const LOCAL = /[?&]local\b/.test(location.search); // test hors ligne : plusieurs onglets du même navigateur
let myName = ""; try { myName = localStorage.getItem(NAME_STORE) || ""; } catch {}

let net = null;          // null = solo ; { host: true, link } ; { host: false, link }
let isHost = true;
let myId = "host";
let players = new Map(); // id -> joueur (l'hôte fait autorité, les autres reçoivent une copie)
let zone = null;         // { lat, lon, r, paths, fake, start?, finish?, name? }
let gameMode = "survie"; // mode choisi par l'hôte
let leaving = false;

const makeCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0]; return s; };
const cleanName = (n) => (String(n || "").replace(/[<>&"]/g, "").trim().slice(0, 16) || "Joueur");
