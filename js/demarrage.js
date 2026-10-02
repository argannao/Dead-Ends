"use strict";
// Dead Ends · Démarrage : chargé en dernier, quand tout le reste est prêt

if (cartoKey) acceptKey(cartoKey); else askKey();

// Accès pour le débogage depuis la console
window.PZ = {
  get G() { return G; }, get game() { return game; }, get state() { return state; }, get players() { return players; }, get mode() { return gameMode; },
  get net() { return net; }, get myId() { return myId; }, CFG, ROLES, route, snap, computeField, followDrawn, toLL, fakeCity,
};

requestAnimationFrame(frame);
