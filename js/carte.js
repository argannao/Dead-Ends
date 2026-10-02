"use strict";
// Dead Ends · Fond de carte Leaflet

/* ---------------- Carte ---------------- */
const map = L.map("map", { zoomControl: true, boxZoom: false, preferCanvas: true, worldCopyJump: true })
  .setView([46.6, 2.4], 6);
// Fond de carte CARTO : chaque joueur utilise sa propre clé (gratuite), gardée dans son navigateur.
const KEY_STORE = "deadends.cartoKey";
let cartoKey = ""; try { cartoKey = localStorage.getItem(KEY_STORE) || localStorage.getItem("pointzero.cartoKey") || ""; } catch {}
let baseLayer = null, tileOk = 0, tileErr = 0;
function setBaseMap(key) {
  if (baseLayer) baseLayer.remove();
  tileOk = 0; tileErr = 0;
  baseLayer = L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  baseLayer.on("tileload", () => tileOk++);
  baseLayer.on("tileerror", () => {
    if (++tileErr >= 4 && tileOk === 0) keyStatus("La carte ne se charge pas avec cette clé. Vérifie-la ou change-la.", "err");
  });
}
map.zoomControl.setPosition("topright");

let pickMarker = null, zoneCircle = null, roadsLayer = null;
let picked = null;          // {lat, lon}
let G = null;               // graphe routier
let state = "key";          // key | menu | lobby | loading | role | countdown | play | over
