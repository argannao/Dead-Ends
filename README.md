# 🧟 Dead Ends

**Fuis. Choisis bien ta rue. Prie pour qu'elle ne soit pas une impasse.**

Dead Ends est un jeu de survie multijoueur qui se joue directement dans le navigateur, sur **de vraies rues** issues d'OpenStreetMap. L'hôte choisit un point de départ n'importe où dans le monde, un compte à rebours se lance… puis les zombies sortent du point zéro et te traquent à travers le vrai réseau routier.

▶️ **Jouer :** https://argannao.github.io/dead-ends/

---

## 🎮 Principe

1. L'hôte crée un salon, choisit un lieu et un mode de jeu.
2. Les joueurs rejoignent avec un **code de partie** (jusqu'à 8 joueurs), choisissent leur classe et, dans les modes en équipes, leur équipe.
3. **3… 2… 1… GO !** Tout le monde s'enfuit.
4. Les zombies apparaissent au point de départ, puis par vagues depuis des points aléatoires annoncés quelques secondes à l'avance.
5. Ils suivent les rues comme toi, se répartissent dans les rues parallèles pour t'encercler, et certains quadrillent le quartier. Une ruelle, un raccourci, un cul-de-sac : chaque choix compte.

## 🕹️ Contrôles

| Action | Commande |
|---|---|
| Se déplacer vers un point | Clic |
| Dessiner son itinéraire | **Shift** maintenu + glisser |
| Sprinter (bruyant : les zombies t'entendent de plus loin) | **Espace** |
| Compétence de classe | **A** (ou bouton en bas de l'écran) |
| Annuler une visée | **Échap** ou clic droit |

## 🧍 Classes

| Classe | Compétence (touche A) | Atout | Défaut |
|---|---|---|---|
| **Coureur** | *Rush* : 4 s de sprint sans fatigue | Vitesse +15 % | Endurance −20 % |
| **Éclaireur** | *Drone* : révèle tous les zombies pendant 5 s | Vision 300 m | — |
| **Fantôme** | *Planque* : 3 s immobile, même les zombies qui te traquent perdent ta trace | Repéré de moins loin, piste moins précise | Sprint limité à 3 s d'affilée |
| **Artificier** | *Pétard* : attire pendant 12 s tous les zombies proches, même ceux qui te chassent | Fait diversion | Son sprint s'entend 30 % plus loin |
| **Saboteur** | *Barricade* : bloque une rue pendant 12 s (zombies et joueurs) | Contrôle le terrain | — |
| **Endurant** | *Second souffle* : endurance pleine immédiatement | Endurance ×1,9, récupère 50 % plus vite | Vision 140 m |
| **Traceur** | *Raccourci* : traverse un pâté de maisons en ligne droite jusqu'à une rue à 90 m (recharge 20 s, +15 s à chaque usage) | Passe là où les autres ne passent pas | Endurance −15 % |
| **Increvable** | *Seconde chance* (passif) : une fois par partie, échappe à une capture et repousse les zombies proches | Survit à une capture | Endurance −25 % |
| **Charognard** | *Appât* : marque un joueur 15 s, les zombies le repèrent de plus loin et accélèrent de 20 % | Moins repéré quand un autre joueur est plus près des zombies | Vision 130 m |

## 🏁 Modes de jeu

| Mode | Joueurs | Objectif |
|---|---|---|
| Dernier survivant | 1+ | Être le dernier en vie |
| Extraction | 1+ | Rejoindre l'hélico : zone connue dès le départ, point exact 30 s avant l'atterrissage, places limitées |
| Patient zéro | 3+ | Humains : tenir 8 min · Patient zéro : tout infecter |
| Chasse au trésor | 1+ | Meilleur score en 6 min |
| Roi de la colline | 1+ | 120 points, ou le plus de points en 6 min |
| Escorte | 2+ | Équipe bleue contre équipe rouge : amener son VIP à destination en premier |
| Zombies contre survivants | 2+ | Survivants : tenir 6 min · Horde : tout attraper |
| Tenir jusqu'à l'aube *(prototype)* | 1+ | Tenir 10 min, relever ses coéquipiers à terre |
| Course contre la montre *(prototype)* | 1+ | Meilleur temps sur un trajet, avec classement |
| Sommet *(prototype)* | 1+ | Atteindre le premier le point le plus haut de la zone ; les montées ralentissent et épuisent, les descentes accélèrent |
| Défi du jour *(prototype)* | 1+ | Même lieu et mêmes vagues pour tous, classement quotidien |

Dans les modes en équipes, chacun choisit son camp avant la partie (ou « Hasard ») : Bleue ou Rouge en Escorte, Survivants ou Horde en Zombies contre survivants.

## 👤 Compte (optionnel)

Connexion Google en haut à droite pour garder ses statistiques, ajouter des amis avec un code ami, voir qui est en ligne et le rejoindre, et apparaître dans les classements.

## ⚙️ Technique

- **Aucun build** : HTML, CSS et JavaScript simples, hébergés sur GitHub Pages
- **Carte :** [Leaflet](https://leafletjs.com/) + fond de carte [CARTO](https://carto.com/)
- **Rues :** [OpenStreetMap](https://www.openstreetmap.org/) via l'API Overpass, chargement par secteurs, requêtes parallèles sur plusieurs miroirs et cache local (IndexedDB, 30 jours). Ponts et tunnels respectés : pas de passage d'une route à celle qui passe au-dessus.
- **Relief (mode Sommet) :** altitudes [Open-Meteo](https://open-meteo.com/) (modèle Copernicus 90 m), relief simulé si le service ne répond pas
- **Multijoueur :** pair-à-pair WebRTC via [PeerJS](https://peerjs.com/), l'hôte fait autorité, pas de serveur de jeu
- **Partage de carte :** chaque joueur télécharge une partie des secteurs et la partage aux autres
- **Comptes et classements :** Firebase (connexion Google, Firestore)

### Organisation des fichiers

```
index.html          structure de la page
css/style.css       tout le style
js/config.js        réglages, classes, compétences, modes  ← pour équilibrer le jeu
js/carte.js         fond de carte
js/chemins.js       graphe des rues, itinéraires, déplacements
js/relief.js        altitudes et pentes (mode Sommet)
js/reseau.js        multijoueur
js/salon.js         salon, chargement partagé, choix des classes et des équipes
js/partie.js        préparation d'une partie
js/zombies.js       IA des zombies, barricades
js/jeu.js           compétences, simulation, règles des modes
js/rendu.js         dessin des joueurs, zombies et repères
js/interface.js     HUD, boucle de jeu, commandes, choix du lieu
js/secteurs.js      téléchargement des rues, cache, partage entre joueurs
js/debut-fin.js     compte à rebours, écran de fin, classements
js/compte.js        clé CARTO, compte Google, amis
js/demarrage.js     lance le jeu une fois tout chargé
firestore.rules     règles de sécurité Firebase
```

Les fichiers sont appelés avec un numéro de version (`?v=3`) dans `index.html` : l'augmenter à chaque mise à jour force les navigateurs à recharger les nouveaux fichiers.

## 🔑 Clé CARTO

Chaque joueur utilise **sa propre clé CARTO gratuite** pour afficher le fond de carte. Un guide pas à pas est intégré au jeu au premier lancement.

## 🛠️ Héberger ta propre version

1. Fork le dépôt et active **GitHub Pages** sur la branche principale.
2. *(Optionnel, pour les comptes et classements)* crée un projet Firebase, active l'authentification Google et Firestore, colle ta config dans `js/compte.js` et publie les règles du fichier `firestore.rules`.
3. C'est tout. Le reste du jeu fonctionne sans Firebase.

## 🐞 Debug

- `?local` dans l'URL simule plusieurs joueurs dans un même navigateur (BroadcastChannel, sans PeerJS).
- `?vitesse=3` accélère le temps de jeu (tests).
- L'état du jeu est exposé dans la console via `window.PZ` (`PZ.G`, `PZ.game`, `PZ.state`, `PZ.players`, `PZ.net`, `PZ.CFG`, `PZ.ROLES`).

## 📜 Crédits

Données cartographiques © les contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), fonds de carte © [CARTO](https://carto.com/attributions), altitudes © [Open-Meteo](https://open-meteo.com/) / Copernicus DEM.
