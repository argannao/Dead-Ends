"use strict";
// Dead Ends · HUD, boucle de jeu, commandes, choix du mode et du lieu

/* ---------------- HUD ---------------- */
const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`; };
const fmtClock = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const fmtDist = (m) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace(".", ",")} km`;
let bannerTimer = 0;
function banner(text, danger, ms) {
  const b = $("banner"); b.textContent = text; b.hidden = false; b.classList.toggle("danger", !!danger);
  clearTimeout(bannerTimer); if (ms) bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
}
function flash() { const f = $("flash"); f.style.opacity = 1; setTimeout(() => (f.style.opacity = 0), 260); }
function findMark(kind, pred) { return game.marks.find((m) => m[0] === kind && (!pred || pred(m))); }
function objectiveText() {
  const gm = game, q = meP(), h = gm.hud, P = gm.player;
  const dist = (m) => (m ? where({ x: m[1], y: m[2] }) : "");
  let t = h ? h.txt + (h.left != null ? ` ${fmtClock(h.left)}` : "") + (h.extra ? ` · ${h.extra}` : "") : "";
  if (gm.mode === "patient" && gm.secret && !q.zombie) t = `Tu es le patient zéro · transformation dans ${fmtClock(CFG.patientTurn - gm.t)}`;
  if (gm.mode === "patient" && q.zombie) t = "Infecté : attrape les humains" + (h && h.left != null ? ` · ${fmtClock(h.left)}` : "");
  if (gm.mode === "extraction") { const e = findMark("evac"), z = findMark("evacZone"); if (e && !q.escaped) t += ` · ${dist(e)}`; else if (z && !q.escaped) t += ` · zone ${dist(z)}`; if (q.escaped) t = "Évacué : tu es sauvé"; }
  if (gm.mode === "colline") { const hl = findMark("hill"); if (hl) t += hl[4] === myId ? " · tu tiens la colline !" : ` · colline ${dist(hl)}`; }
  if (gm.mode === "escorte" && q.team != null) { const d = findMark("dest", (m) => m[3] === q.team); t = `${q.vip ? "Tu es le VIP : rejoins" : "Escorte ton VIP jusqu'à"} la destination ${TEAMS[q.team].name}${d ? " · " + dist(d) : ""}`; }
  if (gm.mode === "horde" && q.master) t = "Maître de la horde : clic pour rallier, A pour hurler" + (h && h.left != null ? ` · ${fmtClock(h.left)}` : "");
  if (gm.mode === "course") { const f = findMark("finish"); t = q.escaped ? "Arrivé ! Tu observes les autres" : `Rejoins l'arrivée${f ? " · " + dist(f) : ""}`; }
  if (gm.mode === "sommet") {
    const s = findMark("summit"), alt = Math.round(elevAt(P.x, P.y)), g = Math.round((gm.grade || 0) * 100);
    t = q.escaped ? "Au sommet !" : `Atteins le sommet${s ? ` (${s[3]} m) · ${dist(s)}` : ""} · tu es à ${alt} m${g >= 2 ? ` · montée ${g} %` : g <= -2 ? ` · descente ${-g} %` : ""}`;
  }
  if (gm.mode === "aube" && q.down) t = "À terre : un coéquipier doit rester 3 s près de toi";
  return t;
}
function updateHud() {
  const gm = game, P = gm.player, q = meP();
  const myTime = q.alive && !q.escaped && !q.zombie ? gm.t : (q.time || gm.t);
  $("hTime").textContent = fmtTime(myTime);
  $("hWave").textContent = gm.wave ? String(gm.wave) : "–";
  $("hZomb").textContent = String(gm.zombies.length);
  $("hDist").textContent = fmtDist(P.trail);
  $("hAliveRow").hidden = !net; $("hAliveK").hidden = !net;
  if (net) { const all = [...players.values()].filter((o) => !o.master); $("hAlive").textContent = `${all.filter(isPrey).length} / ${all.length}`; }
  const scoreOn = !!gm.M.score; $("hScoreK").hidden = !scoreOn; $("hScore").hidden = !scoreOn; if (scoreOn) $("hScore").textContent = `${q.score || 0} pts`;
  // étiquette de rôle
  let tag = q.master ? "Maître de la horde" : q.zombie ? (q.patient || gm.secret ? "Patient zéro" : "Infecté") : gm.R.name;
  if (q.team != null) tag += ` · équipe ${TEAMS[q.team].name}`;
  if (q.vip) tag += " · VIP";
  $("hRole").textContent = tag;
  $("hMode").textContent = gm.M.name + (gm.M.proto ? " · prototype" : "");
  const helpKey = q.master ? "m" : q.zombie ? "z" : "p";
  if (gm.helpKey !== helpKey) {
    gm.helpKey = helpKey;
    $("helpBox").innerHTML = q.master
      ? "<span><kbd>Clic</kbd> rallier ta horde ici</span><span><kbd>A</kbd> cri : la horde accélère</span><span><kbd>Glisser</kbd> déplacer la carte</span>"
      : q.zombie ? "<span><kbd>Clic</kbd> courir vers un point</span><span>Tu es plus rapide que les humains</span>"
      : "<span><kbd>Clic</kbd> courir vers un point</span><span><kbd>Shift</kbd> + glisser : tracer ton chemin</span><span><kbd>Espace</kbd> sprint (bruyant)</span><span><kbd>A</kbd> compétence</span>";
  }
  const ob = objectiveText(); $("hObj").textContent = ob; $("hObj").hidden = !ob;
  // endurance
  const ratio = P.stamina / gm.R.stamina;
  const fill = $("hStam"); fill.style.transform = `scaleX(${ratio})`; fill.classList.toggle("low", ratio < 0.25);
  const lbl = $("hStamLbl"); lbl.classList.toggle("on", !!gm.sprinting);
  $("stamBox").hidden = !!(q.master || q.zombie || !q.alive || q.escaped);
  lbl.textContent = q.down ? "À terre" : gm.rushUntil > gm.t ? "Rush · sprint sans fatigue" : gm.sprinting ? "Sprint · tu fais du bruit" : gm.sprintLock ? "Souffle court : relâche Espace" : (ratio < 0.02 ? "À bout de souffle" : "Endurance · Espace pour sprinter");
  // repéré / discret
  const det = $("hDetect"), hn = gm.huntedMe || 0;
  det.hidden = !isPrey(q) || !gm.zombies.length;
  if (hn !== gm.lastHunted) {
    det.textContent = hn ? `Repéré · ${hn} zombie${hn > 1 ? "s" : ""} te traque${hn > 1 ? "nt" : ""}` : "Discret · ils suivent ta piste";
    det.classList.toggle("on", hn > 0);
    if (hn > 0 && !(gm.lastHunted > 0)) { det.classList.remove("pop"); void det.offsetWidth; det.classList.add("pop"); }
    gm.lastHunted = hn;
  }
  // compétence
  const sk = mySkill(), btn = $("skillBtn");
  const passive = !sk && isPrey(q) && gm.R.passive;
  btn.hidden = !sk && !passive;
  if (passive) {
    $("skName").textContent = gm.R.passive.name; $("skState").textContent = q.saveUsed ? "Utilisée" : "Prête";
    btn.classList.toggle("ready", !q.saveUsed); btn.classList.remove("aiming", "active"); btn.style.setProperty("--cd", q.saveUsed ? "1" : "0");
    btn.title = gm.R.passive.desc;
  }
  if (sk) {
    const S = SKILLS[sk], cd = Math.max(0, gm.skillReadyAt - gm.t), active = (sk === "rush" && gm.rushUntil > gm.t) || (sk === "drone" && gm.droneUntil > gm.t) || (sk === "planque" && gm.planqueUntil > gm.t);
    $("skName").textContent = S.name;
    $("skState").textContent = gm.targeting ? "Vise…" : active ? "Actif" : cd > 0 ? `${Math.ceil(cd)} s` : "Prêt";
    btn.classList.toggle("ready", cd <= 0 && !gm.targeting); btn.classList.toggle("aiming", !!gm.targeting); btn.classList.toggle("active", active);
    btn.style.setProperty("--cd", String(cd > 0 ? cd / (gm.skillCdLen || S.cd) : 0));
    btn.title = S.desc;
  }
  let near = Infinity; for (const z of gm.zombies) near = Math.min(near, hyp(z.x, z.y, P.x, P.y));
  const th = $("threat");
  if (isPrey(q) && near <= gm.R.vision) { th.hidden = false; th.textContent = `Zombie à ${Math.round(near)} m`; } else th.hidden = true;
}

