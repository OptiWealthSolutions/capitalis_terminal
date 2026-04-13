# CAPITALIS V2 : Research Pipeline

⸻
 
### Documentation Technique du Pipeline
 
Ce pipeline automatise la sélection d'actifs et l'optimisation de portefeuille via une approche quantitative systématique. Il identifie les entreprises de qualité, les note selon une approche multi-factorielle, puis construit un portefeuille optimisé.

#### 1. Configuration et Paramétrage (`settings.py`)

Le fichier `settings.py` sert de tour de contrôle centrale :

* **Gestion des chemins** : Centralisation des accès aux dossiers de données (`src/data`).
* **Règles de filtrage** : Définition des critères fondamentaux (ROE, croissance, PE).
* **Poids du Scoring** : Paramétrage de la stratégie d'investissement (Qualité, Valeur, Momentum).

#### 2. Phase de Screener (`main_screener.py`)

Ce module effectue un balayage des indices majeurs (S&P 500, Nasdaq-100, CAC 40, etc.).

* **Extraction** : Récupération automatisée des listes de tickers via Wikipedia.
* **Filtrage** : Application des règles de `settings.py` pour ne conserver que les entreprises répondant à des critères stricts de rentabilité, de croissance et de valorisation.
* **Filtrage Fondamental Dynamique** : Sélection d'univers basée sur des ratios financiers à la volée (P/E, P/B, ROE, Marges) avec des opérateurs logiques stricts et purge des données manquantes.
* **Stockage** : Export des actifs qualifiés dans `screened_assets.csv`.

#### 3. Phase de Scorer (`scorer.py`)

Évaluation quantitative des actions retenues pour identifier les meilleures opportunités via un modèle multi-facteurs.

* **Scoring Sectoriel** : La performance de chaque entreprise est mesurée par rapport à ses pairs du même secteur. Un Z-Score est calculé pour chaque métrique en se basant sur la moyenne et l'écart-type du secteur, rendant la comparaison plus juste.
* **Calcul des Facteurs** : Le score agrège plusieurs dimensions de l'investissement :
    * **Qualité** : F-Score (santé financière) et Return on Equity (ROE).
    * **Valeur** : Potentiel de hausse selon la **valeur de Graham** et le ratio Trailing PE.
    * **Momentum/Risque** : Ratio de Sharpe, croissance du cours (CAGR), croissance des bénéfices et volatilité.
* **Formule du Score Global** : Le score final est la somme pondérée des Z-Scores de chaque facteur, conformément à la stratégie définie dans `settings.py`.


#### 4. Optimisation du Portefeuille (`portfolio_optimizer.py`)

Le pipeline supporte plusieurs méthodes d'allocation pour construire le portefeuille final.

* **Hierarchical Risk Parity (HRP)** : Une méthode moderne qui utilise le clustering pour allouer le risque de manière hiérarchique. Elle est plus stable que les méthodes traditionnelles car elle ne nécessite pas l'inversion de la matrice de covariance.
* **Minimum Volatility (Markowitz)** : L'approche classique qui cherche à trouver la combinaison d'actifs qui minimise la volatilité (le risque) du portefeuille global, sous contraintes de poids.
* **Visualisation** : Génération de graphiques interactifs (Sunburst, Bar Charts) pour analyser l'allocation finale.

#### 5. Gestion des Risques & Simulation de Monte Carlo (`monte_carlo_simulation.py`)

Évaluation quantitative du risque de l'allocation via des méthodes stochastiques.
* **Mouvement Brownien Géométrique (GBM)** : Génération vectorisée de milliers de trajectoires futures possibles (Random Walk) basées sur la volatilité et le rendement historique.
* **Métriques de Risques Extrêmes** : Calcul de la perte maximale potentielle via la Value at Risk (VaR à 95% et 99%) et la Conditional Value at Risk (CVaR/Expected Shortfall).

#### 6. Reporting & Monitoring Institutionnel (`04_Reporting.py`)

