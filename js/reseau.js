"use strict";
// Dead Ends · Multijoueur : transport PeerJS, joueurs, messages hôte/invités

/* ---------------- Transport : PeerJS (internet) ou BroadcastChannel (test local) ---------------- */
// PeerJS (sérialisation JSON) refuse tout message de 16 300 octets ou plus : il signale une erreur
// au lieu de l'envoyer. On vérifie donc la taille avant chaque envoi, sur tous les transports
// (y compris le mode de test local, pour que les tests reflètent la vraie limite).
const MSG_MAX = 15500;
const PEER_OPTS = window.DEADENDS_PEER_OPTS || undefined; // serveur de mise en relation personnalisé (tests) ; sinon le serveur public de PeerJS
const utf8 = new TextEncoder();
function fits(m) {
  const s = JSON.stringify(m);
  if (s.length < MSG_MAX / 3 || utf8.encode(s).length < MSG_MAX) return true;
  console.warn("Dead Ends : message trop gros, non envoyé", m && m.t, s.length);
  return false;
}
function peerHost(code, ev) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") { reject(new Error("nolib")); return; }
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTS); let open = false;
    peer.on("open", () => { open = true; resolve({ close: () => { try { peer.destroy(); } catch {} } }); });
    peer.on("error", (e) => { if (!open) reject(e); else console.warn("PeerJS", e.type); });
    peer.on("disconnected", () => { try { if (!peer.destroyed) peer.reconnect(); } catch {} });
    peer.on("connection", (conn) => {
      const link = { send: (m) => { try { if (fits(m)) conn.send(m); } catch {} }, close: () => { try { conn.close(); } catch {} } };
      conn.on("open", () => ev.onJoin(conn.peer, link));
      conn.on("data", (d) => ev.onData(conn.peer, d));
      conn.on("close", () => ev.onLeave(conn.peer));
      conn.on("error", (e) => console.warn("Connexion joueur", e && e.type, e && e.message));
    });
  });
}
function peerJoin(code, ev) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === "undefined") { reject(new Error("nolib")); return; }
    const peer = PEER_OPTS ? new Peer(PEER_OPTS) : new Peer(); let done = false;
    const fail = (e) => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch {} reject(e); };
    const to = setTimeout(() => fail(new Error("timeout")), 15000);
    peer.on("error", (e) => { if (!done) fail(e); });
    peer.on("open", (id) => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: "json" });
      conn.on("open", () => {
        if (done) return; done = true; clearTimeout(to);
        resolve({ id, send: (m) => { try { if (fits(m)) conn.send(m); } catch {} }, close: () => { try { conn.close(); } catch {} try { peer.destroy(); } catch {} } });
      });
      conn.on("data", (d) => ev.onData(d));
      conn.on("close", () => ev.onClose());
      conn.on("error", (e) => console.warn("Connexion à l'hôte", e && e.type, e && e.message));
    });
  });
}
function localHost(code, ev) {
  const bc = new BroadcastChannel("deadends-" + code); const known = new Set();
  bc.onmessage = (e) => {
    const m = e.data; if (m.to !== "host") return;
    if (m.kind === "hello") {
      if (known.has(m.from)) return; known.add(m.from);
      bc.postMessage({ to: m.from, kind: "welcome" });
      ev.onJoin(m.from, { send: (d) => { if (fits(d)) bc.postMessage({ to: m.from, kind: "data", d }); }, close() {} });
    } else if (m.kind === "data") ev.onData(m.from, m.d);
    else if (m.kind === "bye") { known.delete(m.from); ev.onLeave(m.from); }
  };
  const bye = () => bc.postMessage({ to: "*", from: "host", kind: "bye" });
  window.addEventListener("beforeunload", bye);
  return Promise.resolve({ close: () => { bye(); bc.close(); } });
}
function localJoin(code, ev) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel("deadends-" + code); const id = "g" + Math.random().toString(36).slice(2, 8);
    const to = setTimeout(() => { bc.close(); reject(Object.assign(new Error("absent"), { type: "peer-unavailable" })); }, 2500);
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.to === "*" && m.kind === "bye" && m.from === "host") { ev.onClose(); return; }
      if (m.to !== id) return;
      if (m.kind === "welcome") {
        clearTimeout(to);
        resolve({ id, send: (d) => { if (fits(d)) bc.postMessage({ to: "host", from: id, kind: "data", d }); }, close: () => { bc.postMessage({ to: "host", from: id, kind: "bye" }); bc.close(); } });
      } else if (m.kind === "data") ev.onData(m.d);
    };
    window.addEventListener("beforeunload", () => bc.postMessage({ to: "host", from: id, kind: "bye" }));
    bc.postMessage({ to: "host", from: id, kind: "hello" });
  });
}
const Transport = { host: (c, ev) => (LOCAL ? localHost(c, ev) : peerHost(c, ev)), join: (c, ev) => (LOCAL ? localJoin(c, ev) : peerJoin(c, ev)) };

