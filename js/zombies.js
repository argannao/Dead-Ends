"use strict";
// Dead Ends · IA des zombies et barricades

/* ---------------- IA des zombies (calculée par l'hôte) ----------------
   - Perception limitée (plus grande si tu sprintes), piste rafraîchie toutes les quelques secondes,
     cri qui alerte la horde, rabatteurs qui visent le carrefour devant toi.
   - Les classes modifient la perception (Fantôme, Artificier) ; la planque fait perdre ta trace.
   - Les zombies qui ne poursuivent personne sont attirés par les pétards, la colline et le ralliement de leur maître. */
function senseFor(q) {
  if (q.hiddenUntil > game.t) return 25;
  const R = ROLES[q.role] || ROLES.coureur;
  let r = q.sprint ? CFG.senseSprint * (R.noiseMul || 1) : CFG.senseR;
  r *= R.senseMul || 1;
  if (q.fadeUntil > game.t) r *= 0.5;
  if (q.markUntil > game.t) r *= 1.6; // marqué par un appât
  if (q.alertUntil > game.t) r *= CFG.alertMul;
  return r;
}
function scentInterval(q) { const R = ROLES[q.role] || {}; return (q.sprint ? CFG.scentSprint : CFG.scentEvery) * (R.scentMul || 1); }
// Un zombie qui entend un pétard (ou l'appel de la colline) va voir sur place, jusqu'à y arriver ou repérer quelqu'un.
function lureFor(z) {
  const t = game.t;
  if (z.inv && z.invUntil > t) return "all";
  z.inv = false;
  for (const l of game.lures) if (l.grp === "all" && l.until > t && hyp(z.x, z.y, l.x, l.y) < l.range) { z.inv = true; z.invUntil = t + 90; return "all"; }
  if (z.master) { const m = players.get(z.master); if (m && m.rally) return "m:" + z.master; }
  return null;
}
function lureField(grp) {
  let F = G.lureFields.get(grp);
  if (!F || F.dirty) {
    if (!F) { F = { dist: new Float64Array(G.N), next: new Int32Array(G.N), owner: new Int16Array(G.N) }; G.lureFields.set(grp, F); }
    let srcs;
    if (grp === "all") srcs = game.lures.filter((l) => l.grp === "all" && l.keep > game.t).map((l) => ({ x: l.x, y: l.y, a: l.node, b: l.node }));
    else { const m = players.get(grp.slice(2)); srcs = m && m.rally ? [{ x: m.rally.x, y: m.rally.y, a: m.rally.node, b: m.rally.node }] : []; }
    computeField(srcs, F); F.dirty = false;
  }
  return F;
}
function lureChanged(grp) { const F = G.lureFields.get(grp); if (F) F.dirty = true; }
function zombieThink(z) {
  const gm = game, T = gm.targets, A = gm.alive;
  // perception : le joueur le plus proche qu'il perçoit
  let best = -1, bd = Infinity;
  const distracted = z.distractUntil > gm.t; // pétard : il ne remarque que les joueurs tout proches
  for (let i = 0; i < A.length; i++) {
    const q = A[i]; if (!isPrey(q)) continue;
    if (z.ignoreUntil > gm.t && z.ignoreId === q.id) continue; // planque : il a perdu ta trace
    const d = hyp(z.x, z.y, q.x, q.y);
    if (distracted && d > 20) continue;
    let sense = senseFor(q) * (z.hunt && z.tgt === i ? 1.4 : 1);
    if (q.role === "charognard" && A.some((o) => o !== q && isPrey(o) && hyp(z.x, z.y, o.x, o.y) < d)) sense *= 0.5; // il passe après les autres
    if (d < sense && d < bd) { bd = d; best = i; }
  }
  if (best >= 0) {
    if (!z.hunt || z.tgt !== best) { const q = A[best]; q.alertUntil = gm.t + CFG.alertTime; q.knownT = -99; } // il hurle
    z.hunt = true; z.tgt = best;
  } else { z.hunt = false; z.tgt = -1; }
  if (z.hunt) {
    z.inv = false;
    const P = T[z.tgt];
    if (P && sameEdge(z, P) && !edgeBlocked(P.a, P.b)) { z.route = [{ x: P.x, y: P.y, n: -1, ea: P.a, eb: P.b }]; return; }
    step(z, z.role === "flank" && bd > CFG.flankClose && gm.ahead.length ? G.F3 : G); return;
  }
  // pas de proie en vue : attiré par un pétard, la colline ou le ralliement de son maître
  const grp = lureFor(z);
  if (grp) { step(z, lureField(grp), true); return; }
  if (!T.length) { z.route = []; return; }
  step(z, gm.known.length ? G.F2 : G);
}
function step(z, F, stay) {
  if (z.a === z.b) {
    let nx = F.next[z.a];
    if (nx < 0 && stay) { z.route = []; z.inv = false; return; } // arrivé sur place : il reprend la piste
    if (nx < 0 && F !== G) { F = G; nx = G.next[z.a]; } // arrivé au point visé : on reprend la poursuite directe
    if (nx < 0) {
      const P = game.targets[G.owner[z.a]] || game.targets[0]; if (!P) { z.route = []; return; }
      z.route = [{ x: P.x, y: P.y, n: -1, ea: P.a, eb: P.b }]; return;
    }
    z.route = [{ x: G.X[nx], y: G.Y[nx], n: nx }];
  } else {
    const da = hyp(z.x, z.y, G.X[z.a], G.Y[z.a]) + F.dist[z.a];
    const db = hyp(z.x, z.y, G.X[z.b], G.Y[z.b]) + F.dist[z.b];
    if (!isFinite(da) && !isFinite(db)) { z.route = []; return; }
    const t = da < db ? z.a : z.b;
    z.route = [{ x: G.X[t], y: G.Y[t], n: t }];
  }
}
// Carrefour vers lequel le joueur court (pour les rabatteurs)
function aheadOf(q) {
  const nodes = q.nx || []; if (!nodes.length) return q.sp;
  let acc = 0, px_ = q.x, py_ = q.y, pick = -1;
  for (const n of nodes) {
    acc += hyp(px_, py_, G.X[n], G.Y[n]);
    if (acc > CFG.aheadDist && pick >= 0) break;
    pick = n; px_ = G.X[n]; py_ = G.Y[n];
  }
  return pick >= 0 ? { x: G.X[pick], y: G.Y[pick], a: pick, b: pick } : q.sp;
}