Suivi en continu de l'allocation et génération de documents à destination des clients ou gestionnaires.
* **Suivi de l'Érosion (Drift)** : Détection dynamique de l'écart entre l'allocation cible définie par l'optimiseur et l'exposition actuelle subissant les mouvements de marché.
* **Alertes de Rééquilibrage** : Mise en évidence des actifs dépassant le seuil de tolérance de dérive.
* **Export PDF** : Création automatisée de rapports imprimables incluant les indicateurs de performance (KPIs), graphiques d'allocation et tableaux de suivi.

#### 7. Terminal Utilisateur Interactif (Streamlit)

Le pipeline est entièrement pilotable via une interface web centralisée (style Terminal Quant / Bloomberg) :
* `00_Macro_Overview.py` : Analyse Top-Down et macro-économie.
* `01_Screener.py`, `03_Scorer.py`, `04_Allocation.py` : Orchestration de la recherche et allocation.
* `01_Predictions_ML.py` : Inférence en temps réel du moteur de Machine Learning.
* `04_Equity_Overview.py` : Analyse fondamentale, technique et de valorisation d'un actif individuel.
* `05_Portfolio_Analysis.py` et `07_Reporting.py` : Gestion des risques multivariés (Monte Carlo) et exports PDF.

#### 8. Détection de Régime de Marché (Macro-Économie)

Modélisation des cycles de marché pour adapter l'exposition au risque de manière dynamique.
* **Modèles Probabilistes** : Utilisation de modèles de Markov Cachés (HMM) et de modèles MS-GARCH pour identifier les régimes de volatilité latents.
* **Volatilité Stochastique (GARCH)** : Modélisation de l'hétéroscédasticité conditionnelle (GARCH 1,1) pour anticiper les chocs de variance à court terme (T+1).
* **Indicateurs Macro-Économiques** : Intégration de données exogènes (Spread de taux directeurs pour l'inversion de la courbe, DXY, VIX, skewness/kurtosis des rendements).

#### 9. Moteur de Machine Learning (Classification & Sizing)

Système de prédiction quantitatif avancé (*Advances in Financial Machine Learning*).
* **Labellisation Avancée** : *Triple Barrier Method* pour définir des cibles de take-profit et stop-loss ajustées à la volatilité dynamique.
* **Ingénierie des Features** : Différenciation fractionnaire (*Fractional Differentiation*) pour stationnariser les séries temporelles tout en conservant leur "mémoire" à long terme.
* **Validation Robuste** : Utilisation du *Purged K-Fold Cross-Validation* (avec embargo et purge) pour éviter toute fuite d'information (Data Leakage) due à l'autocorrélation temporelle.
* **Meta-Labeling** : Modèle primaire pour la directionnalité couplé à un modèle secondaire probabiliste (Random Forest) pour déterminer la taille de la position (*Position Sizing*).
* **Interprétabilité (SHAP)** : Déconstruction des décisions du modèle primaire via les valeurs de Shapley (Waterfall charts) pour garantir la transparence des signaux.

---

### Structure du Projet

* `settings.py` : Configuration globale et variables d'environnement.
* `app/` : Interface utilisateur Streamlit (Terminal CAPITALIS V2) contenant les différentes pages du tableau de bord.
* `src/data/` : Stockage des fichiers CSV (`screened_assets.csv`, `equity_scored.csv`).
* `src/screener/` : Logique de récupération et de filtrage initial.
* `src/scorer/` : Algorithme de scoring multi-facteurs et sectoriel.
* `src/clustering engine/` : Moteurs d'optimisation (HRP, Markowitz) et classe `Portfolio`.
* `src/risk_management/` : Moteur mathématique pour les simulations Monte Carlo.
* `src/machine learning engine/` : Pipelines de Machine Learning, détection de régime, et préparation de données avancée.
* `engine.ipynb` : Point d'entrée principal pour l'exécution séquentielle du pipeline.
* `setup.sh` & `requirements.txt` : Scripts de déploiement et dépendances.

⸻