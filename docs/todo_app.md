#  App Pipeline Investissement

Ce fichier a pour but de suivre les étapes du moteur d'allocation d'actifs (Clustering Engine) sous forme d'application streamlit

- !!! il faut la possibilité de créer une base de données afin de stocker les préférences de l'utilisateur

- !!! BBD pour stockers les différents pf --> ajout d'une fonctionnalité de creation de plusieurs pf, et donc comparaison des pf

- permettre un screening complet avec un panier de ratio disponible via yfinance : on fait un tirroire avec des checkbox pour ratio que l'on veut ensuite on, doit choisir un opérateurs style >=;<=;= etc... et ensuite une valeur pour chaque ration financier, il faut ainsi gerer les erreursk

- ajout d'une fonctionnalité de filtrage  et seuil de pondération par secteur (voir engine.ipynb)

- possibilité de backtester la stratégies (voir comment se serait comporter le pf sur X années) et ensuite comparer avec le sp500 pour voir si il y a de l'alpha

- pour le modele de markov, ajouter la possiblité de scanner plusieurs marchér et peut-être de comparer plusieurs marché entre eux !! --> faire comme le modele de ML et enregistrer certain modele selon les indices

- ajouter des filtres de momentum (juste un rsi SMA sur n jours pour avoir une vision rapide de la tendance on evite la prise de tete sur le calcul de momentum ) --> a ajouter dans macro 

- fonction de recherche et de raccourci clavier à intergré

- !! mise en place de manua list --> cf @engine_model_1.ipynb

Idées de pages à venir : 

- modele de machine learning --> 
    -   possibilité de fine tune les différents modeles via des page de paramètres !!!! A FAIRE