/* ---------------- Rues bloquées (barricades) ---------------- */
function edgeIdx(a, b) { for (let p = G.adjStart[a]; p < G.adjStart[a + 1]; p++) if (G.adjTo[p] === b) return p; return -1; }
function edgeBlocked(a, b) { if (a === b) return false; const p = edgeIdx(a, b); return p >= 0 && !!G.adjBlocked[p]; }
function setBlocked(a, b, v) {
  const p = edgeIdx(a, b), q = edgeIdx(b, a);
  if (p >= 0) G.adjBlocked[p] = v ? 1 : 0; if (q >= 0) G.adjBlocked[q] = v ? 1 : 0;
  for (const F of G.lureFields.values()) F.dirty = true;
  if (game) { game.forceFields = true; if (v) rerouteMe(); }
}
// Si mon chemin passe par une rue qui vient d'être bloquée, je recalcule un itinéraire vers la même destination
function rerouteMe() {
  const P = game.player; if (!P.route.length) return;
  let prev = P.a, crosses = false;
  for (const w of P.route) { if (w.n >= 0) { if (prev !== w.n && edgeBlocked(prev, w.n)) { crosses = true; break; } prev = w.n; } }
  if (!crosses) return;
  const last = P.route[P.route.length - 1];
  const T = last.n >= 0 ? { x: last.x, y: last.y, a: last.n, b: last.n } : { x: last.x, y: last.y, a: last.ea, b: last.eb };
  const r = route(P, T); P.route = r || [];
  if (!r) banner("Une barricade bloque ton chemin", false, 2000);
}
function applyBars(list) { // invités : on aligne les rues bloquées sur la liste de l'hôte
  const want = new Set(list.map(([a, b]) => a + "_" + b));
  for (const [a, b] of game.bars) if (!want.has(a + "_" + b)) setBlocked(a, b, false);
  const had = new Set(game.bars.map(([a, b]) => a + "_" + b));
  for (const [a, b] of list) if (!had.has(a + "_" + b)) setBlocked(a, b, true);
  game.bars = list.map((x) => x.slice());
}
