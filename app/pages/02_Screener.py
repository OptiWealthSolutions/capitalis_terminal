
import streamlit as st
import pandas as pd
import json
import sys
from pathlib import Path
import time

# --- Configuration de la Page ---
st.set_page_config(
    page_title="CAPITALIS V2 - Screener",
    layout="wide"
)

# --- Ajout du chemin racine et import des modules ---
ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# --- Configuration UI & Raccourcis ---
from src.utils.ui_config import set_terminal_margins, setup_bloomberg_shortcuts
set_terminal_margins()
setup_bloomberg_shortcuts()

# --- Injection de la police JetBrains Mono et CSS global ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
    html, body, [class*="css"] {
        font-family: 'JetBrains Mono', monospace !important;
    }
    p, li, label, .stMarkdown, .stText {
        font-size: 0.9rem !important;
    }
    [data-testid="stSidebar"] p, [data-testid="stSidebar"] label, [data-testid="stSidebar"] .stMarkdown {
        font-size: 0.8rem !important;
    }
</style>
""", unsafe_allow_html=True)

from src.core import config as settings
import importlib
if 'src.pf_engine.screener.main_screener' in sys.modules:
    importlib.reload(sys.modules['src.pf_engine.screener.main_screener'])
from src.pf_engine.screener.main_screener import Screener

# --- LOGIQUE DE PERSISTANCE DES PRESETS ---
PRESETS_DIR = ROOT / "data" / "screener_presets"
PRESETS_DIR.mkdir(parents=True, exist_ok=True)

SYSTEM_PRESETS = {
    "SYSTEM_Deep_Value": {
        "criteria": {
            "forwardPE": {"op": "<=", "val": 15.0},
            "priceToBook": {"op": "<=", "val": 1.5},
            "dividendYield": {"op": ">=", "val": 0.04},
        }
    },
    "SYSTEM_High_Growth": {
        "criteria": {
            "earningsGrowth": {"op": ">=", "val": 20.0},
            "returnOnEquity": {"op": ">=", "val": 15.0}
        }
    },
    "SYSTEM_Quality_Profitability": {
        "criteria": {
            "returnOnEquity": {"op": ">=", "val": 15.0},
            "currentRatio": {"op": ">=", "val": 1.5},
            "debtToEquity": {"op": "<=", "val": 1.0},
            "profitMargins": {"op": ">=", "val": 15.0}
        }
    }
}

def init_system_presets():
    for name, data in SYSTEM_PRESETS.items():
        filepath = PRESETS_DIR / f"{name}.json"
        if not filepath.exists():
            with open(filepath, "w") as f:
                json.dump(data, f, indent=4)

def save_screener_preset(name, criteria):
    filepath = PRESETS_DIR / f"{name}.json"
    with open(filepath, "w") as f:
        json.dump({"criteria": criteria}, f, indent=4)

def load_preset_file(name):
    filepath = PRESETS_DIR / f"{name}.json"
    if filepath.exists():
        with open(filepath, "r") as f:
            return json.load(f)
    return None

def list_presets():
    return sorted([f.stem for f in PRESETS_DIR.glob("*.json")])

def delete_preset(name):
    if str(name).startswith("SYSTEM_"):
        return False
    filepath = PRESETS_DIR / f"{name}.json"
    if filepath.exists():
        filepath.unlink()
        return True
    return False

init_system_presets()

# --- Fonctions mises en cache ---
@st.cache_data(show_spinner="SYSTEM : INITIATING SERVER-SIDE FILTERING VIA TRADINGVIEW API...")
def run_screener(fundamental_criteria):
    """
    Exécute le processus de screening complet.
    Cette fonction est mise en cache pour éviter de la ré-exécuter à chaque interaction.
    """
    screener = Screener()
    screened_df = screener.run_screener(custom_rules=fundamental_criteria, markets=['america'])
    return screened_df

# --- Interface Streamlit ---
st.title("SCREENER")
st.markdown("""
Cette page permet de filtrer l'univers d'investissement à partir des sources définies dans `settings.py`.
Le processus récupère les listes d'actions de plusieurs indices (S&P 500, Nasdaq 100, etc.), 
puis applique des filtres fondamentaux dynamiques basés sur les médianes sectorielles.
""")

st.markdown(f"> *INFO : {len(settings.LINKS)} sources de données macro-indiciels actives.*")

# --- Panneau de Contrôle ---
if 'fundamental_criteria' not in st.session_state:
    st.session_state['fundamental_criteria'] = {}

col_presets, col_filters = st.columns([1, 2], gap="large")

with col_presets:
    st.subheader("PRESET MANAGEMENT")
    st.markdown("Chargez ou sauvegardez des configurations de screening.")
    
    available_presets = list_presets()
    selected_preset = st.selectbox("AVAILABLE PRESETS", available_presets)
    
    col_btn_1, col_btn_2 = st.columns(2)
    with col_btn_1:
        if st.button("LOAD PRESET", width="stretch"):
            data = load_preset_file(selected_preset)
            if data:
                st.session_state['fundamental_criteria'] = data.get("criteria", {})
                st.toast(f"STATUS : PRESET '{selected_preset}' CHARGE.")
                st.rerun()
    with col_btn_2:
        if st.button("DELETE PRESET", width="stretch"):
            if delete_preset(selected_preset):
                st.toast(f"STATUS : PRESET '{selected_preset}' SUPPRIME.")
                st.rerun()
            else:
                st.error("ACTION REJETEE : Impossible de supprimer un preset systeme.")
                
    st.markdown("<br>", unsafe_allow_html=True)
    new_preset_name = st.text_input("NEW PRESET NAME", value="Custom_Strategy_1")
    if st.button("SAVE CURRENT CONFIG", width="stretch", type="secondary"):
        if new_preset_name.startswith("SYSTEM_"):
            st.error("ACTION REJETEE : Le prefixe 'SYSTEM_' est reserve.")
        else:
            save_screener_preset(new_preset_name, st.session_state['fundamental_criteria'])
            st.toast(f"STATUS : PRESET '{new_preset_name}' SAUVEGARDE.")
            st.rerun()

with col_filters:
    st.subheader("DYNAMIC FILTERS")
    
    with st.expander("FUNDAMENTAL RATIOS (ABSOLUTE)", expanded=True):
        AVAILABLE_METRICS = [
            'marketCap', 'trailingPE', 'forwardPE', 'priceToBook', 'dividendYield', 
            'returnOnEquity', 'debtToEquity', 'profitMargins', 'currentRatio', 'earningsGrowth'
        ]
        selected_metrics = st.multiselect("SELECT METRICS", AVAILABLE_METRICS, default=list(st.session_state['fundamental_criteria'].keys()))
        
        new_fundamental_criteria = {}
        for metric in selected_metrics:
            cols_crit = st.columns([3, 1, 2])
            prev_op = st.session_state['fundamental_criteria'].get(metric, {}).get('op', '>=')
            prev_val = st.session_state['fundamental_criteria'].get(metric, {}).get('val', 0.0)
            
            with cols_crit[0]:
                st.markdown(f"<div style='margin-top: 32px; font-weight: bold; color: #D1D5DB; font-size: 0.9rem;'>{metric.upper()}</div>", unsafe_allow_html=True)
            with cols_crit[1]:
                try:
                    idx = ['>', '<', '>=', '<=', '=='].index(prev_op)
                except ValueError:
                    idx = 2
                op = st.selectbox("OP", ['>', '<', '>=', '<=', '=='], index=idx, key=f"op_{metric}", label_visibility="collapsed")
            with cols_crit[2]:
                fmt = "%.0f" if metric == 'marketCap' else "%.4f"
                val = st.number_input("VAL", value=float(prev_val), format=fmt, key=f"val_{metric}", label_visibility="collapsed")
                
            new_fundamental_criteria[metric] = {'op': op, 'val': float(val)}
            
        st.session_state['fundamental_criteria'] = new_fundamental_criteria

if st.button("RUN SCREENER", type="primary", width="stretch"):
    active_criteria = st.session_state.get('fundamental_criteria', {})
    if not active_criteria:
        st.warning("SYSTEM ALERT: Vous devez definir au moins un critere fondamental ou charger un preset avant de lancer le Screener.")
        st.stop()
        
    st.markdown("> SYSTEM : APPLYING INSTITUTIONAL SERVER-SIDE CONSTRAINTS...")
    start_time = time.time()
    
    with st.spinner("SYSTEM : INITIATING SERVER-SIDE FILTERING VIA TRADINGVIEW API..."):
        run_screener.clear()
        screened_results = run_screener(active_criteria)
        
    end_time = time.time()
    
    if screened_results is not None and not screened_results.empty:
        # --- DÉDUPLICATION DES ENTREPRISES MULTI-COTÉES OU MULTI-CLASSES ---
        # Évite d'avoir GOOG et GOOGL, ou des cotations croisées (ex: MS.PA et MS.DE)
        dedup_col = 'description' if 'description' in screened_results.columns else ('name' if 'name' in screened_results.columns else None)
        if dedup_col:
            # 1. Déduplication stricte par le nom entier brut
            screened_results = screened_results.drop_duplicates(subset=[dedup_col], keep='first')
            
            # 2. Déduplication par nom nettoyé pour capturer les variantes
            screened_results['_clean_name'] = screened_results[dedup_col].astype(str).str.upper()
            # Nettoyage des suffixes de classes d'actions et statuts légaux
            for suffix in [' CLASS A', ' CLASS B', ' CLASS C', ' - CLASS A', ' - CLASS B', ' - CLASS C', ' INC.', ' INC', ' CORP.', ' CORP', ' CORPORATION', ' LTD.', ' LTD', ' LIMITED', ' PLC', ' PLC.', ' S.A.', ' SA', ' COMPANY', ' THE ']:
                screened_results['_clean_name'] = screened_results['_clean_name'].str.replace(suffix, '', regex=False)
            # Suppression des indications secondaires après un tiret ou une virgule
            screened_results['_clean_name'] = screened_results['_clean_name'].str.split('-').str[0]
            screened_results['_clean_name'] = screened_results['_clean_name'].str.split(',').str[0].str.strip()
            
            # Conservation de la première occurrence (généralement la plus liquide / principale)
            screened_results = screened_results.drop_duplicates(subset=['_clean_name'], keep='first')
            screened_results = screened_results.drop(columns=['_clean_name'])

        st.session_state['screened_df'] = screened_results
        
        # SAUVEGARDE CRITIQUE DE LA LISTE DES TICKERS POUR YFINANCE (SCORING/OPTIMISATION)
        st.session_state['screened_assets'] = screened_results['ticker'].tolist()
        
        st.success(f"SUCCESS: {len(screened_results)} actifs identifies.")
        st.rerun()

    elif screened_results is not None and screened_results.empty:
        st.error("SYSTEM FAULT: Aucun actif ne correspond a ces criteres stricts.")
        st.session_state['screened_df'] = pd.DataFrame() # Store empty dataframe
        st.session_state['screened_assets'] = []
    else:
        st.error("SYSTEM FAULT: Exception critique detectee lors de l'extraction API.")


# --- Affichage des résultats si déjà calculés ---
if st.session_state.get('screened_df') is not None:
    st.markdown("---")
    st.header("SCREENING MATRIX")

    if not st.session_state['screened_df'].empty:
        st.dataframe(st.session_state['screened_df'], width="stretch")
    else:
        st.markdown("> *INFO : La matrice de filtrage est vide.*")
else:
    st.markdown("> *STATUS : Système en attente de traitement algorithmique.*")

st.markdown("---")
if st.button("PURGE SCREENER CACHE"):
    run_screener.clear()
    st.markdown("> **STATUS : OK** - Mémoire cache réinitialisée.")
