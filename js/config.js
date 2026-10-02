"use strict";
// Dead Ends · Réglages, classes, compétences, modes de jeu

/* =====================================================================
   DEAD ENDS — prototype (solo et multijoueur)
   Carte : OpenStreetMap (tuiles CARTO), réseau routier via Overpass.
   ===================================================================== */

const CFG = {
  zombieDelay: 15,      // s avant la première vague
  waveEvery: 20,        // s entre deux vagues
  waveWarn: 5,          // s d'alerte avant une vague qui sort ailleurs
  spawnMin: 300,        // m : distance minimale (par les rues) entre toi et un point d'apparition
  spawnMax: 1100,       // m : distance maximale
  splitFrom: 4,         // à partir de cette vague, les zombies sortent de 2 points
  waveBase: 3,          // zombies dans la vague 1
  waveInc: 2,           // zombies en plus à chaque vague
  zSpeed: 4.2,          // m/s, vague 1
  zSpeedInc: 0.16,      // m/s gagnés par vague
  zSpeedMax: 7.4,
  runSpeed: 5.0,        // m/s, course normale
  sprintMul: 1.5,
  stamina: 100,
  drain: 24,            // par seconde de sprint
  regen: 11,            // par seconde sans sprint
  catchDist: 7,         // m
  vision: 170,          // m
  fieldEvery: 0.25,     // s entre deux recalculs du champ de poursuite
  // IA des zombies
  senseR: 220,          // m : distance à laquelle un zombie te repère
  senseSprint: 420,     // m : en sprint, tu fais du bruit et on te repère de plus loin
  alertTime: 4,         // s : quand un zombie te repère, il hurle et alerte la horde
  alertMul: 1.8,        //     pendant ce temps, les zombies te repèrent de 1,8 fois plus loin
  scentEvery: 4,        // s : les zombies qui ne te voient pas suivent ta piste, mise à jour toutes les 4 s
  scentSprint: 1.5,     //     (toutes les 1,5 s si tu sprintes)
  flankFrom: 2,         // à partir de cette vague, une partie des zombies sont des rabatteurs
  flankShare: 0.35,     // proportion de rabatteurs
  flankClose: 90,       // m : sous cette distance, un rabatteur fonce droit sur toi
  aheadDist: 160,       // m : un rabatteur vise le carrefour vers lequel tu cours, jusqu'à cette distance devant toi
  playZoom: 17,
  // Compétences et modes
  lureRange: 600,       // m : un pétard attire les zombies (qui ne poursuivent personne) dans ce rayon
  vipSpeed: 0.85,       // le VIP de l'escorte avance moins vite
  zPlayerSpeed: 6.4,    // m/s : vitesse d'un joueur infecté (patient zéro)
  goalR: 15,            // m : rayon des points d'arrivée (évacuation, destination, arrivée)
  extractAt: 150,       // s : ouverture de l'évacuation
  extractOpen: 60,      // s : durée d'ouverture
  patientTurn: 120,     // s : transformation du patient zéro
  patientEnd: 480,      // s : fin de l'épidémie (les humains restants gagnent)
  modeDur: 360,         // s : durée des modes Chasse au trésor, Roi de la colline, Zombies contre survivants
  crateR: 10,           // m : rayon de ramassage d'une caisse
  crateEvery: 8,        // s : réapparition d'une caisse
  hillR: 35,            // m : rayon de la colline
  hillMove: 90,         // s : la colline se déplace
  hillGoal: 120,        // points pour gagner tout de suite
  hillCall: 30,         // s : la colline attire la horde
  aubeDur: 600,         // s : durée de la nuit
  reviveTime: 3,        // s à côté d'un coéquipier à terre pour le relever
  reviveR: 12,          // m
  bleedOut: 60,         // s : un joueur à terre non relevé meurt
};
// Classes : un passif, une compétence (touche A) et un défaut
const ROLES = {
  coureur:    { name: "Coureur",    glyph: "C", speedMul: 1.15, vision: 170, stamina: 80,  regenMul: 1, skill: "rush",
                perk: "Vitesse +15 %", flaw: "Endurance −20 %" },
  eclaireur:  { name: "Éclaireur",  glyph: "É", speedMul: 1, vision: 300, stamina: 100, regenMul: 1, skill: "drone",
                perk: "Vision 300 m au lieu de 170 m", flaw: "" },
  fantome:    { name: "Fantôme",    glyph: "F", speedMul: 1,    vision: 170, stamina: 100, regenMul: 1, skill: "planque", senseMul: 0.6, scentMul: 2, sprintCap: 3,
                perk: "Repéré de moins loin, piste 2 fois moins précise", flaw: "Sprint limité à 3 s d'affilée" },
  artificier: { name: "Artificier", glyph: "A", speedMul: 1,    vision: 170, stamina: 100, regenMul: 1, skill: "petard", noiseMul: 1.3,
                perk: "Fait diversion avec ses pétards", flaw: "Son sprint s'entend 30 % plus loin" },
  saboteur:   { name: "Saboteur",   glyph: "S", speedMul: 1, vision: 170, stamina: 100, regenMul: 1, skill: "barricade",
                perk: "Contrôle le terrain", flaw: "" },
  endurant:   { name: "Endurant",   glyph: "E", speedMul: 1, vision: 140, stamina: 190, regenMul: 1.5, skill: "souffle",
                perk: "Endurance ×1,9, récupère 50 % plus vite", flaw: "Vision 140 m" },
  traceur:    { name: "Traceur",    glyph: "T", speedMul: 1, vision: 170, stamina: 85, regenMul: 1, skill: "raccourci",
                perk: "Passe là où les autres ne passent pas", flaw: "Endurance −15 %" },
  increvable: { name: "Increvable", glyph: "I", speedMul: 1, vision: 170, stamina: 75, regenMul: 1, skill: null,
                passive: { name: "Seconde chance", desc: "une fois par partie, échappe à une capture et repousse les zombies proches" },
                perk: "Survit à une capture", flaw: "Endurance −25 %" },
  charognard: { name: "Charognard", glyph: "R", speedMul: 1, vision: 130, stamina: 100, regenMul: 1, skill: "appat",
                perk: "Moins repéré quand un autre joueur est plus près des zombies (multijoueur)", flaw: "Vision 130 m" },
};
const SKILLS = {
  rush:      { name: "Rush",      cd: 30, dur: 4,  desc: "4 s de sprint sans fatigue" },
  drone:     { name: "Drone",     cd: 40, dur: 5,  desc: "Voit tous les zombies pendant 5 s" },
  planque:   { name: "Planque",   cd: 35, dur: 3,  desc: "3 s immobile : même ceux qui te traquent perdent ta trace" },
  petard:    { name: "Pétard",    cd: 30, dur: 6,  range: 250, target: true, desc: "Attire tous les zombies proches, même ceux qui te chassent" },
  barricade: { name: "Barricade", cd: 35, dur: 12, range: 150, target: true, desc: "Bloque une rue pendant 12 s" },
  cri:       { name: "Cri",       cd: 20, dur: 4,  desc: "Ta horde accélère de 40 % pendant 4 s" },
  souffle:   { name: "Second souffle", cd: 40, dur: 0, desc: "Endurance pleine immédiatement" },
  raccourci: { name: "Raccourci", cd: 25, dur: 0,  range: 90, target: true, desc: "Traverse un pâté de maisons en ligne droite jusqu'à une rue à 90 m" },
  appat:     { name: "Appât",     cd: 45, dur: 6,  range: 200, target: true, desc: "Marque un joueur : les zombies le repèrent de plus loin pendant 6 s" },
};
// Modes de jeu (les prototypes sont jouables mais encore à équilibrer)
const MODES = {
  survie:     { name: "Dernier survivant", min: 1, desc: "Tout le monde part du point zéro. Le dernier en vie gagne." },
  extraction: { name: "Extraction", min: 1, desc: "Après 2 min 30, une évacuation s'ouvre 60 s quelque part. Seuls les premiers arrivés sont sauvés (1 place pour 2 joueurs)." },
  patient:    { name: "Patient zéro", min: 3, desc: "Un joueur est infecté en secret et se transforme après 2 min. Chaque victime rejoint son camp. Les humains gagnent s'ils tiennent 8 min." },
  tresor:     { name: "Chasse au trésor", min: 1, score: true, desc: "Ramasse les caisses : points et bonus. Meilleur score en 6 min. Mourir coûte la moitié de tes points." },
  colline:    { name: "Roi de la colline", min: 1, score: true, desc: "Marque des points en restant seul dans la zone. Elle se déplace et attire la horde. 120 points ou 6 min." },
  escorte:    { name: "Escorte", min: 2, team: true, desc: "Deux équipes, un VIP chacune (plus lent). Le premier VIP arrivé à sa destination fait gagner son équipe." },
  horde:      { name: "Zombies contre survivants", min: 2, team: true, desc: "Un ou deux joueurs dirigent la horde (clic pour la guider, A pour hurler). Les survivants doivent tenir 6 min." },
  aube:       { name: "Tenir jusqu'à l'aube", min: 1, proto: true, coop: true, desc: "10 min de nuit qui s'éclaircit. Un joueur attrapé tombe à terre : reste 3 s près de lui pour le relever. Si quelqu'un tient jusqu'à l'aube, tout le monde gagne." },
  course:     { name: "Course contre la montre", min: 1, proto: true, desc: "Rejoins l'arrivée le plus vite possible, horde aux trousses. Meilleurs temps enregistrés pour chaque trajet." },
  defi:       { name: "Défi du jour", min: 1, proto: true, desc: "Même lieu et mêmes vagues pour tout le monde aujourd'hui. Survis le plus longtemps : classement du jour." },
};
const TEAMS = [{ name: "bleue", color: "#5ec8f2" }, { name: "orange", color: "#ff9e3d" }];
// Lieux du défi du jour (un par jour, à tour de rôle)
const DAILY_SPOTS = [
  ["Paris · Le Marais", 48.8575, 2.3590], ["Lyon · Presqu'île", 45.7640, 4.8357], ["Marseille · Vieux-Port", 43.2951, 5.3740],
  ["Bordeaux · Saint-Pierre", 44.8412, -0.5720], ["Nantes · Bouffay", 47.2140, -1.5530], ["Toulouse · Capitole", 43.6045, 1.4440],
  ["Lille · Vieux-Lille", 50.6400, 3.0630], ["Strasbourg · Grande Île", 48.5818, 7.7507], ["Rennes · centre", 48.1114, -1.6800],
  ["Montpellier · Écusson", 43.6108, 3.8767], ["Nice · Vieux-Nice", 43.6966, 7.2760], ["La Roche-sur-Yon · centre", 46.6705, -1.4260],
  ["Angers · centre", 47.4710, -0.5518], ["Tours · Vieux-Tours", 47.3941, 0.6848], ["Dijon · centre", 47.3220, 5.0415],
  ["Rouen · centre", 49.4425, 1.0930], ["Grenoble · centre", 45.1885, 5.7245], ["Clermont-Ferrand · centre", 45.7772, 3.0870],
  ["Reims · centre", 49.2583, 4.0317], ["Le Mans · Cité Plantagenêt", 48.0080, 0.1980], ["Orléans · centre", 47.9025, 1.9090],
  ["Caen · centre", 49.1829, -0.3707], ["Brest · Siam", 48.3904, -4.4861], ["Avignon · intra-muros", 43.9493, 4.8055],
  ["La Rochelle · Vieux-Port", 46.1591, -1.1520],
];
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const HIGHWAYS = "trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|pedestrian|footway|path|cycleway|track|steps|road";

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = (id) => document.getElementById(id);
const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
// Cartes de classes (générées depuis ROLES et SKILLS)
$("roleList").innerHTML = Object.entries(ROLES).map(([k, R], i) => `<label class="role"><input type="radio" name="role" value="${k}"${i === 0 ? " checked" : ""}>
  <span class="glyph">${R.glyph}</span>
  <span class="rtxt"><span class="name">${R.name}</span>
  <span class="perk">${R.skill ? `<b>${SKILLS[R.skill].name}</b> · ${SKILLS[R.skill].desc} <i>(${SKILLS[R.skill].cd} s)</i>` : `<b>${R.passive.name}</b> · ${R.passive.desc} <i>(passif)</i>`}</span>
  <span class="perk2"><span class="plus">+</span> ${R.perk}${R.flaw ? ` <span class="minus">−</span> ${R.flaw}` : ""}</span></span></label>`).join("");