/* ---------------- Boucle ---------------- */
let last = performance.now();
const TIME_SCALE = Math.min(10, Math.max(0.1, +new URLSearchParams(location.search).get("vitesse") || 1)); // ?vitesse=4 : accélère le temps (tests)
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.016;
  dt *= TIME_SCALE;
  if (state === "play" && game) {
    const steps = Math.ceil(dt / 0.02); for (let i = 0; i < steps && state === "play"; i++) update(dt / steps);
    if (state === "play") { const q = meP(); if (q.alive && !q.master && !q.escaped) followCam(); updateHud(); }
  }
  render(now);
  requestAnimationFrame(frame);
}
function followCam() {
  const ll = toLL(game.player.x, game.player.y);
  const c = map.latLngToContainerPoint(ll), m = map.latLngToContainerPoint(map.getCenter());
  if (Math.abs(c.x - m.x) > 1 || Math.abs(c.y - m.y) > 1) map.setView(ll, map.getZoom(), { animate: false });
}
// (la boucle démarre dans demarrage.js, une fois tous les fichiers chargés)
// Un onglet en arrière-plan ralentit requestAnimationFrame : l'hôte continue la simulation au minimum 10 fois par seconde.
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (document.hidden && isHost && state === "play" && game) { const dt = Math.min(0.25, (now - lastTick) / 1000); update(dt); }
  lastTick = now;
}, 100);

