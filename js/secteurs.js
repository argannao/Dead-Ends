"use strict";
// Dead Ends · Téléchargement des rues par secteurs, cache, partage et préchargement

/* ---------------- Chargement des rues par secteurs ---------------- */
// Grille fixe d'environ 1 km de côté, calée sur les coordonnées (et non sur le point choisi) :
// un même secteur garde la même clé d'une partie à l'autre, ce qui permet de le garder en cache.
const CELL_DEG = 0.009;
function makeCells(lat, lon, r) {
  const dLat = CELL_DEG, dLon = CELL_DEG / Math.cos(Math.floor(lat) * Math.PI / 180);
  const ky = 110574, kx = 111320 * Math.cos(lat * Math.PI / 180);
  const i0 = Math.floor((lat - r / ky) / dLat), i1 = Math.floor((lat + r / ky) / dLat);
  const j0 = Math.floor((lon - r / kx) / dLon), j1 = Math.floor((lon + r / kx) / dLon);
  const cells = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const s = i * dLat, n = s + dLat, w = j * dLon, e = w + dLon;
    const cy = Math.max(s, Math.min(lat, n)), cx = Math.max(w, Math.min(lon, e));
    if (Math.hypot((cx - lon) * kx, (cy - lat) * ky) > r) continue; // garde les secteurs qui touchent le cercle
    const d = Math.hypot(((w + e) / 2 - lon) * kx, ((s + n) / 2 - lat) * ky);
    cells.push({ s, n, w, e, key: `${Math.floor(lat)}:${i}:${j}`, st: "wait", d });
  }
  cells.sort((a, b) => a.d - b.d); // du centre vers l'extérieur
  return cells;
}

/* ---------- Cache des secteurs : mémoire + IndexedDB (30 jours) ---------- */
const QVER = "q2:";             // à changer si la requête change, pour ignorer l'ancien cache
const CACHE_DAYS = 30;
const memCells = new Map(), inflight = new Map();
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res) => {
    try { const rq = indexedDB.open("deadends", 1); rq.onupgradeneeded = () => rq.result.createObjectStore("cells"); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }
    catch { res(null); }
  });
  return idbP;
}
async function idbGet(k) {
  const db = await idb(); if (!db) return null;
  return new Promise((res) => {
    try { const r = db.transaction("cells").objectStore("cells").get(k); r.onsuccess = () => { const v = r.result; res(v && Date.now() - v.t < CACHE_DAYS * 864e5 ? v.d : null); }; r.onerror = () => res(null); }
    catch { res(null); }
  });
}
async function idbPut(k, txt) {
  if (cachedKeys && k.startsWith(QVER)) { cachedKeys.add(k.slice(QVER.length)); drawCacheSoon(); }
  const db = await idb(); if (!db) return; try { db.transaction("cells", "readwrite").objectStore("cells").put({ t: Date.now(), d: txt }, k); } catch {}
}
function memPut(k, d) { memCells.set(k, d); if (memCells.size > 60) memCells.delete(memCells.keys().next().value); }

/* ---------- Secteurs en cache sur la carte du salon ----------
   Les secteurs déjà téléchargés (cette session ou une précédente) sont éclairés : une zone qui en est couverte
   se charge tout de suite. Les secteurs de la zone choisie qui restent à télécharger sont juste tracés en pointillé. */
