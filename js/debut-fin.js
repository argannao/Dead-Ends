"use strict";
// Dead Ends · Compte à rebours, écran de fin et classements

/* ---------------- Départ, fin ---------------- */
function startCountdown(setup) {
  if (!G) return;
  newGame(setup || { mode: gameMode, seed: 1, teams: {}, vip: [], masters: [], dests: [] });
  const q = meP();
  $("panel").hidden = true; $("hud").hidden = false;
  $("banner").hidden = true; $("threat").hidden = true; $("boardBox").hidden = true;
  if (zoneCircle) zoneCircle.remove();
  zoneCircle = L.circle([zone.lat, zone.lon], { radius: zone.r, color: css("--blood"), weight: 1.5, opacity: 0.5, dashArray: "4 8", fill: false, interactive: false }).addTo(map);
  if (q.master) { map.dragging.enable(); map.doubleClickZoom.enable(); map.setView(toLL(G.X[G.spawn], G.Y[G.spawn]), 15, { animate: false }); }
  else { map.dragging.disable(); map.doubleClickZoom.disable(); map.setView(toLL(game.player.x, game.player.y), CFG.playZoom, { animate: false }); }
  updateHud(); renderPlayers();
  state = "countdown";
  const intro = q.master ? "Tu diriges la horde : clique pour la rallier, A pour hurler."
    : q.vip ? `Tu es le VIP de l'équipe ${TEAMS[q.team].name} : rejoins ta destination.`
    : q.team != null ? `Équipe ${TEAMS[q.team].name} : protège ton VIP.` : "";
  if (intro) banner(intro, false, 5000);
  const cd = $("countdown"); const seq = ["3", "2", "1", "GO"]; let i = 0;
  const tick = () => {
    if (state !== "countdown") return;
    cd.innerHTML = ""; if (i >= seq.length) { state = "play"; last = performance.now(); return; }
    const sp = document.createElement("span"); sp.textContent = seq[i]; if (seq[i] === "GO") sp.className = "go";
    cd.appendChild(sp); i++; setTimeout(tick, seq[i - 1] === "GO" ? 700 : 800);
  };
  tick();
}
const WIN_TITLES = { survie: "Victoire", extraction: "Évacué", patient: "Victoire", tresor: "Victoire", colline: "Victoire", escorte: "Victoire", horde: "Victoire", aube: "L'aube est là", course: "Victoire", defi: "Victoire", sommet: "Au sommet" };
function showResults(m) {
  state = "over"; if (game) { game.sprint = false; game.targeting = null; } drawPts = null;
  mapEl.classList.remove("aiming");
  map.dragging.enable(); map.doubleClickZoom.enable();
  $("banner").hidden = true; $("threat").hidden = true; $("hud").hidden = true; $("countdown").innerHTML = "";
  const rows = m.rows || [], M = MODES[m.mode] || MODES.survie;
  const mine = rows.find((r) => r.id === myId) || rows[0] || { time: 0, trail: 0, value: "", score: 0 };
  const won = !!mine.win, winners = rows.filter((r) => r.win);
  let title = won ? WIN_TITLES[m.mode] || "Victoire" : "Défaite", sub = "";
  if (m.mode === "survie") { if (!won) title = "Rattrapé"; sub = winners[0] ? (won ? `Tu es le dernier survivant, après ${fmtTime(mine.time)} de fuite.` : `<span class="pdot" style="background:${winners[0].color}"></span> <b>${esc(winners[0].name)}</b> remporte la partie.`) : ""; }
  if (m.mode === "defi") { title = "Défi terminé"; sub = `Tu as tenu <b>${fmtTime(mine.time)}</b> au défi du jour.`; }
  if (m.mode === "extraction") { if (!won) title = "Abandonné"; sub = winners.length ? `Évacués : ${winners.map((w) => `<b>${esc(w.name)}</b>`).join(", ")}.` : "Personne n'a pu être évacué."; }
  if (m.mode === "patient") { const pz = rows.find((r) => r.note.startsWith("Patient")); sub = winners.length && pz && winners[0].id === pz.id ? `L'épidémie l'emporte. Le patient zéro était <b>${esc(pz.name)}</b>.` : `Les humains ont tenu.${pz ? ` Le patient zéro était <b>${esc(pz.name)}</b>.` : ""}`; if (!won) title = "Infecté"; }
  if (M.score) sub = winners.length ? `${winners.map((w) => `<b>${esc(w.name)}</b>`).join(", ")} gagne avec ${winners[0].value}.` : "Personne n'a marqué de points.";
  if (m.mode === "escorte") sub = winners.length ? `L'équipe ${winners[0].note.split(" · ")[0].replace("Équipe ", "")} l'emporte.` : "Aucun VIP n'est arrivé.";
  if (m.mode === "horde") sub = winners.length && rows.find((r) => r.win && r.note === "Maître de la horde") ? "La horde a eu tout le monde." : "Les survivants ont tenu.";
  if (m.mode === "aube") { if (!won) title = "La nuit l'emporte"; sub = won ? "Vous avez tenu jusqu'au lever du jour." : "Tout le monde est tombé avant l'aube."; }
  if (m.mode === "course") { if (!won) title = mine.note === "Arrivé" ? "Arrivé" : "Rattrapé"; sub = winners[0] ? `Meilleur temps : <b>${esc(winners[0].name)}</b> en ${winners[0].value}.` : "Personne n'a atteint l'arrivée."; }
  if (m.mode === "sommet") { if (!won) title = mine.note === "Au sommet" ? "Au sommet" : "Rattrapé"; sub = winners[0] ? `<b>${esc(winners[0].name)}</b> atteint le sommet en ${winners[0].value}.` : "Personne n'a atteint le sommet."; }
  $("overTitle").textContent = title;
  $("overTitle").classList.toggle("win", won);
  $("stepOver").classList.toggle("victory", won);
  $("overSub").innerHTML = sub; $("overSub").hidden = !sub;
  $("overMode").innerHTML = modeBadge(m.mode);
  $("rTimeK").textContent = M.score ? "Ton score" : m.mode === "course" ? "Ton temps" : "Ta survie";
  $("rTime").textContent = M.score ? `${mine.score} pts` : m.mode === "course" ? mine.value : fmtTime(mine.time);
  $("rDist").textContent = fmtDist(mine.trail);
  $("rWave").textContent = String(m.wave); $("rZomb").textContent = String(m.zombies != null ? m.zombies : game ? game.zombies.length : 0);
  const ol = $("ranking"); ol.innerHTML = ""; ol.hidden = rows.length < 2;
  rows.forEach((r, i) => {
    const li = document.createElement("li"); li.className = (r.id === myId ? "me " : "") + (r.win ? "winner" : "");
    li.innerHTML = `<span class="rk">${i + 1}</span><span class="pdot" style="background:${r.color}"></span><span class="pname">${esc(r.name)}${r.win ? ' <span class="tag">Gagnant</span>' : ""}${r.note ? `<span class="rnote">${esc(r.note)}</span>` : ""}</span><span class="rrole">${ROLES[r.role] ? ROLES[r.role].name : ""}</span><span class="rt">${esc(r.value)}</span>`;
    ol.appendChild(li);
  });
  let best = 0; try { best = +localStorage.getItem("deadends.best") || 0; } catch {}
  const rb = $("rBest");
  if (mine.time > best && !M.score && m.mode !== "course") { try { localStorage.setItem("deadends.best", String(mine.time)); } catch {} rb.textContent = "Nouveau record personnel de survie."; rb.className = "best new"; }
  else { rb.textContent = `Ton record de survie : ${fmtTime(best)}`; rb.className = "best"; }
  $("againBtn").hidden = !isHost; $("elsewhereBtn").hidden = !isHost; $("overWait").hidden = isHost;
  $("panel").hidden = false; showStep("stepOver");
  if (won) victoryFx();
  cloudRecordGame({ time: mine.time || 0, dist: mine.trail || 0, wave: m.wave, won, multi: !!net && rows.length > 1 });
  // classements en ligne des modes prototypes
  $("boardBox").hidden = true;
  if (m.mode === "course" && zone && zone.start) showBoard("course", routeKey(zone), mine.note === "Arrivé" ? parseClock(mine.value) : null);
  if (m.mode === "defi") showBoard("defi", todayKey(), mine.time, m.wave);
}
function parseClock(v) { const r = /^(\d+):(\d+(?:\.\d+)?)$/.exec(v || ""); return r ? +r[1] * 60 + +r[2] : null; }
function routeKey(z) { const f = (v) => v.toFixed(4); return `${f(z.start.lat)}_${f(z.start.lon)}_${f(z.finish.lat)}_${f(z.finish.lon)}`; }
async function showBoard(kind, key, myTime, wave) {
  const box = $("boardBox"), ol = $("board"), title = $("boardTitle");
  box.hidden = false; ol.innerHTML = "";
  title.textContent = kind === "course" ? "Meilleurs temps sur ce trajet" : `Classement du défi du ${key.split("-").reverse().join("/")}`;
  if (!Cloud.user) { $("boardMsg").textContent = "Connecte-toi avec Google (en haut à droite) pour enregistrer tes temps et voir le classement."; return; }
  $("boardMsg").textContent = "Chargement du classement…";
  try {
    if (myTime != null) await (kind === "course" ? cloudSubmitRoute(key, myTime) : cloudSubmitDaily(key, myTime, wave));
    const top = await (kind === "course" ? cloudTopRoute(key) : cloudTopDaily(key));
    $("boardMsg").textContent = top.length ? "" : "Pas encore de temps enregistré.";
    top.forEach((r, i) => {
      const li = document.createElement("li"); if (r.uid === cloudUid()) li.className = "me";
      li.innerHTML = `<span class="rk">${i + 1}</span><span class="pdot" style="background:${r.uid === cloudUid() ? "var(--sodium)" : "var(--line)"}"></span><span class="pname">${esc(r.name)}${relationTo(r.uid) === "friend" ? '<span class="rnote">Ami</span>' : ""}</span><span class="rrole">${kind === "defi" && r.wave ? "vague " + r.wave : ""}</span><span class="rt">${fmtTime(r.time)}</span>`;
      ol.appendChild(li);
    });
  } catch (e) { console.warn("Classement", e); $("boardMsg").textContent = "Impossible de charger le classement pour le moment."; }
}
// Petite pluie d'étincelles couleur sodium pour le vainqueur
function victoryFx() {
  const cv = document.createElement("canvas"); cv.className = "vfx"; document.body.appendChild(cv);
  const c2 = cv.getContext("2d"); const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const parts = Array.from({ length: reduce ? 0 : 140 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 3, s: 2 + Math.random() * 3, h: Math.random() < 0.7 }));
  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) / 1000; c2.clearRect(0, 0, W, H);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; c2.globalAlpha = Math.max(0, 1 - t / 4); c2.fillStyle = p.h ? "#ffad42" : "#f4f8ff"; c2.fillRect(p.x, p.y, p.s, p.s * 2); }
    if (t < 4 && state === "over") requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}

