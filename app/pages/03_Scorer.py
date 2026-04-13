
import streamlit as st
import pandas as pd
import sys
from pathlib import Path
import time
import plotly.graph_objects as go

# --- Configuration de la Page ---
st.set_page_config(
    page_title="CAPITALIS V2 - Scorer",
    layout="wide"
)

# --- Ajout du chemin racine et import des modules ---
# Logique d'import inspirée de engine.ipynb, adaptée pour la structure de l'app Streamlit
ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))  # On ajoute le chemin au début de la liste

# --- Configuration UI & Raccourcis ---
from src.utils.ui_config import set_terminal_margins, setup_bloomberg_shortcuts
set_terminal_margins()
setup_bloomberg_shortcuts()

# --- Injection de la police JetBrains Mono ---
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
from src.pf_engine.scorer.scorer import Scorer

# --- Fonctions de Callback pour la gestion des poids ---
def save_default_scoring_params(params_dict):
    """Callback pour sauvegarder les poids actuels comme nouveaux poids par défaut."""
    settings.SCORING_WEIGHTS = params_dict.copy()
    st.toast("Current weights have been set as default for this session.")

def reset_scoring_params():
    """Callback pour réinitialiser les poids aux valeurs par défaut du système."""
    st.session_state['custom_weights'] = settings.SCORING_WEIGHTS.copy()


# --- Fonctions mises en cache ---
@st.cache_data(show_spinner="Exécution du modèle de scoring multi-facteurs...")
def run_scoring(_df_input, _custom_weights):

    if _df_input is None or _df_input.empty:
        return pd.DataFrame()
    
    # Adaptation pour tvscreener : renommage de la colonne 'ticker' en 'symbol'
    df_target = _df_input.copy()
    if 'ticker' in df_target.columns and 'symbol' not in df_target.columns:
        df_target = df_target.rename(columns={'ticker': 'symbol'})

    # Remplacement temporaire des poids dans le module 'settings' 
    # car la classe Scorer ne prend pas 'weights' en argument.
    original_weights = settings.SCORING_WEIGHTS
    settings.SCORING_WEIGHTS = _custom_weights
    
    try:
        scorer = Scorer(df_input=df_target)
        scored_df = scorer.ComputeScore()
    finally:
        # Restauration pour éviter les effets de bord
        settings.SCORING_WEIGHTS = original_weights
        
    return scored_df

# --- Interface Streamlit ---
st.title("SCORING MODEL")

# --- Vérification de l'état de la session ---
if 'screened_df' not in st.session_state or st.session_state['screened_df'] is None:
    try:
        from src.data_managers.db_manager import get_db
        db = get_db()
        df_screened = db.get_screened_assets()
        if not df_screened.empty:
            st.session_state['screened_df'] = df_screened
            st.toast("Univers d'actifs restauré depuis SQLite.")
    except Exception:
        pass

if 'screened_df' not in st.session_state or st.session_state['screened_df'] is None or st.session_state['screened_df'].empty:
    st.markdown("> **WARNING** - Prérequis manquant : L'univers d'actifs n'est pas défini. Initialisez le SCREENER au préalable.")
    st.stop()

df_screened = st.session_state['screened_df']

manual_tickers = st.session_state.get('manual_tickers', [])
manual_tickers_df = st.session_state.get('manual_tickers_df', pd.DataFrame())

if df_screened.empty and not manual_tickers:
    st.markdown("> **ERROR** - Univers d'entrée nul et aucun actif de conviction manuel. Processus de scoring interrompu.")
    st.stop()

st.markdown(f"> *INFO : Volume d'actifs en file d'attente : {len(df_screened)}.*")

if manual_tickers:
    st.markdown("### CONVICTION HOLDINGS (MANUAL)")
    st.markdown("> *INFO : Ces actifs bypassent le modèle de scoring et sont pré-approuvés pour l'allocation cible.*")
    
    if not manual_tickers_df.empty:
        display_cols = [c for c in ['Ticker', 'Name', 'Sector', 'Price'] if c in manual_tickers_df.columns]
        st.dataframe(manual_tickers_df[display_cols], hide_index=True, width="stretch")
        st.markdown("<br>", unsafe_allow_html=True)
    else:
        html_tickers = "".join([f"<span style='background-color:#111111; padding:5px 15px; margin-right:10px; border-left:3px solid #F5A623; color:#FFFFFF; font-weight:bold; font-family:monospace;'>{t}</span>" for t in manual_tickers])
        st.markdown(f"<div style='margin-bottom:25px;'>{html_tickers}</div>", unsafe_allow_html=True)

st.markdown("Le scorer va évaluer les métriques de performance et de valeur, les convertir en Z-scores sectoriels, puis calculer un score pondéré pour chaque action.")

if 'custom_weights' not in st.session_state:
    st.session_state['custom_weights'] = settings.SCORING_WEIGHTS.copy()

with st.expander("FACTOR WEIGHTS CONFIGURATION", expanded=False):
    st.markdown("Définition de l'allocation factorielle. La contrainte de normalisation impose une somme des pondérations égale à 1.0 (100%).")
    
    new_weights = st.session_state['custom_weights'].copy()
    cols = st.columns(4)
    for i, (factor, weight) in enumerate(st.session_state['custom_weights'].items()):
        with cols[i % 4]:
            new_weights[factor] = st.slider(
                label=factor.upper(), value=float(weight),
                min_value=0.0, max_value=1.0, step=0.01, key=f"weight_{factor}"
            )
    st.session_state['custom_weights'] = new_weights
    
    total_weight = sum(st.session_state['custom_weights'].values())
    st.markdown(f"**TOTAL EXPOSURE : {total_weight:.2%}**")
    if abs(total_weight - 1.0) > 0.001:
        st.markdown(f"> **WARNING** - Le modèle n'est pas normalisé (Somme = {total_weight:.2%}).")
        
    btn_col1, btn_col2 = st.columns(2)
    with btn_col1:
        st.button(
            "Set current as default",
            on_click=save_default_scoring_params,
            args=(st.session_state['custom_weights'],),
            width="stretch",
            key="set_default_scorer"
        )
    with btn_col2:
        st.button(
            "Reset to system defaults",
            on_click=reset_scoring_params,
            width="stretch",
            key="reset_scorer"
        )

