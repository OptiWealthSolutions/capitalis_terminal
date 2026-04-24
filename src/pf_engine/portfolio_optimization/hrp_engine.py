import pandas as pd
import numpy as np
import scipy.cluster.hierarchy as sch
import scipy.spatial.distance as ssd
from sklearn.covariance import LedoitWolf

def correlDist(corr):
    return ((1 - corr) / 2.) ** 0.5

# --- Fonctions optimisées avec NumPy ---
def getIVP_np(cov_np):
    ivp = 1. / np.diag(cov_np)
    ivp /= ivp.sum()
    return ivp

def getClusterVar_np(cov_np, cItems_idx):
    # np.ix_ permet d'extraire la sous-matrice sans passer par Pandas
    cov_ = cov_np[np.ix_(cItems_idx, cItems_idx)]
    w_ = getIVP_np(cov_)
    cVar = np.dot(np.dot(w_.T, cov_), w_)
    return cVar
# --------------------------------------

def getQuasiDiag(link):
    link = link.astype(int)
    sortIx = pd.Series([link[-1, 0], link[-1, 1]])
    numItems = link[-1, 3]
    while sortIx.max() >= numItems:
        sortIx.index = range(0, sortIx.shape[0] * 2, 2)
        df0 = sortIx[sortIx >= numItems]
        i = df0.index
        j = df0.values - numItems
        sortIx[i] = link[j, 0]
        df0 = pd.Series(link[j, 1], index=i + 1)
        sortIx = pd.concat([sortIx, df0])
        sortIx = sortIx.sort_index()
        sortIx.index = range(sortIx.shape[0])
    return sortIx.tolist()

