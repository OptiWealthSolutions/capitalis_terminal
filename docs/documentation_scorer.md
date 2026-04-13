# Documentation - Moteur de Scoring Quantitatif

Ce dossier contient le moteur d'évaluation et de classement (`Scorer`) de CAPITALIS V2. Son rôle est de prendre la liste brute des actifs ayant survécu à la phase de filtrage (Screener) et de leur attribuer une note globale afin d'isoler les meilleures opportunités d'investissement (par exemple, le Top 15% ou 20%).

## Architecture et Méthodologie

L'approche repose sur un modèle factoriel quantitatif robuste, qui évalue chaque entreprise non pas de manière absolue, mais relativement à ses pairs.

### Concepts Clés

#### 1. Modèle Multi-Facteurs
Le score final est une combinaison linéaire de plusieurs dimensions d'investissement (les poids sont configurables dans `settings.py`) :
*   **Qualité (Quality)** : Évaluation de la santé financière via le Piotroski F-Score et la rentabilité (ROE).
*   **Valeur (Value)** : Recherche de sous-évaluation via le modèle de Benjamin Graham et le ratio P/E (Price-to-Earnings).
*   **Momentum & Risque** : Intégration de la dynamique de prix (CAGR), de la croissance des bénéfices, de la volatilité historique et du ratio de Sharpe.

#### 2. Normalisation Sectorielle (Z-Score)
*   *Problème* : Comparer le P/E d'une entreprise technologique avec celui d'une banque n'a pas de sens économique.
*   *Solution* : Le moteur groupe les actions par secteur d'activité (`Sector`) et calcule un **Z-Score** pour chaque métrique. Cela permet de mesurer de combien d'écarts-types une action surperforme ou sous-performe la moyenne de son propre secteur.
*   *Sens des pondérations* : Le système inverse automatiquement les métriques de "friction" (comme la volatilité ou le P/E où *plus bas est meilleur*) pour qu'un Z-score positif fort combiné à un poids positif indique toujours un signal d'achat.

### Fichier Principal

*   `scorer.py` : Contient la classe `Scorer` qui orchestre l'enrichissement des données via l'API, le nettoyage des valeurs aberrantes, et l'application des formules mathématiques de Z-scoring.

## Flux d'Exécution (Pipeline de Production)

1.  **Entrée** : Ingestion du fichier `screened_assets.csv` généré par la phase précédente.
2.  **Enrichissement (Data Fetching)** : Récupération des données manquantes (historique de prix pour la volatilité, taux sans risque actuel via le TNX 10 ans, données fondamentales) via des fournisseurs comme Yahoo Finance.
3.  **Traitement (Data Processing)** : 
    *   Calcul des métriques dérivées (Sharpe, valeur de Graham).
    *   Groupement sectoriel et calcul vectorisé des Z-scores via Pandas.
    *   Agrégation pour obtenir le `Total_Score`.
4.  **Sortie** : Export des résultats (souvent filtrés pour ne garder que le décile supérieur) dans le fichier `equity_scored.csv`, prêt à être ingéré par le `Clustering Engine`.

## Recommandations MLOps & Stabilité en Production

*   **Gestion des Limites d'API (Rate Limiting)** : L'enrichissement des données sollicite fortement des API externes. En production, il est impératif d'utiliser des sessions avec des `retries` automatiques (ex: `requests.Session` avec `Retry` de `urllib3`) et du *backoff* exponentiel pour éviter les bannissements d'IP.
*   **Imputation des Données Manquantes** : Certaines métriques fondamentales peuvent manquer pour des actions spécifiques. Le `Scorer` doit gérer ces valeurs `NaN` (par exemple en les remplaçant par la médiane sectorielle ou en attribuant un Z-score neutre de 0) pour éviter que le score global ne devienne `NaN`.
*   **Gestion des Petits Secteurs** : Si un secteur ne contient qu'une seule entreprise après le filtrage du Screener, le calcul de l'écart-type pour le Z-score retournera `NaN` (division par zéro). Le code doit prévoir un fallback (ex: Z-score de 0 ou regroupement dans un secteur "Autre").
*   **Multithreading** : Pour réduire drastiquement le temps d'exécution lors du téléchargement des données historiques de centaines d'actions, l'implémentation de `ThreadPoolExecutor` ou `asyncio` est fortement recommandée.