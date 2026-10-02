# 🧟 Dead Ends

**Fuis. Choisis bien ta rue. Prie pour qu'elle ne soit pas une impasse.**

Dead Ends est un jeu de survie multijoueur qui se joue directement dans le navigateur, sur **de vraies rues** issues d'OpenStreetMap. L'hôte choisit un point de départ n'importe où dans le monde, un compte à rebours se lance… puis les zombies sortent du point zéro et te traquent à travers le vrai réseau routier.

▶️ **Jouer :** https://argannao.github.io/dead-ends/

---

## 🎮 Principe

1. L'hôte crée un salon, choisit un lieu et un mode de jeu.
2. Les joueurs rejoignent avec un **code de partie** et choisissent leur classe.
3. **3… 2… 1… GO !** Tout le monde s'enfuit.
4. Les zombies apparaissent au point de départ, puis par vagues depuis des points aléatoires annoncés quelques secondes à l'avance.
5. Ils suivent les rues comme toi. Une ruelle, un raccourci, un cul-de-sac : chaque choix compte.

## 🕹️ Contrôles

| Action | Commande |
|---|---|
| Se déplacer vers un point | Clic |
| Dessiner son itinéraire | **Shift** maintenu + glisser |
| Compétence de classe | **A** (ou bouton en bas de l'écran) |

## 🧍 Classes

| Classe | Compétence | Particularités |
|---|---|---|
| **Coureur** | *Rush* : 4 s de sprint sans fatigue | Vitesse +15 %, endurance −20 % |
| **Éclaireur** | *Drone* : révèle tous les zombies pendant 5 s | Vision 300 m, vitesse −5 % |
| **Fantôme** | *Planque* : 3 s immobile, puis les zombies perdent ta trace | Repéré de moins loin, sprint limité à 3 s |
| **Artificier** | *Pétard* : attire les zombies sur un point jusqu'à 250 m | Son sprint s'entend plus loin |
| **Saboteur** | *Barricade* : bloque une rue pendant 12 s (zombies et joueurs) | Vitesse −5 % |

## 🏁 Modes de jeu

| Mode | Joueurs | Objectif |
|---|---|---|
| Dernier survivant | 1+ | Être le dernier en vie |
| Extraction | 1+ | Atteindre le point d'évacuation (places limitées) |
| Patient zéro | 3+ | Humains : tenir 8 min · Patient zéro : tout infecter |
| Chasse au trésor | 1+ | Meilleur score en 6 min |
| Roi de la colline | 1+ | 120 points, ou le plus de points en 6 min |
| Escorte | 2+ | Amener son VIP à destination en premier |
| Zombies contre survivants | 2+ | Survivants : tenir 6 min · Maîtres : tout attraper |
| Tenir jusqu'à l'aube *(prototype)* | 1+ | Tenir 10 min, relever ses coéquipiers à terre |
| Course contre la montre *(prototype)* | 1+ | Meilleur temps sur un trajet, avec classement |
| Défi du jour *(prototype)* | 1+ | Même lieu et mêmes vagues pour tous, classement quotidien |

## ⚙️ Technique

- **Un seul fichier** `index.html`, aucun build, hébergé sur GitHub Pages
- **Carte :** [Leaflet](https://leafletjs.com/) + fond de carte [CARTO](https://carto.com/)
- **Rues :** [OpenStreetMap](https://www.openstreetmap.org/) via l'API Overpass, chargement par secteurs, requêtes parallèles sur plusieurs miroirs et cache local (IndexedDB, 30 jours)
- **Multijoueur :** pair-à-pair WebRTC via [PeerJS](https://peerjs.com/), l'hôte fait autorité, pas de serveur de jeu
- **Partage de carte :** chaque joueur télécharge une partie des secteurs et la partage aux autres
- **Classements :** Firebase Firestore (course contre la montre et défi du jour)

## 🔑 Clé CARTO

Chaque joueur utilise **sa propre clé CARTO gratuite** pour afficher le fond de carte. Un guide pas à pas est intégré au jeu au premier lancement.

## 🛠️ Héberger ta propre version

1. Fork le dépôt et active **GitHub Pages** sur la branche principale.
2. *(Optionnel, pour les classements)* crée un projet Firebase, active Firestore, colle ta config dans `index.html` et publie les règles du fichier `firestore.rules`.
3. C'est tout. Le reste du jeu fonctionne sans Firebase.

## 🐞 Debug

- `?local` dans l'URL simule plusieurs joueurs dans un même navigateur (BroadcastChannel, sans PeerJS).
- L'état du jeu est exposé dans la console via `window.PZ` (`PZ.G`, `PZ.game`, `PZ.state`, `PZ.players`, `PZ.net`, `PZ.CFG`, `PZ.ROLES`).

## 📜 Crédits

Données cartographiques © les contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), fonds de carte © [CARTO](https://carto.com/attributions).
