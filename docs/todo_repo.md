# TODO - Industrialisation de CAPITALIS V2

## 1. Ingestion et Pipeline Quantitatif (Screener & Scorer)
- !!! Implémenter le multithreading (ou asyncio) dans le scorer pour accelerer drastiquement les requêtes API (Yahoo Finance).
- Remplacer le scraping Wikipedia du screener par un fournisseur de donnees robuste (API) pour securiser la source et permettre des backtests Point-in-Time sans biais de survie.
- !Migrer la sauvegarde des resultats (CSV) vers une base de donnees (SQLite/PostgreSQL) pour conserver l'historique quotidien des scores.

## 2. Moteur d'Allocation et Risques
- Integrer un nettoyage strict des donnees (Data Imputation type Forward Fill) avant l'optimisation pour eviter tout crash lie a une valeur manquante (NaN) dans les matrices.
- Remplacer la covariance classique par un estimateur robuste de type Ledoit-Wolf pour les calculs de frontiere efficiente.
- !!! Ajouter un module de backtest unifie (via vectorbt) comparant le rendement historique de l'allocation vs benchmark (SPY).

## 3. Intelligence Artificielle et MLOps
- Extraire la logique d'entrainement du notebook ML vers des scripts autonomes (train_pipeline.py, predict_pipeline.py).
- !! Integrer MLflow au processus d'entrainement pour tracer les parametres, les metriques et serialiser automatiquement les pipelines de modeles (.pkl/.joblib).
- !!! Implémenter Optuna pour dynamiser et automatiser l'optimisation des hyperparametres des modeles Random Forest.

## 4. Application Streamlit (Interface Utilisateur)
- !!! Mettre en place un ORM (SQLAlchemy) et une base de donnees pour persister les configurations et les portefeuilles des utilisateurs au-dela du cache du navigateur.
- Ajouter un onglet dedie a la visualisation du backtest historique (Equity Curve de l'allocation).

## 5. DevOps, Architecture et CI/CD
- Creer un dossier tests/ et implementer des tests unitaires Pytest. Priorite haute: validation stricte du non-chevauchement des donnees dans le PurgedKFold.
- Rediger un Dockerfile et un docker-compose.yml pour encapsuler le projet (environnement, base de donnees, terminal Streamlit) et garantir son portage sur n'importe quel OS.
- Configurer un workflow d'integration continue (CI) via GitHub Actions pour lancer les tests automatiquement a chaque modification du depot.