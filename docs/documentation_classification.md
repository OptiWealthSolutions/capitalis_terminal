# Documentation - Moteur de Machine Learning (Classification Financière)

Ce dossier contient le système de prédiction algorithmique de CAPITALIS V2. Fortement inspiré des travaux de Marcos Lopez de Prado (*Advances in Financial Machine Learning*), ce module vise à prédire la direction d'un actif et à filtrer les signaux avec un degré de confiance probabiliste.

## Architecture et Concepts Quantitatifs Clés

Contrairement aux modèles de ML traditionnels, la finance impose des contraintes strictes (non-stationnarité, chevauchement temporel, bruit). Ce modèle intègre des solutions avancées pour y répondre.

### 1. Labellisation : La Méthode de la Triple Barrière (Triple-Barrier Method)
*   *Problème* : Prédire si le prix "montera demain" n'est pas actionnable. Un trade réel a un stop-loss et un take-profit.
*   *Solution* : Le système simule un trade pour chaque point de donnée avec 3 barrières :
    *   **Barrière Supérieure** : Objectif de profit (Label = 1 / Achat).
    *   **Barrière Inférieure** : Stop-loss (Label = -1 / Vente).
    *   **Barrière Verticale** : Expiration temporelle maximale du trade.

### 2. Ingénierie des Données : Différenciation Fractionnaire
*   *Problème* : Les prix ne sont pas stationnaires (les moyennes changent), ce qui perturbe les modèles. La différenciation classique (rendements quotidiens) efface la mémoire à long terme de l'actif.
*   *Solution* : La différenciation fractionnaire trouve le compromis mathématique exact (le paramètre `d`) pour rendre la série temporelle stationnaire tout en conservant le maximum de sa mémoire historique.

### 3. Architecture Prédictive : Méta-Labeling
L'architecture repose sur deux modèles qui travaillent en cascade :
*   **Modèle Primaire (Direction)** : Un algorithme (ex: *Random Forest*) analyse les indicateurs techniques, macro-économiques et fondamentaux pour émettre un signal directionnel pur (Achat ou Vente).
*   **Méta-Modèle (Confiance & Sizing)** : Un second modèle ML apprend à prédire *si le premier modèle a raison ou tort*. Il crache une probabilité (ex: 60% de chances de succès). On ne prendra position que si cette confiance dépasse un certain seuil.

### 4. Validation : Purged K-Fold Cross-Validation (avec Embargo)
*   *Problème* : En finance, les observations se chevauchent (un trade de 5 jours initié mardi partage 4 jours avec un trade initié mercredi). Une validation croisée standard provoque une fuite d'informations (*Data Leakage*) du futur vers le passé.
*   *Solution* : 
    *   **Purge** : Suppression stricte des données d'entraînement qui chevauchent la période de test.
    *   **Embargo** : Ajout d'une zone morte (ex: 5 jours) après la période de test pour bloquer l'autocorrélation.

## Fichiers et Fonctions Pertinentes

*   `ClassificationModel` (Classe principale orchestratrice) :
    *   `prepare_data()` : Fonction critique qui génère l'ensemble du dataset (Calcul des features, application de la Triple Barrière pour extraire les labels `y`, et génération des `sample_weights` basés sur la volatilité).
    *   `cross_validate_and_train_models()` : Orchestre l'entraînement robuste via le `PurgedKFold`. Applique une réduction de dimensionnalité (`PCA`) pour éviter le sur-apprentissage, puis entraîne le modèle primaire et le méta-modèle en cascade.
    *   `predict()` : Exécute l'inférence Out-Of-Sample.

*   Modules de traitement de données :
    *   `data_engineer.py` / `features_engineerning.py` : Scripts pour nettoyer l'historique et générer des signaux composites (Fama-French, VIX, Spread de taux).

## Recommandations MLOps & Production

L'état actuel est fonctionnel pour la recherche (prototypage via `engine_model_1.ipynb`), mais nécessite des adaptations pour la production automatisée :

1.  **Sortir du Notebook** : L'orchestration de l'entraînement doit être migrée vers un script Python exécutable (`train_pipeline.py`) pour permettre son automatisation (CRON, Airflow).
2.  **Tracking des Expériences (MLflow)** : Il est crucial d'implémenter un tracker (ex: MLflow) dans la boucle `cross_validate_and_train_models` pour enregistrer les hyperparamètres, les scores de Brier (calibration) et sauvegarder automatiquement les objets pipelines (fichiers `.pkl` ou `.joblib`).
3.  **Optimisation des Hyperparamètres (HPO)** : Les paramètres des Random Forests (ex: `max_depth`) ne doivent plus être fixés en dur. Intégrer `Optuna` pour que le modèle trouve dynamiquement ses meilleurs paramètres à chaque ré-entraînement.
4.  **Tests Unitaires Financiers** : Coder des assertions `pytest` spécifiques pour garantir mathématiquement que la fonction `PurgedKFold` n'autorise aucune fuite de données entre les *splits* temporels.