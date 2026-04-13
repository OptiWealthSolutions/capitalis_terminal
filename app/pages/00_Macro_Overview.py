"""
Module of Macro-Economic Market Regime.
Combines HMM for regime detection, GARCH for volatility, and 
Institutional Sentiment Analysis (COT & News).
"""

import sys
import logging
from pathlib import Path

import pandas as pd
import numpy as np
import streamlit as st
import yfinance as yf
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# 1. PAGE CONFIG EN PREMIER
st.set_page_config(
    page_title="CAPITALIS V2 - Macro Overview",
    layout="wide"
)

from src.utils.alpha_vantage import fetch_macro_news
from src.utils.ui_config import set_terminal_margins, setup_bloomberg_shortcuts
from src.macro_models.global_macro import fetch_global_macro_indicators
try:
    from src.pf_engine.risk_management.volatility_engine import GARCHModeler
except ImportError:
    st.error("SYSTEM FATAL: Module 'arch' manquant. Executez 'pip install arch'.")
    GARCHModeler = None

# --- Configuration UI & Raccourcis ---
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

# --- Module de Donnees Macro ---
@st.cache_data(ttl=3600)
def get_macro_data():
    tickers = {'SP500': '^GSPC', 'VIX': '^VIX', 'US10Y': '^TNX', 'US3M': '^IRX', 'GOLD': 'GC=F', 'OIL': 'CL=F'}
    try:
        df = yf.download(list(tickers.values()), period="5y", interval="1d", progress=False)
        df = df['Close'] if isinstance(df.columns, pd.MultiIndex) else df[['Close']]
        inv_map = {v: k for k, v in tickers.items()}
        df.columns = [inv_map.get(c, c) for c in df.columns]
        if 'US10Y' in df.columns and 'US3M' in df.columns:
            df['YIELD_SPREAD'] = df['US10Y'] - df['US3M']
        return df.dropna()
    except Exception as e:
        return pd.DataFrame()

@st.cache_data(ttl=86400, show_spinner="Synchronisation FRED API...")
def get_macro_indicators():
    return fetch_global_macro_indicators()

# --- Modele de Detection de Regime ---
@st.cache_data(ttl=3600)
def detect_market_regime(df):
    if df.empty: return df, pd.DataFrame()
    df_model = df.copy()
    df_model['Returns'] = df_model['SP500'].pct_change() * 100
    df_model = df_model.dropna()
    X = df_model[['Returns', 'VIX']].values
    from sklearn.mixture import GaussianMixture
    gmm = GaussianMixture(n_components=2, covariance_type='full', random_state=42).fit(X)
    regimes = gmm.predict(X)
    probs = gmm.predict_proba(X)
    if gmm.means_[0, 1] > gmm.means_[1, 1]:
        regimes, probs = 1 - regimes, probs[:, ::-1]
    df_model['Regime'], df_model['Prob_Bull'], df_model['Prob_Bear'] = regimes, probs[:, 0], probs[:, 1]
    chars = [{"Regime": "BULL / LOW VOL" if r == 0 else "BEAR / HIGH VOL", 
              "Ann_Ret": df_model.loc[df_model['Regime']==r, 'Returns'].mean()*252,
              "Ann_Vol": df_model.loc[df_model['Regime']==r, 'Returns'].std()*np.sqrt(252)} for r in [0,1]]
    return df_model, pd.DataFrame(chars)


# --- UI : Layout Principal ---
st.title("MACRO-ECONOMIC VIEW")

tab_regime, tab_sentiment = st.tabs(["REGIME ANALYSIS", "SENTIMENT & NEWS"])

