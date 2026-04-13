import sys
import os
import json
import time
from pathlib import Path

import streamlit as st
import pandas as pd

# --- SYSTEM PATH & CONFIG ---
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

st.set_page_config(page_title="CAPITALIS V2 - System Settings", layout="wide")

from src.data_managers.db_manager import get_db
from src.utils.ui_config import set_terminal_margins, setup_bloomberg_shortcuts

set_terminal_margins()
setup_bloomberg_shortcuts()

# --- USER PREFERENCES CONFIGURATION ---
PREFS_FILE = ROOT / "data" / "user_prefs.json"

def load_preferences():
    default_prefs = {
        "accent_color": "#3B82F6", 
        "default_capital": 20000,
        "currency": "EUR (€)",
        "chart_template": "plotly_dark",
        "decimals": 2,
        "ui_density": "Normale"
    }
    if PREFS_FILE.exists():
        try:
            with open(PREFS_FILE, "r") as f:
                saved_prefs = json.load(f)
                return {**default_prefs, **saved_prefs}
        except:
            pass
    return default_prefs

def save_preferences(prefs):
    PREFS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PREFS_FILE, "w") as f:
        json.dump(prefs, f, indent=4)

prefs = load_preferences()

# --- INJECTION CSS DYNAMIQUE ---
# Gestion de la densite (Padding global)
padding_top = "2rem" if prefs.get("ui_density") == "Compacte" else "4rem" if prefs.get("ui_density") == "Aérée" else "3rem"
gap_elements = "0.5rem" if prefs.get("ui_density") == "Compacte" else "1.5rem" if prefs.get("ui_density") == "Aérée" else "1rem"

