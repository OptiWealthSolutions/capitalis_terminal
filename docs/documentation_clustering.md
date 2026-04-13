# Documentation - Clustering Engine (Allocation d'Actifs)

Ce dossier contient le moteur mathématique d'allocation et d'optimisation de portefeuille de CAPITALIS V2. Son rôle est de transformer une liste d'actifs présélectionnés et notés (par le `scorer.py`) en un portefeuille pondéré et optimisé selon des critères quantitatifs de gestion des risques.

## Architecture du Moteur d'Allocation

L'approche de production repose sur une abstraction orientée objet (la classe `Portfolio`) et différents algorithmes d'optimisation mathématiques.

### Fichiers et Composants Principaux

#### 1. `portfolio_optimizer.py`
C'est le cœur du moteur d'allocation. Ce fichier implémente les algorithmes mathématiques qui déterminent le pourcentage de capital à allouer à chaque actif.

Les méthodes d'optimisation disponibles pour la production sont :

*   **Hierarchical Risk Parity (HRP)** : 
    *   *Principe* : Utilise le Machine Learning (Clustering Hiérarchique) sur la matrice de corrélation pour grouper les actifs se comportant de manière similaire, puis alloue le capital de manière inversement proportionnelle à la variance (risque) au sein de chaque cluster.
    *   *Avantage en production* : Ultra-robuste. Contrairement à Markowitz, HRP ne nécessite pas l'inversion de la matrice de covariance. Cela évite les instabilités mathématiques et les allocations extrêmes (corner solutions) lorsque des actifs sont fortement corrélés.
*   **Minimum Volatility (Markowitz)** :
    *   *Principe* : Optimisation quadratique classique (Mean-Variance) cherchant la combinaison exacte qui minimise la volatilité historique globale du portefeuille.
    *   *Avantage en production* : C'est le standard institutionnel, très facilement explicable aux clients.

#### 2. L'objet `Portfolio` (Abstraction Métier)
Cette classe (généralement définie dans l'engine) encapsule toutes les caractéristiques du portefeuille généré :
*   **États (Attributs)** : Poids finaux de l'allocation (`weights`), Rendement annuel espéré (`CAGR`), Volatilité annuelle (`vol`), Ratio de Sharpe (`sharpe`).
*   **Comportements (Méthodes)** : Fonctions pour calculer les rendements quotidiens, générer la matrice de covariance, et déduire les métriques de performance historiques sur la période définie (`LOOK_BACK_PERIOD` dans `settings.py`).

## Flux d'Exécution (Pipeline de Production)

1.  **Entrée** : Le moteur reçoit un sous-ensemble d'actifs (ex: le Top 20 des actions avec le meilleur Total Score) issu du module `Scorer`.
2.  **Ingestion** : Récupération de l'historique des prix de clôture ajustés (*Adjusted Close*) pour calculer les séries de rendements stationnaires.
3.  **Traitement & Optimisation** : Calcul des matrices de corrélation/covariance et application de l'algorithme choisi (par défaut HRP) sous contraintes de poids (limites min/max par actif).
4.  **Sortie** : Le dictionnaire `target_portfolio` contenant les poids et les KPIs, prêt à être consommé par le Dashboard Streamlit, l'export PDF et la simulation de Monte Carlo.

## Recommandations MLOps & Stabilité en Production

*   **Nettoyage des Données (Data Imputation)** : Assurez-vous que les valeurs manquantes (NaN) dans les séries temporelles sont gérées (ex: *Forward Fill*) avant de calculer les matrices. Une seule valeur NaN fera crasher l'optimiseur de SciPy/NumPy.
*   **Contraintes de Poids (Bounds)** : Pour éviter une concentration excessive du risque, il est indispensable de coder en dur des bornes d'allocation dans l'optimiseur (par exemple : minimum 2% et maximum 15% par actif).
*   **Robustesse de la Covariance** : En production, il est souvent préférable d'utiliser des estimateurs de covariance "rétrécis" (ex: *Ledoit-Wolf shrinkage*) plutôt que la covariance empirique standard, surtout si le nombre d'actifs approche le nombre de jours d'historique.