with tab_regime:
    # --- 2. INDICATEURS MACROECONOMIQUES MONDIAUX ---
    st.subheader("GLOBAL MACROECONOMIC INDICATORS")
    st.markdown("Donnees synchronisees via l'API officielle Federal Reserve Economic Data (FRED).")
    
    macro_data = get_macro_indicators()
    
    col_us, col_eu, col_jp = st.columns(3)
    
    with col_us:
        st.markdown("<div style='border-bottom: 2px solid #3B82F6; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold; color: #D1D5DB;'>UNITED STATES (USD)</div>", unsafe_allow_html=True)
        st.metric("Central Bank Rate (Fed Funds)", macro_data['US']['Rate'])
        st.metric("GDP Growth (QoQ)", macro_data['US']['GDP'])
        st.metric("Unemployment Rate", macro_data['US']['Unemp'])
        
    with col_eu:
        st.markdown("<div style='border-bottom: 2px solid #10B981; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold; color: #D1D5DB;'>EUROZONE (EUR)</div>", unsafe_allow_html=True)
        st.metric("Interbank Rate (3-Month)", macro_data['EU']['Rate'])
        st.metric("GDP Growth", macro_data['EU']['GDP'])
        st.metric("Unemployment Rate", macro_data['EU']['Unemp'])
        
    with col_jp:
        st.markdown("<div style='border-bottom: 2px solid #F5A623; padding-bottom: 5px; margin-bottom: 15px; font-weight: bold; color: #D1D5DB;'>JAPAN (JPY)</div>", unsafe_allow_html=True)
        st.metric("Interbank Rate (3-Month)", macro_data['JP']['Rate'])
        st.metric("GDP Growth", macro_data['JP']['GDP'])
        st.metric("Unemployment Rate", macro_data['JP']['Unemp'])

    st.markdown("---")

    df_macro = get_macro_data()
    if df_macro.empty: st.stop()
    df_regime, df_chars = detect_market_regime(df_macro)

    if not df_regime.empty:
        # Ticker Tape (Compact)
        last = df_regime.iloc[-1]
        spread = last.get('YIELD_SPREAD', 0)
        curve_color = "#FF4136" if spread < 0 else "#2ECC40"
        
        st.markdown(f"""
        <div style="padding: 15px; border-left: 5px solid #2962FF; display: flex; justify-content: space-between; background: #151A22; margin-bottom: 20px;">
            <span>S&P 500: <b>{last['SP500']:.2f}</b></span>
            <span>VIX: <b>{last['VIX']:.2f}</b></span>
            <span>US 10Y: <b>{last['US10Y']:.3f}%</b></span>
            <span style="color: {curve_color};">YIELD CURVE: <b>{spread:.3f}%</b></span>
            <span style="color: #F5A623;">GOLD: <b>${last['GOLD']:.2f}</b></span>
        </div>
        """, unsafe_allow_html=True)

        col_reg, col_prob = st.columns(2)
        curr_r = df_regime['Regime'].iloc[-1]
        r_name = "BEAR / HIGH VOL" if curr_r == 1 else "BULL / LOW VOL"
        r_col = "#F5A623" if curr_r == 1 else "#3B82F6"
        
        col_reg.metric("CURRENT REGIME", r_name)
        col_prob.metric("BULL PROBABILITY", f"{df_regime['Prob_Bull'].iloc[-1]:.1%}")

        # Graphique des Regimes
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(go.Scatter(x=df_regime.index, y=df_regime['SP500'], line=dict(color='#D1D5DB', width=1.5), name='S&P 500'), secondary_y=False)
        
        df_regime['Block'] = (df_regime['Regime'] != df_regime['Regime'].shift(1)).cumsum()
        for _, group in df_regime.groupby('Block'):
            fill = "rgba(245, 166, 35, 0.2)" if group['Regime'].iloc[0] == 1 else "rgba(59, 130, 246, 0.1)"
            fig.add_vrect(x0=group.index[0], x1=group.index[-1], fillcolor=fill, line_width=0)

        fig.update_layout(template="plotly_dark", height=400, margin=dict(l=0,r=0,t=20,b=0), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
        st.plotly_chart(fig, width="stretch")

    # Section GARCH
    st.subheader("VOLATILITY MODELLING")
    ticker_g = st.selectbox("Forecast Asset", ["^GSPC", "^NDX", "GC=F"], index=0)
    if GARCHModeler:
        ge = GARCHModeler()
        rets = ge.fetch_and_prepare_data(ticker_g)
        cv, fv = ge.fit_garch(rets)
        realized_vol_30d = rets.tail(30).std() * np.sqrt(252) if len(rets) >= 30 else 0 # Annualized proxy
        current_cond_vol = cv.iloc[-1]
        
        html_garch_kpi = f"""
        <div style="padding: 20px; border-left: 5px solid #F5A623; display: flex; flex-wrap: wrap; gap: 30px; margin-bottom: 25px; background-color: #151A22;">
            <div><div style="color: #888888; font-size: 0.8rem;">REALIZED VOLATILITY (30D)</div><div style="font-size: 1.4rem; color: #FFFFFF;">{realized_vol_30d:.2f}%</div></div>
            <div><div style="color: #888888; font-size: 0.8rem;">CONDITIONAL VOLATILITY (TODAY)</div><div style="font-size: 1.4rem; color: #FFFFFF;">{current_cond_vol:.2f}%</div></div>
            <div><div style="color: #888888; font-size: 0.8rem;">GARCH FORECAST (T+1)</div><div style="font-size: 1.4rem; color: #F5A623; font-weight: bold;">{fv:.2f}%</div></div>
        </div>"""
        st.markdown(html_garch_kpi, unsafe_allow_html=True)
        
        fig_garch = go.Figure()
        fig_garch.add_trace(go.Bar(x=rets.index, y=rets.abs(), name='ABS LOG RETURNS', marker_color='rgba(209, 213, 219, 0.2)', hoverinfo='skip'))
        fig_garch.add_trace(go.Scatter(x=cv.index, y=cv, mode='lines', name='CONDITIONAL VOLATILITY', line=dict(color='#F5A623', width=2)))
        fig_garch.update_layout(template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', margin=dict(l=0, r=0, t=30, b=0), height=400, hovermode="x unified", legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1))
        st.plotly_chart(fig_garch, width="stretch")

with tab_sentiment:
    st.subheader("INSTITUTIONAL SENTIMENT (COT)")
    st.markdown("Analyse des positions nettes des 'Large Speculators' (Hedge Funds & CTAs).")
    
    from pathlib import Path
    import plotly.graph_objects as go
    import importlib.util
    
    ROOT = Path(__file__).resolve().parent.parent.parent
    COT_CSV_PATH = ROOT / "data" / "cot_latest.csv"
    SCRAPER_PATH = ROOT / "src" / "macro_models" / "cot_scraper.py"
    
    # Import dynamique sécurisé via pathlib pour éviter les conflits de cache Streamlit
    spec = importlib.util.spec_from_file_location("cot_scraper", SCRAPER_PATH)
    cot_scraper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cot_scraper)
    fetch_and_save_cot_data = cot_scraper.fetch_and_save_cot_data

    # Bouton pour forcer la mise a jour asynchrone
    if st.button("SYNCHRONISER DERNIER RAPPORT COT (WEB SCRAPING)", type="primary", width="stretch"):
        with st.spinner("Connexion au serveur source et extraction des donnees..."):
            success = fetch_and_save_cot_data()
            if success:
                st.success("Base de donnees COT mise a jour avec succes.")
            else:
                st.error("Echec de la connexion. Le site source est peut-etre inaccessible.")
    
    st.markdown("---")
    
    # Lecture du fichier local s'il existe
    if COT_CSV_PATH.exists():
        df_processed = pd.read_csv(COT_CSV_PATH)
        
        df_processed.rename(columns={'ASSET': 'MARKET ASSET'}, inplace=True)
        df_display = df_processed[['MARKET ASSET', 'SENTIMENT', 'NET_POSITION']].copy()

        # --- NOUVEAU : FILTRE INSTITUTIONNEL (NOISE CANCELLATION) ---
        # Liste des mots-cles definissant l'univers d'investissement primaire
        major_keywords = [
            'S&P', 'NASDAQ', 'DOW', 'RUSSELL', 'VIX',       # Indices
            'GOLD', 'SILVER', 'COPPER',                     # Metaux
            'CRUDE OIL', 'WTI', 'BRENT', 'NATURAL GAS',     # Energies
            'EURO', 'YEN', 'POUND', 'FRANC', 'DOLLAR',      # Forex
            '10-YEAR', '2-YEAR', 'TREASURY', 'BOND',        # Taux
            'BITCOIN'                                       # Crypto
        ]
        
        # 1. On ne garde que les actifs qui matchent avec nos mots-cles (insensible a la casse)
        pattern = '|'.join(major_keywords)
        df_majors = df_display[df_display['MARKET ASSET'].str.contains(pattern, case=False, na=False)].copy()
        
        # Securite : si le filtre a tout casse a cause d'un changement de nom du site, on reprend tout
        if df_majors.empty:
            df_majors = df_display.copy()
            
        # 2. On trie par la "force" de la conviction (Valeur Absolue) pour garder les plus importants
        df_majors['ABS_POS'] = df_majors['NET_POSITION'].abs()
        df_majors = df_majors.nlargest(15, 'ABS_POS').drop(columns=['ABS_POS'])

        # --- VISUALISATION GRAPHIQUE (DIVERGING BAR CHART EPURE) ---
        # Tri final par Position Nette pour l'escalier visuel (de la vente vers l'achat)
        df_chart = df_majors.sort_values(by='NET_POSITION', ascending=True)
        
        fig_cot = go.Figure()
        fig_cot.add_trace(go.Bar(
            x=df_chart['NET_POSITION'],
            y=df_chart['MARKET ASSET'],
            orientation='h',
            marker_color=['#2ECC40' if val > 0 else '#FF4136' for val in df_chart['NET_POSITION']],
            text=[f" {val:,.0f} " for val in df_chart['NET_POSITION']],
            textposition='outside',
            textfont=dict(color='#FFFFFF')
        ))
        
        fig_cot.update_layout(
            title=dict(text="INSTITUTIONAL NET POSITIONING (LONG - SHORT)", font=dict(color="#888888", size=14)),
            template="plotly_dark",
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            xaxis=dict(title="< Bearish (Net Short) | Bullish (Net Long) >", gridcolor='#1E232F', zeroline=True, zerolinecolor='#FFFFFF', zerolinewidth=2),
            yaxis=dict(title="", tickfont=dict(size=11, color="#D1D5DB")),
            margin=dict(l=10, r=10, t=40, b=10),
            height=max(400, len(df_chart) * 35),
            showlegend=False
        )
        
        st.plotly_chart(fig_cot, width="stretch")
        
        with st.expander("VIEW RAW COT DATA MATRIX"):
            st.dataframe(df_display.sort_values(by='NET_POSITION', ascending=False), width="stretch", hide_index=True)
            
    else:
        st.info("Aucun fichier de donnees local detecte. Cliquez sur le bouton de synchronisation ci-dessus.")

    st.markdown("---")
    # Bouton de Purge pour la gestion du cache Macro et Regime
    if st.button("PURGE MACRO CACHE", use_container_width=True):
        get_macro_data.clear()
        detect_market_regime.clear()
        st.rerun()

    # --- 2. NEWS FEED (BOTTOM VIEW) ---
    st.subheader("MACRO INTELLIGENCE STREAM")
    api_key = st.secrets.get("ALPHA_VANTAGE_API_KEY")

    if api_key:
        news = fetch_macro_news(api_key=api_key, limit=15)
        if news:
            for art in news:
                with st.container():
                    c1, c2 = st.columns([1, 4])
                    if art.get("banner_image"): c1.image(art["banner_image"])
                    c2.subheader(art.get("title"))
                    c2.caption(f"{art.get('source')} | Sentiment: {art.get('overall_sentiment_label')}")
                    c2.write(art.get("summary")[:250] + "...")
                st.markdown("<br>", unsafe_allow_html=True)
        else:
            st.info("No recent intelligence found.")