format_config = {
    "CAGR": st.column_config.NumberColumn("CAGR", format="%.2f %%"),
    "Vol_Ann": st.column_config.NumberColumn("Volatilité", format="%.2f %%"),
    "Sharpe": st.column_config.NumberColumn("Sharpe", format="%.2f"),
    "trailingPE": st.column_config.NumberColumn("P/E Ratio", format="%.1f"),
    "forwardPE": st.column_config.NumberColumn("Fwd P/E", format="%.1f"),
    "priceToBook": st.column_config.NumberColumn("P/B Ratio", format="%.2f"),
    "returnOnEquity": st.column_config.NumberColumn("ROE", format="%.2f %%"),
    "earningsGrowth": st.column_config.NumberColumn("Croissance Bénéfices", format="%.2f %%"),
    "Total_Score": st.column_config.NumberColumn("Score Global", format="%.3f")
}

if st.button("RUN SCORER", type="primary", width="stretch"):
    
    start_time = time.time()
    # On utilise un hash du DataFrame comme partie de la clé de cache implicite de Streamlit
    # pour s'assurer que le cache est invalidé si les données d'entrée changent.
    if not df_screened.empty:
        # Déduplication finale par nom entier avant le scoring pour éviter les doublons résiduels
        name_col = next((c for c in df_screened.columns if str(c).lower() in ['name', 'description', 'company_name']), None)
        if name_col:
            df_screened = df_screened.drop_duplicates(subset=[name_col], keep='first')
            
        scored_results = run_scoring(df_screened, st.session_state['custom_weights'])
    else:
        scored_results = pd.DataFrame()
    end_time = time.time()
    
    if scored_results is not None:
        st.session_state['scored_df'] = scored_results
        
        # --- PERSISTANCE SQLITE ---
        try:
            from src.data_managers.db_manager import get_db
            db = get_db()
            db.upsert_scores(scored_results)
        except Exception as e:
            st.warning(f"Erreur lors de l'enregistrement SQL: {e}")

        st.markdown(f"> **STATUS : OK** - Modèle exécuté avec succès ({end_time - start_time:.2f}s).")
        if not scored_results.empty:
            st.dataframe(scored_results, hide_index=True, column_config=format_config, width="stretch")
        st.markdown("> *INFO : Données factorielles persistées. Prêt pour l'étape PORTFOLIO OPTIMIZATION.*")


# --- Affichage des résultats si déjà calculés ---
if st.session_state.get('scored_df') is not None:
    st.header("SCORING MATRIX")
    df_results = st.session_state['scored_df']
    
    if not df_results.empty:
        st.subheader("FACTOR EXPOSURE (RADAR CHART)")
        st.markdown("> *INFO : Visualisation du profil factoriel (Z-Scores) de l'actif par rapport à sa médiane sectorielle.*")
        
        # Extraction dynamique des colonnes de Z-scores
        z_cols = [col for col in df_results.columns if str(col).startswith('Z_')]
        
        if z_cols:
            selected_ticker = st.selectbox("SÉLECTIONNER UN ACTIF :", df_results['Ticker'].tolist())
            ticker_data = df_results[df_results['Ticker'] == selected_ticker].iloc[0]
            
            # Préparation des données pour Plotly
            categories = [col.replace('Z_', '') for col in z_cols]
            values = [ticker_data[col] for col in z_cols]
            
            # Fermeture du polygone pour le rendu Radar
            categories.append(categories[0])
            values.append(values[0])
            
            fig_radar = go.Figure()
            fig_radar.add_trace(go.Scatterpolar(
                r=values,
                theta=categories,
                fill='toself',
                name=selected_ticker,
                line=dict(color='#F5A623'), # Ambre institutionnel
                fillcolor='rgba(245, 166, 35, 0.2)'
            ))
            
            fig_radar.update_layout(
                polar=dict(
                    radialaxis=dict(visible=True, gridcolor='#333333'),
                    angularaxis=dict(gridcolor='#333333'),
                    bgcolor='#111111'
                ),
                showlegend=False,
                template="plotly_dark",
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(0,0,0,0)',
            font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"),
                margin=dict(l=40, r=40, t=40, b=40),
                height=450
            )
            st.plotly_chart(fig_radar, width="stretch")

        st.subheader("FULL SCORING MATRIX")
        st.dataframe(df_results, hide_index=True, column_config=format_config, width="stretch", height=500)
        
        st.subheader("SCORE DISTRIBUTION")
        fig = st.bar_chart(df_results.set_index('Ticker')['Total_Score'])

    else:
        st.markdown("> *INFO : Matrice de scoring quantitative vide (Uniquement des actifs de conviction).*")
else:
    st.markdown("> *STATUS : Système en attente de traitement algorithmique.*")

st.markdown("---")
if st.button("PURGE SCORER CACHE"):
    run_scoring.clear()
    st.markdown("> **STATUS : OK** - Mémoire cache réinitialisée.")
