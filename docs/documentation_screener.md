# Documentation - Moteur de Screening Fondamental

Ce dossier contient le moteur de présélection (`Screener`) de CAPITALIS V2. Son rôle est de constituer l'univers d'investissement initial en récupérant les actions des grands indices mondiaux, puis d'appliquer un premier filtre "coupe-gorge" pour éliminer les entreprises ne répondant pas aux critères fondamentaux minimums de qualité et de croissance.

## Architecture et Méthodologie

L'approche est systématique et repose sur des règles d'exclusion strictes configurées de manière centralisée.

### Concepts Clés

#### 1. Constitution de l'Univers d'Investissement
Le système utilise une technique de Web Scraping pour extraire dynamiquement les listes de tickers (symboles boursiers) directement depuis les pages Wikipédia des indices majeurs (S&P 500, Nasdaq 100, CAC 40, DAX, etc.). Les URLs sources sont définies dans `settings.py`.

#### 2. Standardisation des Données (Mapping)
Les symboles boursiers diffèrent selon les fournisseurs de données. Le Screener gère un système de mapping (`SPECIAL_TICKER_MAP`, `COUNTRY_SUFFIX_MAP` dans `settings.py`) pour convertir les tickers Wikipédia vers le format attendu par l'API Yahoo Finance (ex: ajout de `.PA` pour les actions françaises).

#### 3. Filtrage Dynamique Sectoriel
Les règles de filtrage (définies par `RULES_DICT` dans `settings.py`) ne sont pas de simples seuils absolus (ex: "PE < 15"). Le système est capable d'appliquer des filtres relatifs (ex: "Le PE doit être inférieur à 1.2x la médiane du secteur"). Cela évite d'exclure massivement les secteurs structurellement plus valorisés comme la technologie.

### Fichier Principal

*   `main_screener.py` : Contient la classe `Screener` qui orchestre l'extraction web, le téléchargement des données fondamentales, l'application des règles logiques et l'export des résultats.

## Flux d'Exécution (Pipeline de Production)

1.  **Entrée** : Listes d'URLs (Wikipédia) et règles de filtrage issues de `settings.py`.
2.  **Extraction** : Parsing HTML des tableaux Wikipédia pour consolider une liste globale de plusieurs centaines/milliers de tickers bruts.
3.  **Nettoyage & Ingestion** : Application du mapping de tickers et requête en masse via Yahoo Finance pour récupérer l'objet `.info` de chaque entreprise.
4.  **Filtrage** : Évaluation de chaque actif face aux règles `RULES_DICT`. Si une seule règle n'est pas respectée, l'actif est rejeté.
5.  **Sortie** : Génération du fichier `screened_assets.csv`, contenant uniquement l'élite des entreprises, prêt à être ingéré par le `Scorer`.

## Recommandations MLOps & Stabilité en Production

*   **Fragilité du Web Scraping** : L'extraction depuis Wikipédia est extrêmement fragile. Si la structure HTML de la page change, le scraper plantera. En production institutionnelle, cette étape doit être remplacée par l'ingestion d'un univers statique via un Data Provider payant (ex: requêtes API Refinitiv ou Bloomberg).
*   **Biais de Survie (Survivorship Bias)** : En récupérant la composition *actuelle* de l'indice, on ignore les entreprises qui y étaient il y a 5 ans mais qui ont fait faillite. C'est acceptable pour du trading live, mais cela invalide tout backtest rigoureux. Un backtest nécessitera une base de données *Point-in-Time*.
*   **Parallélisation et Gestion des Erreurs API** : Télécharger les attributs fondamentaux de milliers d'actions une par une est très lent. Une implémentation asynchrone (ex: `asyncio` avec `aiohttp`) couplée à un système de rotation de proxy/User-Agent est vitale pour passer à l'échelle sans se faire bloquer par Yahoo Finance.
*   **Tolérance aux Données Manquantes** : Si Yahoo Finance ne renvoie pas la valeur "Forward PE" pour une action, l'opérateur de comparaison échouera. Le code doit s'assurer qu'une métrique manquante ne fait pas crasher l'ensemble du pipeline (comportement de rejet silencieux ou `try/except` strict).