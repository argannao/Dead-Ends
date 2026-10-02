"use strict";
// Dead Ends · Clé CARTO, compte Google, amis, présence, démarrage

/* ---------------- Clé CARTO ---------------- */
function keyStatus(t, cls) { const s = $("keyStatus"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); if (state === "menu" && cls === "err") askKey(); }
function maskKey(k) { return k.length > 6 ? "••••" + k.slice(-4) : "••••"; }
function askKey() { state = "key"; showStep("stepKey"); $("keyInput").value = cartoKey; $("keyInput").focus(); }
function acceptKey(k) {
  cartoKey = k; try { localStorage.setItem(KEY_STORE, k); } catch {}
  cloudSaveKey(k);
  setBaseMap(k);
  $("keyInfo").innerHTML = `Clé CARTO : <b>${maskKey(k)}</b>`;
  keyStatus("");
  goMenu();
}
$("keyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const k = $("keyInput").value.trim();
  if (k.length < 8 || /\s/.test(k)) { keyStatus("Cette clé semble incomplète. Copie-la en entier depuis le site de CARTO.", "err"); return; }
  acceptKey(k);
});
$("changeKeyBtn").addEventListener("click", askKey);
if (/^https?:$/.test(location.protocol) && location.hostname) $("refText").textContent = location.hostname;
else { $("refLabel").hidden = true; $("refRow").hidden = true; }
document.querySelectorAll(".copy").forEach((btn) => btn.addEventListener("click", async () => {
  const el = $(btn.dataset.copy); const txt = el.textContent;
  try { await navigator.clipboard.writeText(txt); btn.textContent = "Copié"; btn.classList.add("done"); setTimeout(() => { btn.textContent = "Copier"; btn.classList.remove("done"); }, 1500); }
  catch { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
}));
$("pasteBtn").addEventListener("click", async () => {
  try { const t = (await navigator.clipboard.readText()).trim(); if (t) { $("keyInput").value = t; keyStatus(""); } }
  catch { $("keyInput").focus(); keyStatus("Ton navigateur bloque le collage automatique : fais Ctrl+V dans le champ.", "err"); }
});

/* =====================================================================
   COMPTES (Firebase : connexion Google + base Firestore)
   Progression (statistiques, pseudo, clé CARTO) et liste d'amis avec présence en ligne.
   Tant que FIREBASE_CONFIG n'est pas rempli, le jeu marche normalement, sans comptes.
   ===================================================================== */
// Configuration du projet Firebase « dead-ends » (Paramètres du projet > Vos applications). Ces valeurs sont publiques.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAddb1nQp2TnFu3mxXG1Bp6aDrthwj-yzo",
  authDomain: "dead-ends-f7189.firebaseapp.com",
  projectId: "dead-ends-f7189",
  storageBucket: "dead-ends-f7189.firebasestorage.app",
  messagingSenderId: "364965478054",
  appId: "1:364965478054:web:87aba238d56ead45e13e67",
};
const FB_VER = "10.12.2";
const ONLINE_MS = 150000;     // un ami est « en ligne » s'il a donné signe de vie il y a moins de 2 min 30
const HEARTBEAT_MS = 60000;
const Cloud = {
  on: false, auth: null, db: null, user: null, profile: null,
  links: new Map(),      // uid de l'autre -> { id, status: "pending"|"accepted", requester }
  friends: new Map(),    // uid -> profil public (nom, photo, présence)
  unsubs: [], friendUnsubs: new Map(), lastPresence: "", lastBeat: 0,
};
const cloudUid = () => (Cloud.user ? Cloud.user.uid : null);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("script " + src)); document.head.appendChild(s); });
}
async function cloudInit() {
  renderAccount();
  if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    await loadScript(base + "firebase-app-compat.js");
    await Promise.all([loadScript(base + "firebase-auth-compat.js"), loadScript(base + "firebase-firestore-compat.js")]);
    firebase.initializeApp(FIREBASE_CONFIG);
    Cloud.auth = firebase.auth(); Cloud.db = firebase.firestore(); Cloud.on = true;
    Cloud.auth.onAuthStateChanged((u) => onCloudUser(u).catch((e) => { console.warn("Compte", e); acctStatus("Impossible de charger ton profil. Vérifie ta connexion.", "err"); }));
  } catch (e) {
    console.warn("Firebase", e); acctStatus("Le service de comptes ne répond pas. Le jeu reste jouable sans compte.", "err");
  }
  renderAccount();
}
const FV = () => firebase.firestore.FieldValue;
const userRef = (uid) => Cloud.db.collection("users").doc(uid);
const pairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
function makeFriendCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += A[(Math.random() * A.length) | 0]; return s; }