let cachedKeys = null, cacheLayer = null, cacheTimer = 0;
async function loadCachedKeys() {
  if (cachedKeys) return cachedKeys;
  const db = await idb(); const set = new Set();
  if (db) await new Promise((res) => {
    try { const r = db.transaction("cells").objectStore("cells").getAllKeys(); r.onsuccess = () => { for (const k of r.result || []) if (String(k).startsWith(QVER)) set.add(String(k).slice(QVER.length)); res(); }; r.onerror = () => res(); }
    catch { res(); }
  });
  for (const k of memCells.keys()) set.add(k);
  cachedKeys = set; return set;
}
function cellBounds(key) {
  const [lf, i, j] = key.split(":").map(Number), dLat = CELL_DEG, dLon = CELL_DEG / Math.cos(lf * Math.PI / 180);
  return [[i * dLat, j * dLon], [(i + 1) * dLat, (j + 1) * dLon]];
}
function drawCacheSoon() { clearTimeout(cacheTimer); cacheTimer = setTimeout(drawCache, 150); }
async function drawCache() {
  if (!cacheLayer) cacheLayer = L.layerGroup().addTo(map);
  cacheLayer.clearLayers();
  if (state !== "lobby" || map.getZoom() < 11) return;
  const keys = await loadCachedKeys(); if (state !== "lobby") return;
  const view = map.getBounds().pad(0.2), lit = css("--sodium");
  let n = 0;
  for (const k of keys) {
    const b = cellBounds(k); if (!view.intersects(b)) continue;
    cacheLayer.addLayer(L.rectangle(b, { color: lit, weight: 1, opacity: 0.45, fillColor: lit, fillOpacity: 0.13, interactive: false }));
    if (++n > 800) break;
  }
  if (zone && !zone.fake) for (const c of makeCells(zone.lat, zone.lon, zone.r)) if (!keys.has(c.key))
    cacheLayer.addLayer(L.rectangle([[c.s, c.w], [c.n, c.e]], { color: "#8a99a8", weight: 1, opacity: 0.35, dashArray: "3 5", fill: false, interactive: false }));
}
map.on("moveend", () => { if (state === "lobby") drawCacheSoon(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abortErr = () => new DOMException("Annulé", "AbortError");

// Requête « couverte » : on interroge un serveur ; s'il n'a pas répondu au bout de 6 s, on en interroge
// un deuxième, puis un troisième à 12 s. La première réponse valide gagne, les autres sont annulées.
function netFetch(q, start) {
  return new Promise((resolve, reject) => {
    const ctls = []; let done = false, failed = 0, started = 0, lastErr = null;
    const finish = (fn) => { if (done) return; done = true; timers.forEach(clearTimeout); fn(); };
    const launch = () => {
      if (done || started >= OVERPASS.length) return;
      const url = OVERPASS[(start + started) % OVERPASS.length]; started++;
      const ctl = new AbortController(); ctls.push(ctl);
      fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctl.signal })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then((txt) => { if (!txt.startsWith("{")) throw new Error("réponse invalide"); finish(() => { ctls.forEach((c) => c !== ctl && c.abort()); resolve({ txt, host: new URL(url).hostname }); }); })
        .catch((e) => {
          if (done) return; failed++; lastErr = e;
          if (started < OVERPASS.length) launch();               // erreur rapide : serveur suivant tout de suite
          else if (failed >= started) finish(() => reject(lastErr));
        });
    };
    const timers = [setTimeout(launch, 6000), setTimeout(launch, 12000), setTimeout(() => finish(() => { ctls.forEach((c) => c.abort()); reject(new Error("délai dépassé")); }), 65000)];
    launch();
  });
}
function cellQuery(c) {
  const f = (v) => v.toFixed(6);
  return `[out:json][timeout:60];way["highway"~"^(${HIGHWAYS})$"]["area"!="yes"](${f(c.s)},${f(c.w)},${f(c.n)},${f(c.e)});out body qt;>;out skel qt;`;
}
/* ---------- Partage des secteurs entre joueurs ----------
   Dès qu'un joueur obtient un secteur (téléchargement ou cache), il l'envoie aux autres par la connexion
   de jeu (compressé en gzip, découpé en morceaux). Un invité l'envoie à l'hôte, qui le relaie à tous.
   Côté réception, le secteur arrive directement en cache : plus besoin de le demander à OpenStreetMap. */
const sentKeys = new Set(), recvKeys = new Set(), sharedWait = new Map(), partsIn = new Map();
const CHUNK = 12000; // caractères base64 par morceau, sous la limite de 16 Ko de PeerJS
function waitShared(key) {
  let w = sharedWait.get(key);
  if (!w) { let res; const p = new Promise((r) => { res = r; }); w = { p, res }; sharedWait.set(key, w); }
  return w.p;
}
function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(s); }
function unb64(str) { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
async function packTxt(txt) {
  if (typeof CompressionStream === "undefined") return { z: 0, d: txt };
  const buf = new Uint8Array(await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  return { z: 1, d: b64(buf) };
}
async function unpackTxt(z, d) {
  if (!z) return d;
  return await new Response(new Blob([unb64(d)]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
async function shareCell(key, txt, except) {
  if (!net || sentKeys.has(key)) return;
  if (!isHost && recvKeys.has(key)) return; // un invité ne renvoie pas ce que l'hôte lui a déjà donné
  sentKeys.add(key);
  const { z, d } = await packTxt(txt);
  const n = Math.ceil(d.length / CHUNK) || 1;
  for (let i = 0; i < n; i++) {
    const m = { t: "cell", key, i, n, z, d: d.slice(i * CHUNK, (i + 1) * CHUNK) };
    if (isHost) { for (const q of players.values()) if (q.link && q.id !== except) q.link.send(m); }
    else toHost(m);
    if (i % 8 === 7) await sleep(0); // laisse respirer la boucle de jeu
  }
}
async function receiveCellPart(m, fromId) {
  let e = partsIn.get(m.key);
  if (!e) { e = { parts: new Array(m.n), got: 0 }; partsIn.set(m.key, e); }
  if (e.parts[m.i] === undefined) { e.parts[m.i] = m.d; e.got++; }
  if (e.got < m.n) return;
  partsIn.delete(m.key);
  if (memCells.has(m.key)) return;
  try {
    const txt = await unpackTxt(m.z, e.parts.join(""));
    const d = JSON.parse(txt);
    recvKeys.add(m.key); memPut(m.key, d); idbPut(QVER + m.key, txt);
    const w = sharedWait.get(m.key); if (w) w.res(d);
    markArrived(m.key);
    if (isHost) shareCell(m.key, txt, fromId); // l'hôte relaie aux autres joueurs
  } catch {}
}
// Un secteur : mémoire -> IndexedDB -> envoyé par un autre joueur -> réseau.
// Une même requête en cours est partagée (préchargement + chargement).
// Un secteur : mémoire -> IndexedDB -> envoyé par un autre joueur -> réseau.
// waitMs : en multijoueur, temps laissé au joueur responsable du secteur pour nous l'envoyer
// avant de le télécharger nous-mêmes. onSteal est appelé si on finit par le télécharger.
function getCell(c, worker, waitMs = 0, onSteal) {
  if (memCells.has(c.key)) {
    c.cached = true; if (recvKeys.has(c.key)) c.shared = true;
    if (net && !sentKeys.has(c.key)) shareCell(c.key, JSON.stringify(memCells.get(c.key)));
    return Promise.resolve(memCells.get(c.key));
  }
  if (inflight.has(c.key)) return inflight.get(c.key);
  const p = (async () => {
    const txt = await idbGet(QVER + c.key);
    if (txt) { c.cached = true; shareCell(c.key, txt); return JSON.parse(txt); }
    if (net && waitMs > 0) {
      const got = await Promise.race([waitShared(c.key), sleep(waitMs).then(() => null)]);
      if (got) { c.shared = true; return got; }
      c.stolen = true; if (onSteal) onSteal(c); // trop long : on le télécharge nous-mêmes
    }
    let lastErr;
    for (let round = 0; round < 3; round++) {
      try {
        const r = await Promise.race([netFetch(cellQuery(c), worker + round), waitShared(c.key).then((d) => ({ d }))]);
        if (r.d) { c.shared = true; return r.d; }
        c.server = r.host; idbPut(QVER + c.key, r.txt); shareCell(c.key, r.txt);
        return JSON.parse(r.txt);
      } catch (e) { lastErr = e; await sleep(1500 * (round + 1)); }
    }
    throw lastErr;
  })();
  inflight.set(c.key, p);
  p.then((d) => memPut(c.key, d), () => {}).finally(() => inflight.delete(c.key));
  return p;
}

/* ---------- Répartition des secteurs entre joueurs ----------
   Les secteurs (triés du centre vers l'extérieur) sont distribués à tour de rôle entre les joueurs,
   dans le même ordre chez tout le monde. Chacun télécharge d'abord les siens et les partage.
   Quand il a fini, il attend ceux des autres ; si l'un d'eux tarde plus de STEAL_WAIT, il le télécharge lui-même. */
const STEAL_WAIT = 4000;
function assignCells(cells) {
  const ids = net ? [...players.keys()].sort() : [myId];
  cells.forEach((c, i) => {
    c.owner = ids[i % ids.length] || myId;
    const q = players.get(c.owner); c.color = q ? q.color : null;
  });
  return cells;
}
// Fait tourner les téléchargements : mes secteurs d'abord, puis ceux des autres (avec attente).
async function runCells(cells, nWorkers, onCell, ctl) {
  assignCells(cells);
  const mine = cells.filter((c) => c.owner === myId), others = cells.filter((c) => c.owner !== myId);
  for (const c of others) if (c.st === "wait") c.st = "share";
  let iM = 0, iO = 0;
  const worker = async (w) => {
    while (!ctl.stop()) {
      let c, wait;
      if (iM < mine.length) { c = mine[iM++]; wait = 0; c.st = "load"; }
      else if (iO < others.length) { c = others[iO++]; wait = STEAL_WAIT; if (c.st !== "done") c.st = "share"; }
      else break;
      onCell(c);
      try {
        const data = await Promise.race([getCell(c, w, wait, (x) => { x.st = "load"; onCell(x); }), ctl.abortP]);
        c.st = "done"; c.data = data; onCell(c);
      } catch (err) { if (err.name !== "AbortError") { c.st = "fail"; onCell(c); } throw err; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(nWorkers, cells.length) }, (_, w) => worker(w)));
}
// Un secteur reçu d'un autre joueur s'affiche tout de suite comme chargé
function markArrived(key) {
  if (loading) for (const c of loading.cells) if (c.key === key && c.st !== "done") { c.st = "done"; c.shared = true; onCell(c); }
  if (prefetchCells) for (const c of prefetchCells) if (c.key === key && c.st !== "done") { c.st = "done"; c.shared = true; }
}
async function fetchRoads(cells, onCell, workers = 4) {
  let aborted = false, fire; const abortP = new Promise((_, rej) => { fire = () => rej(abortErr()); }); abortP.catch(() => {});
  loadCtl = { abort() { if (!aborted) { aborted = true; fire(); } } };
  try { await runCells(cells, workers, onCell, { stop: () => aborted, abortP }); }
  catch (err) { loadCtl.abort(); throw err; }
  const nodes = new Map(), ways = new Map();
  for (const c of cells) { const d = memCells.get(c.key) || c.data; if (d) for (const el of d.elements) (el.type === "node" ? nodes : ways).set(el.id, el); }
  // ordre stable : mêmes données => même graphe chez tous les joueurs
  const byId = (a, b) => a.id - b.id;
  return { elements: [...[...nodes.values()].sort(byId), ...[...ways.values()].sort(byId)] };
}

/* ---------- Préchargement : dès que la zone est choisie, les rues se téléchargent en arrière-plan ---------- */
let prefetchTimer = 0, prefetchTok = 0, prefetchCells = null;
function schedulePrefetch() {
  clearTimeout(prefetchTimer);
  const z = zone; const tok = ++prefetchTok;
  drawCacheSoon();
  if (!z || z.fake) { $("hostPrefetch").textContent = ""; $("guestPrefetch").textContent = ""; return; }
  prefetchTimer = setTimeout(async () => {
    const cells = makeCells(z.lat, z.lon, z.r); prefetchCells = cells;
    const show = () => {
      if (tok !== prefetchTok || state !== "lobby") return;
      if (cachedKeys) { let added = false; for (const c of cells) if (c.st === "done" && !cachedKeys.has(c.key)) { cachedKeys.add(c.key); added = true; } if (added) drawCacheSoon(); }
      const done = cells.filter((c) => c.st === "done").length;
      const mineN = cells.filter((c) => c.owner === myId).length, mineDone = cells.filter((c) => c.owner === myId && c.st === "done").length;
      const t = done === cells.length ? `Rues de la zone déjà téléchargées (${done} / ${cells.length} secteurs) : le chargement sera immédiat.`
        : `Préchargement des rues : ${done} / ${cells.length} secteurs${net && players.size > 1 ? ` (ta part : ${mineDone} / ${mineN})` : ""}`;
      $("hostPrefetch").textContent = t; $("guestPrefetch").textContent = t;
    };
    const ctl = { stop: () => tok !== prefetchTok || state !== "lobby", abortP: new Promise(() => {}) };
    show();
    try { await runCells(cells, 3, show, ctl); } catch {}
    show();
  }, 1200); // on attend que l'hôte arrête de bouger le point
}
let loadCtl = null, loading = null;
const mo = (b) => b < 1e6 ? `${Math.max(1, Math.round(b / 1024))} Ko` : `${(b / 1e6).toFixed(1).replace(".", ",")} Mo`;
function onCell(c) {
  if (!loading) return;
  const done = loading.cells.filter((x) => x.st === "done").length, N = loading.cells.length;
  $("lFill").style.transform = `scaleX(${done / N})`;
  $("lPhase").textContent = `Secteurs chargés : ${done} / ${N}`;
  const shared = loading.cells.filter((x) => x.st === "done" && x.shared).length;
  const cached = loading.cells.filter((x) => x.st === "done" && x.cached && !x.shared).length;
  const bits = [];
  if (net && players.size > 1) {
    const mine = loading.cells.filter((x) => x.owner === myId);
    bits.push(`ta part : ${mine.filter((x) => x.st === "done").length} / ${mine.length}`);
    const stolen = loading.cells.filter((x) => x.stolen && x.owner !== myId).length;
    if (stolen) bits.push(`${stolen} repris aux joueurs lents`);
  }
  if (shared) bits.push(`${shared} reçu${shared > 1 ? "s" : ""} des autres joueurs`);
  if (cached) bits.push(`${cached} repris du cache`);
  if (c.server && !c.shared) bits.push(`serveur ${c.server}`);
  $("lHint").textContent = bits.length ? bits.join(" · ") : "Connexion aux serveurs OpenStreetMap…";
  reportProgress(done, N, false);
  const data = c.data || memCells.get(c.key);
  if (c.st === "done" && data && !c.drawn) {
    c.drawn = true; // aperçu immédiat des rues du secteur
    const pts = new Map(); for (const el of data.elements) if (el.type === "node") pts.set(el.id, [el.lat, el.lon]);
    const lines = [];
    for (const el of data.elements) if (el.type === "way") { const l = el.nodes.map((id) => pts.get(id)).filter(Boolean); if (l.length > 1) lines.push(l); }
    if (lines.length) loading.preview.addLayer(L.polyline(lines, { color: css("--sodium"), opacity: 0.35, weight: 1.5, interactive: false }));
  }
}
function hideLoader() {
  $("loader").hidden = true;
  if (loading) { clearInterval(loading.timer); loading.preview.remove(); }
  loading = null;
}
// Ville de secours, générée (identique chez tous les joueurs)
function fakeCity(lat0, lon0, R) {
  let seed = 1234567; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  const step = 90, n = Math.ceil(R / step); const els = []; const ids = new Map(); let id = 1;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const x = i * step + (rnd() - 0.5) * 30, y = j * step + (rnd() - 0.5) * 30;
    if (Math.hypot(x, y) > R * 1.05) continue;
    ids.set(i + "," + j, id); els.push({ type: "node", id: id++, lat: lat0 + y / ky, lon: lon0 + x / kx });
  }
  const way = (a, b) => { const A = ids.get(a), B = ids.get(b); if (A && B) els.push({ type: "way", id: id++, nodes: [A, B] }); };
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    if (rnd() > 0.14) way(i + "," + j, (i + 1) + "," + j);
    if (rnd() > 0.14) way(i + "," + j, i + "," + (j + 1));
    if (i === j || i === -j - 1) way(i + "," + j, (i + 1) + "," + (j + 1));
  }
  return { elements: els };
}
