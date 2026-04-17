# Roadmap & Tâches Restantes

Salut Claude, voici la liste des choses qu'il nous reste à faire sur le projet. 
**Instruction importante :** Quand tu as fini une tâche, merci de cocher la case correspondante en remplaçant `[ ]` par `[x]`.

Lors ce que tu fini ces taches ne me fait pas de recap juste coche les cases et c'est fini.

#  problemes a traiter : 
- comment heberger l'app avec un environnement python viable
- comment reguler les appels api vers yfinance ?
- comment trouver des failles de securité
- gerer le soucis des doublons


# idée UX/UI :
- possibilité de mettre des volet roulant dasn portfolio
- ajouter une vue avancée et une vue simple sur l'ensemble du site
- creation page dashboard --> vision clair et un indicateur macro simple

## FONCTIONNALITES bonus : 
- [] ajouter la possibilités de créer un pf a une data t, et ensuite de tracker les perfs du pf : nous avons un soucis interne 'internal error server' (fix it)

- [] pouvoir comparer le pf avec un benchmark choisi --> ajouter cette features dans la même 

- ajout de features forex factory --> calendar and data news

- ajout du score macro --> improve the IC' score to be more constistent

## 1. Macro View

- [] ajouter des données macro importantes 
- [] trouver comment faire un indicateur de stress sur les marché via la vol du vix et le cot ?
- changer le modele de market regime et les différentes timesframes 



## 2 Scoring :
RAS

## 3. Portfolio & Allocation
- [] corrgier le bugs qui fait que les optimzation hors methode HRP ne fonctionne pas
- [] rendre l'interface plus lisible au niveua des couleurs des graphs, avec des couleurs plus contrastées.
-[]simulation de Monte_carlo : ajouter les probabilités de ruines, faire une vraie etude des la VaR du pf etc... Comparer avec des indices/benchmarks


# 4. Equity Overview :
- [x] ajouter des graphiques d'évolution de marges, net income, CA etc... des entreprises concernée. 
- [] plus d'historique sur Trading view

# 5. Reporting : 
- [] error lorsque je veux créer le pdf (fix)
- [] il faut que le pdf prenne en compte toutes les actions presente dans le pf, ajoute les graphiques necessaires, les simulaitins, des tableaux de performances

# 6 ML Alpha : 
- finir de faire le modele de machine learning ??? - POur l'instant cette page doit être inactive avec ecris : En construction, features bientot dispo etc...

# Securité et account création: 
- [ ] idée : je suis l'admin je genere des clés personnalisée selon l'abonnement de la personne et ensuite je lui donne la clé, comme ca pas de problemes de creation de compte avec BBD etc..generation de clés à usage unique
- 

Logique : clé à usage unique : ensuite chaque personne devra mettre ses clés API FRED/ALPHA VANTAGE etc... pour avior accès aux données macro 

# Doc : 
- faire la docs des méthodes de pondération --> HRP, Markowitz, Mean Var.
