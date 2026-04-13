
**Ce fichier contient toutes les pistes de reflexion relatives au modeles de changement de régime :**


#### Modele de markov caché :

##### Mise en place de plusieurs features : 
- eviter les features corrélés ou faire PCA si besoin
- prendre des series stationnaires, --> frac diff si besoin
- prendre des features de vol et de momentum (RSI, vol implicite)
- Le Skewness (Asymétrie) et la Kurtosis des rendements sur une fenêtre glissante (ex: 20 jours).Les régimes de krach ont souvent une "Fat Tail" (kurtosis élevée) et une asymétrie négative.
- inversion de la courbe des taux donc mise en place des taux directeur CT et LT et de leur spread comme nouvelle feature
- prix du VIX

##### Evaluation du modele :
- limitation overfitting : 
    - walk forward validation
    - train set et test set
    - limiter le nb d'état à 3 max 
- BIC (Bayesian Information Criterion) :  . Pénalité plus forte pour chaque paramètre additionnel. Le BIC est généralement préféré pour éviter l'overfitting dans la sélection du nombre de régimes.


#### MS GARCH modele :
- Cette approche est cruciale car elle permet de distinguer entre la persistance réelle de la volatilité et les changements brusques de son niveau. Une étude sur le marché vietnamien a démontré que le modèle MS-E-GARCH surpasse les modèles à régime unique pour capturer les asymétries de volatilité.