/* ---------------- Entrées ---------------- */
let suppressClick = 0;
map.on("click", (e) => {
  if (state === "lobby" && isHost) { lobbyMapClick(e.latlng); return; }
  if (state !== "play" || !game) return;
  if (performance.now() < suppressClick || (e.originalEvent && e.originalEvent.shiftKey)) return;
  if (game.targeting) {
    if (mySkill() === game.targeting) { fireTarget(e.latlng); return; }
    cancelAim(); // compétence plus disponible (infecté, à terre…) : le clic sert à se déplacer
  }
  const q = meP();
  if (q.master) { const xy = toXY(e.latlng), T = snap(xy.x, xy.y, 300); if (T) { const n = hyp(T.x, T.y, G.X[T.ea], G.Y[T.ea]) < hyp(T.x, T.y, G.X[T.eb], G.Y[T.eb]) ? T.ea : T.eb; if (isHost) hostRally(myId, { node: n }); else toHost({ t: "rally", node: n }); banner("Ta horde se rassemble ici", false, 1200); } return; }
  if (!canMove()) return;
  if (game.player.route.length && game.player.route[0].jump) return; // pendant un raccourci
  goTo(e.latlng);
});
map.on("mousemove", (e) => { if (game) game.mouseLL = e.latlng; });
map.on("contextmenu", () => { if (game && game.targeting) { game.targeting = null; mapEl.classList.remove("aiming"); } });
function goTo(ll) {
  const p = toXY(ll); const T = snap(p.x, p.y, 600); if (!T) return;
  const r = route(game.player, T); if (r) game.player.route = r; else banner("Impossible d'y aller par là", false, 1500);
}
const mapEl = map.getContainer();
mapEl.addEventListener("mousedown", (e) => {
  if (state !== "play" || !game || !canMove() || game.targeting || !e.shiftKey || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  drawPts = [map.mouseEventToLatLng(e)];
}, true);
window.addEventListener("mousemove", (e) => {
  if (!drawPts) return;
  const ll = map.mouseEventToLatLng(e);
  const lastP = map.latLngToContainerPoint(drawPts[drawPts.length - 1]), q = map.latLngToContainerPoint(ll);
  if (Math.hypot(q.x - lastP.x, q.y - lastP.y) > 5) drawPts.push(ll);
});
window.addEventListener("mouseup", () => {
  if (!drawPts) return;
  const pts = drawPts; drawPts = null; suppressClick = performance.now() + 250;
  if (state !== "play" || !canMove()) return;
  if (pts.length < 2) { goTo(pts[0]); return; }
  followDrawn(pts);
});
function followDrawn(pts) {
  const xy = pts.map(toXY);
  const samples = [xy[0]]; let acc = 0; const STEP = 22;
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1], b = xy[i]; let seg = hyp(a.x, a.y, b.x, b.y), t0 = 0;
    while (acc + seg - t0 >= STEP) { const need = STEP - acc; t0 += need; const f = t0 / seg; samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }); acc = 0; }
    acc += seg - t0;
  }
  samples.push(xy[xy.length - 1]);
  const snapped = [];
  for (const s of samples.slice(0, 160)) {
    const T = snap(s.x, s.y, 80); if (!T || T.d > 80) continue;
    const prev = snapped[snapped.length - 1];
    if (prev && hyp(prev.x, prev.y, T.x, T.y) < 12) continue;
    snapped.push(T);
  }
  if (!snapped.length) return;
  let from = { x: game.player.x, y: game.player.y, a: game.player.a, b: game.player.b };
  const all = [];
  for (const T of snapped) { const r = route(from, T); if (!r) continue; all.push(...r); from = T; }
  if (all.length) game.player.route = all;
}
window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
  if (e.key === "Shift" && state === "play") mapEl.classList.add("drawing");
  if (e.code === "Space" && state === "play") { e.preventDefault(); game.sprint = true; }
  if (state === "play" && !e.repeat && (e.code === "KeyQ" || e.key === "a" || e.key === "A")) { e.preventDefault(); useSkill(); }
  if (e.key === "Escape" && game && game.targeting) { game.targeting = null; mapEl.classList.remove("aiming"); }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Shift") mapEl.classList.remove("drawing");
  if (e.code === "Space" && game) game.sprint = false;
});
window.addEventListener("blur", () => { if (game) game.sprint = false; drawPts = null; mapEl.classList.remove("drawing"); });
const sb = $("sprintBtn");
sb.addEventListener("pointerdown", (e) => { e.preventDefault(); if (game) game.sprint = true; });
["pointerup", "pointercancel", "pointerleave"].forEach((ev) => sb.addEventListener(ev, () => { if (game) game.sprint = false; }));
$("skillBtn").addEventListener("click", (e) => { e.stopPropagation(); useSkill(); });

