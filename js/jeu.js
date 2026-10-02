"use strict";
// Dead Ends · Compétences, personnage, simulation du monde et règles des modes

/* ---------------- Compétences ---------------- */
function useSkill() {
  if (!game || state !== "play") return;
  const id = mySkill(); if (!id) return;
  const S = SKILLS[id], gm = game;
  if (gm.targeting) { gm.targeting = null; mapEl.classList.remove("aiming"); return; }
  if (gm.t < gm.skillReadyAt) { banner(`${S.name} : encore ${Math.ceil(gm.skillReadyAt - gm.t)} s`, false, 1200); return; }
  if (S.target) { gm.targeting = id; mapEl.classList.add("aiming"); banner(`${S.name} : clique sur la carte (${S.range} m max) · Échap pour annuler`, false, 2500); return; }
  startCooldown(id);
  if (id === "rush") gm.rushUntil = gm.t + S.dur;
  if (id === "drone") gm.droneUntil = gm.t + S.dur;
  if (id === "planque") { gm.planqueUntil = gm.t + S.dur; gm.player.route = []; sendSkill({ k: "planque" }); }
  if (id === "cri") sendSkill({ k: "cri" });
  if (id === "souffle") gm.player.stamina = gm.R.stamina;
  banner(`${S.name} !`, false, 1200);
}
function fireTarget(ll) {
  const gm = game, id = gm.targeting, S = SKILLS[id]; if (!S) return;
  const p = toXY(ll);
  if (id === "appat") { // on vise un autre joueur
    let tg = null, bd = 45;
    for (const o of players.values()) if (o.id !== myId && isPrey(o)) { const d = hyp(o.x, o.y, p.x, p.y); if (d < bd) { bd = d; tg = o; } }
    if (!tg) { banner("Clique sur un autre joueur", false, 1500); return; }
    if (hyp(tg.x, tg.y, gm.player.x, gm.player.y) > S.range) { banner(`Trop loin : ${S.range} m maximum`, false, 1500); return; }
    gm.targeting = null; mapEl.classList.remove("aiming"); startCooldown(id);
    sendSkill({ k: "appat", id: tg.id }); return;
  }
  const T = snap(p.x, p.y, id === "raccourci" ? 40 : 120);
  if (!T) { banner("Vise une rue", false, 1500); return; }
  if (hyp(T.x, T.y, gm.player.x, gm.player.y) > S.range) { banner(`Trop loin : ${S.range} m maximum`, false, 1500); return; }
  gm.targeting = null; mapEl.classList.remove("aiming"); startCooldown(id);
  if (id === "petard") { const n = hyp(T.x, T.y, G.X[T.ea], G.Y[T.ea]) < hyp(T.x, T.y, G.X[T.eb], G.Y[T.eb]) ? T.ea : T.eb; sendSkill({ k: "petard", node: n }); banner("Pétard lancé !", false, 1500); }
  if (id === "barricade") { sendSkill({ k: "barricade", a: T.ea, b: T.eb }); banner("Barricade posée", false, 1500); }
  if (id === "raccourci") { gm.player.route = [{ x: T.x, y: T.y, n: -1, ea: T.ea, eb: T.eb, jump: true }]; banner("Raccourci !", false, 1200); } // en ligne droite, hors des rues
}
// Délai de recharge. Raccourci du Traceur : 20 s, +15 s à chaque usage (2 min max), redescend d'un cran par minute sans s'en servir.
function startCooldown(id) {
  const gm = game, S = SKILLS[id]; let cd = S.cd;
  if (id === "raccourci") {
    const idle = Math.max(0, gm.t - (gm.parkReady || 0));
    gm.parkLvl = Math.max(0, (gm.parkLvl || 0) - Math.floor(idle / 60));
    cd = Math.min(S.cdMax, S.cd + S.cdStep * gm.parkLvl);
    gm.parkLvl = Math.min(gm.parkLvl + 1, Math.ceil((S.cdMax - S.cd) / S.cdStep)); gm.parkReady = gm.t + cd;
  }
  gm.skillCdLen = cd; gm.skillReadyAt = gm.t + cd;
}
function sendSkill(m) { m.t = "skill"; if (isHost) hostSkill(myId, m); else toHost(m); }
function hostSkill(id, m) {
  const gm = game, q = players.get(id); if (!gm || !q || state !== "play") return;
  const okNode = (n) => Number.isInteger(n) && n >= 0 && n < G.N;
  if (m.k === "planque" && isPrey(q) && q.role === "fantome") {
    const dur = SKILLS.planque.dur;
    q.hiddenUntil = gm.t + dur; q.planqueEnd = gm.t + dur;
    // les zombies qui te traquent (ou rôdent à moins de 150 m) perdent ta trace tout de suite et partent sur une fausse piste
    const idx = gm.alive.indexOf(q);
    for (const z of gm.zombies) if ((z.hunt && z.tgt === idx) || hyp(z.x, z.y, q.x, q.y) < 150) {
      z.hunt = false; z.tgt = -1; z.inv = false; z.ignoreId = q.id; z.ignoreUntil = gm.t + dur + 3;
    }
    const n = pickNodeAround(q.x, q.y, 250, 450);
    q.known = { x: G.X[n], y: G.Y[n], a: n, b: n }; q.knownT = gm.t + dur; gm.forceFields = true;
  }
  else if (m.k === "petard" && q.role === "artificier" && okNode(m.node)) {
    const lx = G.X[m.node], ly = G.Y[m.node];
    gm.lures.push({ x: lx, y: ly, node: m.node, until: gm.t + SKILLS.petard.dur, keep: gm.t + SKILLS.petard.dur + 90, range: CFG.lureRange, grp: "all", kind: "petard" });
    lureChanged("all");
    for (const z of gm.zombies) if (hyp(z.x, z.y, lx, ly) < CFG.lureRange) {
      z.hunt = false; z.tgt = -1; z.inv = true; z.invUntil = gm.t + 90; z.distractUntil = gm.t + SKILLS.petard.dur;
    }
  } else if (m.k === "barricade" && q.role === "saboteur" && okNode(m.a) && okNode(m.b) && m.a !== m.b && edgeIdx(m.a, m.b) >= 0) {
    gm.bars.push([m.a, m.b, gm.t + SKILLS.barricade.dur]); setBlocked(m.a, m.b, true);
  } else if (m.k === "appat" && q.role === "charognard" && isPrey(q)) {
    const tg = players.get(m.id);
    if (tg && tg !== q && isPrey(tg) && hyp(tg.x, tg.y, q.x, q.y) <= SKILLS.appat.range + 30) {
      tg.markUntil = gm.t + SKILLS.appat.dur; gm.forceFields = true;
      emit({ t: "ev", k: "marked", id: tg.id, name: tg.name, by: q.name, byId: q.id });
    }
  } else if (m.k === "cri" && q.master) {
    for (const z of gm.zombies) if (z.master === id) z.criUntil = gm.t + SKILLS.cri.dur;
    emit({ t: "ev", k: "cri", name: q.name });
  }
}
function hostRally(id, m) {
  const q = players.get(id); if (!q || !q.master || !Number.isInteger(m.node) || m.node < 0 || m.node >= G.N) return;
  q.rally = { node: m.node, x: G.X[m.node], y: G.Y[m.node] }; lureChanged("m:" + id);
}