async function onCloudUser(u) {
  // nettoyage de la session précédente
  Cloud.unsubs.forEach((f) => f()); Cloud.unsubs = [];
  Cloud.friendUnsubs.forEach((f) => f()); Cloud.friendUnsubs.clear();
  Cloud.links.clear(); Cloud.friends.clear(); Cloud.profile = null; Cloud.lastPresence = "";
  Cloud.user = u || null;
  if (!u) { renderAccount(); pushLobby(); return; }
  acctStatus("");
  // profil : création au premier passage
  const ref = userRef(u.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const first = (u.displayName || "").split(" ")[0];
    await ref.set({
      name: cleanName(myName || first || "Joueur"), photo: u.photoURL || "", friendCode: makeFriendCode(),
      createdAt: FV().serverTimestamp(), lastSeen: FV().serverTimestamp(), status: "menu", party: null,
      stats: { games: 0, wins: 0, multiGames: 0, bestTime: 0, totalTime: 0, totalDist: 0, bestWave: 0 },
    });
  } else if (u.photoURL && snap.data().photo !== u.photoURL) ref.update({ photo: u.photoURL });
  Cloud.unsubs.push(ref.onSnapshot((d) => {
    const first = !Cloud.profile;
    Cloud.profile = d.data({ serverTimestamps: "estimate" }) || null;
    if (first && Cloud.profile) onProfileLoaded();
    renderAccount();
  }));
  // amitiés (demandes et amis)
  Cloud.unsubs.push(Cloud.db.collection("friendships").where("members", "array-contains", u.uid).onSnapshot((qs) => {
    const seen = new Set();
    qs.forEach((d) => {
      const f = d.data(); const other = f.members.find((m) => m !== u.uid); if (!other) return;
      seen.add(other); Cloud.links.set(other, { id: d.id, status: f.status, requester: f.requester });
      if (!Cloud.friendUnsubs.has(other)) {
        Cloud.friendUnsubs.set(other, userRef(other).onSnapshot((p) => {
          if (p.exists) Cloud.friends.set(other, p.data({ serverTimestamps: "estimate" }));
          renderAccount();
        }, () => {}));
      }
    });
    for (const k of [...Cloud.links.keys()]) if (!seen.has(k)) {
      Cloud.links.delete(k); Cloud.friends.delete(k);
      const f = Cloud.friendUnsubs.get(k); if (f) f(); Cloud.friendUnsubs.delete(k);
    }
    renderAccount(); pushLobby();
  }, (e) => console.warn("Amis", e)));
  // clé CARTO synchronisée entre tes appareils
  const priv = userRef(u.uid).collection("private").doc("settings");
  try {
    const ps = await priv.get(); const remoteKey = ps.exists ? ps.data().cartoKey : "";
    if (remoteKey && !cartoKey) acceptKey(remoteKey);
    else if (cartoKey && cartoKey !== remoteKey) priv.set({ cartoKey }, { merge: true });
  } catch (e) { console.warn("Réglages", e); }
  // un invité déjà dans un salon signale son compte à l'hôte (pour les boutons « + Ami »)
  if (net && !isHost) toHost({ t: "hello", name: myName, uid: u.uid });
  pushLobby(); presenceTick(true);
}
function onProfileLoaded() {
  const p = Cloud.profile;
  if (p.name) { myName = p.name; try { localStorage.setItem(NAME_STORE, myName); } catch {} if (state === "menu") $("nameInput").value = myName; }
  // record local d'avant la connexion
  let best = 0; try { best = +localStorage.getItem("deadends.best") || 0; } catch {}
  if (best > ((p.stats && p.stats.bestTime) || 0)) userRef(cloudUid()).update({ "stats.bestTime": best });
}
async function cloudSignIn() {
  if (!Cloud.on) return;
  acctStatus("Connexion…");
  try { await Cloud.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); acctStatus(""); }
  catch (e) {
    const c = e && e.code;
    acctStatus(c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request" ? ""
      : c === "auth/popup-blocked" ? "Ton navigateur a bloqué la fenêtre de connexion. Autorise les fenêtres pour ce site et réessaie."
      : c === "auth/unauthorized-domain" ? "Ce site n'est pas autorisé dans Firebase : ajoute son domaine dans Authentication > Settings > Authorized domains."
      : c === "auth/operation-not-allowed" ? "La connexion Google n'est pas activée dans Firebase (Authentication > Sign-in method)."
      : "La connexion a échoué. Réessaie dans un instant.", "err");
  }
}
async function cloudSignOut() {
  if (!Cloud.on || !Cloud.user) return;
  try { await userRef(Cloud.user.uid).update({ status: "offline", party: null }); } catch {}
  await Cloud.auth.signOut();
}

