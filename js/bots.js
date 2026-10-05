"use strict";
// Dead Ends · Survivants pilotés par l'ordinateur (horde en solo)

/* ---------------- Bots survivants ----------------
   En solo, le mode « Zombies contre survivants » se joue contre des survivants pilotés par l'hôte.
   Chaque bot regarde régulièrement quelques rues autour de lui et file vers celle qui est la plus loin
   des zombies (en distance par les rues), en évitant les itinéraires qui passent près d'eux.
   Il sprinte quand un zombie se rapproche, tant qu'il lui reste de l'endurance. */
const BOT_NAMES = ["Alex", "Sam", "Noa", "Lou", "Max", "Inès"];
const BOT_ROLES = ["coureur", "eclaireur", "fantome", "endurant", "increvable", "traceur"];

function addBots(n) {
  removeBots();
  for (let i = 0; i < n; i++) {
    const id = "bot" + i, p = newPlayer(id, BOT_NAMES[i % BOT_NAMES.length], false);
    p.bot = true; p.ready = true; p.loaded = true; p.role = BOT_ROLES[(Math.random() * BOT_ROLES.length) | 0];
    players.set(id, p);
  }
}
function removeBots() { for (const [id, p] of players) if (p.bot) players.delete(id); }
const hasBots = () => [...players.values()].some((p) => p.bot);

// Distance (par les rues) au zombie le plus proche, pour tous les carrefours
function dangerField() {
  const gm = game;
  if (!G.FZ) G.FZ = { dist: new Float64Array(G.N), next: new Int32Array(G.N), owner: new Int16Array(G.N) };
  const srcs = gm.zombies.length ? gm.zombies.map((z) => ({ x: z.x, y: z.y, a: z.a, b: z.b })) : [{ x: G.X[G.spawn], y: G.Y[G.spawn], a: G.spawn, b: G.spawn }];
  computeField(srcs, G.FZ);
  gm.fzT = 0.5;
}
function botPlan(q, B) {
  const F = G.FZ, cand = [];
  // quelques carrefours au hasard à 120-380 m, plus ceux où il allait déjà
  for (let i = 0; i < 60 && cand.length < 18; i++) {
    const n = (Math.random() * G.N) | 0, d = hyp(G.X[n], G.Y[n], B.x, B.y);
    if (d > 120 && d < 380 && isFinite(F.dist[n])) cand.push(n);
  }
  if (q.botGoal != null) cand.push(q.botGoal);
  if (!cand.length) return;
  const deg = (n) => G.adjStart[n + 1] - G.adjStart[n];
  // tri rapide sur la distance aux zombies, puis on ne calcule l'itinéraire que des meilleurs
  cand.sort((a, b) => F.dist[b] - F.dist[a]);
  let best = null, bs = -Infinity;
  for (const n of cand.slice(0, 6)) {
    const r = route(B, { x: G.X[n], y: G.Y[n], a: n, b: n }); if (!r || !r.length) continue;
    let pathMin = Infinity;
    for (let k = 0; k < r.length && k < 8; k++) if (r[k].n >= 0) pathMin = Math.min(pathMin, F.dist[r[k].n]);
    const s = Math.min(F.dist[n], pathMin * 1.6) + (deg(n) >= 3 ? 25 : deg(n) <= 1 ? -60 : 0) + Math.random() * 20; // les impasses, c'est le piège
    if (s > bs) { bs = s; best = { n, r }; }
  }
  if (best) { q.botGoal = best.n; B.route = best.r; }
}
function botsUpdate(dt) {
  const gm = game; if (!hasBots()) return;
  gm.fzT = (gm.fzT || 0) - dt;
  if (gm.fzT <= 0 || !G.FZ) dangerField();
  for (const q of players.values()) {
    if (!q.bot || !isPrey(q)) continue;
    const R = ROLES[q.role] || ROLES.coureur;
    if (!q.body || q.bodyGame !== gm) {
      const s = q.sp || { x: q.x, y: q.y, a: G.spawn, b: G.spawn };
      q.body = { x: s.x, y: s.y, a: s.a, b: s.b, route: [], trail: 0, dir: Math.random() * 6.28, stamina: R.stamina };
      q.bodyGame = gm; q.botT = Math.random(); q.botGoal = null;
    }
    const B = q.body;
    let near = Infinity; for (const z of gm.zombies) near = Math.min(near, hyp(z.x, z.y, B.x, B.y));
    q.botT -= dt;
    if (q.botT <= 0 || !B.route.length) { q.botT = near < 150 ? 0.7 : 1.8; botPlan(q, B); }
    const sprint = B.route.length && near < 90 && B.stamina > 12;
    if (sprint) B.stamina = Math.max(0, B.stamina - CFG.drain * dt); else B.stamina = Math.min(R.stamina, B.stamina + CFG.regen * R.regenMul * dt);
    let spd = CFG.runSpeed * R.speedMul * (sprint ? CFG.sprintMul : 1);
    if (G.elev) spd *= slopeMul(gradeOf(B));
    advance(B, spd * dt);
    q.x = B.x; q.y = B.y; q.dir = B.dir; q.trail = B.trail; q.sprint = !!sprint;
    q.sp = { x: B.x, y: B.y, a: B.a, b: B.b };
    q.nx = B.route.filter((w) => w.n >= 0).slice(0, 4).map((w) => w.n);
  }
}