/* ---------------- Mon personnage ---------------- */
function moveMe(dt) {
  const gm = game, P = gm.player, q = meP();
  gm.sprinting = false;
  if (!canMove()) return;
  if (q.zombie) { advance(P, CFG.zPlayerSpeed * dt); return; }
  const R = gm.R, moving = P.route.length > 0, rush = gm.rushUntil > gm.t;
  if (gm.sprintLock && !gm.sprint) gm.sprintLock = false;
  let want = moving && (rush || (gm.sprint && !gm.sprintLock && P.stamina > 0));
  if (want && !rush && R.sprintCap) { gm.sprintRun += dt; if (gm.sprintRun > R.sprintCap) { gm.sprintLock = true; want = false; } }
  if (!want) gm.sprintRun = 0;
  if (want && !rush) P.stamina = Math.max(0, P.stamina - CFG.drain * dt);
  else if (!want) P.stamina = Math.min(R.stamina, P.stamina + CFG.regen * R.regenMul * dt);
  let spd = CFG.runSpeed * R.speedMul * (want ? CFG.sprintMul : 1);
  if (q.vip) spd *= CFG.vipSpeed;
  if (gm.speedBonusUntil > gm.t) spd *= 1.3;
  if (P.route.length && P.route[0].jump) spd = Math.max(spd, CFG.runSpeed * 2.2); // raccourci : on fonce à travers le pâté
  if (G.elev) { // mode Sommet : la pente ralentit (et fatigue) en montée, accélère en descente
    const g = moving ? gradeOf(P) : 0; gm.grade = g; spd *= slopeMul(g);
    if (g > 0 && !rush) P.stamina = Math.max(0, P.stamina - CFG.slopeDrain * g * dt);
  }
  advance(P, spd * dt);
  gm.sprinting = want;
}