/* ---------- Progression ---------- */
function cloudSaveName(name) { if (Cloud.user && Cloud.profile && Cloud.profile.name !== name) userRef(Cloud.user.uid).update({ name }); }
function cloudSaveKey(k) { if (Cloud.user) userRef(Cloud.user.uid).collection("private").doc("settings").set({ cartoKey: k }, { merge: true }).catch(() => {}); }
function cloudRecordGame(r) {
  if (!Cloud.user || !Cloud.profile) return;
  const st = Cloud.profile.stats || {}; const inc = FV().increment;
  const upd = {
    "stats.games": inc(1), "stats.totalTime": inc(Math.round(r.time * 10) / 10), "stats.totalDist": inc(Math.round(r.dist)),
    "stats.multiGames": inc(r.multi ? 1 : 0), "stats.wins": inc(r.won ? 1 : 0),
  };
  if (r.time > (st.bestTime || 0)) upd["stats.bestTime"] = Math.round(r.time * 10) / 10;
  if (r.wave > (st.bestWave || 0)) upd["stats.bestWave"] = r.wave;
  userRef(Cloud.user.uid).update(upd).catch((e) => console.warn("Stats", e));
}

/* ---------- Classements (modes prototypes) ---------- */
const boardName = () => cleanName((Cloud.profile && Cloud.profile.name) || myName || "Joueur");
async function cloudSubmitRoute(key, time) {
  if (!Cloud.user) return;
  const ref = Cloud.db.collection("routes").doc(key).collection("times").doc(Cloud.user.uid);
  const s = await ref.get(); if (s.exists && s.data().time <= time) return; // on garde le meilleur temps
  await ref.set({ name: boardName(), time: Math.round(time * 10) / 10, at: FV().serverTimestamp() });
}
async function cloudTopRoute(key) {
  const qs = await Cloud.db.collection("routes").doc(key).collection("times").orderBy("time").limit(10).get();
  return qs.docs.map((d) => ({ uid: d.id, ...d.data() }));
}
async function cloudSubmitDaily(day, time, wave) {
  if (!Cloud.user) return;
  const ref = Cloud.db.collection("daily").doc(day).collection("scores").doc(Cloud.user.uid);
  const s = await ref.get(); if (s.exists && s.data().time >= time) return;
  await ref.set({ name: boardName(), time: Math.round(time * 10) / 10, wave: wave || 0, at: FV().serverTimestamp() });
}
async function cloudTopDaily(day) {
  const qs = await Cloud.db.collection("daily").doc(day).collection("scores").orderBy("time", "desc").limit(10).get();
  return qs.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* ---------- Présence (pour que tes amis voient si tu es en ligne et puissent te rejoindre) ---------- */
function presenceNow() {
  if (state === "play" || state === "countdown") return { status: net ? "playing" : "solo", party: null };
  if (net && isHost) return { status: "host", party: { code: net.code, open: state === "lobby", n: players.size } };
  if (net) return { status: "party", party: null };
  if (["lobby", "loading", "role", "over"].includes(state)) return { status: "solo", party: null };
  return { status: "menu", party: null };
}
function presenceTick(force) {
  if (!Cloud.user) return;
  const p = presenceNow(); const sig = JSON.stringify(p);
  const now = Date.now();
  if (!force && sig === Cloud.lastPresence && now - Cloud.lastBeat < HEARTBEAT_MS) return;
  Cloud.lastPresence = sig; Cloud.lastBeat = now;
  userRef(Cloud.user.uid).update({ status: p.status, party: p.party, lastSeen: FV().serverTimestamp() }).catch(() => {});
}
setInterval(() => {
  presenceTick(false);
  $("acct").hidden = state === "play" || state === "countdown";
}, 1000);
setInterval(() => { if (Cloud.friends.size) renderAccount(); }, 30000); // l'état « en ligne » vieillit
window.addEventListener("beforeunload", () => { if (Cloud.user) userRef(Cloud.user.uid).update({ status: "offline", party: null }); });

/* ---------- Amis ---------- */
async function addFriendByCode(code) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) { friendStatus("Un code ami fait 6 caractères.", "err"); return; }
  if (Cloud.profile && code === Cloud.profile.friendCode) { friendStatus("C'est ton propre code.", "err"); return; }
  friendStatus("Recherche…");
  try {
    const qs = await Cloud.db.collection("users").where("friendCode", "==", code).limit(1).get();
    if (qs.empty) { friendStatus("Aucun joueur avec ce code.", "err"); return; }
    await requestFriend(qs.docs[0].id, qs.docs[0].data().name);
    $("friendInput").value = "";
  } catch (e) { console.warn(e); friendStatus("Impossible d'envoyer la demande. Réessaie.", "err"); }
}
async function requestFriend(uid, name) {
  const me_ = cloudUid(); if (!me_ || uid === me_) return;
  const ref = Cloud.db.collection("friendships").doc(pairId(me_, uid));
  const ex = await ref.get();
  if (ex.exists) {
    const f = ex.data();
    if (f.status === "accepted") { friendStatus(`${name || "Ce joueur"} est déjà dans tes amis.`); return; }
    if (f.requester !== me_) { await ref.update({ status: "accepted", acceptedAt: FV().serverTimestamp() }); friendStatus(`Tu es maintenant ami avec ${name || "ce joueur"}.`, "good"); return; }
    friendStatus(`Demande déjà envoyée à ${name || "ce joueur"}.`); return;
  }
  await ref.set({ members: [me_, uid].sort(), requester: me_, status: "pending", at: FV().serverTimestamp() });
  friendStatus(`Demande envoyée à ${name || "ce joueur"}.`, "good");
}
function acceptFriend(uid) { const l = Cloud.links.get(uid); if (l) Cloud.db.collection("friendships").doc(l.id).update({ status: "accepted", acceptedAt: FV().serverTimestamp() }); }
function removeFriend(uid) { const l = Cloud.links.get(uid); if (l) Cloud.db.collection("friendships").doc(l.id).delete(); }
function relationTo(uid) {
  const l = Cloud.links.get(uid); if (!l) return null;
  if (l.status === "accepted") return "friend";
  return l.requester === cloudUid() ? "out" : "in";
}
function isOnline(p) {
  if (!p || p.status === "offline" || !p.lastSeen) return false;
  const t = p.lastSeen.toMillis ? p.lastSeen.toMillis() : 0;
  return Date.now() - t < ONLINE_MS;
}
const STATUS_TXT = { menu: "En ligne", host: "Héberge une partie", party: "Dans un salon", playing: "En pleine partie", solo: "Joue en solo" };

