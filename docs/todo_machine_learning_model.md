# Modèle de Classification

Ce fichier `todo.md` a pour but de suivre les étapes de la création du modèle de classification.

## Tâches

- [] ajouter les décisions du modele de HMM comme features dans le modele primaires
    - --> Créer un modele de detection de régime afin de pouvoir ajouter ses decisions/biais comme features dans le modeles ou comme filtres : modele de markov caché

- mettre en place le features importance --> cf de prado
- mettre en place les features d'entropy pour les random foret


- trouver tout les paramètres à optimiser
    -  triple barrier method : SL/TP size et time limit
    - voir les embargos utilisés dans des codes publiques --> cf de Prado
    - idem pour les purges possibles 
    - trouver le cv split idéal
    
- supprimer les features macro  --> mettre les features macro en options
- entrainer le modele sur des données plus grande (15ans en 1H) --> 
- idem pour les features DXY,OIL,GOLD et ratio on prend le meme nombre et timeframe

--> Les features macro seront remplacés par un modele macro et un score macro --> 
--> mettre en place 
Structure du dossier ML : 

- Il nous faut les fonctions utiles comme fracc diff, purged k fold etc dans un dossier 'utils'
- Il faut un dossier data qui contiendra des fichiers csv des donné 'close" de chaque ticker que nous voulons exploiter
- Il faut un dossier 'trained models' dans lequel on pourra stocker des fichier jolib afin de pouvoir piocher dans des modeles deja entrainés


Idées d'améliorations plus importantes : 
- rendre le pipeline de ML plus modulables pour y ajouter des features etc.. Mais aussi des nouveaux types de target pas que du triple barrier
- prendre un grand nombres de features et ensuite faire une matrice de corrélation et voir qui explique quoi afin de pouvoir


machine_learning_engine/
│
├── configs/                     # Configuration externalisée
│   ├── train_params.yaml        # Paramètres du Random Forest, Triple Barrier, etc.
│   └── optuna_search.yaml       # Plages de recherche pour l'optimisation des hyperparamètres
│
├── data/                        # Séparation stricte des états de la donnée (Ignoré par Git)
│   ├── raw/                     # Données brutes (intouchables, ex: SP500_data.csv)
│   └── processed/               # Données transformées (features, séries différenciées)
│
├── notebooks/                   # Réservé à l'exploration et aux brouillons (EDA)
│   ├── 01_data_exploration.ipynb
│   └── 02_model_prototyping.ipynb # Ancien engine_model_1.ipynb (avant conversion)
│
├── src/                         # Le code source métier (Package Python)
│   ├── __init__.py
│   ├── data_processing/         # Tout ce qui transforme la donnée
│   │   ├── feature_engineering.py
│   │   ├── target_engineering.py
│   │   └── fracc_diff.py        # Calcul du d-optimal et différenciation fractionnaire
│   │
│   ├── modeling/                # Architecture des modèles et pondérations
│   │   ├── classifier.py        # Ta classe ClassificationModel (sans la prép. des données)
│   │   └── sample_weights.py    # Pondération par volatilité et unicité temporelle
│   │
│   ├── evaluation/              # Validation et métriques
│   │   ├── purged_cv.py         # Implémentation du Purged K-Fold avec embargo
│   │   └── metrics.py           # Fonctions pour P&L attendu, Brier Score, Sharpe, etc.
│   │
│   └── utils/                   # Fonctions utilitaires
│       └── logger.py            # Configuration des logs (remplace les print)
│
├── scripts/                     # Points d'entrée exécutables (Pipelines)
│   ├── train.py                 # Script pour entraîner, évaluer et sauvegarder le modèle
│   ├── predict.py               # Script pour l'inférence en production (daily run)
│   └── tune_hyperparams.py      # Script lançant Optuna pour trouver les meilleurs paramètres
│
├── tests/                       # Tests unitaires et d'intégration (Pytest)
│   ├── test_purged_cv.py        # Vérifie l'absence absolue de chevauchement Train/Test
│   ├── test_fracc_diff.py       # Vérifie la stationnarité après différenciation
│   └── test_sample_weights.py
│
├── artifacts/                   # Artefacts générés (Ignoré par Git, géré par MLflow)
│   └── models/                  # Pipelines Scikit-learn sérialisés (.pkl ou .joblib)
│
├── pyproject.toml               # Fichier moderne de gestion des dépendances et du build
└── requirements.txt             # Liste figée des dépendances pour la reproductibilité