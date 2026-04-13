#  Optimisation de Portefeuille

Ce fichier a pour but de suivre les étapes du moteur d'allocation d'actifs (Clustering Engine).


// - pour l'implémentation de Black-Litterman il faut pouvoir avoir une convictions différentes sur chaque assets afin de donner un biais pour calculer les rendements implicites via le CAPM

## 1. Phase de Screening (Filtres Absolus)
*Fichier concerné : `settings.py`, `main_screener.py`*

- [ ] **Gérer le Biais de Survie (Survivorship Bias) :**
  - *Problème :* Le scraping de Wikipédia ne récupère que les entreprises actuellement dans l'indice, faussant les backtests historiques. --> a faire plus tard car probleme de data provider donc impossible de faire le backtest
  - *Action :* Noter cette limitation. Si un backtest long terme est envisagé plus tard, il faudra sourcer une base de données "point-in-time" (incluant les faillites/sorties d'indice).

## 2. Phase de Scoring (Filtres Relatifs & Z-Scores)

## 3. Phase de Clustering & Allocation (HRP / Markowitz)
*Fichiers concernés : `src/scorer/scorer.py`, `src/clustering engine/portfolio_optimizer.py`*