/* ---------------- Joueurs ---------------- */
function newPlayer(id, name, host) {
  const used = new Set([...players.values()].map((p) => p.color));
  return {
    id, name: cleanName(name), host, color: COLORS.find((c) => !used.has(c)) || COLORS[0],
    load: { done: 0, n: 0 }, loaded: false, failed: false, ready: false, role: "coureur",
    alive: true, time: 0, x: 0, y: 0, dir: 0, trail: 0, sp: null, link: null,
  };
}
const me = () => players.get(myId);
function publicPlayers() {
  return [...players.values()].map((p) => ({ id: p.id, uid: p.id === myId ? cloudUid() : p.uid || null, name: p.name, host: p.host, color: p.color, load: p.load, loaded: p.loaded, failed: p.failed, ready: p.ready, role: p.role, alive: p.alive }));
}
// L'hôte envoie à tous ; send() du côté invité va vers l'hôte.
function broadcast(m) { if (!net || !net.host) return; for (const p of players.values()) if (p.link) p.link.send(m); }
function toHost(m) { if (net && !net.host) net.link.send(m); }
let lobbyDirty = false;
function pushLobby() { lobbyDirty = true; }
setInterval(() => {
  if (!lobbyDirty) return; lobbyDirty = false;
  if (isHost) broadcast({ t: "lobby", players: publicPlayers(), zone, mode: gameMode });
  renderPlayers(); refreshRoleButtons();
}, 150);

function renderPlayers() {
  const box = $("pbox");
  const show = !!net && ["lobby", "loading", "role", "over"].includes(state);
  box.hidden = !show;
  $("leaveBtn").hidden = !["lobby", "loading", "role", "over"].includes(state);
  $("leaveBtn").textContent = net ? "Quitter la partie" : "Retour au menu";
  if (!show) return;
  const list = $("plist"); list.innerHTML = "";
  $("pcount").textContent = `${players.size} / ${MAX_PLAYERS}`;
  for (const p of players.values()) {
    const li = document.createElement("li");
    let st = "Connecté", cls = "";
    if (state === "loading") {
      if (p.loaded) { st = "Carte prête"; cls = "ok"; }
      else if (p.failed) { st = "Échec du chargement"; cls = "err"; }
      else st = p.load.n ? `Chargement ${p.load.done} / ${p.load.n}` : "Chargement…";
    } else if (state === "role") { st = p.ready ? `Prêt · ${ROLES[p.role].name}` : "Choisit son rôle…"; cls = p.ready ? "ok" : ""; }
    else if (state === "over") { st = ROLES[p.role].name; }
    const pct = state === "loading" && p.load.n ? Math.round((p.load.done / p.load.n) * 100) : (p.loaded ? 100 : 0);
    li.innerHTML = `<span class="pdot" style="background:${p.color}"></span>
      <span class="pname">${p.name}${p.id === myId ? ' <span class="you">(toi)</span>' : ""}${p.host ? ' <span class="tag">Hôte</span>' : ""}${friendBit(p)}</span>
      <span class="pst ${cls}">${st}</span>${state === "loading" ? `<span class="pbar"><span style="transform:scaleX(${pct / 100})"></span></span>` : ""}`;
    list.appendChild(li);
  }
}