/* ---------------- Boutons ---------------- */
$("createBtn").addEventListener("click", startHost);
$("soloBtn").addEventListener("click", startSolo);
$("joinForm").addEventListener("submit", (e) => { e.preventDefault(); startJoin($("codeInput").value); });
$("leaveBtn").addEventListener("click", () => { leaving = true; goMenu(); leaving = false; });
$("loadBtn").addEventListener("click", () => { if (!loading && currentZone()) hostStartLoad(false); });
$("cancelBtn").addEventListener("click", () => { if (loadCtl) loadCtl.abort(); });
$("retryBtn").addEventListener("click", () => { const p = me(); if (p) { p.failed = false; } if (isHost) pushLobby(); startLoading(); });
$("fakeBtn").addEventListener("click", () => hostStartLoad(true));
$("readyBtn").addEventListener("click", toggleReady);
$("launchBtn").addEventListener("click", hostLaunch);
$("backBtn").addEventListener("click", () => { if (isHost) enterLobby(); });
$("againBtn").addEventListener("click", () => { if (!isHost) return; broadcast({ t: "role" }); enterRole(); });
$("elsewhereBtn").addEventListener("click", () => { if (isHost) enterLobby(); });
$("nameInput").addEventListener("change", saveName);
document.fonts && document.fonts.ready.then(readColors);