/* ---------- Affichage ---------- */
let acctMsg = { t: "", c: "" }, friendMsg = { t: "", c: "" };
function acctStatus(t, c) { acctMsg = { t, c: c || "" }; renderAccount(); }
function friendStatus(t, c) { friendMsg = { t, c: c || "" }; renderAccount(); }
function avatarHtml(name, photo, color) {
  if (photo) return `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`;
  return `<span style="background:${color || "var(--line)"}">${esc((name || "?").slice(0, 1).toUpperCase())}</span>`;
}
function renderAccount() {
  const signed = !!(Cloud.user && Cloud.profile);
  const p = Cloud.profile || {};
  const incoming = [...Cloud.links.entries()].filter(([u, l]) => l.status === "pending" && l.requester !== cloudUid());
  // bouton
  $("acctAv").innerHTML = signed ? avatarHtml(p.name, p.photo) : "";
  $("acctAv").hidden = !signed;
  $("acctLabel").textContent = signed ? p.name : Cloud.user ? "Chargement…" : "Se connecter";
  const onlineFriends = [...Cloud.links.entries()].filter(([u, l]) => l.status === "accepted" && isOnline(Cloud.friends.get(u))).length;
  $("acctBadge").hidden = !incoming.length; $("acctBadge").textContent = String(incoming.length);
  $("acctOnline").hidden = !signed || !onlineFriends || !!incoming.length; $("acctOnline").textContent = String(onlineFriends);
  // panneau
  $("acctOut").hidden = signed; $("acctIn").hidden = !signed;
  $("acctOff").hidden = Cloud.on || !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);
  $("googleBtn").hidden = !Cloud.on;
  $("acctMsg").textContent = acctMsg.t; $("acctMsg").className = "status" + (acctMsg.c ? " " + acctMsg.c : "");
  if (!signed) return;
  $("meAv").innerHTML = avatarHtml(p.name, p.photo);
  $("meName").textContent = p.name;
  const s = p.stats || {};
  $("stGames").textContent = String(s.games || 0);
  $("stWins").textContent = `${s.wins || 0}${s.multiGames ? ` / ${s.multiGames}` : ""}`;
  $("stBest").textContent = fmtTime(s.bestTime || 0);
  $("stDist").textContent = fmtDist(s.totalDist || 0);
  $("stWave").textContent = String(s.bestWave || 0);
  $("stTime").textContent = fmtLong(s.totalTime || 0);
  $("friendCode").textContent = p.friendCode || "------";
  $("friendMsg").textContent = friendMsg.t; $("friendMsg").className = "status" + (friendMsg.c ? " " + friendMsg.c : "");
  // demandes et amis
  const req = $("reqList"); req.innerHTML = "";
  const fl = $("friendList"); fl.innerHTML = "";
  const rows = [...Cloud.links.entries()].map(([u, l]) => ({ uid: u, l, f: Cloud.friends.get(u) || {} }));
  const pend = rows.filter((r) => r.l.status === "pending");
  $("reqBox").hidden = !pend.length;
  for (const r of pend) {
    const li = document.createElement("li");
    const inc = r.l.requester !== cloudUid();
    li.innerHTML = `<span class="fav">${avatarHtml(r.f.name, r.f.photo)}</span>
      <span class="fname">${esc(r.f.name || "…")}<span class="fst">${inc ? "veut devenir ton ami" : "demande envoyée"}</span></span>
      <span class="facts">${inc ? `<button class="mini ok" data-act="accept" data-uid="${r.uid}">Accepter</button>` : ""}<button class="mini" data-act="remove" data-uid="${r.uid}">${inc ? "Refuser" : "Annuler"}</button></span>`;
    req.appendChild(li);
  }
  const acc = rows.filter((r) => r.l.status === "accepted")
    .sort((a, b) => (isOnline(b.f) - isOnline(a.f)) || String(a.f.name || "").localeCompare(String(b.f.name || "")));
  $("friendCount").textContent = acc.length ? `(${acc.filter((r) => isOnline(r.f)).length} en ligne sur ${acc.length})` : "";
  $("noFriends").hidden = !!acc.length;
  for (const r of acc) {
    const on = isOnline(r.f);
    const party = on && r.f.status === "host" && r.f.party && r.f.party.open ? r.f.party : null;
    const li = document.createElement("li"); li.className = on ? "on" : "";
    li.innerHTML = `<span class="fav">${avatarHtml(r.f.name, r.f.photo)}<i class="fdot"></i></span>
      <span class="fname">${esc(r.f.name || "…")}<span class="fst">${on ? (party ? `Héberge une partie · ${party.n || 1} joueur${(party.n || 1) > 1 ? "s" : ""}` : STATUS_TXT[r.f.status] || "En ligne") : "Hors ligne"}</span></span>
      <span class="facts">${party ? `<button class="mini join" data-act="join" data-code="${esc(party.code)}" ${state === "menu" ? "" : "disabled title=\"Reviens au menu pour rejoindre\""}>Rejoindre</button>` : ""}
      <button class="mini x" data-act="unfriend" data-uid="${r.uid}" aria-label="Retirer ${esc(r.f.name || "")} de tes amis" title="Retirer de tes amis">✕</button></span>`;
    fl.appendChild(li);
  }
}
const fmtLong = (t) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };

