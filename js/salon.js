"use strict";
// Dead Ends · Salon, chargement partagé, choix des classes, préparation de la partie

/* ---------------- Salon : choix de la zone ---------------- */
function enterLobby() {
  state = "lobby"; game = null; G = null;
  for (const p of players.values()) { p.loaded = false; p.failed = false; p.ready = false; p.load = { done: 0, n: 0 }; p.alive = true; }
  if (roadsLayer) { roadsLayer.remove(); roadsLayer = null; }
  $("panel").hidden = false; $("hud").hidden = true;
  map.dragging.enable(); map.doubleClickZoom.enable();
  showStep("stepLobby"); setupLobbyView();
  if (isHost) { broadcast({ t: "toLobby" }); zoneChanged(); }
  else showGuestZone();
  pushLobby();
}
function setupLobbyView() {
  if (isHost) setMode(gameMode);
  $("codeBox").hidden = !net;
  if (net) $("codeText").textContent = net.code;
  $("hostZone").hidden = !isHost; $("guestZone").hidden = isHost;
  $("loadBtn").textContent = net ? "Charger la zone pour tout le monde" : "Charger les rues";
}
function showGuestZone() {
  if (zoneCircle) { zoneCircle.remove(); zoneCircle = null; }
  const M = MODES[gameMode] || MODES.survie;
  $("guestMode").innerHTML = `${modeBadge(gameMode)}<br><span class="fine">${M.desc}</span>`;
  if (!zone) { $("guestZoneText").textContent = "L'hôte choisit où l'infection commence…"; return; }
  zoneCircle = L.circle([zone.lat, zone.lon], { radius: zone.r, color: css("--sodium"), weight: 1.5, dashArray: "4 8", fill: false, interactive: false }).addTo(map);
  map.fitBounds(zoneCircle.getBounds(), { paddingTopLeft: [window.innerWidth > 640 ? 400 : 0, 0] });
  $("guestZoneText").textContent = `Zone choisie : rayon ${zone.r >= 1000 ? (zone.r / 1000).toString().replace(".", ",") + " km" : zone.r + " m"}${zone.paths ? ", chemins piétons inclus" : ", rues seulement"}. En attente du chargement…`;
}

