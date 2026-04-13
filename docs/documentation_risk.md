# Documentation - Moteur de Gestion des Risques (Monte Carlo)

Ce dossier contient le moteur d'évaluation des risques et de simulation stochastique (`Risk Management`) de CAPITALIS V2. Son rôle est d'analyser le portefeuille cible généré par le moteur d'allocation, de simuler son comportement futur sous des milliers de scénarios probabilistes, et de quantifier l'exposition aux risques extrêmes (Tail Risk).

## Architecture et Méthodologie

L'approche repose sur des méthodes quantitatives de simulation stochastique multivariée pour projeter les trajectoires de prix futures tout en respectant la structure de corrélation historique des actifs.

### Concepts Clés

#### 1. Simulation de Monte Carlo (Mouvement Brownien Géométrique)
*   *Problème* : L'historique passé ne suffit pas à capturer tous les scénarios futurs possibles, en particulier pour un portefeuille complexe soumis à l'incertitude des marchés.
*   *Solution* : Le système génère des milliers de trajectoires aléatoires (ex: 1000 simulations sur 252 jours) basées sur la dérive (drift) et la volatilité historiques de chaque actif, modélisant ainsi une large distribution des futurs possibles.

#### 2. Corrélation Multivariée (Décomposition de Cholesky)
*   *Problème* : Simuler chaque actif de manière totalement indépendante détruirait la réalité du portefeuille (ex: les actions d'un même secteur chutent souvent en même temps).
*   *Solution* : Le moteur calcule la matrice de covariance historique et applique une **factorisation de Cholesky**. Cela permet de transformer des chocs aléatoires normaux indépendants en chocs corrélés, garantissant que les simulations respectent les dynamiques de co-mouvement des actifs.

#### 3. Analyse des Risques Extrêmes (VaR & CVaR)
*   **Value at Risk (VaR 95% / 99%)** : Estime la perte maximale attendue sur l'horizon donné, avec un certain niveau de confiance.
*   **Conditional VaR (CVaR ou Expected Shortfall)** : Va au-delà de la VaR en calculant la perte *moyenne* constatée dans les pires scénarios (les 5% les plus extrêmes). C'est la métrique la plus robuste pour évaluer le "Tail Risk" (risque de queue).

### Fichiers et Fonctions Pertinentes

*   `monte_carlo_simulation.py` (Backend Quantitatif) :
    *   `run_monte_carlo_portfolio()` : Moteur tensoriel numpy. Applique la régularisation de covariance, la décomposition de Cholesky, et vectorise la génération des trajectoires pour l'ensemble du portefeuille.
    *   `calculate_var_cvar()` : Calcule la Relative VaR et la CVaR à partir de la distribution finale des valeurs simulées (perte par rapport à l'espérance mathématique).

## Flux d'Exécution (Pipeline de Production)

1.  **Entrée** : Réception des poids d'allocation (`weights`) du portefeuille cible depuis la session Streamlit (générés au préalable par le Clustering Engine).
2.  **Acquisition & Modélisation** : Téléchargement de l'historique récent des prix pour calculer le vecteur de rendements espérés (`mu_vec`) et la matrice de covariance annualisée (`cov_matrix`).
3.  **Simulation Tensorielle** : Génération de la matrice tridimensionnelle de chocs corrélés et calcul vectorisé des trajectoires cumulées du portefeuille global.
4.  **Évaluation Quantile** : Extraction des valeurs terminales de chaque simulation pour calculer la distribution de probabilité et les métriques VaR/CVaR.
5.  **Sortie** : Rendu visuel interactif des trajectoires (Random Walk WebGL) et de l'histogramme de distribution des pertes.

## Recommandations MLOps & Stabilité en Production

*   **Stabilité Algébrique (Matrice Définie Positive)** : La décomposition de Cholesky exige une matrice de covariance strictement définie positive. Le code actuel applique une légère régularisation (`+ 1e-6` sur la diagonale) en cas d'erreur `LinAlgError`. En production, face à des matrices mal conditionnées (ex: grand nombre d'actifs par rapport à l'historique), l'utilisation d'estimateurs robustes de type *Shrinkage* (ex: Ledoit-Wolf) est fortement recommandée.
*   **Performance et Scalabilité (Compute)** : La simulation Monte Carlo multivariée est intensive en CPU, particulièrement sur de grands univers. Pour passer à l'échelle (ex: 50 000+ simulations sur 100 actifs), l'utilisation de bibliothèques de compilation "Just-in-Time" comme **Numba** (`@njit`) ou de calcul GPU via **JAX** réduira drastiquement le temps d'exécution.
*   **Qualité des Données (Data Provider)** : S'appuyer sur `yfinance` à la volée est vulnérable aux limites de requêtes et aux données manquantes, ce qui peut fausser la matrice de covariance. Un cache asynchrone alimenté par une API robuste (Alpha Vantage, Polygon) sécurisera ce module.
*   **Visualisation Big Data** : L'astuce d'affichage actuelle via Plotly (un seul objet `Scattergl` séparé par des `None`) est excellente pour éviter de faire crasher le DOM du navigateur. Si le nombre de chemins augmente encore, une stratégie d'agrégation ou de *downsampling* visuel (ex: n'afficher que les quantiles, la médiane et quelques courbes représentatives) sera nécessaire.