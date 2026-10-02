"use strict";
// Dead Ends · Dessin des joueurs, zombies et marqueurs

/* ---------------- Rendu (canvas par-dessus la carte) ---------------- */
const fx = $("fx"); const ctx = fx.getContext("2d");
let DPR = 1;
function resizeFx() {
  DPR = window.devicePixelRatio || 1;
  const r = map.getContainer().getBoundingClientRect();
  fx.width = Math.round(r.width * DPR); fx.height = Math.round(r.height * DPR);
  fx.style.width = r.width + "px"; fx.style.height = r.height + "px";
}
window.addEventListener("resize", resizeFx); resizeFx();
const COL = {};
function readColors() { for (const k of ["sodium", "blood", "runner", "night", "ink", "ok", "muted"]) COL[k] = css("--" + k); }
readColors();
const px = (x, y) => map.latLngToContainerPoint(toLL(x, y));
function metersToPx(m) {
  const c = map.getCenter(); const p1 = map.latLngToContainerPoint(c);
  const p2 = map.latLngToContainerPoint(L.latLng(c.lat, c.lng + m / (111320 * Math.cos(c.lat * Math.PI / 180))));
  return Math.abs(p2.x - p1.x);
}
let drawPts = null; // tracé en cours (Shift + glisser)
// Flèche au bord de l'écran vers un repère hors champ
function edgeArrow(q, color, label, W, Hh) {
  const mx = 40, my = 100;
  if (!(q.x < mx || q.y < my || q.x > W - mx || q.y > Hh - my)) return;
  const cx = W / 2, cy = Hh / 2, dx = q.x - cx, dy = q.y - cy;
  const t = Math.min((W / 2 - mx) / Math.abs(dx || 1e-6), (Hh / 2 - my) / Math.abs(dy || 1e-6));
  const ex = cx + dx * t, ey = cy + dy * t, ang = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (label) { ctx.font = "700 12px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText(label, ex - Math.cos(ang) * 24, ey - Math.sin(ang) * 24 + 4); }
}
function ring(x, y, r, color, w, dash) { ctx.strokeStyle = color; ctx.lineWidth = w || 2; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
function dot(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function label(txt, x, y, color) {
  ctx.font = "600 12px 'Barlow Condensed', 'Arial Narrow', sans-serif"; ctx.textAlign = "center";
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(11,15,20,0.9)"; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
function render(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, fx.width, fx.height);
  if (loading && loading.cells) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    for (const c of loading.cells) {
      const a = map.latLngToContainerPoint([c.n, c.w]), b = map.latLngToContainerPoint([c.s, c.e]);
      const x = a.x, y = a.y, w = b.x - a.x, h = b.y - a.y;
      if (c.st === "done") { ctx.fillStyle = "rgba(255,173,66,0.10)"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "rgba(255,173,66,0.35)"; ctx.lineWidth = 1; }
      else if (c.st === "load") { ctx.fillStyle = `rgba(255,173,66,${0.05 + 0.08 * pulse})`; ctx.fillRect(x, y, w, h); ctx.strokeStyle = `rgba(255,173,66,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 2; }
      else if (c.st === "fail") { ctx.strokeStyle = "rgba(229,72,77,0.8)"; ctx.lineWidth = 2; }
      else if (c.st === "share") { ctx.globalAlpha = 0.45 + 0.35 * pulse; ctx.strokeStyle = c.color || "rgba(138,153,168,0.6)"; ctx.lineWidth = 2; }
      else { ctx.strokeStyle = "rgba(138,153,168,0.35)"; ctx.lineWidth = 1; }
      ctx.setLineDash(c.st === "wait" || c.st === "share" ? [4, 6] : []); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
  if (!G) return;
  const W = fx.width / DPR, Hh = fx.height / DPR;
  const s = px(G.X[G.spawn], G.Y[G.spawn]);
  const inGame = game && (state === "play" || state === "countdown");
  const P = inGame ? game.player : null, mine = inGame ? meP() : null;
  const body = inGame && mine.alive && !mine.master && !mine.escaped;           // j'ai un corps sur la carte
  const seeAll = inGame && (!body || mine.master || game.droneUntil > game.t); // spectateur, maître ou drone

  // brouillard au-delà de la vision (s'éclaircit vers l'aube)
  if (inGame && body) {
    const pp = px(P.x, P.y), dawn = game.mode === "aube" ? Math.min(1, game.t / CFG.aubeDur) : 0;
    const vis = metersToPx(game.R.vision * (1 + dawn * 0.8));
    ctx.save();
    ctx.fillStyle = `rgba(5,7,10,${0.55 * (1 - dawn * 0.65)})`; ctx.fillRect(0, 0, W, Hh);
    ctx.globalCompositeOperation = "destination-out";
    const grd = ctx.createRadialGradient(pp.x, pp.y, vis * 0.75, pp.x, pp.y, vis);
    grd.addColorStop(0, "rgba(0,0,0,1)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(pp.x, pp.y, vis, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ring(pp.x, pp.y, vis, "rgba(255,173,66,0.18)", 1, [2, 6]);
  }
  // vrais carrefours : un point là où on peut tourner (pas de point = pont ou tunnel, on ne peut pas passer de l'un à l'autre)
  if (map.getZoom() >= 16 && G.junc) {
    const b = map.getBounds(), xa = (b.getWest() - G.lon0) * G.kx, xb = (b.getEast() - G.lon0) * G.kx, ya = (b.getSouth() - G.lat0) * G.ky, yb = (b.getNorth() - G.lat0) * G.ky;
    const jr = map.getZoom() >= 17 ? 2.6 : 1.8;
    ctx.fillStyle = "rgba(255,208,138,0.85)";
    ctx.beginPath();
    for (const n of G.junc) {
      const x = G.X[n], y = G.Y[n]; if (x < xa || x > xb || y < ya || y > yb) continue;
      const q = px(x, y); ctx.moveTo(q.x + jr, q.y); ctx.arc(q.x, q.y, jr, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  // point zéro
  const pulse = (now / 1000) % 1.6 / 1.6;
  ctx.globalAlpha = 1 - pulse; ring(s.x, s.y, 8 + pulse * 26, COL.blood, 2); ctx.globalAlpha = 1;
  dot(s.x, s.y, 5, COL.blood);
  ctx.strokeStyle = COL.blood; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x - 11, s.y); ctx.lineTo(s.x + 11, s.y); ctx.moveTo(s.x, s.y - 11); ctx.lineTo(s.x, s.y + 11); ctx.stroke();
  if (!inGame) return;

  // barricades
  for (const [a, b, left] of game.bars) {
    const A = px(G.X[a], G.Y[a]), B = px(G.X[b], G.Y[b]);
    ctx.strokeStyle = "rgba(229,72,77,0.85)"; ctx.lineWidth = 6; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.setLineDash([]);
    const mx_ = (A.x + B.x) / 2, my_ = (A.y + B.y) / 2;
    dot(mx_, my_, 9, "#2a0709"); ring(mx_, my_, 9, COL.blood, 2);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx_ - 4, my_ - 4); ctx.lineTo(mx_ + 4, my_ + 4); ctx.moveTo(mx_ + 4, my_ - 4); ctx.lineTo(mx_ - 4, my_ + 4); ctx.stroke();
    const lf = isHost ? Math.ceil(left - game.t) : left; if (lf > 0) label(`${lf} s`, mx_, my_ - 14, "#ffb3b5");
  }
  // repères du mode
  const pul = 0.5 + 0.5 * Math.sin(now / 250);
  for (const m of game.marks) {
    const q = px(m[1], m[2]);
    switch (m[0]) {
      case "evacZone": { // zone approximative de l'atterrissage
        const r = metersToPx(m[3]);
        ctx.globalAlpha = 0.1 + 0.05 * pul; dot(q.x, q.y, r, COL.ok); ctx.globalAlpha = 1;
        ring(q.x, q.y, r, "rgba(126,224,129,0.7)", 2, [8, 8]);
        label(`ZONE D'ÉVACUATION · point exact dans ${m[4]} s`, q.x, q.y - r - 8, "#b9f5c9");
        edgeArrow(q, COL.ok, "", W, Hh);
        break;
      }
      case "evac": {
        const open = m[3] === 1, col = open ? COL.ok : "rgba(126,224,129,0.6)";
        ring(q.x, q.y, metersToPx(CFG.goalR) + 4, col, 3, open ? [] : [6, 6]);
        ring(q.x, q.y, metersToPx(CFG.goalR) + 10 + pul * 10, `rgba(76,195,138,${0.5 - pul * 0.4})`, 2);
        dot(q.x, q.y, 5, col);
        label(open ? `ÉVACUATION · ${m[4]} place${m[4] > 1 ? "s" : ""} · ${m[5]} s` : `Évacuation dans ${m[5]} s`, q.x, q.y - 22, open ? "#b9f5c9" : "#d6e2ea");
        edgeArrow(q, COL.ok, `${m[5]}`, W, Hh);
        break;
      }
      case "crate": {
        const c = m[3] ? "#5ec8f2" : COL.sodium, sz = 6;
        ctx.fillStyle = c; ctx.strokeStyle = "#1a1006"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(q.x - sz, q.y - sz, sz * 2, sz * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(q.x - sz, q.y); ctx.lineTo(q.x + sz, q.y); ctx.stroke();
        break;
      }
      case "hill": {
        const r = metersToPx(m[3]), owner = m[4], o = owner && owner !== "*" ? players.get(owner) : null;
        const col = o ? o.color : owner === "*" ? "#ff9b9e" : "#d6e2ea";
        ctx.globalAlpha = 0.16 + 0.08 * pul; dot(q.x, q.y, r, col); ctx.globalAlpha = 1;
        ring(q.x, q.y, r, col, 3);
        label(o ? `COLLINE · ${o.name}` : owner === "*" ? "COLLINE · disputée" : "COLLINE · libre", q.x, q.y - r - 8, col);
        edgeArrow(q, col, "", W, Hh);
        break;
      }
      case "dest": {
        const T = TEAMS[m[3]], mineT = mine.team === m[3];
        ring(q.x, q.y, metersToPx(CFG.goalR) + 4, T.color, 3);
        ctx.fillStyle = T.color; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - 22); ctx.lineTo(q.x + 14, q.y - 17); ctx.lineTo(q.x, q.y - 12); ctx.fill();
        ctx.strokeStyle = T.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - 22); ctx.stroke();
        label(`Destination ${T.name}`, q.x, q.y - 28, T.color);
        if (mineT) edgeArrow(q, T.color, "", W, Hh);
        break;
      }
      case "finish": {
        const r = metersToPx(CFG.goalR) + 4;
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#fff" : "#111"; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.arc(q.x, q.y, r, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2); ctx.fill(); }
        ring(q.x, q.y, r, COL.sodium, 2);
        label("ARRIVÉE", q.x, q.y - r - 8, "#fff");
        edgeArrow(q, "#fff", "", W, Hh);
        break;
      }
      case "summit": { // sommet : petite montagne + drapeau
        ctx.fillStyle = "#c9d4dd"; ctx.strokeStyle = "#0b0f14"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(q.x - 14, q.y + 6); ctx.lineTo(q.x, q.y - 12); ctx.lineTo(q.x + 14, q.y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COL.sodium; ctx.beginPath(); ctx.moveTo(q.x, q.y - 12); ctx.lineTo(q.x, q.y - 28); ctx.lineTo(q.x + 11, q.y - 24); ctx.lineTo(q.x, q.y - 20); ctx.fill();
        ctx.strokeStyle = COL.sodium; ctx.beginPath(); ctx.moveTo(q.x, q.y - 12); ctx.lineTo(q.x, q.y - 28); ctx.stroke();
        ring(q.x, q.y, metersToPx(CFG.goalR) + 6 + pul * 4, COL.sodium, 2, [4, 4]);
        label(`SOMMET · ${m[3]} m`, q.x, q.y - 34, "#ffd08a");
        edgeArrow(q, COL.sodium, "", W, Hh);
        break;
      }
      case "lure": {
        const r = 10 + ((now / 400) % 1) * 40;
        ctx.globalAlpha = 1 - ((now / 400) % 1); ring(q.x, q.y, r, "#ffcf6b", 3); ctx.globalAlpha = 1;
        dot(q.x, q.y, 5, "#ffcf6b"); label(`PÉTARD ${m[3]} s`, q.x, q.y - 16, "#ffcf6b");
        break;
      }
      case "rally": if (m[3] === myId) { ring(q.x, q.y, 14, COL.blood, 2, [4, 4]); label("RALLIEMENT", q.x, q.y - 20, "#ffb3b5"); } break;
      case "down": {
        const o = players.get(m[3]); if (!o) break;
        ring(q.x, q.y, 16 + pul * 4, "rgba(255,155,158,0.8)", 2);
        if (m[4] > 0) { ctx.strokeStyle = COL.ok; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(q.x, q.y, 20, -Math.PI / 2, -Math.PI / 2 + (m[4] / 100) * Math.PI * 2); ctx.stroke(); }
        label(`${o.name} à terre · ${m[5]} s`, q.x, q.y + 32, "#ffb3b5");
        if (m[3] !== myId) edgeArrow(q, "#ff9b9e", "", W, Hh);
        break;
      }
    }
  }
  // mon chemin prévu
  const pp = px(P.x, P.y);
  if (body && P.route.length) {
    ctx.strokeStyle = COL.sodium; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.setLineDash([7, 7]); ctx.lineDashOffset = -now / 40;
    ctx.beginPath(); ctx.moveTo(pp.x, pp.y);
    for (const w of P.route) { const q = px(w.x, w.y); ctx.lineTo(q.x, q.y); }
    ctx.stroke(); ctx.setLineDash([]);
    const last = P.route[P.route.length - 1]; const q = px(last.x, last.y);
    dot(q.x, q.y, 5, COL.sodium);
  }
  if (drawPts && drawPts.length > 1) {
    ctx.strokeStyle = "rgba(244,248,255,0.75)"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    drawPts.forEach((ll, i) => { const q = map.latLngToContainerPoint(ll); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.stroke();
  }
  // visée d'une compétence
  if (game.targeting && body) {
    const S = SKILLS[game.targeting];
    ring(pp.x, pp.y, metersToPx(S.range), "rgba(255,207,107,0.7)", 2, [6, 6]);
    if (game.mouseLL) {
      const xy = toXY(game.mouseLL), T = snap(xy.x, xy.y, 120);
      if (T) {
        const ok = hyp(T.x, T.y, P.x, P.y) <= S.range, c = ok ? "#ffcf6b" : "#ff9b9e";
        if (game.targeting === "barricade") { const A = px(G.X[T.ea], G.Y[T.ea]), B = px(G.X[T.eb], G.Y[T.eb]); ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.setLineDash([]); }
        else { const q = px(T.x, T.y); ring(q.x, q.y, 12, c, 3); dot(q.x, q.y, 4, c); }
      }
    }
  }
  // anciens nids
  for (const nd of game.nests) {
    const q = px(nd.x, nd.y);
    ctx.strokeStyle = "rgba(229,72,77,0.45)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(q.x - 6, q.y - 6); ctx.lineTo(q.x + 6, q.y + 6); ctx.moveTo(q.x + 6, q.y - 6); ctx.lineTo(q.x - 6, q.y + 6); ctx.stroke();
  }
  // vague annoncée
  if (game.upcoming && game.wave > 0) {
    const left = Math.max(0, game.upcoming.at - game.t);
    for (const pt of game.upcoming.pts) {
      const q = px(pt.x, pt.y), k = Math.min(1, left / CFG.waveWarn);
      ctx.globalAlpha = 0.9; ring(q.x, q.y, 12 + 40 * k, COL.blood, 3); ctx.globalAlpha = 1;
      dot(q.x, q.y, 6, COL.blood);
      ctx.font = "700 14px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.fillText(String(Math.ceil(left)), q.x, q.y - 20 - 40 * k);
      edgeArrow(q, COL.blood, String(Math.ceil(left)), W, Hh);
    }
  }
  // zombies : dans mon champ de vision (tous si je suis spectateur, maître ou si mon drone vole)
  const vm = game.R.vision * (game.mode === "aube" ? 1 + Math.min(1, game.t / CFG.aubeDur) * 0.8 : 1);
  const zr = Math.max(4, Math.min(8, metersToPx(4)));
  for (const z of game.zombies) {
    const d = hyp(z.x, z.y, P.x, P.y); if (!seeAll && d > vm) continue;
    const a = seeAll ? 1 : Math.min(1, (vm - d) / (vm * 0.2));
    const wob = Math.sin(now / 140 + z.wob) * 0.8;
    const q = px(z.x + z.ox + wob, z.y + z.oy);
    ctx.globalAlpha = a;
    dot(q.x, q.y, zr * 2, "rgba(229,72,77,0.25)");
    ctx.fillStyle = COL.blood; ctx.strokeStyle = "#2a0709"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(q.x, q.y, zr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // autres joueurs
  for (const q of players.values()) {
    if (q.id === myId || q.master || q.escaped) continue;
    // le maître de la horde ne voit que les survivants repérés par ses zombies
    if (mine.master && !q.zombie && !game.zombies.some((z) => hyp(z.x, z.y, q.x, q.y) < CFG.senseR)) continue;
    const o = px(q.x, q.y);
    if (!q.alive) {
      ctx.strokeStyle = "rgba(138,153,168,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o.x - 5, o.y - 5); ctx.lineTo(o.x + 5, o.y + 5); ctx.moveTo(o.x + 5, o.y - 5); ctx.lineTo(o.x - 5, o.y + 5); ctx.stroke();
      label(q.name, o.x, o.y - 11, "rgba(138,153,168,0.9)"); continue;
    }
    ctx.globalAlpha = q.hidden ? 0.35 : 1;
    const qc = q.team != null ? TEAMS[q.team].color : q.color; // en équipe : couleur de l'équipe
    if (q.team != null) ring(o.x, o.y, 10, "#ffffff", 2);
    if (q.zombie) { dot(o.x, o.y, 7, COL.blood); ring(o.x, o.y, 7, "#2a0709", 2); }
    else if (q.down) { dot(o.x, o.y, 6, "rgba(138,153,168,0.9)"); }
    else { ctx.fillStyle = qc; ctx.strokeStyle = "#0b0f14"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x, o.y, q.team != null ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (q.vip) { ctx.fillStyle = "#ffd75e"; ctx.beginPath(); ctx.moveTo(o.x, o.y - 22); ctx.lineTo(o.x + 5, o.y - 16); ctx.lineTo(o.x, o.y - 10); ctx.lineTo(o.x - 5, o.y - 16); ctx.fill(); }
    if (q.markUntil > game.t) ring(o.x, o.y, 13 + 3 * Math.sin(now / 120), "#ff9b9e", 2, [3, 3]);
    label(q.zombie ? `${q.name} (infecté)` : q.markUntil > game.t ? `${q.name} · marqué` : q.name, o.x, o.y - (q.vip ? 26 : 13), q.zombie ? "#ff9b9e" : qc);
    ctx.globalAlpha = 1;
  }
  // moi
  if (!body) {
    if (!mine.alive && !mine.master) {
      ctx.strokeStyle = COL.blood; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pp.x - 7, pp.y - 7); ctx.lineTo(pp.x + 7, pp.y + 7); ctx.moveTo(pp.x + 7, pp.y - 7); ctx.lineTo(pp.x - 7, pp.y + 7); ctx.stroke();
    }
    return;
  }
  const r = 7, myColor = mine.team != null ? TEAMS[mine.team].color : mine.color || COL.sodium;
  const hiddenMe = game.planqueUntil > game.t;
  ctx.globalAlpha = hiddenMe ? 0.45 : 1;
  if (mine.team != null) { dot(pp.x, pp.y, 12, TEAMS[mine.team].color); ring(pp.x, pp.y, 12, "#ffffff", 2); }
  if (game.sprinting) dot(pp.x, pp.y, r * 2.4, "rgba(255,173,66,0.3)");
  if (mine.zombie) { dot(pp.x, pp.y, r + 1, COL.blood); ring(pp.x, pp.y, r + 1, "#2a0709", 2); }
  else if (mine.down) { dot(pp.x, pp.y, r, "rgba(138,153,168,0.9)"); }
  else { ctx.fillStyle = COL.runner; ctx.strokeStyle = myColor; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  if (mine.vip) { ctx.fillStyle = "#ffd75e"; ctx.beginPath(); ctx.moveTo(pp.x, pp.y - 24); ctx.lineTo(pp.x + 6, pp.y - 17); ctx.lineTo(pp.x, pp.y - 10); ctx.lineTo(pp.x - 6, pp.y - 17); ctx.fill(); }
  if (!mine.down) {
    const dx = Math.cos(P.dir), dy = -Math.sin(P.dir);
    ctx.fillStyle = mine.zombie ? COL.blood : myColor; ctx.beginPath();
    ctx.moveTo(pp.x + dx * (r + 9), pp.y + dy * (r + 9));
    ctx.lineTo(pp.x + dx * (r + 2) - dy * 5, pp.y + dy * (r + 2) + dx * 5);
    ctx.lineTo(pp.x + dx * (r + 2) + dy * 5, pp.y + dy * (r + 2) - dx * 5);
    ctx.closePath(); ctx.fill();
  }
  if (hiddenMe) label(`PLANQUÉ · ${Math.ceil(game.planqueUntil - game.t)} s`, pp.x, pp.y - 16, "#d6e2ea");
  ctx.globalAlpha = 1;
}