/* ---------------- Choix du mode et du lieu (hôte) ---------------- */
function showStep(id) {
  for (const s of ["stepKey", "stepMenu", "stepLobby", "stepLoad", "stepRole", "stepOver"]) $(s).hidden = s !== id;
  $("tagline").hidden = id === "stepOver";
  if (id === "stepLobby") drawCacheSoon(); else if (cacheLayer) cacheLayer.clearLayers(); // secteurs en cache : seulement dans le salon
  renderPlayers();
}
function radius() {
  const v = document.querySelector('input[name="radius"]:checked').value;
  return v === "custom" ? +$("radiusRange").value : +v;
}
const fmtR = (r) => (r >= 1000 ? `${(r / 1000).toFixed(1).replace(".0", "").replace(".", ",")} km` : `${r} m`);
function radiusUi() {
  const custom = document.querySelector('input[name="radius"]:checked').value === "custom", r = +$("radiusRange").value;
  $("customBox").hidden = !custom; $("radiusOut").textContent = fmtR(r); $("customD").textContent = fmtR(r);
  $("radiusWarn").hidden = !(custom && r > 2500);
}
let finishPick = null, finishMarker = null;
const pinMode = () => (document.querySelector('input[name="pin"]:checked') || {}).value || "start";
function lobbyMapClick(ll) {
  if (gameMode === "defi") { zstatus("Le Défi du jour se joue au lieu imposé.", "err"); return; }
  if (gameMode === "course" && pinMode() === "finish") { setFinish(ll); return; }
  setPick(ll);
  if (gameMode === "course" && !finishPick) { const f = document.querySelector('input[name="pin"][value="finish"]'); if (f) f.checked = true; }
}
function setPick(ll) {
  picked = { lat: ll.lat, lon: ll.lng };
  if (!pickMarker) pickMarker = L.circleMarker(ll, { radius: 7, color: css("--blood"), weight: 2, fillColor: css("--blood"), fillOpacity: 0.5 }).addTo(map);
  else pickMarker.setLatLng(ll);
  if (map.getZoom() < 14) map.setView(ll, 15);
  zoneChanged();
}
function setFinish(ll) {
  finishPick = { lat: ll.lat, lon: ll.lng };
  if (!finishMarker) finishMarker = L.circleMarker(ll, { radius: 8, color: "#ffffff", weight: 3, fillColor: "#111", fillOpacity: 0.9 }).addTo(map);
  else finishMarker.setLatLng(ll);
  zoneChanged();
}
function currentZone() {
  const paths = $("withPaths").checked;
  if (gameMode === "defi") { const [name, lat, lon] = dailySpot(); return { lat, lon, r: 1000, paths, fake: false, name }; }
  if (!picked) return null;
  if (gameMode === "course") {
    if (!finishPick) return null;
    const ky = 110574, kx = 111320 * Math.cos(picked.lat * Math.PI / 180);
    const d = Math.hypot((finishPick.lon - picked.lon) * kx, (finishPick.lat - picked.lat) * ky);
    if (d < 300 || d > 4000) return null;
    return { lat: (picked.lat + finishPick.lat) / 2, lon: (picked.lon + finishPick.lon) / 2, r: Math.round(Math.min(2500, Math.max(800, d / 2 + 400))), paths, fake: false, start: { ...picked }, finish: { ...finishPick }, dist: Math.round(d) };
  }
  return { lat: picked.lat, lon: picked.lon, r: radius(), paths, fake: false };
}
function zoneChanged() {
  if (!isHost) return;
  zone = currentZone();
  drawZone(); updateZoneInfo(); pushLobby(); schedulePrefetch();
}
function drawZone() {
  if (zoneCircle) { zoneCircle.remove(); zoneCircle = null; }
  const z = zone || currentZone(); if (!z) return;
  zoneCircle = L.circle([z.lat, z.lon], { radius: z.r, color: css("--sodium"), weight: 1.5, dashArray: "4 8", fill: false, interactive: false }).addTo(map);
}
function updateZoneInfo() {
  const z = zone, M = MODES[gameMode];
  let t = "";
  if (gameMode === "defi") t = `Lieu du jour : <b>${esc(z.name)}</b> (rayon 1 km)`;
  else if (gameMode === "course") {
    if (!picked) t = "Clique sur la carte pour placer le <b>départ</b>.";
    else if (!finishPick) t = "Clique maintenant pour placer l'<b>arrivée</b> (300 m à 4 km du départ).";
    else if (!z) t = "L'arrivée doit être entre 300 m et 4 km du départ.";
    else t = `Trajet de <b>${fmtDist(z.dist)}</b> à vol d'oiseau`;
  } else t = picked ? `Point zéro : <b>${picked.lat.toFixed(5)}, ${picked.lon.toFixed(5)}</b>` : "Clique sur la carte pour placer le point zéro.";
  $("pickInfo").innerHTML = t;
  $("loadBtn").disabled = !z;
}
// Choix du mode : tuiles + fiche du mode choisi
function modeOk(k) { const M = MODES[k]; return !!net || M.min <= 1 || M.bots; } // en solo, les modes à plusieurs sont grisés
function renderModes() {
  $("modeList").innerHTML = Object.entries(MODES).map(([k, M]) => {
    const [short, icon] = MODE_TILES[k] || [M.name, ""], ok = modeOk(k);
    return `<label class="mode${M.proto ? " isproto" : ""}" title="${ok ? M.name : M.name + " : multijoueur uniquement"}"><input type="radio" name="mode" value="${k}"${k === gameMode ? " checked" : ""}${ok ? "" : " disabled"}>
      <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span class="mname">${short}</span></label>`;
  }).join("");
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => setMode(r.value)));
  renderModeInfo();
}
function renderModeInfo() {
  const M = MODES[gameMode] || MODES.survie;
  const who = M.bots && !net ? "Solo : tu diriges la horde contre 4 survivants pilotés par l'ordinateur" : M.coop ? "Coopératif, de 1 à 8 joueurs" : M.min > 1 ? `De ${M.min} à 8 joueurs` : "De 1 à 8 joueurs";
  $("modeInfo").innerHTML = `<h3>${M.name}${M.proto ? ' <span class="proto">Prototype</span>' : ""}</h3><p>${M.desc}</p><p class="who">${who}</p>`;
}
function setMode(k) {
  if (!MODES[k] || !modeOk(k)) k = "survie";
  gameMode = k;
  renderModes();
  const course = k === "course", defi = k === "defi";
  $("pinRow").hidden = !course; $("radiusBox").hidden = course || defi; $("searchForm").hidden = defi;
  if (finishMarker && !course) { finishMarker.remove(); finishMarker = null; finishPick = null; }
  if (defi) { const [, lat, lon] = dailySpot(); if (pickMarker) { pickMarker.remove(); pickMarker = null; } picked = null; map.setView([lat, lon], 15); }
  zstatus("");
  zoneChanged();
}
document.querySelectorAll('input[name="radius"]').forEach((r) => r.addEventListener("change", () => { radiusUi(); zoneChanged(); }));
$("radiusRange").addEventListener("input", () => { radiusUi(); zoneChanged(); });
radiusUi();
$("withPaths").addEventListener("change", zoneChanged);
$("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("searchInput").value.trim(); if (!q) return;
  zstatus("Recherche…");
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "fr" } });
    const j = await res.json();
    if (!j.length) { zstatus("Aucun lieu trouvé pour cette recherche.", "err"); return; }
    const ll = L.latLng(+j[0].lat, +j[0].lon); map.setView(ll, 16); lobbyMapClick(ll);
    zstatus(j[0].display_name.split(",").slice(0, 3).join(","));
  } catch { zstatus("La recherche ne répond pas. Clique directement sur la carte.", "err"); }
});
function zstatus(t, cls) { const s = $("zoneStatus"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
// Point du graphe le plus proche d'une position (départ et arrivée de la course)
function nodeNear(ll) {
  const T = snap((ll.lon - G.lon0) * G.kx, (ll.lat - G.lat0) * G.ky, 2000); if (!T) return G.spawn;
  return hyp(T.x, T.y, G.X[T.ea], G.Y[T.ea]) < hyp(T.x, T.y, G.X[T.eb], G.Y[T.eb]) ? T.ea : T.eb;
}