def getRecBipart(cov, sortIx, mu=None, risk_aversion=None):
    # 1. Conversion des données Pandas en arrays NumPy
    cov_np = cov.values
    if mu is not None:
        # Aligner 'mu' sur les colonnes de 'cov' pour éviter les décalages d'indices
        mu_np = mu.reindex(cov.columns).values 
    
    # 2. Mapping : noms d'actifs -> indices entiers
    col_to_idx = {col: i for i, col in enumerate(cov.columns)}
    sortIx_idx = [col_to_idx[col] for col in sortIx]
    
    # Initialisation du vecteur de poids sous forme de tableau NumPy (plus rapide)
    w_np = np.ones(len(cov.columns))
    
    cItems_idx = [sortIx_idx]
    
    while len(cItems_idx) > 0:
        cItems_idx = [i[j:k] for i in cItems_idx for j, k in ((0, len(i)//2), (len(i)//2, len(i))) if len(i) > 1]
        for i in range(0, len(cItems_idx), 2):
            c0 = cItems_idx[i]
            c1 = cItems_idx[i + 1]
            
            cVar0 = getClusterVar_np(cov_np, c0)
            cVar1 = getClusterVar_np(cov_np, c1)

            if mu is not None and risk_aversion is not None:
                # Extraction ultra-rapide des sous-matrices
                cov0 = cov_np[np.ix_(c0, c0)]
                cov1 = cov_np[np.ix_(c1, c1)]
                
                w0 = getIVP_np(cov0)
                w1 = getIVP_np(cov1)

                mu0 = np.dot(w0, mu_np[c0])
                mu1 = np.dot(w1, mu_np[c1])
                
                utility0 = mu0 - 0.5 * risk_aversion * cVar0
                utility1 = mu1 - 0.5 * risk_aversion * cVar1

                if utility0 < 0 or utility1 < 0:
                    alpha = 1 - cVar0 / (cVar0 + cVar1)
                else:
                    if utility0 + utility1 == 0:
                        alpha = 0.5
                    else:
                        alpha = utility0 / (utility0 + utility1)
            else:
                alpha = 1 - cVar0 / (cVar0 + cVar1)
                
            # Application vectorisée sur les indices correspondants
            w_np[c0] *= alpha
            w_np[c1] *= (1 - alpha)
            
    # 3. Reconversion finale en Pandas Series
    w_series = pd.Series(w_np, index=cov.columns)
    return w_series.loc[sortIx]


def get_ewma_mu(returns, halflife=40):
    """
    Calcule le vecteur des rendements espérés (mu) en utilisant un lissage exponentiel (EWMA).
    
    halflife=63 correspond à environ un trimestre de trading.
    """
    ewma_series = returns.ewm(halflife=halflife).mean()

    mu_ewma = ewma_series.iloc[-1] * 252 
    
    return mu_ewma


def run_hrp(returns, mu=None, risk_aversion=None):
    returns = returns.dropna()  # clean copy — don't mutate caller's DataFrame
    corr = returns.corr()       # compute on clean data (no NaN → no NaN distances)

    if mu is None and risk_aversion is not None:

        mu = get_ewma_mu(returns, halflife=63)

    lw = LedoitWolf().fit(returns)
    cov = pd.DataFrame(lw.covariance_, index=returns.columns, columns=returns.columns) * 252
    
    dist = correlDist(corr)
    dist_condensed = ssd.squareform(dist)
    link = sch.linkage(dist_condensed, 'single')

    sortIx = getQuasiDiag(link)
    sortIx = corr.index[sortIx].tolist() 

    weights = getRecBipart(cov, sortIx, mu, risk_aversion)
    return weights

def apply_weight_constraints(weights, min_weight, max_weight):
    w = weights.copy()
    
    if max_weight * len(w) < 1.0 or min_weight * len(w) > 1.0:
        raise ValueError("Contraintes impossibles à satisfaire avec ce nombre d'actifs.")

    # NOUVEAU : On crée un masque mémoire pour verrouiller les actifs déjà traités
    constrained = pd.Series(False, index=w.index)

    while True:
        # On ne vérifie QUE les actifs qui ne sont pas encore verrouillés
        capped_mask = (w > max_weight) & ~constrained
        floored_mask = (w < min_weight) & ~constrained
        
        # S'il n'y a plus aucun débordement, on sort définitivement de la boucle
        if not (capped_mask.any() or floored_mask.any()):
            break
            
        # On verrouille les nouveaux actifs qui ont touché les limites
        constrained = constrained | capped_mask | floored_mask
        
        # On applique la limite stricte
        w.loc[capped_mask] = max_weight
        w.loc[floored_mask] = min_weight
        
        free_mask = ~constrained
        if free_mask.sum() == 0:
            break 
            
        # On redistribue le capital restant UNIQUEMENT sur les actifs libres
        weight_left = 1.0 - w.loc[constrained].sum()
        original_free_sum = weights.loc[free_mask].sum()
        
        if original_free_sum > 0:
            w.loc[free_mask] = (weights.loc[free_mask] / original_free_sum) * weight_left
        else:
            w.loc[free_mask] = weight_left / free_mask.sum()
            
    return w

def post_process_weights(weights, sector_map, max_asset_weight=0.10, max_sector_weight=0.30, min_weight=0.0):
    """
    REDISTRIBUTION ITERATIVE DES POIDS SOUS DOUBLE CONTRAINTE (ACTIF ET SECTEUR).
    """
    w = weights.copy()
    
    for _ in range(20): # Limite de convergence
        # 1. CONTRAINTES INDIVIDUELLES (ACTIFS)
        w[w > max_asset_weight] = max_asset_weight
        w[w < min_weight] = min_weight
        
        # 2. CONTRAINTES SECTORIELLES
        if sector_map is not None and not sector_map.empty:
            sectors = w.groupby(sector_map).sum()
            for sec, val in sectors.items():
                if val > max_sector_weight:
                    idx = w[sector_map == sec].index
                    w[idx] = w[idx] * (max_sector_weight / val)
                    
        # 3. NORMALISATION STRICTE A 1.0
        w /= w.sum()
        
        # 4. VERIFICATION DE LA CONVERGENCE (MARGE DE TOLERANCE)
        sec_check = w.groupby(sector_map).sum() if sector_map is not None else pd.Series()
        if (w <= max_asset_weight + 1e-4).all() and (w >= min_weight - 1e-4).all() and (sec_check <= max_sector_weight + 1e-4).all():
            break
            
    return w