/* ---------------- Simulation du monde (hôte) ---------------- */
function hostUpdate(dt) {
  const gm = game, mine = me(), P = gm.player;
  if (mine.alive && !mine.master && !mine.escaped) {
    mine.x = P.x; mine.y = P.y; mine.dir = P.dir; mine.trail = P.trail; mine.sp = { x: P.x, y: P.y, a: P.a, b: P.b };
    mine.sprint = !!gm.sprinting; mine.nx = P.route.filter((w) => w.n >= 0).slice(0, 4).map((w) => w.n);
  }
  modeTick(dt);
  if (gm.ended) return;
  // fin des effets temporaires
  for (const l of gm.lures) if (l.keep <= gm.t) { l.dead = true; lureChanged(l.grp); }
  gm.lures = gm.lures.filter((l) => !l.dead);
  for (const b of gm.bars) if (b[2] <= gm.t) { setBlocked(b[0], b[1], false); b.dead = true; }
  gm.bars = gm.bars.filter((b) => !b.dead);
  const prey = [...players.values()].filter((q) => isPrey(q) && q.sp);
  // Piste : dernière position connue de chaque joueur (pas mise à jour pendant une planque)
  let knownDirty = gm.forceFields; gm.forceFields = false;
  for (const q of prey) if (q.hiddenUntil <= gm.t && (!q.known || gm.t - q.knownT >= scentInterval(q))) { q.known = q.sp; q.knownT = gm.t; knownDirty = true; }
  gm.fieldT -= dt;
  if (gm.fieldT <= 0 || knownDirty) {
    const changed = gm.alive.length !== prey.length || prey.some((q, i) => gm.alive[i] !== q);
    gm.alive = prey; gm.targets = prey.map((q) => q.sp);
    if (prey.length) {
      computeField(gm.targets);
      if (knownDirty || changed) { gm.known = prey.map((q) => q.known || q.sp); computeField(gm.known, G.F2); }
      gm.f3 = (gm.f3 || 0) + 1;
      if (gm.f3 % 2 === 0 || changed) { gm.ahead = prey.map(aheadOf); computeField(gm.ahead, G.F3); }
    } else { gm.known = []; gm.ahead = []; }
    gm.fieldT = CFG.fieldEvery;
  }
  // Vagues : la 1re sort du point zéro, les suivantes d'endroits aléatoires annoncés à l'avance
  if (!gm.upcoming && gm.t >= gm.nextWave - CFG.waveWarn && prey.length) {
    const k = gm.wave + 1;
    const nodes = k === 1 ? [G.spawn] : pickSpawnNodes(k >= CFG.splitFrom ? 2 : 1);
    gm.upcoming = { at: gm.nextWave, nodes, pts: nodes.map((n) => ({ x: G.X[n], y: G.Y[n] })) };
    if (k > 1) emit({ t: "ev", k: "warn", wave: k, pts: gm.upcoming.pts, left: CFG.waveWarn });
  }
  if (gm.upcoming && gm.t >= gm.nextWave) {
    gm.wave++;
    const n = CFG.waveBase + CFG.waveInc * (gm.wave - 1) + Math.max(0, players.size - 1) * 2;
    const nodes = gm.upcoming.nodes;
    for (let i = 0; i < n; i++) gm.pending.push({ t: gm.t + Math.floor(i / nodes.length) * 0.35, node: nodes[i % nodes.length] });
    for (const nd of nodes) if (nd !== G.spawn) gm.nests.push({ x: G.X[nd], y: G.Y[nd] });
    gm.upcoming = null;
    gm.nextWave += gm.mode === "aube" ? CFG.waveEvery * 0.9 : CFG.waveEvery;
    emit({ t: "ev", k: "wave", wave: gm.wave, n });
  }
  while (gm.pending.length && gm.pending[0].t <= gm.t) { const p = gm.pending.shift(); spawnZombie(gm.wave, p.node); }
  // Zombies
  for (const z of gm.zombies) {
    if (z.stunUntil > gm.t) continue; // repoussé par un Increvable
    const prey_ = z.hunt ? gm.alive[z.tgt] : null;
    let left = z.speed * (z.criUntil > gm.t ? 1.4 : 1) * (prey_ && prey_.markUntil > gm.t ? 1.2 : 1) * (G.elev ? slopeMul(gradeOf(z)) : 1) * dt; // appât : ils foncent sur le joueur marqué ; pentes du mode Sommet
    for (let i = 0; i < 4 && left > 1e-6; i++) { zombieThink(z); if (!z.route.length) break; left = advance(z, left); }
  }
  // Captures par les zombies
  for (const q of prey) if (!(q.invulnUntil > gm.t)) for (const z of gm.zombies) if (!(z.stunUntil > gm.t) && hyp(z.x, z.y, q.x, q.y) < CFG.catchDist) {
    if (z.master) { const m = players.get(z.master); if (m) m.catches++; }
    catchPlayer(q, null); break;
  }
  // Captures par les joueurs infectés (patient zéro)
  for (const zp of players.values()) if (zp.alive && zp.zombie) for (const q of prey) if (isPrey(q) && hyp(zp.x, zp.y, q.x, q.y) < CFG.catchDist) catchPlayer(q, zp);
  if (gm.ended) return;
  // Combien de zombies traquent chaque joueur (affiché dans le HUD)
  for (const q of players.values()) q.hunted = 0;
  for (const z of gm.zombies) if (z.hunt && gm.alive[z.tgt]) gm.alive[z.tgt].hunted++;
  gm.huntedMe = mine.hunted || 0;
  // État du monde : repères du mode et envoi aux joueurs
  gm.sendT -= dt;
  if (gm.sendT <= 0) {
    gm.sendT = 0.1;
    gm.marks = buildMarks();
    if (net) {
      const r1 = (v) => Math.round(v * 10) / 10;
      broadcast({
        t: "snap", time: gm.t, w: gm.wave, nw: gm.wave === 0 ? gm.nextWave - gm.t : null,
        z: gm.zombies.map((z) => [Math.round(z.x + z.ox), Math.round(z.y + z.oy)]),
        p: [...players.values()].map((q) => [q.id, r1(q.x), r1(q.y), Math.round(q.dir * 100) / 100, q.alive ? 1 : 0, q.hunted || 0, flagsOf(q), q.score || 0]),
        up: gm.upcoming && gm.wave > 0 ? { left: gm.upcoming.at - gm.t, pts: gm.upcoming.pts } : null,
        nests: gm.nests, mk: gm.marks, bars: gm.bars.map(([a, b, u]) => [a, b, Math.max(0, Math.round(u - gm.t))]), hud: gm.hud,
      });
    }
  }
}
function flagsOf(q) {
  return (q.zombie ? 1 : 0) | (q.down ? 2 : 0) | (q.escaped ? 4 : 0) | (q.vip ? 8 : 0) | (q.master ? 16 : 0) | (q.team === 1 ? 32 : 0)
    | (q.hiddenUntil > game.t ? 64 : 0) | (q.patient ? 128 : 0) | (q.team != null ? 256 : 0);
}
function applyFlags(q, f) {
  q.zombie = !!(f & 1); q.down = !!(f & 2); q.escaped = !!(f & 4); q.vip = !!(f & 8); q.master = !!(f & 16);
  q.team = f & 256 ? (f & 32 ? 1 : 0) : null; q.hidden = !!(f & 64); q.patient = !!(f & 128);
}
// Repères affichés sur la carte : [type, x, y, ...]
function buildMarks() {
  const gm = game, mk = [], R = Math.round;
  if (gm.evac && gm.evac.node < 0) mk.push(["evacZone", R(gm.evac.zx), R(gm.evac.zy), gm.evac.zr, Math.max(0, Math.ceil(gm.evac.at - 30 - gm.t))]);
  if (gm.evac && gm.evac.node >= 0) mk.push(["evac", R(gm.evac.x), R(gm.evac.y), gm.evac.open ? 1 : 0, gm.evac.places - gm.evac.taken, Math.max(0, Math.ceil(gm.evac.open ? gm.evac.end - gm.t : gm.evac.at - gm.t))]);
  for (const c of gm.crates) mk.push(["crate", R(c.x), R(c.y), c.bonus ? 1 : 0]);
  if (gm.hill) mk.push(["hill", R(gm.hill.x), R(gm.hill.y), gm.hill.r, gm.hill.owner || ""]);
  for (const d of gm.setup.dests || []) mk.push(["dest", R(d.x), R(d.y), d.team]);
  if (gm.finish) mk.push(["finish", R(gm.finish.x), R(gm.finish.y)]);
  if (gm.summit) mk.push(["summit", R(gm.summit.x), R(gm.summit.y), gm.summit.alt]);
  for (const l of gm.lures) if (l.kind === "petard" && l.until > gm.t) mk.push(["lure", R(l.x), R(l.y), Math.max(0, Math.ceil(l.until - gm.t))]);
  for (const q of players.values()) if (q.master && q.rally) mk.push(["rally", R(q.rally.x), R(q.rally.y), q.id]);
  for (const q of players.values()) if (q.down) mk.push(["down", R(q.x), R(q.y), q.id, Math.round((q.revive / CFG.reviveTime) * 100), Math.max(0, Math.ceil(CFG.bleedOut - (gm.t - q.downT)))]);
  return mk;
}
function catchPlayer(q, by) {
  const gm = game; if (!isPrey(q) || gm.ended || q.invulnUntil > gm.t) return;
  if (q.role === "increvable" && !q.saveUsed) { // seconde chance : il repousse les zombies proches et repart
    q.saveUsed = true; q.invulnUntil = gm.t + 2.5;
    for (const z of gm.zombies) if (hyp(z.x, z.y, q.x, q.y) < 25) { z.stunUntil = gm.t + 3; z.hunt = false; z.tgt = -1; }
    emit({ t: "ev", k: "saved", id: q.id, name: q.name }); return;
  }
  if (gm.mode === "patient") {
    q.zombie = true; q.time = gm.t;
    if (by) by.infections++; else { const pz = players.get(gm.patientId); if (pz) pz.infections++; }
    emit({ t: "ev", k: "infected", id: q.id, name: q.name, by: by ? by.name : null });
  } else if (gm.mode === "aube" && players.size > 1) {
    q.down = true; q.downT = gm.t; q.revive = 0;
    emit({ t: "ev", k: "down", id: q.id, name: q.name });
  } else { killPlayer(q); return; }
  checkEnd();
}
function killPlayer(q) {
  if (!q.alive || state !== "play") return;
  q.alive = false; q.down = false; q.time = game.t;
  if (game.mode === "tresor") q.score = Math.floor(q.score / 2);
  emit({ t: "ev", k: "dead", id: q.id, name: q.name, time: q.time });
  checkEnd();
}