/* ---------------- Chargement (chaque joueur charge la même zone) ---------------- */
function hostStartLoad(fake) {
  if (!isHost) return;
  zone = currentZone(); if (!zone) return;
  zone.fake = !!fake;
  for (const p of players.values()) { p.loaded = false; p.failed = false; p.load = { done: 0, n: 0 }; }
  broadcast({ t: "load", zone });
  startLoading();
}
let lastProgSent = 0;
let loadGen = 0; // numéro du chargement en cours : un ancien chargement qui finit en retard est ignoré
async function startLoading() {
  if (loadCtl) loadCtl.abort();
  hideLoader();
  const gen = ++loadGen;
  state = "loading"; showStep("stepLoad");
  $("retryBtn").hidden = true; $("fakeBtn").hidden = true; $("waitAll").hidden = true; lstatus("");
  if (roadsLayer) { roadsLayer.remove(); roadsLayer = null; }
  if (zoneCircle) zoneCircle.remove();
  zoneCircle = L.circle([zone.lat, zone.lon], { radius: zone.r, color: css("--sodium"), weight: 1.5, dashArray: "4 8", fill: false, interactive: false }).addTo(map);
  map.fitBounds(zoneCircle.getBounds(), { paddingTopLeft: [window.innerWidth > 640 ? 400 : 0, 0] });
  pushLobby();
  if (zone.fake) { finishLoading(fakeCity(zone.lat, zone.lon, zone.r), true, gen); return; }
  const cells = makeCells(zone.lat, zone.lon, zone.r);
  loading = { t0: performance.now(), cells, preview: L.layerGroup().addTo(map) };
  loading.timer = setInterval(() => {
    if (!loading) return;
    const sec = (performance.now() - loading.t0) / 1000;
    $("lTime").textContent = `${Math.floor(sec)} s`;
    if (sec > 20) $("lSlow").hidden = false;
  }, 200);
  $("lSlow").hidden = true; $("lTime").textContent = "0 s"; $("loader").hidden = false;
  $("lFill").style.transform = "scaleX(0)"; $("lPhase").textContent = `Secteurs chargés : 0 / ${cells.length}`; $("lHint").textContent = "Connexion aux serveurs OpenStreetMap…";
  reportProgress(0, cells.length, true);
  try {
    const data = await fetchRoads(cells, onCell);
    if (gen !== loadGen) return; // un autre chargement a pris le relais (ex. ville générée)
    $("lPhase").textContent = "Construction du réseau de rues…";
    await new Promise((r) => setTimeout(r, 40));
    if (gen !== loadGen) return;
    hideLoader();
    finishLoading(data, false, gen);
  } catch (err) {
    if (gen !== loadGen) return;
    hideLoader();
    if (state !== "loading") return;
    lstatus(err && err.name === "AbortError" ? "Chargement annulé." : "Impossible de récupérer toutes les rues (serveurs saturés ou hors ligne).", "err");
    $("retryBtn").hidden = false;
    if (isHost) $("fakeBtn").hidden = false;
    reportLoaded(false);
  }
}
let myLoad = { done: 0, n: 0 };
function reportProgress(done, n, force) {
  myLoad = { done, n };
  const p = me(); if (p) p.load = { done, n };
  const now = performance.now();
  if (!isHost && (force || now - lastProgSent > 250 || done === n)) { lastProgSent = now; toHost({ t: "progress", done, n }); }
  if (isHost) pushLobby();
}
function reportLoaded(ok) {
  const p = me(); if (p) { p.loaded = ok; p.failed = !ok; }
  if (isHost) { pushLobby(); checkAllLoaded(); } else toHost({ t: "loaded", ok });
}
function finishLoading(data, generated, gen) {
  if (gen !== loadGen || state !== "loading") return; // jamais de changement de carte hors de la phase de chargement
  const g = buildGraph(data, zone.lat, zone.lon, zone.paths);
  if (!g || g.N < 20) {
    lstatus("Pas assez de rues dans cette zone.", "err");
    if (isHost) $("fakeBtn").hidden = false;
    reportLoaded(false); return;
  }
  G = g;
  if (zone.start) G.spawn = nodeNear(zone.start);
  G.finish = zone.finish ? nodeNear(zone.finish) : null;
  drawNetwork(generated);
  lstatus(`${G.N.toLocaleString("fr-FR")} carrefours et ${G.EA.length.toLocaleString("fr-FR")} tronçons chargés${generated ? " (ville générée)" : ""}.`, "good");
  $("waitAll").hidden = !net;
  reportLoaded(true);
}
function checkAllLoaded() {
  if (!isHost || state !== "loading") return;
  const all = [...players.values()];
  if (all.length && all.every((p) => p.loaded)) { broadcast({ t: "role" }); enterRole(); }
  else if (all.some((p) => p.failed)) $("fakeBtn").hidden = false;
}
function drawNetwork(generated) {
  if (roadsLayer) roadsLayer.remove();
  const toLine = (w) => w.nodes.map((n) => toLL(G.X[n], G.Y[n]));
  const sel = (lvl, minor) => G.ways.filter((w) => (w.lvl || 0) === lvl && !!w.minor === minor).map(toLine);
  const sodium = css("--sodium"), night = css("--night");
  const layers = [
    // tunnels et passages couverts : sous le reste, en pointillés effacés
    L.polyline(sel(-1, false).concat(sel(-1, true)), { color: sodium, opacity: 0.28, weight: 2, dashArray: "2 6", interactive: false }),
    // rues et chemins au sol
    L.polyline(sel(0, false), { color: sodium, opacity: generated ? 0.55 : 0.45, weight: generated ? 3 : 2.5, interactive: false }),
    L.polyline(sel(0, true), { color: sodium, opacity: 0.6, weight: 1.6, dashArray: "3 5", interactive: false }),
    // ponts : un contour sombre les détache de ce qui passe dessous
    L.polyline(sel(1, false).concat(sel(1, true)), { color: night, opacity: 1, weight: 8, lineCap: "butt", interactive: false }),
    L.polyline(sel(1, false), { color: "#ffd08a", opacity: 0.95, weight: 3, lineCap: "butt", interactive: false }),
    L.polyline(sel(1, true), { color: "#ffd08a", opacity: 0.9, weight: 2, dashArray: "3 4", lineCap: "butt", interactive: false }),
  ];
  roadsLayer = L.layerGroup(layers).addTo(map);
  if (pickMarker) { pickMarker.remove(); pickMarker = null; }
}
function lstatus(t, cls) { const s = $("loadStatus"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }

/* ---------------- Classes (choix avant la partie) ---------------- */
function enterRole() {
  state = "role"; game = null;
  for (const p of players.values()) { p.ready = false; p.alive = true; p.time = 0; }
  $("panel").hidden = false; $("hud").hidden = true;
  map.dragging.enable(); map.doubleClickZoom.enable();
  if (G) map.setView(toLL(G.X[G.spawn], G.Y[G.spawn]), 16);
  if (zoneCircle) zoneCircle.remove();
  zoneCircle = L.circle([zone.lat, zone.lon], { radius: zone.r, color: css("--sodium"), weight: 1.5, dashArray: "4 8", fill: false, interactive: false }).addTo(map);
  $("roleMode").innerHTML = modeBadge(gameMode);
  showStep("stepRole");
  pushLobby(); refreshRoleButtons();
}
function modeBadge(k) { const M = MODES[k] || MODES.survie; return `Mode : <b>${esc(M.name)}</b>${M.proto ? ' <span class="proto">Prototype</span>' : ""}`; }
function myRole() { const r = document.querySelector('input[name="role"]:checked'); return r && ROLES[r.value] ? r.value : "coureur"; }
function refreshRoleButtons() {
  if (state !== "role") return;
  const p = me(); if (!p) return;
  $("readyBtn").hidden = !net;
  $("readyBtn").textContent = p.ready ? "Prêt ✓ · cliquer pour annuler" : "Je suis prêt";
  $("readyBtn").classList.toggle("on", !!p.ready);
  $("launchBtn").hidden = !isHost; $("backBtn").hidden = !isHost;
  const all = [...players.values()];
  const allReady = !net || all.every((q) => q.ready);
  const M = MODES[gameMode] || MODES.survie, enough = all.length >= M.min;
  $("launchBtn").disabled = !allReady || !enough;
  $("launchBtn").textContent = !enough ? `${M.name} : ${M.min} joueurs minimum` : !net || allReady ? "Lancer la partie" : `Lancer (${all.filter((q) => q.ready).length} / ${all.length} prêts)`;
  $("roleWait").hidden = isHost || !p.ready;
}
function toggleReady() {
  const p = me(); if (!p) return;
  p.ready = !p.ready; p.role = myRole();
  if (isHost) pushLobby(); else toHost({ t: "ready", ready: p.ready, role: p.role });
  refreshRoleButtons(); renderPlayers();
}
document.querySelectorAll('input[name="role"]').forEach((r) => r.addEventListener("change", () => {
  const p = me(); if (!p) return; p.role = myRole();
  if (p.ready) { if (isHost) pushLobby(); else toHost({ t: "ready", ready: true, role: p.role }); }
}));
function hostLaunch() {
  if (!isHost) return;
  const p = me(); p.role = myRole(); p.ready = true;
  const all = [...players.values()];
  if (net && !all.every((q) => q.ready)) return;
  if (all.length < (MODES[gameMode] || MODES.survie).min) return;
  const setup = makeSetup();
  broadcast({ t: "start", setup });
  startCountdown(setup);
}

/* ---------------- Préparation d'une partie (hôte) ---------------- */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function dailySpot() { return DAILY_SPOTS[hashStr("deadends:" + todayKey()) % DAILY_SPOTS.length]; }
// Carrefour au hasard entre minD et maxD (à vol d'oiseau) d'un point
function pickNodeAround(x, y, minD, maxD, rnd, avoid) {
  rnd = rnd || Math.random;
  for (const k of [1, 1.5, 2.5, 99]) {
    for (let i = 0; i < 400; i++) {
      const n = (rnd() * G.N) | 0, d = hyp(G.X[n], G.Y[n], x, y);
      if (d >= minD / k && d <= maxD * k && (!avoid || avoid(n))) return n;
    }
  }
  return G.spawn;
}
function makeSetup() {
  const ids = [...players.keys()].sort();
  const seed = gameMode === "defi" ? hashStr(todayKey()) : (Math.random() * 2 ** 31) | 0;
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const st = { mode: gameMode, seed, teams: {}, vip: [], masters: [], dests: [] };
  if (gameMode === "escorte") {
    const sh = shuffle(ids.slice(), rnd);
    sh.forEach((id, i) => { st.teams[id] = i % 2; });
    for (const t of [0, 1]) { const m = sh.filter((id) => st.teams[id] === t); if (m.length) st.vip.push(m[0]); }
    const sx = G.X[G.spawn], sy = G.Y[G.spawn];
    const a = pickNodeAround(sx, sy, 700, 1100, rnd);
    const angA = Math.atan2(G.Y[a] - sy, G.X[a] - sx);
    const b = pickNodeAround(sx, sy, 700, 1100, rnd, (n) => { let d = Math.abs(Math.atan2(G.Y[n] - sy, G.X[n] - sx) - angA); if (d > Math.PI) d = 2 * Math.PI - d; return d > 1.8; });
    st.dests = [a, b].map((n, t) => ({ x: G.X[n], y: G.Y[n], node: n, team: t }));
  }
  if (gameMode === "horde") st.masters = shuffle(ids.slice(), rnd).slice(0, ids.length >= 5 ? 2 : 1);
  return st;
}