st.markdown(f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
    html, body, [class*="css"] {{ font-family: 'JetBrains Mono', monospace !important; }}
    
    /* Dynamic UI Density */
    .block-container {{
        padding-top: {padding_top} !important;
        gap: {gap_elements} !important;
    }}
    
    /* Dynamic Accent Color Injection */
    .stButton>button[kind="primary"] {{
        background-color: {prefs.get('accent_color')} !important;
        border-color: {prefs.get('accent_color')} !important;
    }}
    .stProgress .st-bo {{ background-color: {prefs.get('accent_color')} !important; }}
</style>
""", unsafe_allow_html=True)

# --- DATABASE CONNECTION ---
try:
    db = get_db()
except Exception as e:
    st.error(f"SYSTEM FAULT : Base de donnees inaccessible - {e}")
    st.stop()

# --- UI : HEADER ---
st.title("SYSTEM SETTINGS & DIAGNOSTICS")
st.markdown("Panneau de controle d'administration de l'environnement CAPITALIS V2.")

tab_data, tab_ui = st.tabs(["DATA MANAGEMENT", "UI & PREFERENCES"])

# --- TAB 1 : DATA MANAGEMENT ---
with tab_data:
    st.subheader("DATABASE DIAGNOSTICS")
    
    col_kpi1, col_kpi2, col_kpi3 = st.columns(3)
    
    # KPI Portfolios
    df_portfolios = db.get_all_portfolios()
    nb_pf = len(df_portfolios) if not df_portfolios.empty else 0
    col_kpi1.metric("Portefeuilles Sauvegardes", nb_pf)
    
    # KPI Assets (Scoring)
    with db.get_connection(db.db_scores) as conn:
        try:
            nb_assets = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        except:
            nb_assets = 0
    col_kpi2.metric("Actifs en Base de Donnees", nb_assets)
    
    # KPI Market Data (History)
    with db.get_connection(db.db_market) as conn:
        try:
            nb_prices = conn.execute("SELECT COUNT(*) FROM market_data").fetchone()[0]
        except:
            nb_prices = 0
    col_kpi3.metric("Lignes d'Historique Prix", f"{nb_prices:,}")
    
    st.markdown("---")
    
    # Gestion des Portefeuilles (Suppression de masse)
    st.subheader("PORTFOLIO MANAGER")
    if not df_portfolios.empty:
        st.dataframe(df_portfolios[['name', 'creation_date']], use_container_width=True, hide_index=True)
        
        pf_to_delete = st.selectbox("Selectionner un portefeuille a detruire :", df_portfolios['name'].tolist())
        if st.button("DELETE PORTFOLIO", type="primary"):
            db.delete_portfolio(pf_to_delete)
            st.toast(f"Portefeuille {pf_to_delete} supprime.")
            time.sleep(1)
            st.rerun()
    else:
        st.info("Aucun portefeuille actuellement enregistre dans la base de donnees.")
        
    st.markdown("---")
    
    # Purge Cache Globale
    st.subheader("SYSTEM CACHE")
    if st.button("PURGE ALL SYSTEM CACHE", use_container_width=True):
        st.cache_data.clear()
        st.cache_resource.clear()
        st.success("Memoire cache purgee avec succes. Les prochaines executions rechargeront les donnees a neuf.")
        
    st.markdown("---")
    
    st.subheader("SCREENER API UNITS GUIDE")
    st.markdown("""
    <div style='background-color: #111111; padding: 15px; border-left: 3px solid #3B82F6; margin-bottom: 20px;'>
        <div style='color: #888888; font-size: 0.8rem; font-weight: bold; margin-bottom: 5px;'>GUIDE DES UNITÉS DE FILTRAGE API</div>
        <table style='width: 100%; font-size: 0.85rem; color: #D1D5DB;'>
            <tr><td><b>marketCap</b></td><td>Capitalisation boursière en devise absolue (ex: <code>1000000000</code> pour 1 Milliard).</td></tr>
            <tr><td><b>trailingPE / forwardPE</b></td><td>Multiple de valorisation (ex: <code>15.0</code> pour 15x les bénéfices).</td></tr>
            <tr><td><b>priceToBook</b></td><td>Multiple de la valeur comptable (ex: <code>1.5</code> pour 1.5x).</td></tr>
            <tr><td><b>dividendYield</b></td><td>Pourcentage absolu ou décimal selon l'API (ex: <code>0.04</code> ou <code>4.0</code> pour 4%).</td></tr>
            <tr><td><b>returnOnEquity / profitMargins</b></td><td>Pourcentage absolu (ex: <code>15.0</code> pour 15%).</td></tr>
            <tr><td><b>earningsGrowth</b></td><td>Pourcentage absolu de croissance (ex: <code>20.0</code> pour 20%).</td></tr>
            <tr><td><b>currentRatio / debtToEq.</b></td><td>Multiple direct (ex: <code>1.5</code> ou <code>1.0</code>).</td></tr>
        </table>
    </div>
    """, unsafe_allow_html=True)

# --- TAB 2 : UI & PREFERENCES ---
with tab_ui:
    st.subheader("INTERFACE & FORMATTING CUSTOMIZATION")
    
    col_ux1, col_ux2 = st.columns(2)
    
    with col_ux1:
        st.markdown("<div style='color: #888888; font-size: 0.85rem; font-weight: bold; margin-bottom: 10px;'>VISUEL & DESIGN</div>", unsafe_allow_html=True)
        
        new_color = st.color_picker(
            "Couleur d'Accentuation (Boutons, Progress Bars) :", 
            value=prefs.get("accent_color", "#3B82F6")
        )
        
        chart_opts = ["plotly_dark", "plotly_white", "seaborn", "ggplot2"]
        current_chart = prefs.get("chart_template", "plotly_dark")
        new_chart_theme = st.selectbox(
            "Thème des graphiques interactifs (Plotly) :", 
            chart_opts, 
            index=chart_opts.index(current_chart) if current_chart in chart_opts else 0
        )
        
        density_opts = ["Compacte", "Normale", "Aérée"]
        current_density = prefs.get("ui_density", "Normale")
        new_density = st.select_slider(
            "Densité de l'interface (Marges) :", 
            options=density_opts, 
            value=current_density
        )

    with col_ux2:
        st.markdown("<div style='color: #888888; font-size: 0.85rem; font-weight: bold; margin-bottom: 10px;'>PARAMÈTRES FINANCIERS</div>", unsafe_allow_html=True)
        
        new_capital = st.number_input(
            "Capital Nominal par Défaut :", 
            min_value=1000, 
            value=prefs.get("default_capital", 20000), 
            step=1000
        )
        
        currency_opts = ["EUR (€)", "USD ($)", "GBP (£)", "CHF (Fr)"]
        current_currency = prefs.get("currency", "EUR (€)")
        new_currency = st.selectbox(
            "Devise de Référence globale :", 
            currency_opts, 
            index=currency_opts.index(current_currency) if current_currency in currency_opts else 0
        )
        
        decimal_opts = [2, 3, 4]
        current_decimal = prefs.get("decimals", 2)
        new_decimals = st.radio(
            "Précision des Décimales (Poids & Scores) :", 
            options=decimal_opts, 
            index=decimal_opts.index(current_decimal) if current_decimal in decimal_opts else 0,
            horizontal=True
        )
        
    st.markdown("---")
    
    if st.button("SAVE PREFERENCES", type="primary", use_container_width=True):
        new_prefs = {
            "accent_color": new_color,
            "default_capital": new_capital,
            "chart_template": new_chart_theme,
            "currency": new_currency,
            "decimals": new_decimals,
            "ui_density": new_density
        }
        save_preferences(new_prefs)
        st.success("Paramètres mis à jour avec succès ! Le système est en train de recharger l'interface...")
        time.sleep(1) # Laisse le temps au toast de s'afficher
        st.rerun()