// Bouton « + Ami » pour les joueurs connectés à leur compte
function friendBit(p) {
  if (p.id === myId || !p.uid || !Cloud.user || p.uid === cloudUid()) return "";
  const r = relationTo(p.uid);
  if (r === "friend") return '<span class="ftag">Ami</span>';
  if (r === "out") return '<span class="ftag">Demande envoyée</span>';
  if (r === "in") return '<span class="ftag">Veut être ton ami</span>';
  return `<button type="button" class="addf" data-addf="${esc(p.uid)}" data-name="${esc(p.name)}">+ Ami</button>`;
}

/* ---------------- Menu, création, connexion ---------------- */
function goMenu(msg) {
  sentKeys.clear(); recvKeys.clear(); partsIn.clear();
  if (net) { try { net.link.close(); } catch {} }
  net = null; isHost = true; myId = "host"; players = new Map(); zone = null; game = null; G = null;
  if (loadCtl) loadCtl.abort(); hideLoader();
  clearMapLayers();
  $("panel").hidden = false; $("hud").hidden = true; $("countdown").innerHTML = "";
  map.dragging.enable(); map.doubleClickZoom.enable();
  state = "menu"; showStep("stepMenu");
  $("nameInput").value = myName;
  menuStatus(msg || "", msg ? "err" : "");
  renderPlayers();
}
function clearMapLayers() {
  for (const l of [roadsLayer, zoneCircle, pickMarker]) if (l) l.remove();
  roadsLayer = zoneCircle = pickMarker = null; picked = null;
}
function menuStatus(t, cls) { const s = $("menuStatus"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
function saveName() { myName = cleanName($("nameInput").value); $("nameInput").value = myName; try { localStorage.setItem(NAME_STORE, myName); } catch {} cloudSaveName(myName); }

function startSolo() {
  saveName(); net = null; isHost = true; myId = "host";
  players = new Map(); players.set(myId, newPlayer(myId, myName, true));
  enterLobby();
}
async function startHost() {
  saveName(); menuStatus("Création de la partie…");
  $("createBtn").disabled = true;
  for (let i = 0; i < 4; i++) {
    const code = makeCode();
    try {
      const link = await Transport.host(code, { onJoin: hostOnJoin, onData: hostOnData, onLeave: hostOnLeave });
      net = { host: true, link, code }; isHost = true; myId = "host";
      players = new Map(); players.set(myId, newPlayer(myId, myName, true));
      $("createBtn").disabled = false; menuStatus("");
      enterLobby(); return;
    } catch (e) {
      if (e && e.type === "unavailable-id") continue; // code déjà pris : on en tire un autre
      $("createBtn").disabled = false;
      menuStatus(e && e.message === "nolib" ? "Le module réseau n'a pas pu se charger. Vérifie ta connexion." : "Impossible de créer la partie (serveur de mise en relation injoignable). Réessaie dans un instant.", "err");
      return;
    }
  }
  $("createBtn").disabled = false; menuStatus("Impossible de trouver un code libre. Réessaie.", "err");
}
async function startJoin(code) {
  saveName(); code = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 5) { menuStatus("Le code fait 5 caractères (lettres et chiffres).", "err"); return; }
  menuStatus("Connexion à la partie…");
  try {
    const link = await Transport.join(code, { onData: guestOnData, onClose: guestOnClose });
    net = { host: false, link, code }; isHost = false; myId = link.id;
    players = new Map();
    toHost({ t: "hello", name: myName, uid: cloudUid() });
    state = "lobby"; showStep("stepLobby"); setupLobbyView(); menuStatus("");
  } catch (e) {
    const t = e && e.type;
    menuStatus(t === "peer-unavailable" ? "Aucune partie avec ce code. Vérifie-le auprès de l'hôte."
      : e && e.message === "nolib" ? "Le module réseau n'a pas pu se charger. Vérifie ta connexion."
      : "Connexion impossible. Certains réseaux (entreprise, 4G) bloquent les connexions directes entre joueurs.", "err");
  }
}

/* ---------------- Côté hôte : messages des joueurs ---------------- */
function hostOnJoin(id, link) {
  if (state !== "lobby") { link.send({ t: "refused", why: "started" }); setTimeout(() => link.close(), 300); return; }
  if (players.size >= MAX_PLAYERS) { link.send({ t: "refused", why: "full" }); setTimeout(() => link.close(), 300); return; }
  const p = newPlayer(id, "Joueur", false); p.link = link; players.set(id, p);
  sentKeys.clear(); if (zone) setTimeout(schedulePrefetch, 500); // le nouveau venu reçoit aussi les secteurs déjà chargés
  link.send({ t: "welcome", id });
  pushLobby();
}
function hostOnLeave(id) {
  const p = players.get(id); if (!p) return;
  players.delete(id);
  if (state === "play" && game) { banner(`${p.name} a quitté la partie`, false, 2500); checkEnd(); }
  if (state === "loading") checkAllLoaded();
  pushLobby();
}
function hostOnData(id, m) {
  const p = players.get(id); if (!p || !m) return;
  switch (m.t) {
    case "hello": p.name = cleanName(m.name); p.uid = typeof m.uid === "string" ? m.uid.slice(0, 128) : null; pushLobby(); break;
    case "progress": p.load = { done: +m.done || 0, n: +m.n || 0 }; pushLobby(); break;
    case "loaded": p.loaded = !!m.ok; p.failed = !m.ok; pushLobby(); checkAllLoaded(); break;
    case "ready": if (state === "role") { p.ready = !!m.ready; p.role = ROLES[m.role] ? m.role : "coureur"; pushLobby(); } break;
    case "cell": receiveCellPart(m, id); break;
    case "skill": hostSkill(id, m); break;
    case "rally": if (state === "play") hostRally(id, m); break;
    case "pos":
      if (state === "play" && G && p.alive) {
        p.x = +m.x; p.y = +m.y; p.dir = +m.dir || 0; p.trail = +m.trail || 0;
        p.sp = snap(p.x, p.y, 80);
        p.sprint = !!m.s; p.nx = Array.isArray(m.nx) ? m.nx.filter((n) => Number.isInteger(n) && n >= 0 && n < G.N).slice(0, 4) : [];
      }
      break;
  }
}

/* ---------------- Côté invité : messages de l'hôte ---------------- */
function guestOnClose() {
  if (leaving) return;
  goMenu("L'hôte a quitté la partie.");
}
function guestOnData(m) {
  if (!m) return;
  switch (m.t) {
    case "welcome": myId = m.id; break;
    case "refused": leaving = true; goMenu(m.why === "full" ? "Cette partie est complète." : "Cette partie a déjà commencé."); leaving = false; break;
    case "lobby": {
      const prev = players; players = new Map();
      for (const q of m.players) players.set(q.id, Object.assign(prev.get(q.id) || { x: 0, y: 0, dir: 0, trail: 0 }, q));
      const mine = players.get(myId); if (mine && state === "loading" && myLoad.n) mine.load = { ...myLoad }; // ma progression locale est plus à jour
      const zChanged = JSON.stringify(m.zone) !== JSON.stringify(zone) || m.mode !== gameMode;
      zone = m.zone; gameMode = MODES[m.mode] ? m.mode : "survie";
      if (zChanged && state === "lobby") { showGuestZone(); schedulePrefetch(); }
      renderPlayers(); refreshRoleButtons();
      break;
    }
    case "load": zone = m.zone; startLoading(); break;
    case "role": enterRole(); break;
    case "toLobby": enterLobby(); break;
    case "start": startCountdown(m.setup); break;
    case "snap": applySnap(m); break;
    case "ev": handleEvent(m); break;
    case "over": showResults(m); break;
    case "cell": receiveCellPart(m, "host"); break;
  }
}