/* ---------------- Règles des modes (hôte) ---------------- */
function modeTick(dt) {
  const gm = game, t = gm.t, all = [...players.values()], prey = all.filter(isPrey);
  // fin de planque : les zombies perdent ta trace et partent sur une fausse piste
  for (const q of all) if (q.planqueEnd && t >= q.planqueEnd) {
    q.planqueEnd = 0; q.fadeUntil = t + 3;
  }
  switch (gm.mode) {
    case "extraction": {
      const e = gm.evac;
      if (!e.told && t >= 1) { e.told = true; emit({ t: "ev", k: "evacZone", pt: { x: e.zx, y: e.zy } }); }
      if (e.node < 0 && t >= e.at - 30 && prey.length) {
        // point précis annoncé 30 s avant l'ouverture, quelque part dans la zone
        const n = pickNodeAround(e.zx, e.zy, 0, e.zr * 0.8);
        Object.assign(e, { node: n, x: G.X[n], y: G.Y[n] });
        emit({ t: "ev", k: "evacSoon", pt: { x: e.x, y: e.y }, places: e.places, left: Math.round(e.at - t) });
      }
      if (!e.open && t >= e.at) { e.open = true; e.end = t + CFG.extractOpen; emit({ t: "ev", k: "evacOpen", pt: { x: e.x, y: e.y }, places: e.places - e.taken, left: CFG.extractOpen }); }
      if (e.open) for (const q of prey) if (e.taken < e.places && hyp(q.x, q.y, e.x, e.y) < CFG.goalR) {
        q.escaped = true; q.time = t; q.place = ++e.taken;
        emit({ t: "ev", k: "escaped", id: q.id, name: q.name, left: e.places - e.taken });
      }
      gm.hud = e.open ? { txt: "Évacuation ouverte", left: e.end - t, extra: `${e.places - e.taken} place${e.places - e.taken > 1 ? "s" : ""}` } : { txt: "Évacuation dans", left: e.at - t };
      break;
    }
    case "patient": {
      if (!gm.turned && t >= CFG.patientTurn) {
        gm.turned = true; const q = players.get(gm.patientId);
        if (q && isPrey(q)) { q.zombie = true; q.patient = true; q.time = t; emit({ t: "ev", k: "turn", id: q.id, name: q.name }); }
      }
      gm.hud = gm.turned ? { txt: "Les humains tiennent encore", left: CFG.patientEnd - t } : { txt: "Le patient zéro se révèle dans", left: CFG.patientTurn - t };
      break;
    }
    case "tresor": {
      gm.crateT -= dt;
      if (gm.crateT <= 0) { gm.crateT = CFG.crateEvery; if (gm.crates.length < gm.crateMax) spawnCrate(); }
      for (const q of prey) for (let i = gm.crates.length - 1; i >= 0; i--) {
        const c = gm.crates[i]; if (hyp(q.x, q.y, c.x, c.y) >= CFG.crateR) continue;
        gm.crates.splice(i, 1); q.score += c.pts;
        const bonus = c.bonus ? ["stamina", "skill", "speed"][(Math.random() * 3) | 0] : null;
        emit({ t: "ev", k: "crate", id: q.id, pts: c.pts, bonus });
      }
      gm.hud = { txt: "Fin de la chasse dans", left: CFG.modeDur - t };
      break;
    }
    case "colline": {
      const h = gm.hill;
      if (t - h.movedAt >= CFG.hillMove) {
        const n = pickNodeAround(h.x, h.y, 200, 550); Object.assign(h, { node: n, x: G.X[n], y: G.Y[n], movedAt: t });
        emit({ t: "ev", k: "hillMove", pt: { x: h.x, y: h.y } });
      }
      const inside = prey.filter((q) => hyp(q.x, q.y, h.x, h.y) < h.r);
      h.owner = inside.length === 1 ? inside[0].id : inside.length > 1 ? "*" : null;
      if (inside.length === 1) { inside[0].scoreF += dt; inside[0].score = Math.floor(inside[0].scoreF); }
      gm.callT -= dt;
      if (gm.callT <= 0) { gm.callT = CFG.hillCall; gm.lures.push({ x: h.x, y: h.y, node: h.node, until: t + 8, keep: t + 95, range: 1500, grp: "all", kind: "hill" }); lureChanged("all"); emit({ t: "ev", k: "hillCall" }); }
      gm.hud = { txt: "Fin dans", left: CFG.modeDur - t };
      break;
    }
    case "escorte": {
      for (const q of prey) if (q.vip) { const d = gm.setup.dests[q.team]; if (d && hyp(q.x, q.y, d.x, d.y) < CFG.goalR) { gm.escortWin = q.team; q.escaped = true; q.time = t; } }
      gm.hud = { txt: "Escorte ton VIP jusqu'à sa destination", left: null };
      break;
    }
    case "horde": gm.hud = { txt: "Les survivants doivent tenir encore", left: CFG.modeDur - t }; break;
    case "aube": {
      for (const q of all) if (q.alive && q.down) {
        if (t - q.downT > CFG.bleedOut) { killPlayer(q); continue; }
        const helper = prey.some((o) => o !== q && hyp(o.x, o.y, q.x, q.y) < CFG.reviveR);
        q.revive = helper ? q.revive + dt : Math.max(0, q.revive - dt * 0.5);
        if (q.revive >= CFG.reviveTime) { q.down = false; q.revive = 0; q.known = null; emit({ t: "ev", k: "revived", id: q.id, name: q.name }); }
      }
      gm.hud = { txt: "L'aube se lève dans", left: CFG.aubeDur - t };
      break;
    }
    case "course": {
      for (const q of prey) if (gm.finish && hyp(q.x, q.y, gm.finish.x, gm.finish.y) < CFG.goalR) {
        q.escaped = true; q.finishT = t; q.time = t; emit({ t: "ev", k: "finish", id: q.id, name: q.name, time: t });
      }
      gm.hud = { txt: "Rejoins l'arrivée", left: null };
      break;
    }
    case "sommet": {
      const S = gm.summit;
      if (S) for (const q of prey) if (hyp(q.x, q.y, S.x, S.y) < CFG.goalR) {
        q.escaped = true; q.finishT = t; q.time = t; gm.summitWin = q.id; emit({ t: "ev", k: "summit", id: q.id, name: q.name, time: t }); break;
      }
      gm.hud = { txt: "Atteins le sommet", left: null };
      break;
    }
    case "defi": gm.hud = { txt: `Défi du ${todayKey().split("-").reverse().join("/")}`, left: null }; break;
    default: gm.hud = null;
  }
  checkEnd();
}
// Fin de partie selon le mode
function checkEnd() {
  if (!isHost || state !== "play" || !game || game.ended) return;
  const gm = game, t = gm.t, all = [...players.values()], prey = all.filter(isPrey);
  const multi = !!net && all.length > 1, win = new Set();
  let done = false;
  switch (gm.mode) {
    case "survie": case "defi":
      if (multi && gm.mode === "survie" ? prey.length <= 1 : prey.length === 0) { done = true; if (multi && prey.length === 1 && gm.mode === "survie") win.add(prey[0].id); }
      break;
    case "extraction": {
      const e = gm.evac;
      if (!prey.length || (e.open && (t >= e.end || e.taken >= e.places))) { done = true; all.filter((q) => q.escaped).forEach((q) => win.add(q.id)); }
      break;
    }
    case "patient": {
      const humans = all.filter((q) => isPrey(q));
      if (!humans.length) { done = true; if (gm.patientId) win.add(gm.patientId); }
      else if (t >= CFG.patientEnd) { done = true; humans.forEach((q) => win.add(q.id)); }
      break;
    }
    case "tresor": case "colline": {
      const goal = gm.mode === "colline" && all.some((q) => q.score >= CFG.hillGoal);
      if (!prey.length || t >= CFG.modeDur || goal) {
        done = true; const best = Math.max(0, ...all.map((q) => q.score));
        if (best > 0) all.filter((q) => q.score === best).forEach((q) => win.add(q.id));
      }
      break;
    }
    case "escorte": {
      const vipOk = [0, 1].map((tm) => all.some((q) => q.vip && q.team === tm && q.alive));
      if (gm.escortWin != null) { done = true; all.filter((q) => q.team === gm.escortWin).forEach((q) => win.add(q.id)); }
      else if (!vipOk[0] || !vipOk[1]) {
        done = true; const tm = vipOk[0] ? 0 : vipOk[1] ? 1 : null;
        if (tm != null) all.filter((q) => q.team === tm).forEach((q) => win.add(q.id));
      }
      break;
    }
    case "horde": {
      const surv = all.filter((q) => !q.master);
      if (!surv.some(isPrey)) { done = true; all.filter((q) => q.master).forEach((q) => win.add(q.id)); }
      else if (t >= CFG.modeDur) { done = true; surv.filter(isPrey).forEach((q) => win.add(q.id)); }
      break;
    }
    case "aube":
      if (!prey.length) done = true;
      else if (t >= CFG.aubeDur) { done = true; all.forEach((q) => win.add(q.id)); }
      break;
    case "sommet":
      if (gm.summitWin) { done = true; win.add(gm.summitWin); }
      else if (!prey.length) done = true;
      break;
    case "course":
      if (!prey.length) {
        done = true; const fin = all.filter((q) => q.finishT != null).sort((a, b) => a.finishT - b.finishT);
        if (fin[0]) win.add(fin[0].id);
      }
      break;
  }
  if (!done) return;
  gm.ended = true;
  for (const q of all) if (isPrey(q) || (q.alive && q.zombie && !q.time) || (q.alive && q.down)) q.time = q.time || t;
  for (const q of all) if (isPrey(q)) q.time = t;
  const msg = { t: "over", rows: buildRows(win), wave: gm.wave, mode: gm.mode, zombies: gm.zombies.length };
  broadcast(msg); showResults(msg);
}
function buildRows(win) {
  const gm = game, all = [...players.values()], scoreMode = !!gm.M.score;
  const rows = all.map((q) => {
    let value, sort, note = "";
    if (q.master) { value = `${q.catches} victime${q.catches > 1 ? "s" : ""}`; sort = -q.catches; note = "Maître de la horde"; }
    else if (scoreMode) { value = `${q.score} pts`; sort = -(q.score * 1e5 + q.time); }
    else if (gm.mode === "course") { value = q.finishT != null ? fmtTime(q.finishT) : "Abandon"; sort = q.finishT != null ? q.finishT : 1e7 - q.time; }
    else { value = fmtTime(q.time || 0); sort = -(q.time || 0); }
    if (gm.mode === "extraction" && q.escaped) { note = `Évacué (${q.place}${q.place === 1 ? "er" : "e"})`; sort = -1e7 + q.place; }
    if (gm.mode === "patient") note = q.patient ? `Patient zéro · ${q.infections} infecté${q.infections > 1 ? "s" : ""}` : q.zombie ? "Infecté" : "Humain";
    if (gm.mode === "escorte") note = `Équipe ${TEAMS[q.team] ? TEAMS[q.team].name : ""}${q.vip ? " · VIP" : ""}`;
    if (gm.mode === "aube" && q.down) note = "À terre";
    if (gm.mode === "course" && q.finishT != null) note = "Arrivé";
    if (gm.mode === "sommet" && q.finishT != null) { note = "Au sommet"; value = fmtTime(q.finishT); sort = -1e7; }
    return { id: q.id, name: q.name, color: q.team != null ? TEAMS[q.team].color : q.color, role: q.master ? "" : q.role, value, note, win: win.has(q.id), time: q.time || 0, trail: q.trail || 0, score: q.score || 0, sort };
  });
  rows.sort((a, b) => (b.win - a.win) || (a.sort - b.sort));
  return rows;
}
// Un message de l'hôte est appliqué localement et envoyé à tous
function emit(m) { broadcast(m); handleEvent(m); }
function cancelAim() { if (game) game.targeting = null; drawPts = null; mapEl.classList.remove("aiming"); }
function handleEvent(m) {
  if (!game) return;
  const mine = m.id === myId;
  if (mine && ["dead", "turn", "infected", "down", "escaped", "finish", "summit"].includes(m.k)) cancelAim(); // changement d'état : on annule toute visée en cours
  switch (m.k) {
    case "warn": if (!isHost) game.upcoming = { at: game.t + m.left, pts: m.pts }; banner(`Vague ${m.wave} dans ${m.left} s · ${m.pts.map(where).join(" et ")}`, true, 3500); break;
    case "wave": game.wave = m.wave; if (!isHost) game.upcoming = null; banner(m.wave === 1 ? "Ils sortent du point zéro" : `Vague ${m.wave} · ${m.n} zombies`, true, 2600); flash(); break;
    case "dead": { const q = players.get(m.id); if (q) { q.alive = false; q.time = m.time; } if (mine) myDeath(); else banner(`${m.name} s'est fait rattraper`, true, 2600); break; }
    case "secret": game.secret = true; banner("Tu es le patient zéro. Tu te transformes dans 2 min : reste discret.", true, 6000); break;
    case "turn": { const q = players.get(m.id); if (q) { q.zombie = true; q.patient = true; } if (mine) { game.player.route = []; banner("Tu te transformes ! Attrape les humains.", true, 4000); } else banner(`${m.name} était le patient zéro !`, true, 4000); flash(); break; }
    case "infected": { const q = players.get(m.id); if (q) q.zombie = true; if (mine) { game.player.route = []; banner("Tu es infecté : attrape les derniers humains !", true, 4000); flash(); } else banner(`${m.name} a été infecté${m.by ? " par " + m.by : ""}`, true, 2600); break; }
    case "down": { const q = players.get(m.id); if (q) q.down = true; if (mine) { game.player.route = []; banner("À terre ! Un coéquipier doit rester 3 s près de toi.", true, 4000); flash(); } else banner(`${m.name} est à terre : va le relever !`, true, 3000); break; }
    case "revived": { const q = players.get(m.id); if (q) q.down = false; banner(mine ? "Relevé ! Cours !" : `${m.name} est relevé`, false, 2500); break; }
    case "evacZone": banner(`Zone d'évacuation repérée · ${where(m.pt)} · point exact 30 s avant l'arrivée de l'hélico`, false, 4500); break;
    case "evacSoon": banner(`Évacuation dans ${m.left} s · ${where(m.pt)} · ${m.places} place${m.places > 1 ? "s" : ""}`, true, 4000); break;
    case "evacOpen": banner(`Évacuation ouverte ${m.left} s · ${where(m.pt)}`, true, 4000); flash(); break;
    case "escaped": banner(mine ? "Évacué ! Tu es sauvé." : `${m.name} est évacué · ${m.left} place${m.left > 1 ? "s" : ""} restante${m.left > 1 ? "s" : ""}`, !mine, 3000); if (mine) { game.player.route = []; map.dragging.enable(); } break;
    case "crate":
      if (mine) {
        const B = { stamina: "endurance pleine", skill: "compétence rechargée", speed: "vitesse +30 % pendant 6 s" };
        banner(`+${m.pts} points${m.bonus ? " · " + B[m.bonus] : ""}`, false, 1800);
        if (m.bonus === "stamina") game.player.stamina = game.R.stamina;
        if (m.bonus === "skill") game.skillReadyAt = game.t;
        if (m.bonus === "speed") game.speedBonusUntil = game.t + 6;
      }
      break;
    case "hillMove": banner(`La colline se déplace · ${where(m.pt)}`, false, 3000); break;
    case "hillCall": banner("La colline attire la horde !", true, 2200); break;
    case "finish": banner(mine ? `Arrivé en ${fmtTime(m.time)} !` : `${m.name} est arrivé en ${fmtTime(m.time)}`, false, 3000); if (mine) map.dragging.enable(); break;
    case "summit": banner(mine ? `Au sommet en ${fmtTime(m.time)} !` : `${m.name} a atteint le sommet !`, !mine, 3000); if (mine) map.dragging.enable(); break;
    case "cri": if (!meP().master) banner(`${m.name} hurle : la horde accélère !`, true, 2000); break;
    case "saved": { const q = players.get(m.id); if (q) q.saveUsed = true; banner(mine ? "Seconde chance ! Tu repousses les zombies : cours !" : `${m.name} s'échappe de justesse`, mine, 2500); if (mine) flash(); break; }
    case "marked": { const q = players.get(m.id); if (q) q.markUntil = game.t + SKILLS.appat.dur;
      if (mine) banner(`${m.by} t'a marqué : les zombies te repèrent de plus loin et accélèrent pendant ${SKILLS.appat.dur} s !`, true, 3000);
      else if (m.byId === myId) banner(`Appât posé sur ${m.name}`, false, 2000); break; }
  }
}
function myDeath() {
  const P = game.player; P.alive = false; P.route = []; game.sprint = false; drawPts = null; game.targeting = null; flash();
  if (!net) return; // en solo, l'écran de fin arrive tout de suite
  const left = [...players.values()].filter(isPrey).length;
  banner(left ? `Rattrapé ! Tu observes la fin de la partie (${left} encore en jeu)` : "Rattrapé !", true, 0);
  map.dragging.enable();
}
// Invités : application de l'état reçu
function applySnap(m) {
  if (!game || !G) return;
  game.wave = m.w;
  while (game.zombies.length < m.z.length) { const [x, y] = m.z[game.zombies.length]; game.zombies.push({ x, y, tx: x, ty: y, ox: 0, oy: 0, wob: Math.random() * 10 }); }
  game.zombies.length = m.z.length;
  m.z.forEach(([x, y], i) => { game.zombies[i].tx = x; game.zombies[i].ty = y; });
  for (const [id, x, y, dir, alive, hunted, flags, score] of m.p) {
    const q = players.get(id); if (!q) continue;
    applyFlags(q, flags || 0); q.alive = !!alive; q.score = score || 0;
    if (id === myId) { game.huntedMe = hunted || 0; continue; }
    if (q.tx === undefined) { q.x = x; q.y = y; }
    q.tx = x; q.ty = y; q.dir = dir;
  }
  game.upcoming = m.up ? { at: game.t + m.up.left, pts: m.up.pts } : null;
  game.nests = m.nests || [];
  game.hostNw = m.nw;
  game.marks = m.mk || [];
  game.hud = m.hud || null;
  applyBars(m.bars || []);
}
function guestUpdate(dt) {
  const gm = game, P = gm.player, mine = meP();
  const k = Math.min(1, dt * 12);
  for (const z of gm.zombies) { z.x += (z.tx - z.x) * k; z.y += (z.ty - z.y) * k; }
  for (const q of players.values()) if (q.id !== myId && q.tx !== undefined) { q.x += (q.tx - q.x) * k; q.y += (q.ty - q.y) * k; }
  gm.sendT -= dt;
  if (gm.sendT <= 0 && mine.alive && !mine.master && !mine.escaped) {
    gm.sendT = 0.1;
    toHost({ t: "pos", x: Math.round(P.x * 10) / 10, y: Math.round(P.y * 10) / 10, dir: Math.round(P.dir * 100) / 100, trail: Math.round(P.trail),
      s: gm.sprinting ? 1 : 0, nx: P.route.filter((w) => w.n >= 0).slice(0, 4).map((w) => w.n) });
  }
}
function update(dt) {
  const gm = game;
  gm.t += dt;
  moveMe(dt);
  if (isHost) hostUpdate(dt); else guestUpdate(dt);
  // compte à rebours avant la 1re vague
  const nw = isHost ? (gm.wave === 0 ? gm.nextWave - gm.t : null) : gm.hostNw;
  if (gm.wave === 0 && nw != null && nw > 0) {
    const txt = `Les zombies sortent dans ${Math.max(0, Math.ceil(nw))} s`;
    if (txt !== gm.lastBanner) { gm.lastBanner = txt; banner(txt, false, 0); }
  }
}
