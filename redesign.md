## 1. CARTES ET CONTENEURS (CARDS)
L'interface doit abandonner le design plat et angulaire au profit d'une architecture par cartes détachées.

* **Border-Radius :** * Composants majeurs (Sidebar, Zones de graphiques) : `24px`.
    * Cartes de données (Watchlist, Métriques) : `16px`.
    * Boutons et Inputs : `8px` à `12px`.
* **Bordures :** Suppression des séparateurs pleins. Utilisation exclusive de bordures ultra-fines et translucides : `border: 1px solid rgba(255, 255, 255, 0.05)`.
* **Élévation & Fond :** Le fond principal de la page (`body`) doit être légèrement plus sombre que le fond des cartes (`cards`). L'élévation est simulée par un fond plus clair au survol (`:hover`) ou une ombre interne subtile (inner glow), jamais par des ombres portées (drop shadows) agressives.

## 2. SÉMANTIQUE DES COULEURS
La palette existante (Fond sombre, Accents Cyan/Orange) est conservée, mais son application est drastiquement restreinte.

* **Couleurs Sémantiques (Rouge/Vert) :** Strictement réservées aux données numériques de performance (variations, PnL). Interdiction absolue d'appliquer ces couleurs sur des bordures de cartes, des fonds, ou des textes qualitatifs (ex: indicateur "LOW" dans le calendrier).
* **Couleurs d'Accentuation (Orange/Cyan) :** Réservées aux éléments d'interaction primaires (Call to Action, Checkbox active, Ligne de graphique principale). 
* **Suppression du Bruit :** Retrait total des effets de "glow" fluo derrière les conteneurs (l'effet "Gamer").

## 3. TYPOGRAPHIE ET ESPACEMENTS (PADDING/MARGIN)
La lisibilité des données denses est la priorité. Les polices Space Grotesk / Space Mono sont conservées.

* **Hiérarchie Clé/Valeur :** Contraste obligatoire entre les labels et les données.
    * *Labels (ex: Market Cap) :* Couleur grise/atténuée (`color: rgba(255,255,255,0.6)`), potentiellement en majuscules avec un `letter-spacing` (tracking) de `0.05em`. Taille de police légèrement inférieure.
    * *Valeurs (ex: 4.83T) :* Blanc pur (`#FFFFFF`), graisse supérieure (`font-weight: 500` ou `700`).
* **Respiration (Densité) :** Augmentation du `padding` interne des cellules de tableaux et des cartes. Un minimum de `16px` à `24px` de padding interne pour chaque carte macro. Augmentation du `line-height` à `1.5` ou `1.6` pour les listes.
* **États Vides (Empty States) :** Remplacement des mentions "N/A" agressives par un tiret cadratin (`—`) avec une opacité réduite à 30%.

## 4. GRAPHIQUES ET VISUALISATION (DATA VIZ)
Les graphiques doivent s'intégrer au design comme des objets physiques, sans créer de surcharge cognitive.

* **Graphiques de Répartition (> 5 éléments) :** Interdiction des Pie Charts (Camemberts) pour les portefeuilles denses. Remplacement obligatoire par des Treemaps ou des graphiques en barres horizontales triés par ordre décroissant.
* **Graphiques Linéaires (Séries Temporelles) :** Éviter l'effet "spaghetti". Si plus de 4 lignes se croisent (ex: indices Forex), implémenter une hiérarchie visuelle stricte : opacité réduite sur les lignes secondaires, et mise en surbrillance (focus) uniquement au survol de la souris.
* **Intégration :** Chaque graphique ne flotte pas dans le vide. Il est encapsulé dans une carte avec un fond propre et un padding périphérique.