/* ---------- Évènements du panneau ---------- */
$("acctBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const open = $("acctMenu").hidden; $("acctMenu").hidden = !open; $("acctBtn").setAttribute("aria-expanded", String(open));
  if (open) { friendMsg = { t: "", c: "" }; renderAccount(); }
});
document.addEventListener("pointerdown", (e) => { if (!$("acct").contains(e.target)) { $("acctMenu").hidden = true; $("acctBtn").setAttribute("aria-expanded", "false"); } }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("acctMenu").hidden = true; });
$("googleBtn").addEventListener("click", cloudSignIn);
$("signOutBtn").addEventListener("click", cloudSignOut);
$("friendForm").addEventListener("submit", (e) => { e.preventDefault(); addFriendByCode($("friendInput").value); });
$("acctMenu").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const uid = b.dataset.uid;
  if (b.dataset.act === "accept") acceptFriend(uid);
  else if (b.dataset.act === "remove") removeFriend(uid);
  else if (b.dataset.act === "unfriend") {
    if (b.dataset.confirm) removeFriend(uid);
    else { b.dataset.confirm = "1"; b.textContent = "Retirer ?"; b.classList.add("warn"); setTimeout(() => renderAccount(), 3000); }
  } else if (b.dataset.act === "join" && state === "menu") { $("acctMenu").hidden = true; startJoin(b.dataset.code); }
});
// « + Ami » dans la liste des joueurs du salon
$("plist").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-addf]"); if (!b) return;
  b.disabled = true; b.textContent = "Envoyée";
  requestFriend(b.dataset.addf, b.dataset.name).catch(() => { b.disabled = false; b.textContent = "+ Ami"; });
});
cloudInit();
