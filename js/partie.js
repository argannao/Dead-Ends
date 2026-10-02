"use strict";
// Dead Ends · État d'une partie

/* ---------------- Partie ---------------- */
let game = null;
function newGame(setup) {
  const p = me(); const roleKey = isHost ? myRole() : (ROLES[p.role] ? p.role : myRole());
  p.role = roleKey;
  const R = ROLES[roleKey], s = G.spawn;
  G.elev = setup.elev || null; // relief du mode Sommet
  game = {
    mode: setup.mode, M: MODES[setup.mode] || MODES.survie, setup, rng: setup.mode === "defi" ? mulberry32(setup.seed) : Math.random,
    R, t: 0, wave: 0, nextWave: CFG.zombieDelay, pending: [], fieldT: 0, sendT: 0, markT: 0, sprint: false, sprinting: false, lastBanner: "",
    player: { x: G.X[s], y: G.Y[s], a: s, b: s, route: [], trail: 0, dir: 0, stamina: R.stamina, alive: true },
    zombies: [], upcoming: null, nests: [], targets: [], alive: [], known: [], ahead: [], huntedMe: 0, forceFields: true,
    // compétences (locales)
    skillReadyAt: 0, rushUntil: 0, droneUntil: 0, planqueUntil: 0, speedBonusUntil: 0, targeting: null, mouseLL: null, sprintRun: 0, sprintLock: false,
    // état du mode (calculé par l'hôte, recopié chez les invités)
    marks: [], bars: [], hud: null, lures: [], crates: [], hill: null, evac: null, secret: false, ended: false,
  };
  for (const q of players.values()) {
    Object.assign(q, {
      alive: true, time: 0, x: G.X[s], y: G.Y[s], trail: 0, sp: { x: G.X[s], y: G.Y[s], a: s, b: s }, known: null, knownT: -99, alertUntil: 0, sprint: false, nx: [], hunted: 0,
      score: 0, scoreF: 0, zombie: false, patient: false, down: false, downT: 0, revive: 0, escaped: false, place: 0, finishT: null, catches: 0, infections: 0,
      master: setup.masters.includes(q.id), vip: setup.vip.includes(q.id), team: setup.teams[q.id] != null ? setup.teams[q.id] : null,
      hiddenUntil: 0, fadeUntil: 0, planqueEnd: 0, tx: undefined, ty: undefined, saveUsed: false, invulnUntil: 0, markUntil: 0,
    });
  }
  if (setup.summit != null && G.elev) { const n = setup.summit; game.summit = { node: n, x: G.X[n], y: G.Y[n], alt: Math.round(elevAt(G.X[n], G.Y[n])) }; }
  G.adjBlocked.fill(0); G.lureFields.clear(); G.eLoadT.fill(-99);
  if (isHost) hostModeInit();
}
const meP = () => players.get(myId) || {};
const isPrey = (q) => q.alive && !q.zombie && !q.master && !q.escaped && !q.down;
function canMove() { const q = meP(); return q.alive && !q.master && !q.escaped && !q.down && game.planqueUntil <= game.t; }
function mySkill() { const q = meP(); if (q.master) return "cri"; if (q.zombie || !isPrey(q)) return null; return game.R.skill; }

function hostModeInit() {
  const gm = game, n = players.size;
  if (gm.mode === "extraction") { // zone approximative connue dès le départ, point d'atterrissage précis 30 s avant
    const c = pickNodeAround(G.X[G.spawn], G.Y[G.spawn], 350, 700);
    gm.evac = { at: CFG.extractAt, node: -1, open: false, places: Math.max(1, Math.floor(n / 2)), taken: 0, end: 0, zx: G.X[c], zy: G.Y[c], zr: CFG.evacZoneR, told: false };
  }
  if (gm.mode === "patient") {
    const ids = [...players.keys()]; gm.patientId = ids[(Math.random() * ids.length) | 0]; gm.turned = false;
    const pz = players.get(gm.patientId);
    setTimeout(() => { if (!game || game !== gm) return; const m = { t: "ev", k: "secret" }; if (gm.patientId === myId) handleEvent(m); else if (pz && pz.link) pz.link.send(m); }, 300);
  }
  if (gm.mode === "tresor") { gm.crateMax = 10 + 3 * n; gm.crateT = CFG.crateEvery; for (let i = 0; i < gm.crateMax; i++) spawnCrate(); }
  if (gm.mode === "colline") { const h = pickNodeAround(G.X[G.spawn], G.Y[G.spawn], 150, 450); gm.hill = { node: h, x: G.X[h], y: G.Y[h], r: CFG.hillR, owner: null, movedAt: 0 }; gm.callT = CFG.hillCall; }
  if (gm.mode === "course") gm.finish = G.finish != null ? { x: G.X[G.finish], y: G.Y[G.finish] } : null;
}
function spawnCrate() {
  const gm = game;
  const n = pickNodeAround(G.X[G.spawn], G.Y[G.spawn], 60, Math.min(900, (zone && zone.r) || 900), Math.random, (k) => gm.crates.every((c) => hyp(c.x, c.y, G.X[k], G.Y[k]) > 60));
  const bonus = Math.random() < 0.25;
  gm.crates.push({ x: G.X[n], y: G.Y[n], bonus, pts: bonus ? 5 : 10 });
}
function waveSpeed(k) { return Math.min(CFG.zSpeedMax, CFG.zSpeed + CFG.zSpeedInc * (k - 1)); }
function spawnZombie(k, s) {
  const rnd = game.rng, ang = rnd() * Math.PI * 2;
  const masters = [...players.values()].filter((q) => q.master);
  game.zombies.push({
    x: G.X[s], y: G.Y[s], a: s, b: s, route: [],
    speed: waveSpeed(k) * (0.9 + rnd() * 0.2),
    ox: Math.cos(ang) * 3, oy: Math.sin(ang) * 3, wob: rnd() * 10,
    role: ((r) => k >= CFG.flankFrom && r < CFG.flankShare ? "flank" : r > 1 - CFG.roamShare ? "roam" : "chase")(rnd()), hunt: false, tgt: -1,
    master: masters.length ? masters[game.zombies.length % masters.length].id : null, criUntil: 0,
  });
}
// Points d'apparition : carrefours au hasard, ni trop près ni trop loin du joueur le plus proche (par les rues)
function pickSpawnNodes(count) {
  const out = [], rnd = game.rng;
  const ok = (n, min, max) => {
    const d = G.dist[n]; if (!(d >= min && d <= max)) return false;
    return out.every((m) => hyp(G.X[n], G.Y[n], G.X[m], G.Y[m]) > 250);
  };
  for (const [min, max] of [[CFG.spawnMin, CFG.spawnMax], [CFG.spawnMin * 0.6, CFG.spawnMax * 2], [120, Infinity]]) {
    for (let tries = 0; tries < 400 && out.length < count; tries++) {
      const n = (rnd() * G.N) | 0;
      if (ok(n, min, max)) out.push(n);
    }
    if (out.length >= count) break;
  }
  return out.length ? out : [G.spawn];
}
// « au nord-est, à 420 m » depuis ma position
function where(pt) {
  const P = game.player; const dx = pt.x - P.x, dy = pt.y - P.y;
  const dirs = ["à l'est", "au nord-est", "au nord", "au nord-ouest", "à l'ouest", "au sud-ouest", "au sud", "au sud-est"];
  const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return `${dirs[i]}, à ${Math.round(Math.hypot(dx, dy) / 10) * 10} m`;
}
