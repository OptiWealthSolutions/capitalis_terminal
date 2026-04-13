import streamlit as st
import pandas as pd
import sys
from pathlib import Path
import plotly.express as px
import plotly.graph_objects as go
import numpy as np
import yfinance as yf
import importlib
from plotly.subplots import make_subplots

# --- Configuration de la Page ---
st.set_page_config(
    page_title="CAPITALIS V2 - Portfolio",
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
    div[data-testid="stMetricValue"] {
        color: #F5A623;
    }
    div[data-testid="stMetricLabel"] {
        color: #888888;
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    .stTabs [data-baseweb="tab-list"] { gap: 24px; }
    .stTabs [data-baseweb="tab"] { font-size: 1.0rem; padding-bottom: 10px; text-transform: uppercase; }
</style>
""", unsafe_allow_html=True)

from src.core import config as settings
from src.pf_engine.portfolio_optimization.portfolio_optimizer import Portfolio
from src.pf_engine.portfolio_optimization.settings_maximisation import find_optimal_parameters
from src.pf_engine.risk_management.monte_carlo_simulation import run_monte_carlo_portfolio, calculate_var_cvar

if 'src.pf_engine.portfolio_optimization.hrp_engine' in sys.modules:
    importlib.reload(sys.modules['src.pf_engine.portfolio_optimization.hrp_engine'])
from src.pf_engine.portfolio_optimization.hrp_engine import post_process_weights

# --- Fonctions mises en cache ---
@st.cache_data(show_spinner="Moteur d'optimisation de portefeuille en cours d'execution...")
def run_optimization(tickers, method, capital, min_w, max_w, risk_aversion):
    if not tickers:
        return None, "Structure d'actifs manquante."
    try:
        portfolio = Portfolio(
            tickers=tickers, capital=capital, min_weight=min_w,
            max_weight=max_w, risk_aversion=risk_aversion
        )
        weights = portfolio.Optimize(method=method)
        return weights, portfolio
    except Exception as e:
        st.markdown(f"> **ERROR** - Erreur lors de l'optimisation matricielle : {e}")
        return None, None

def sanitize_tickers_for_yfinance(tickers_list):
    sanitized = []
    for t in tickers_list:
        if not isinstance(t, str):
            sanitized.append(t)
            continue
        t_upper = str(t).upper()
        if ':' in t_upper:
            t_upper = t_upper.split(':')[-1]
        if t_upper in ['BRK.B', 'BRK.A', 'BF.B', 'BF.A']:
            sanitized.append(t_upper.replace('.', '-'))
            continue
        
        protected = False
        if hasattr(settings, 'PROTECTED_SUFFIXES'):
            for suffix in settings.PROTECTED_SUFFIXES:
                if t_upper.endswith(suffix):
                    sanitized.append(t_upper.replace('/', '-'))
                    protected = True
                    break
        if not protected:
            sanitized.append(t_upper.replace('.', '-').replace('/', '-'))
    return sanitized

@st.cache_data(show_spinner="Recuperation des donnees pour les tickers manuels...")
def fetch_manual_ticker_data(tickers):
    if not tickers: return pd.DataFrame()
    try:
        from src.data_managers.db_manager import get_db
        db = get_db()
        placeholders = ','.join(['?'] * len(tickers))
        query = f"SELECT ticker AS Ticker, name AS Name, sector AS Sector, industry AS Industry, country AS Country FROM assets WHERE ticker IN ({placeholders})"

        with db.get_connection(db.db_scores) as conn:
            df_db = pd.read_sql_query(query, conn, params=tickers)

        found_tickers = df_db['Ticker'].tolist()
        not_found_tickers = [t for t in tickers if t not in found_tickers]

        if not_found_tickers:
            st.warning(f"Tickers manuels avec metadonnees inconnues : {', '.join(not_found_tickers)}")
            missing_data = [{
                'Ticker': ticker, 'Name': ticker, 'Sector': 'Inconnu',
                'Industry': 'Inconnu', 'Country': 'Inconnu'
            } for ticker in not_found_tickers]
            missing_df = pd.DataFrame(missing_data)
            df_final = pd.concat([df_db, missing_df], ignore_index=True)
            return df_final

        return df_db
    except Exception as e:
        st.error(f"Erreur acces base de donnees : {e}")
        return pd.DataFrame([{'Ticker': t, 'Name': t, 'Sector': 'Inconnu', 'Industry': 'Inconnu', 'Country': 'Inconnu'} for t in tickers])

def deduplicate_semantic_tickers(df):
    if df.empty or 'Ticker' not in df.columns:
        return df
    tickers = df['Ticker'].tolist()
    to_remove = set()
    if 'GOOG' in tickers and 'GOOGL' in tickers: to_remove.add('GOOG')
    if 'BRK.A' in tickers and 'BRK.B' in tickers: to_remove.add('BRK.A')
    if 'BF.A' in tickers and 'BF.B' in tickers: to_remove.add('BF.A')
        
    for t1 in tickers:
        if len(t1) == 5 and t1.endswith('F'):
            base_name = t1[:-1]
            potential_adr = base_name + 'Y'
            if potential_adr in tickers:
                to_remove.add(t1)
    return df[~df['Ticker'].isin(to_remove)].copy()

def plot_uncertainty_cone(df_portfolio_past_base100, sim_paths):
    past_vals = df_portfolio_past_base100.values.flatten() if isinstance(df_portfolio_past_base100, (pd.DataFrame, pd.Series)) else np.array(df_portfolio_past_base100)
    sim_vals = sim_paths.values if isinstance(sim_paths, (pd.DataFrame, pd.Series)) else np.array(sim_paths)
    
    x_hist = np.arange(-len(past_vals) + 1, 1)
    x_proj = np.arange(len(sim_vals))
    mean_path = np.mean(sim_vals, axis=1)
    p2_5 = np.percentile(sim_vals, 2.5, axis=1)
    p97_5 = np.percentile(sim_vals, 97.5, axis=1)
    
    final_values = sim_vals[-1, :]
    var_95 = np.percentile(final_values, 5)
    
    fig = make_subplots(rows=1, cols=2, shared_yaxes=True, column_widths=[0.7, 0.3], horizontal_spacing=0.01)
    fig.add_trace(go.Scatter(x=x_proj, y=p97_5, mode='lines', line=dict(width=0), showlegend=False), row=1, col=1)
    fig.add_trace(go.Scatter(x=x_proj, y=p2_5, mode='lines', name='95% Confidence Interval', fill='tonexty', fillcolor='rgba(59, 130, 246, 0.15)', line=dict(width=0)), row=1, col=1)
    fig.add_trace(go.Scatter(x=x_proj, y=mean_path, mode='lines', name='Expected Mean Path', line=dict(color='#3B82F6', width=3, dash='dash')), row=1, col=1)
    fig.add_trace(go.Scatter(x=x_hist, y=past_vals, mode='lines', name='Historical Path', line=dict(color='#E5E7EB', width=3)), row=1, col=1)
    fig.add_trace(go.Histogram(y=final_values, orientation='h', name='Distribution Finale', marker_color='rgba(59, 130, 246, 0.5)', histnorm='probability density', showlegend=False), row=1, col=2)
    fig.add_hline(y=var_95, line_dash="dash", line_color="#FF4136", line_width=2, annotation_text="VaR 95%", annotation_position="top right", annotation_font_color="#FF4136", row=1, col=2)
    
    fig.update_layout(
        title=dict(text="HISTORICAL PERFORMANCE & UNCERTAINTY CONE (BASE 100)", font=dict(color="#888888", size=14)),
        template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1), margin=dict(l=10, r=10, t=40, b=10), height=450
    )
    fig.update_xaxes(title_text="Horizon (Jours)", showgrid=False, row=1, col=1)
    fig.update_xaxes(title_text="Densite de Probabilite", showgrid=False, row=1, col=2)
    fig.update_yaxes(title_text="Performance", showgrid=True, gridcolor='#1E232F', zeroline=True, zerolinecolor='#333333', row=1, col=1)
    fig.update_yaxes(showgrid=False, zeroline=False, row=1, col=2)
    return fig

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_xray_data(tickers_list):
    info_dict = {}
    for t in tickers_list:
        try:
            info_dict[t] = yf.Ticker(t).info
        except Exception:
            info_dict[t] = {}
    return info_dict

# --- Interface Streamlit ---
col_title, col_pf = st.columns([2, 1])
with col_title:
    st.title("PORTFOLIO MASTER VIEW")
with col_pf:
    st.markdown("<div style='margin-top: 15px;'></div>", unsafe_allow_html=True)
    try:
        from src.data_managers.db_manager import get_db
        db = get_db()
        portfolios_df = db.get_all_portfolios()
        if not portfolios_df.empty:
            pf_names = portfolios_df['name'].tolist()
            current_pf_name = st.session_state.get('loaded_pf_name', pf_names[0])
            index_select = pf_names.index(current_pf_name) if current_pf_name in pf_names else 0
            
            st.markdown("<div style='color: #888888; font-size: 0.8rem; margin-bottom: 5px; font-weight: bold;'>PORTEFEUILLE ACTIF :</div>", unsafe_allow_html=True)
            col_sel, col_load, col_del = st.columns([3, 1, 1])
            with col_sel:
                pf_name_to_load = st.selectbox("Charger un portefeuille existant :", pf_names, index=index_select, label_visibility="collapsed")
            with col_load:
                if st.button("LOAD", use_container_width=True):
                    pf_data = db.load_portfolio(pf_name_to_load)
                    if pf_data:
                        st.session_state['target_portfolio'] = pf_data
                        st.session_state['loaded_pf_name'] = pf_name_to_load
                        st.session_state['active_portfolio_tickers'] = [t for t, w in pf_data.get('weights', {}).items() if w > 0]
                        st.rerun()
            with col_del:
                if st.button("DELETE", key="delete_portfolio_btn", type="primary", use_container_width=True):
                    db.delete_portfolio(pf_name_to_load)
                    st.cache_data.clear()
                    if st.session_state.get('loaded_pf_name') == pf_name_to_load:
                        st.session_state.pop('target_portfolio', None)
                        st.session_state.pop('loaded_pf_name', None)
                    st.toast(f"Portefeuille '{pf_name_to_load}' efface definitivement.")
                    st.rerun()
        else:
            st.selectbox("PORTEFEUILLE ACTIF :", ["Aucun portefeuille"], disabled=True)
    except Exception as e:
        st.error(f"Erreur lors de la gestion du portefeuille : {e}")

# --- DECLARATION DES ONGLETS ---
tab_allocation, tab_performance, tab_stress_risk, tab_drawdowns = st.tabs([
    "Allocation & Poids", 
    "Performance Historique", 
    "Stress Tests & Risk (Monte Carlo)", 
    "Rendements & Drawdowns"
])

manual_tickers = st.session_state.get('manual_tickers', [])
df_scored = st.session_state.get('scored_df', pd.DataFrame())

if df_scored.empty:
    try:
        from src.data_managers.db_manager import get_db
        db = get_db()
        df_scored = db.get_latest_scores()
        if not df_scored.empty:
            st.session_state['scored_df'] = df_scored
            st.toast("Matrice integrale restauree depuis SQLite.")
    except Exception:
        pass

is_scored_empty = df_scored.empty

if is_scored_empty and not manual_tickers:
    with tab_allocation:
        st.markdown("> **WARNING** - Dependances manquantes. Execution des modules SCREENER et SCORING requise.")
    st.stop()

max_slider_val = len(df_scored)
if 'auto_top_n' not in st.session_state: st.session_state['auto_top_n'] = min(20, max_slider_val) if max_slider_val > 0 else 0
if 'auto_lambda' not in st.session_state: st.session_state['auto_lambda'] = 5.0

# --- SECTION CONFIGURATION DE L'ALLOCATION ---
with tab_allocation, st.expander("CONTROL PANEL & PARAMETERS", expanded=True):
    st.markdown("### 1. RISK PROFILING ENGINE")
    risk_profile = st.selectbox(
        "SELECTION DU PROFIL DE RISQUE (Ajuste automatiquement la concentration) :",
        ["Personnalise (Custom)", "Defensif (Conservative)", "Equilibre (Balanced)", "Agressif (Concentrated)"],
        index=0
    )
    
    if risk_profile == "Defensif (Conservative)":
        def_lambda, def_min_w, def_max_w, def_max_sec = 15.0, 1.0, 5.0, 20.0
    elif risk_profile == "Equilibre (Balanced)":
        def_lambda, def_min_w, def_max_w, def_max_sec = 5.0, 2.0, 10.0, 30.0
    elif risk_profile == "Agressif (Concentrated)":
        def_lambda, def_min_w, def_max_w, def_max_sec = 1.0, 4.0, 25.0, 50.0
    else: 
        def_lambda = float(st.session_state.get('auto_lambda', 5.0))
        def_min_w, def_max_w, def_max_sec = 2.0, 10.0, 30.0

    st.markdown("### 2. ALLOCATION PARAMETERS")
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        if max_slider_val > 0:
            top_n = st.slider("ACTIONS QUANT. A INCLURE :", min_value=min(5, max_slider_val), max_value=max_slider_val, step=1, value=min(int(st.session_state['auto_top_n']), max_slider_val))
            st.session_state['auto_top_n'] = top_n
        else:
            top_n = 0
            st.markdown("> *INFO : Aucun actif quantitatif.*")
        capital = st.number_input("CAPITAL NOMINAL (EUR):", min_value=1000, value=20000, step=1000)

    df_top = df_scored.head(top_n) if max_slider_val > 0 else pd.DataFrame()

    with col2:
        method = st.selectbox("ALGORITHME MATHEMATIQUE:", ["HRP", "MinVol", "MeanVar", "EqualWeights"], index=0)
        risk_aversion = st.slider("AVERSION AU RISQUE (Lambda):", min_value=0.1, max_value=20.0, step=0.1, value=def_lambda, disabled=(method not in ["HRP", "MeanVar"]))
        st.session_state['auto_lambda'] = risk_aversion

    with col3:
        min_weight = st.slider("CONTRAINTE MIN (%):", min_value=0.0, max_value=15.0, value=def_min_w, step=0.1) / 100
        max_weight_value = st.slider("MAX ASSET WEIGHT (%):", min_value=0.5, max_value=50.0, value=def_max_w, step=0.5)
        max_weight = max_weight_value / 100
        max_sector_value = st.slider("MAX SECTOR WEIGHT (%):", min_value=10.0, max_value=100.0, value=def_max_sec, step=1.0)
        max_sector_weight = max_sector_value / 100

    with col4:
        manual_tickers_str = st.text_area("MANUAL TICKERS (BYPASS):", value=", ".join(st.session_state.get('manual_tickers', [])))
        manual_tickers = [ticker.strip().upper() for ticker in manual_tickers_str.split(',') if ticker.strip()]
        st.session_state['manual_tickers'] = manual_tickers
        df_manual = fetch_manual_ticker_data(manual_tickers)
        
        if st.button(" AUTO-TUNE (MAX SHARPE)", width="stretch"):
            if df_scored.empty:
                st.error("Auto-Tune indisponible sans donnees de scoring.")
            else:
                with st.spinner("Recherche des parametres optimaux..."):
                    df_tune = df_scored.copy()
                    if 'Ticker' in df_tune.columns:
                        df_tune['Ticker'] = sanitize_tickers_for_yfinance(df_tune['Ticker'].tolist())
                    best_params = find_optimal_parameters(df_tune, method, capital, min_weight, max_weight)
                    st.session_state['auto_top_n'] = best_params['top_n']
                    st.session_state['auto_lambda'] = best_params['risk_aversion']
                    st.rerun()
                    
        target_btn_placeholder = st.empty()
        
    # Fusion matricielle
    df_final_allocation = pd.concat([df_top, df_manual], ignore_index=True)
    if not df_final_allocation.empty and 'Ticker' in df_final_allocation.columns:
        df_final_allocation = df_final_allocation.drop_duplicates(subset=['Ticker'], keep='last')
        name_col = next((c for c in df_final_allocation.columns if str(c).lower() in ['name', 'description']), None)
        if name_col:
            df_final_allocation = df_final_allocation.drop_duplicates(subset=[name_col], keep='first')
        df_final_allocation = deduplicate_semantic_tickers(df_final_allocation)
        final_portfolio_tickers = df_final_allocation['Ticker'].tolist()
    else:
        final_portfolio_tickers = []
        
    st.markdown(f"> *INFO : {len(df_top)} actions quant. + {len(df_manual)} convictions. Total unique : {len(final_portfolio_tickers)}.*")

yf_tickers_list = sanitize_tickers_for_yfinance(final_portfolio_tickers)
yf_to_orig = {yf_tickers_list[i]: final_portfolio_tickers[i] for i in range(len(final_portfolio_tickers))}
yf_tickers = list(yf_to_orig.keys())

with tab_allocation, st.spinner("Synchronisation et validation de l'historique de marche..."):
    try:
        from src.data_managers.db_manager import get_db
        db = get_db()
        df_hist = yf.download(yf_tickers, period="2y", interval="1d", progress=False)
        if not df_hist.empty:
            if isinstance(df_hist.columns, pd.MultiIndex):
                df_close = df_hist['Close']
            elif 'Close' in df_hist.columns:
                df_close = df_hist[['Close']].copy()
                if len(yf_tickers) == 1: df_close.columns = yf_tickers
            else:
                df_close = pd.DataFrame()

            if not df_close.empty:
                valid_counts = df_close.count()
                valid_yf_tickers = valid_counts[valid_counts >= 100].index.tolist()
                invalid_tickers = set(yf_tickers) - set(valid_yf_tickers)
                if invalid_tickers:
                    st.warning(f"Actifs ignores (Historique insuffisant) : {', '.join(invalid_tickers)}")
                yf_tickers = [t for t in yf_tickers if t in valid_yf_tickers]
                
                if yf_tickers:
                    df_flat = df_close[yf_tickers].reset_index().melt(id_vars=['Date'], var_name='ticker', value_name='close')
                    df_flat.rename(columns={'Date': 'timestamp'}, inplace=True)
                    db.upsert_market_data(df_flat)
    except Exception as e:
        st.warning(f"Avertissement lors de la validation des donnees : {e}")

if not yf_tickers:
    with tab_allocation:
        st.error("Aucun historique de prix valide n'a pu etre recupere pour l'univers selectionne.")
    st.stop()

yf_to_orig = {k: v for k, v in yf_to_orig.items() if k in yf_tickers}

# --- Execution Optimisation ---
weights, portfolio_obj = run_optimization(yf_tickers, method, capital, min_weight, max_weight, risk_aversion)

if not df_final_allocation.empty:
    col_ticker = next((c for c in df_final_allocation.columns if str(c).lower() in ['ticker', 'symbol']), None)
    col_name = next((c for c in df_final_allocation.columns if str(c).lower() in ['name', 'description']), None)
    col_sector = next((c for c in df_final_allocation.columns if str(c).lower() == 'sector'), None)
    col_country = next((c for c in df_final_allocation.columns if str(c).lower() == 'country'), None)
    
    meta_cols = {}
    if col_ticker: meta_cols[col_ticker] = 'Ticker'
    if col_name: meta_cols[col_name] = 'Name'
    if col_sector: meta_cols[col_sector] = 'Sector'
    if col_country: meta_cols[col_country] = 'Country'
    df_meta = df_final_allocation[list(meta_cols.keys())].rename(columns=meta_cols).copy()
else:
    df_meta = pd.DataFrame()

master_meta = {}
if not df_scored.empty and 'Ticker' in df_scored.columns:
    for _, row in df_scored.iterrows():
        master_meta[str(row['Ticker']).upper()] = {'Name': row.get('Name', row['Ticker']), 'Sector': row.get('Sector', 'Inconnu'), 'Country': row.get('Country', 'Inconnu')}
if 'df_manual' in locals() and not df_manual.empty and 'Ticker' in df_manual.columns:
    for _, row in df_manual.iterrows():
        t = str(row['Ticker']).upper()
        if t not in master_meta or master_meta[t].get('Sector') == 'Inconnu':
            master_meta[t] = {'Name': row.get('Name', t), 'Sector': row.get('Sector', 'Inconnu'), 'Country': row.get('Country', 'Inconnu')}

if weights is not None and not weights.empty:
    if hasattr(portfolio_obj, 'returns'):
        portfolio_obj.returns.columns = portfolio_obj.returns.columns.map(lambda x: yf_to_orig.get(x, x))
    weights.index = weights.index.map(lambda x: yf_to_orig.get(x, x))
    sector_map = pd.Series({k: v['Sector'] for k, v in master_meta.items()}) if master_meta else None
    weights = post_process_weights(weights, sector_map, max_asset_weight=max_weight, max_sector_weight=max_sector_weight, min_weight=min_weight)

# =====================================================================
# ONGLET 1 : ALLOCATION & POIDS
# =====================================================================
if weights is not None and not weights.empty:
    df_weights = weights.to_frame(name='Weight').reset_index()
    df_weights.columns = ['Ticker', 'Weight']
    df_weights['Allocation'] = df_weights["Weight"] * capital
    
    df_plot = df_weights.copy()
    df_plot['Ticker_Upper'] = df_plot['Ticker'].astype(str).str.upper()
    df_plot['Name'] = df_plot['Ticker_Upper'].apply(lambda x: master_meta.get(x, {}).get('Name', x))
    df_plot['Sector'] = df_plot['Ticker_Upper'].apply(lambda x: master_meta.get(x, {}).get('Sector', 'Inconnu'))
    df_plot['Country'] = df_plot['Ticker_Upper'].apply(lambda x: master_meta.get(x, {}).get('Country', 'Inconnu'))
    df_plot.drop(columns=['Ticker_Upper'], inplace=True)
    df_plot = df_plot.sort_values(by='Weight', ascending=False).fillna('Inconnu')

    with tab_allocation:
        st.subheader("ASSET WEIGHTS")
        fig_bar = px.bar(df_plot, x='Ticker', y='Weight', color='Sector', template="plotly_dark", color_discrete_sequence=['#F5A623', '#4B5563', '#374151', '#10B981', '#3B82F6'], text_auto='.2%')
        fig_bar.update_layout(paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"), xaxis={'categoryorder':'total descending'}, yaxis=dict(tickformat=".0%"), yaxis_title=None, xaxis_title=None, showlegend=False)
        st.plotly_chart(fig_bar, width="stretch")

        st.markdown("---")
        st.subheader("PORTFOLIO DETAILS")
        df_display = df_plot[['Ticker', 'Name', 'Sector', 'Country', 'Weight', 'Allocation']].copy()
        df_display['Weight_%'] = df_display['Weight'] * 100
        df_display = df_display.sort_values(by='Weight_%', ascending=False)
        
        st.dataframe(
            df_display[['Ticker', 'Name', 'Sector', 'Country', 'Weight_%', 'Allocation']], hide_index=True, width="stretch",
            column_config={
                "Ticker": st.column_config.TextColumn("SYMBOL", width="small"),
                "Name": st.column_config.TextColumn("COMPANY NAME", width="medium"),
                "Sector": st.column_config.TextColumn("SECTOR EXPOSURE", width="medium"),
                "Country": st.column_config.TextColumn("REGION/COUNTRY", width="small"),
                "Weight_%": st.column_config.ProgressColumn("TARGET WEIGHT", format="%.2f %%", min_value=0, max_value=float(df_display['Weight_%'].max())),
                "Allocation": st.column_config.NumberColumn("NOMINAL ALLOCATION", format="%.2f EUR")
            }
        )

        st.markdown("---")
        col_chart1, col_chart2 = st.columns(2)
        with col_chart1:
            st.markdown("<div style='color: #888888; font-size: 0.85rem; font-weight: bold; margin-bottom: 10px;'>SECTOR EXPOSURE</div>", unsafe_allow_html=True)
            df_sector = df_plot.groupby('Sector', as_index=False)['Weight'].sum()
            fig_sec = px.pie(df_sector, values='Weight', names='Sector', hole=0.65, color_discrete_sequence=px.colors.sequential.Blues_r, template="plotly_dark")
            fig_sec.update_traces(textposition='inside', textinfo='percent+label', showlegend=False)
            fig_sec.update_layout(margin=dict(t=10, b=10, l=10, r=10), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', height=350)
            st.plotly_chart(fig_sec, width="stretch")
        with col_chart2:
            st.markdown("<div style='color: #888888; font-size: 0.85rem; font-weight: bold; margin-bottom: 10px;'>ECONOMIC ZONE (COUNTRY)</div>", unsafe_allow_html=True)
            df_geo = df_plot.groupby('Country', as_index=False)['Weight'].sum()
            fig_geo = px.pie(df_geo, values='Weight', names='Country', hole=0.65, color_discrete_sequence=px.colors.sequential.Oranges_r, template="plotly_dark")
            fig_geo.update_traces(textposition='inside', textinfo='percent+label', showlegend=False)
            fig_geo.update_layout(margin=dict(t=10, b=10, l=10, r=10), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', height=350)
            st.plotly_chart(fig_geo, width="stretch")

        st.markdown("---")
        st.subheader("PORTFOLIO RISK & CONCENTRATION AUDIT")
        df_risk = df_plot.copy()
        df_risk['Weight_%'] = df_risk['Weight'] * 100
        hhi_index = (df_risk['Weight_%'] ** 2).sum()
        top_5_concentration = df_risk.nlargest(5, 'Weight_%')['Weight_%'].sum()
        if hhi_index < 1500: hhi_status, hhi_color = "DIVERSIFIED", "#2ECC40"
        elif hhi_index < 2500: hhi_status, hhi_color = "MODERATE CONCENTRATION", "#F5A623"
        else: hhi_status, hhi_color = "HIGH CONCENTRATION", "#FF4136"
        
        col_r1, col_r2, col_r3 = st.columns(3)
        with col_r1: st.markdown(f"<div style='padding: 15px; border-left: 4px solid {hhi_color}; background-color: #151A22;'> <div style='color:#888; font-size:0.8rem;'>HHI INDEX</div> <div style='font-size:1.5rem; color:#FFF;'>{hhi_index:.0f} <span style='font-size:0.8rem; color:{hhi_color};'>({hhi_status})</span></div> </div>", unsafe_allow_html=True)
        with col_r2:
            top5_color = "#FF4136" if top_5_concentration > 40 else "#2ECC40"
            st.markdown(f"<div style='padding: 15px; border-left: 4px solid {top5_color}; background-color: #151A22;'> <div style='color:#888; font-size:0.8rem;'>TOP 5 EXPOSURE</div> <div style='font-size:1.5rem; color:#FFF;'>{top_5_concentration:.2f}%</div> </div>", unsafe_allow_html=True)
        with col_r3:
            if 'Country' not in df_risk.columns: df_risk['Country'] = 'Inconnu'
            main_country = df_risk.groupby('Country')['Weight_%'].sum().idxmax()
            st.markdown(f"<div style='padding: 15px; border-left: 4px solid #3B82F6; background-color: #151A22;'> <div style='color:#888; font-size:0.8rem;'>DOMINANT REGION</div> <div style='font-size:1.5rem; color:#FFF;'>{main_country}</div> </div>", unsafe_allow_html=True)

        cyclical_sectors = ['Technology', 'Consumer Cyclical', 'Industrials', 'Basic Materials', 'Financial Services']
        cyclical_weight = df_risk[df_risk['Sector'].isin(cyclical_sectors)]['Weight_%'].sum()
        if cyclical_weight > 60.0: st.warning(f"MACRO ALERT: Votre portefeuille est concentre a {cyclical_weight:.2f}% sur des secteurs cycliques. Envisagez de relancer l'optimisation avec le profil 'Defensif'.")
        else: st.success(f"MACRO CHECK: Exposition cyclique moderee ({cyclical_weight:.2f}%). Le portefeuille presente des caracteristiques defensives adequates.")

        st.markdown("---")
        st.subheader("EXECUTION PLAN")
        col_t1, col_t2 = st.columns(2)
        with col_t1: twap_tranches = st.slider("Nombre de Tranches d'Execution :", min_value=2, max_value=10, value=4, step=1)
        with col_t2: twap_freq = st.selectbox("Frequence Spatiale Suggeree :", ["Quotidienne (Daily)", "Hebdomadaire (Weekly)", "Bi-mensuelle", "Mensuelle"], index=1)

        df_twap = df_plot[['Ticker', 'Name', 'Allocation']].copy()
        df_twap['Total Allocation'] = df_twap['Allocation'].map('{:,.2f} EUR'.format)
        df_twap[f'Ordre par Tranche (x{twap_tranches})'] = (df_twap['Allocation'] / twap_tranches).map('{:,.2f} EUR'.format)
        st.dataframe(df_twap[['Ticker', 'Name', 'Total Allocation', f'Ordre par Tranche (x{twap_tranches})']], width="stretch", hide_index=True)

    # =====================================================================
    # ONGLET 2 : PERFORMANCE HISTORIQUE
    # =====================================================================
    with tab_performance:
        st.subheader("PORTFOLIO METRICS")
        portfolio_returns = portfolio_obj.returns.dot(weights.values)
        years = len(portfolio_returns) / 252
        cagr_total = (portfolio_returns + 1).prod() ** (1/years) - 1 if years > 0 else 0
        vol = portfolio_returns.std() * np.sqrt(252)
        sharpe = (cagr_total - 0.04) / vol if vol > 0 else 0

        from src.utils.performance_analyzer import max_drawdown, calmar_ratio, sortino_ratio
        mdd = max_drawdown(portfolio_returns)
        calmar = calmar_ratio(cagr_total, mdd)
        sortino = sortino_ratio(portfolio_returns, cagr_total, rf_rate=0.04)

        c1, c2, c3 = st.columns(3)
        c1.metric("Rendement Annuel Compose (CAGR)", f"{cagr_total:.2%}")
        c2.metric("Volatilite Annuelle", f"{vol:.2%}")
        c3.metric("Ratio de Sharpe", f"{sharpe:.2f}")

        c4, c5, c6 = st.columns(3)
        c4.metric("Maximum Drawdown (MDD)", f"{mdd:.2%}")
        c5.metric("Ratio de Calmar", f"{calmar:.2f}")
        c6.metric("Ratio de Sortino", f"{sortino:.2f}")

        st.markdown("---")
        st.subheader("AGGREGATED FUNDAMENTALS")
        info_dict = fetch_xray_data(yf_tickers)
        ey_list, beta_list, div_list, w_pe, w_beta, w_div = [], [], [], [], [], []
        
        for idx, t in enumerate(yf_tickers):
            w = weights.iloc[idx]
            inf = info_dict.get(t, {})
            pe = inf.get('trailingPE')
            if pe is not None and pe > 0: ey_list.append(w / pe); w_pe.append(w)
            beta = inf.get('beta')
            if beta is not None: beta_list.append(beta * w); w_beta.append(w)
            div = inf.get('dividendYield')
            if div is not None: div_list.append(div * w); w_div.append(w)

        avg_pe = sum(w_pe) / sum(ey_list) if w_pe and sum(ey_list) > 0 else 0
        avg_beta = sum(beta_list) / sum(w_beta) if w_beta else 1.0
        avg_div = sum(div_list) / sum(w_div) if w_div else 0
        est_div_cash = capital * avg_div
        bias = "GROWTH" if avg_pe > 25 else "VALUE"
        bias_color = "#10B981" if bias == "GROWTH" else "#3B82F6"

        html_grid = f"""
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 30px;">
            <div style="background-color: #111111; padding: 15px; border-left: 4px solid #F5A623;"><div style="color: #888888; font-size: 0.8rem; text-transform: uppercase;">WEIGHTED P/E RATIO</div><div style="font-size: 1.5rem; font-weight: bold; color: #FFFFFF; margin-top: 5px;">{avg_pe:.1f}</div></div>
            <div style="background-color: #111111; padding: 15px; border-left: 4px solid #F5A623;"><div style="color: #888888; font-size: 0.8rem; text-transform: uppercase;">PORTFOLIO BETA</div><div style="font-size: 1.5rem; font-weight: bold; color: #FFFFFF; margin-top: 5px;">{avg_beta:.2f}</div></div>
            <div style="background-color: #111111; padding: 15px; border-left: 4px solid #F5A623;"><div style="color: #888888; font-size: 0.8rem; text-transform: uppercase;">EST. DIVIDEND YIELD</div><div style="font-size: 1.5rem; font-weight: bold; color: #FFFFFF; margin-top: 5px;">{avg_div:.2%}</div></div>
            <div style="background-color: #111111; padding: 15px; border-left: 4px solid #F5A623;"><div style="color: #888888; font-size: 0.8rem; text-transform: uppercase;">EST. ANNUAL CASH (EUR)</div><div style="font-size: 1.5rem; font-weight: bold; color: #2ECC40; margin-top: 5px;">{est_div_cash:,.2f} EUR</div></div>
            <div style="background-color: #111111; padding: 15px; border-left: 4px solid {bias_color};"><div style="color: #888888; font-size: 0.8rem; text-transform: uppercase;">PORTFOLIO BIAS</div><div style="font-size: 1.5rem; font-weight: bold; color: {bias_color}; margin-top: 5px;">{bias}</div></div>
        </div>"""
        st.markdown(html_grid, unsafe_allow_html=True)

        st.markdown("---")
        portfolio_cumulative = (1 + portfolio_returns).cumprod() * 100
        mu_vec_cone = portfolio_obj.returns.mean().fillna(0).values * 252
        cov_matrix_cone = portfolio_obj.returns.cov().fillna(0).values * 252
        cov_matrix_cone += np.eye(cov_matrix_cone.shape[0]) * 1e-5
        
        sim_paths_cone = run_monte_carlo_portfolio(initial_capital=portfolio_cumulative.iloc[-1], weights=weights.values, mu_vec=mu_vec_cone, cov_matrix=cov_matrix_cone, horizon_days=252, n_simulations=1000)
        fig_perf = plot_uncertainty_cone(portfolio_cumulative, sim_paths_cone)
        st.plotly_chart(fig_perf, width="stretch")

    # =====================================================================
    # ONGLET 3 : STRESS TESTS & RISK
    # =====================================================================
    with tab_stress_risk:
        st.subheader("RISK CONTROL: CROSS-ASSET CORRELATION MATRIX")
        corr_matrix = portfolio_obj.returns.corr()
        fig_corr = go.Figure(data=go.Heatmap(z=corr_matrix.values, x=corr_matrix.columns, y=corr_matrix.index, colorscale=[[0, '#3B82F6'], [0.5, '#000000'], [1, '#F5A623']], zmin=-1, zmax=1))
        fig_corr.update_layout(template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"), margin=dict(l=0, r=0, t=10, b=0), height=600)
        st.plotly_chart(fig_corr, width="stretch")
        
        high_corr_pairs = []
        cols = corr_matrix.columns
        for i in range(len(cols)):
            for j in range(i+1, len(cols)):
                if corr_matrix.iloc[i, j] > 0.85: high_corr_pairs.append((cols[i], cols[j], corr_matrix.iloc[i, j]))
        if high_corr_pairs:
            for a, b, c in high_corr_pairs:
                st.markdown(f"> **WARNING** - RISQUE STRUCTUREL DETECTE : TRES FORTE CORRELATION ENTRE {a} ET {b} ({c:.2f}).")

        st.markdown("---")
        st.subheader("STRESS TEST & RISK (MONTE CARLO)")
        with st.expander("SIMULATION PARAMETERS", expanded=False):
            c1, c2, c3 = st.columns(3)
            with c1: initial_capital_mc = st.number_input("CAPITAL INITIAL (EUR)", min_value=1000, value=int(capital), step=1000, key="cap_mc")
            with c2: n_simulations = st.slider("NOMBRE DE SIMULATIONS", min_value=100, max_value=5000, value=1000, step=100)
            with c3: horizon_days = st.slider("HORIZON TEMPOREL (JOURS)", min_value=30, max_value=1000, value=252, step=10)

        with st.spinner(f"GENERATION DE MOUVEMENTS BROWNIENS CORRELES (N={n_simulations})..."):
            mu_vec = portfolio_obj.returns.mean().fillna(0).values * 252
            cov_matrix = portfolio_obj.returns.cov().fillna(0).values * 252
            cov_matrix += np.eye(cov_matrix.shape[0]) * 1e-5
            df_paths = run_monte_carlo_portfolio(initial_capital=initial_capital_mc, weights=weights.values, mu_vec=mu_vec, cov_matrix=cov_matrix, horizon_days=horizon_days, n_simulations=n_simulations)
            final_values = df_paths.iloc[-1].values
            var_95, var_99, cvar_95 = calculate_var_cvar(final_values)

        col_paths, col_tail_risk = st.columns([2, 1])
        with col_paths:
            st.markdown("#### SIMULATED PORTFOLIO PATHS (RANDOM WALK)")
            fig_mc = go.Figure()
            x_vals, y_vals = [], []
            x_idx = df_paths.index.tolist()
            for col in df_paths.columns:
                x_vals.extend(x_idx); x_vals.append(None)
                y_vals.extend(df_paths[col].tolist()); y_vals.append(None)
            fig_mc.add_trace(go.Scattergl(x=x_vals, y=y_vals, mode='lines', line=dict(color='rgba(245, 166, 35, 0.03)', width=1), showlegend=False))
            fig_mc.add_trace(go.Scatter(x=x_idx, y=df_paths.mean(axis=1), mode='lines', line=dict(color='#3B82F6', width=2), name='MOYENNE'))
            fig_mc.update_layout(template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"), margin=dict(l=0, r=0, t=30, b=0), height=500)
            st.plotly_chart(fig_mc, width="stretch")

        with col_tail_risk:
            st.markdown("#### TAIL RISK ANALYSIS (VAR / CVAR)")
            var_95_pct, var_99_pct, cvar_95_pct = var_95 / initial_capital_mc, var_99 / initial_capital_mc, cvar_95 / initial_capital_mc
            st.metric(label="VALUE AT RISK (VAR 95%)", value=f"-{abs(var_95):,.2f} EUR", delta=f"-{abs(var_95_pct):.2%}", delta_color="inverse")
            st.metric(label="VALUE AT RISK (VAR 99%)", value=f"-{abs(var_99):,.2f} EUR", delta=f"-{abs(var_99_pct):.2%}", delta_color="inverse")
            st.metric(label="CONDITIONAL VAR (CVAR 95%)", value=f"-{abs(cvar_95):,.2f} EUR", delta=f"-{abs(cvar_95_pct):.2%}", delta_color="inverse")
            
            fig_hist = go.Figure()
            fig_hist.add_trace(go.Histogram(x=final_values, nbinsx=50, marker_color='#F5A623', opacity=0.7, name="DISTRIBUTION"))
            fig_hist.add_vline(x=initial_capital_mc, line_dash="dash", line_color="#9CA3AF")
            fig_hist.add_vline(x=np.mean(final_values), line_dash="dash", line_color="#3B82F6")
            fig_hist.update_layout(template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', margin=dict(l=0, r=0, t=10, b=0), height=250, showlegend=False)
            st.plotly_chart(fig_hist, width="stretch")

    # =====================================================================
    # ONGLET 4 : RENDEMENTS & DRAWDOWNS
    # =====================================================================
    with tab_drawdowns:
        st.header("RISK BUDGETING & FACTOR ATTRIBUTION")
        
        st.subheader("MARGINAL CONTRIBUTION TO RISK (MCTR)")
        try:
            from src.pf_engine.risk_management.risk_reporting import calculate_mctr
            cov_matrix_factor = portfolio_obj.returns.cov().fillna(0).values * 252
            cov_matrix_factor += np.eye(cov_matrix_factor.shape[0]) * 1e-5
            cov_df = pd.DataFrame(cov_matrix_factor, index=yf_tickers, columns=yf_tickers)
            mctr_df, port_vol_mctr = calculate_mctr(weights.values, cov_df)
            
            fig_mctr = go.Figure(go.Bar(x=mctr_df.index, y=mctr_df['Risk_Contribution_pct'], marker_color='#F5A623', text=mctr_df['Risk_Contribution_pct'].apply(lambda x: f"{x:.1f}%"), textposition='auto'))
            fig_mctr.update_layout(template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"), yaxis_title="% du Risque Total", margin=dict(l=0, r=0, t=20, b=0), height=400)
            st.plotly_chart(fig_mctr, width="stretch")
        except Exception as e:
            st.warning(f"Impossible de calculer le MCTR : {e}")

        st.markdown("---")
        st.subheader("FAMA-FRENCH ALPHA & BETA ATTRIBUTION (3-FACTOR)")
        try:
            from src.utils.performance_analyzer import run_fama_french_regression
            port_returns_ff = portfolio_obj.returns.fillna(0).dot(weights.values)
            start_str = port_returns_ff.index[0].strftime('%Y-%m-%d')
            end_str = port_returns_ff.index[-1].strftime('%Y-%m-%d')
            ff_results = run_fama_french_regression(port_returns_ff, start_str, end_str, model='3')
            
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("ALPHA (ANNUALISE)", f"{ff_results.get('alpha_annualized_pct', 0):.2f}%")
            c2.metric("MKT BETA (Marche)", f"{ff_results.get('Mkt-RF', 0):.2f}")
            c3.metric("SMB BETA (Taille)", f"{ff_results.get('SMB', 0):.2f}")
            c4.metric("HML BETA (Valeur)", f"{ff_results.get('HML', 0):.2f}")
            st.caption(f"R2 de la regression : {ff_results.get('r_squared', 0):.2%}.")
        except ImportError:
            st.warning("Module performance_analyzer introuvable.")
        except Exception as e:
            st.warning(f"Donnees Fama-French inaccessibles : {e}")

    # --- Sauvegarde du Modèle ---
    with target_btn_placeholder.container():
        st.markdown("<div style='margin-top: 10px;'></div>", unsafe_allow_html=True)
        col_pf_name, col_pf_btn = st.columns([2, 1])
        with col_pf_name:
            default_pf_name = f"PF_{method}_{pd.Timestamp.now().strftime('%Y%m%d_%H%M')}"
            pf_name = st.text_input("Nom du portefeuille :", value=default_pf_name, label_visibility="collapsed")
        with col_pf_btn:
            if st.button(" SAVE", key="set_target_portfolio", type="primary", width="stretch"):
                target_portfolio_data = {
                    'weights': weights.to_dict(),
                    'cagr': cagr_total,
                    'vol': vol,
                    'sharpe': sharpe,
                    'method': method,
                    'tickers': final_portfolio_tickers
                }
                st.session_state['target_portfolio'] = target_portfolio_data
                st.session_state['loaded_pf_name'] = pf_name
                try:
                    from src.data_managers.db_manager import get_db
                    db = get_db()
                    db.save_portfolio(pf_name, target_portfolio_data)
                    st.toast(f"Portefeuille '{pf_name}' sauvegarde dans la base !")
                    st.rerun()
                except Exception as e:
                    st.warning(f"Erreur SQL : {e}")
else:
    with tab_allocation:
        st.markdown("> *INFO : Ajuster les contraintes mathematiques dans le panneau lateral pour resoudre l'optimisation.*")