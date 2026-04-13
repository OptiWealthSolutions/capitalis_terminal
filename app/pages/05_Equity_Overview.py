import streamlit as st
import pandas as pd
import yfinance as yf
import plotly.graph_objects as go
import numpy as np
from plotly.subplots import make_subplots
import sys
from pathlib import Path
from datetime import datetime
import streamlit.components.v1 as components

# --- Configuration de la Page ---
st.set_page_config(
    page_title="CAPITALIS V2 - Equity Overview",
    layout="wide"
)

# --- Ajout du chemin racine au PYTHONPATH ---
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
</style>
""", unsafe_allow_html=True)

# --- Fonctions mises en cache (Data Fetching) ---
@st.cache_data(ttl=3600, show_spinner=False)
def get_stock_history(ticker):
    """
    Télécharge l'historique des prix (1 an) et calcule les moyennes mobiles.
    Mis en cache pour 1 heure (3600s).
    """
    try:
        df = yf.download(ticker, period='1y', interval='1d', progress=False)
        if not df.empty:
            # Gestion sécurisée si yf.download renvoie un MultiIndex
            close_col = df['Close'] if isinstance(df.columns, pd.Index) else df.xs('Close', axis=1, level=0)
            
            df['SMA_50'] = close_col.rolling(window=50).mean()
            df['SMA_200'] = close_col.rolling(window=200).mean()
        return df
    except Exception:
        return pd.DataFrame()

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_watchlist_data(tickers_list):
    """
    Telecharge les donnees de la Watchlist (15 jours) et calcule les variations vectorisees.
    Robuste face aux valeurs manquantes et aux jours sans cotation.
    """
    if not tickers_list:
        return pd.DataFrame()

    try:
        df = yf.download(tickers_list, period="15d", progress=False)
        if df.empty:
            return pd.DataFrame()

        # Isolation robuste de la colonne de prix selon la version de l'API (MultiIndex ou Non)
        if isinstance(df.columns, pd.MultiIndex):
            if 'Close' in df.columns.levels[0]:
                df_close = df['Close'].copy()
            elif 'Adj Close' in df.columns.levels[0]:
                df_close = df['Adj Close'].copy()
            else:
                return pd.DataFrame()
        else:
            if 'Close' in df.columns:
                df_close = df[['Close']].copy()
            elif 'Adj Close' in df.columns:
                df_close = df[['Adj Close']].copy()
            else:
                return pd.DataFrame()
            if len(tickers_list) == 1:
                df_close.columns = tickers_list

        # Interpolation temporelle directionnelle pour pallier les NaN de jours feries
        df_close = df_close.ffill()

        if len(df_close) < 2:
            return pd.DataFrame()

        # Isolement indexe et calcul vectoriel des rendements
        current_prices = df_close.iloc[-1]
        price_1d_ago = df_close.iloc[-2]
        price_1w_ago = df_close.iloc[-6] if len(df_close) >= 6 else df_close.iloc[0]

        pct_1d = (current_prices / price_1d_ago) - 1
        pct_1w = (current_prices / price_1w_ago) - 1

        df_final = pd.DataFrame({
            'Ticker': df_close.columns,
            'Price': current_prices.values,
            '1D (%)': pct_1d.values,
            '1W (%)': pct_1w.values
        })

        # Graceful Degradation : Remplacement des erreurs de calcul (Division par zero ou prix nul)
        df_final.replace([np.inf, -np.inf], np.nan, inplace=True)
        df_final = df_final.fillna(0.0)
        return df_final
    except Exception:
        return pd.DataFrame()

@st.cache_data(ttl=60, show_spinner=False)
def get_intraday_data(ticker):
    """
    Télécharge les données intraday (15 min) sur 5 jours pour le Ticker Tape en temps réel.
    Cache ultra-court (60s) pour garantir la fraîcheur de la cotation.
    """
    try:
        df = yf.download(ticker, period='5d', interval='15m', progress=False)
        if not df.empty:
            close_col = df['Close'] if isinstance(df.columns, pd.Index) else df.xs('Close', axis=1, level=0)
            return close_col.squeeze()
    except Exception:
        pass
    return pd.Series(dtype=float)

@st.cache_data(ttl=3600, show_spinner=False)
def get_quarterly_financials(ticker):
    """
    Télécharge les données fondamentales trimestrielles (Compte de résultat).
    """
    try:
        return yf.Ticker(ticker).quarterly_financials
    except Exception:
        return pd.DataFrame()

@st.cache_data(ttl=3600, show_spinner=False)
def get_stock_info(ticker):
    """
    Télécharge les métriques fondamentales de l'actif.
    """
    try:
        return yf.Ticker(ticker).info
    except Exception:
        return {}

@st.cache_data(ttl=3600, show_spinner=False)
def get_benchmark_history():
    """
    Télécharge l'historique du benchmark (SPY) pour le calcul d'Alpha.
    """
    try:
        df = yf.download('SPY', period='10d', interval='1d', progress=False)
        if not df.empty:
            close_col = df['Close'] if isinstance(df.columns, pd.Index) else df.xs('Close', axis=1, level=0)
            return close_col.squeeze()
    except Exception:
        pass
    return pd.Series(dtype=float)

@st.cache_data(ttl=3600, show_spinner=False)
def get_implied_volatility(ticker):
    """
    Extrait la médiane de la volatilité implicite des options d'achat (Calls).
    """
    try:
        tk = yf.Ticker(ticker)
        opts = tk.options
        if not opts:
            return "N/A"
        chain = tk.option_chain(opts[0])
        calls = chain.calls
        if calls.empty or 'impliedVolatility' not in calls.columns:
            return "N/A"
        iv_median = calls['impliedVolatility'].median()
        return f"{iv_median:.2%}"
    except Exception:
        return "N/A"

def calculate_historical_risk(df_hist):
    """
    Calcule la VaR et la CVaR historiques (95%) à partir des rendements logarithmiques.
    """
    if df_hist.empty or len(df_hist) < 20:
        return "N/A", "N/A"
    try:
        close_px = df_hist['Close'] if isinstance(df_hist.columns, pd.Index) else df_hist.xs('Close', axis=1, level=0)
        log_returns = np.log(close_px / close_px.shift(1)).dropna()
        var_95 = np.percentile(log_returns, 5)
        cvar_95 = log_returns[log_returns <= var_95].mean()
        return f"{var_95:.2%}", f"{cvar_95:.2%}"
    except Exception:
        return "N/A", "N/A"

def format_market_cap(value):
    if value is None or value == 'N/A':
        return 'N/A'
    try:
        val = float(value)
        if val >= 1e9:
            return f"${val/1e9:.2f}B"
        elif val >= 1e6:
            return f"${val/1e6:.2f}M"
        else:
            return f"${val:,.0f}"
    except Exception:
        return 'N/A'

# --- Widget TradingView ---
def render_tradingview_widget(ticker):
    """Genere le widget HTML officiel de TradingView (Mode Dark/Terminal)."""
    # Nettoyage du ticker pour TV (ex: BRK-B -> BRK.B)
    clean_ticker = str(ticker).replace('-', '.') 
    
    html_code = f"""
    <div class="tradingview-widget-container" style="height:100%;width:100%">
      <div id="tv_chart_{clean_ticker}" style="height:600px;width:100%"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
      <script type="text/javascript">
      new TradingView.widget({{
          "autosize": true,
          "symbol": "{clean_ticker}",
          "interval": "D",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "enable_publishing": false,
          "backgroundColor": "#0b0e14",
          "gridColor": "#1E232F",
          "hide_top_toolbar": false,
          "hide_legend": false,
          "save_image": false,
          "container_id": "tv_chart_{clean_ticker}"
      }});
      </script>
    </div>
    """
    components.html(html_code, height=600)

# --- Interface Streamlit ---
col_title, col_pf = st.columns([2, 1])
with col_title:
    st.title("EQUITY OVERVIEW")
with col_pf:
    st.markdown("<div style='margin-top: 15px;'></div>", unsafe_allow_html=True)
    try:
        from src.data_managers.db_manager import get_db
        db = get_db()
        portfolios_df = db.get_all_portfolios()
        
        if not portfolios_df.empty:
            pf_names = portfolios_df['name'].tolist()
            current_pf_name = st.session_state.get('loaded_pf_name', "-- Select --")
            index_select = pf_names.index(current_pf_name) + 1 if current_pf_name in pf_names else 0
            
            selected_pf = st.selectbox("PORTEFEUILLE ACTIF :", ["-- Select --"] + pf_names, index=index_select)
            
            if selected_pf != "-- Select --" and selected_pf != current_pf_name:
                loaded_data = db.load_portfolio(selected_pf)
                if loaded_data:
                    st.session_state['target_portfolio'] = loaded_data
                    st.session_state['loaded_pf_name'] = selected_pf
                    st.session_state['active_portfolio_tickers'] = [t for t, w in loaded_data.get('weights', {}).items() if w > 0]
                    st.rerun()
        else:
            st.selectbox("PORTEFEUILLE ACTIF :", ["Aucun portefeuille"], disabled=True)
    except Exception:
        pass

# --- Vérification du Portefeuille Cible ---
if 'target_portfolio' not in st.session_state or not st.session_state['target_portfolio']:
    st.info("INFO - Veuillez d'abord optimiser ou charger un portefeuille dans le module PORTFOLIO OPTIMIZATION.")
    st.stop()

if 'active_portfolio_tickers' not in st.session_state:
    st.session_state['active_portfolio_tickers'] = [t for t, w in st.session_state['target_portfolio'].get('weights', {}).items() if w > 0]

active_tickers = st.session_state.get('active_portfolio_tickers', [])

if not active_tickers:
    st.info("INFO - Le portefeuille actif ne contient aucune position (poids strictement superieur a 0).")
    st.stop()

# --- Watchlist Dynamique ---
st.subheader("WATCHLIST : PORTEFEUILLE ACTIF")

with st.spinner("Calcul des performances de la Watchlist..."):
    df_watchlist = fetch_watchlist_data(active_tickers)
    
    if not df_watchlist.empty:
        
        def color_performance(val):
            if pd.isna(val): return ''
            color = '#2ECC40' if val > 0 else '#FF4136' if val < 0 else '#D1D5DB'
            return f'color: {color}; font-weight: bold;'
        
        styled_watchlist = df_watchlist.style.format({
            "Price": "${:.2f}",
            "1D (%)": "{:+.2%}",
            "1W (%)": "{:+.2%}"
        })
        
        styled_watchlist = styled_watchlist.map(color_performance, subset=["1D (%)", "1W (%)"]) if hasattr(styled_watchlist, "map") else styled_watchlist.applymap(color_performance, subset=["1D (%)", "1W (%)"])
        
        st.dataframe(styled_watchlist, use_container_width=True, hide_index=True)
    else:
        st.warning("AVERTISSEMENT - Aucune donnee de marche disponible pour les actifs de la Watchlist.")

st.markdown("---")

# --- Sélecteur d'Actif ---
st.markdown("### SELECTION POUR ANALYSE PROFONDE")
selected_ticker = st.selectbox("CHOIX DE L'ACTIF :", options=active_tickers, label_visibility="collapsed")

with st.spinner("Acquisition des données de marché..."):
    intraday_px = get_intraday_data(selected_ticker)
    df_hist = get_stock_history(selected_ticker)
    df_fin = get_quarterly_financials(selected_ticker)
    info = get_stock_info(selected_ticker)

# --- SECTION 1 : TICKER TAPE (HEADER COTATION DYNAMIQUE) ---
if not df_hist.empty:
    close_px = df_hist['Close'].squeeze() if isinstance(df_hist.columns, pd.MultiIndex) else df_hist['Close']
    
    if not intraday_px.empty:
        current_price = float(intraday_px.iloc[-1])
    else:
        current_price = float(close_px.iloc[-1])
        
    # Utilisation stricte de l'historique journalier (évite le bug du lundi)
    if len(close_px) >= 2:
        prev_close = float(close_px.iloc[-2])
        ret_1d = (current_price / prev_close) - 1
    else:
        ret_1d = 0.0
        
    if len(close_px) >= 6:
        week_ago_price = float(close_px.iloc[-6])
        ret_1w = (current_price / week_ago_price) - 1
    else:
        ret_1w = 0.0

    spy_hist = get_benchmark_history()
    spy_ret_1d, spy_ret_1w = 0.0, 0.0
    if not spy_hist.empty and len(spy_hist) >= 2:
        spy_ret_1d = (float(spy_hist.iloc[-1]) / float(spy_hist.iloc[-2])) - 1
    if not spy_hist.empty and len(spy_hist) >= 6:
        spy_ret_1w = (float(spy_hist.iloc[-1]) / float(spy_hist.iloc[-6])) - 1
        
    alpha_1d = ret_1d - spy_ret_1d
    alpha_1w = ret_1w - spy_ret_1w

    # Logique de couleurs institutionnelles
    color_1d = "#2ECC40" if ret_1d >= 0 else "#FF4136"
    color_1w = "#2ECC40" if ret_1w >= 0 else "#FF4136"
    color_alpha_1d = "#2ECC40" if alpha_1d >= 0 else "#FF4136"
    color_alpha_1w = "#2ECC40" if alpha_1w >= 0 else "#FF4136"
    
    ticker_html = f"""
    <div style="background-color: #111111; padding: 15px 25px; border-left: 5px solid #F5A623; display: flex; align-items: baseline; flex-wrap: wrap; gap: 30px; margin-bottom: 25px;">
        <div style="font-size: 1.8rem; font-weight: bold; color: #FFFFFF;">{selected_ticker}</div>
        <div style="font-size: 1.8rem; color: #FFFFFF;">${current_price:.2f}</div>
        <div style="font-size: 1.1rem; color: {color_1d};">1D: {ret_1d:+.2%}</div>
        <div style="font-size: 1.1rem; color: {color_1w};">1W: {ret_1w:+.2%}</div>
        <div style="border-left: 1px solid #333333; height: 30px;"></div>
        <div style="font-size: 1.1rem; color: {color_alpha_1d};">α(SPY) 1D: {alpha_1d:+.2%}</div>
        <div style="font-size: 1.1rem; color: {color_alpha_1w};">α(SPY) 1W: {alpha_1w:+.2%}</div>
    </div>
    """
    st.markdown(ticker_html, unsafe_allow_html=True)
else:
    st.markdown("> **ERROR** - Flux de cotation indisponible pour cet actif.")

# --- SECTION 1.5 : FUNDAMENTAL METRICS GRID ---
def g(key, format_str="{}", default="N/A"):
    val = info.get(key)
    if val is None: return default
    try:
        return format_str.format(val)
    except Exception:
        return str(val)

iv_val = get_implied_volatility(selected_ticker)
var_95_val, cvar_95_val = calculate_historical_risk(df_hist)

data_metrics = {
    "Sector": info.get('sector', 'N/A'),
    "Industry": info.get('industry', 'N/A'),
    "Market Cap": format_market_cap(info.get('marketCap')),
    "PE (TTM)": g('trailingPE', "{:.1f}"),
    "Fwd PE": g('forwardPE', "{:.1f}"),
    "PEG Ratio": g('pegRatio', "{:.2f}"),
    "EPS (TTM)": g('trailingEps', "${:.2f}"),
    "Div Yield": g('dividendYield', "{:.2%}"),
    "Beta": g('beta', "{:.2f}"),
    "52W High": g('fiftyTwoWeekHigh', "${:.2f}"),
    "52W Low": g('fiftyTwoWeekLow', "${:.2f}"),
    "Implied Vol (IV)": iv_val,
    "Hist VaR 95%": var_95_val,
    "Hist CVaR 95%": cvar_95_val
}

html_grid = "<div style=\"display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 25px;\">"
for k, v in data_metrics.items():
    html_grid += f"<div style=\"background-color: #111111; padding: 10px 15px; border-left: 3px solid #F5A623;\"><div style=\"color: #888888; font-size: 0.75rem; text-transform: uppercase;\">{k}</div><div style=\"font-weight: bold; color: #FFFFFF; margin-top: 5px; font-size: 1.1rem;\">{v}</div></div>"
html_grid += "</div>"
st.markdown(html_grid, unsafe_allow_html=True)

# --- SECTION 2 : CORPORATE GROWTH TRENDS (FONDAMENTAUX) ---
st.subheader("CORPORATE GROWTH TRENDS & UPCOMING EVENTS")

growth_col1, growth_col2, col_calendar = st.columns([2, 2, 1])

with col_calendar:
    def format_ts(ts):
        if not ts or pd.isna(ts): return "N/A"
        try:
            return datetime.fromtimestamp(int(ts)).strftime('%d %b %Y').upper()
        except Exception:
            return "N/A"
            
    earnings_ts = info.get('earningsTimestamp')
    ex_div_ts = info.get('exDividendDate')
    div_ts = info.get('dividendDate')
    
    cal_html = f"""
    <div style="border: 1px solid #333333; padding: 15px; background-color: #111111; height: 350px;">
        <div style="color: #F5A623; margin-bottom: 25px; font-weight: bold; font-size: 1.1rem; text-transform: uppercase;">Upcoming Events</div>
        <div style="margin-bottom: 20px;">
            <div style="color: #888888; font-size: 0.8rem; margin-bottom: 2px; text-transform: uppercase;">Earnings Date:</div>
            <div style="color: #D1D5DB; font-size: 1.1rem; font-weight: bold;">{format_ts(earnings_ts)}</div>
        </div>
        <div style="margin-bottom: 20px;">
            <div style="color: #888888; font-size: 0.8rem; margin-bottom: 2px; text-transform: uppercase;">Ex-Dividend:</div>
            <div style="color: #D1D5DB; font-size: 1.1rem; font-weight: bold;">{format_ts(ex_div_ts)}</div>
        </div>
        <div>
            <div style="color: #888888; font-size: 0.8rem; margin-bottom: 2px; text-transform: uppercase;">Payment Date:</div>
            <div style="color: #D1D5DB; font-size: 1.1rem; font-weight: bold;">{format_ts(div_ts)}</div>
        </div>
    </div>
    """
    st.markdown(cal_html, unsafe_allow_html=True)

if not df_fin.empty:
    # Nettoyage et préparation de la matrice fondamentale
    df_fin = df_fin.T.sort_index(ascending=True) # Dates en lignes, du plus ancien au plus récent
    
    # Recherche des clés standardisées par yfinance
    rev_key = next((k for k in ['Total Revenue', 'Operating Revenue'] if k in df_fin.columns), None)
    inc_key = next((k for k in ['Net Income', 'Net Income Common Stockholders'] if k in df_fin.columns), None)
    
    if rev_key and inc_key:
        dates = df_fin.index.strftime('%Y-Q%q') # Format lisible Q1/Q2
        revenue = df_fin[rev_key].fillna(0).astype(float)
        net_income = df_fin[inc_key].fillna(0).astype(float)
        margin = (net_income / revenue).fillna(0)
        
        with growth_col1:
            fig_rev = make_subplots(specs=[[{"secondary_y": True}]])
            
            fig_rev.add_trace(go.Bar(
                x=dates, y=revenue, name="Total Revenue", marker_color="#4B5563"
            ), secondary_y=False)
            
            fig_rev.add_trace(go.Scatter(
                x=dates, y=margin, name="Net Margin", line=dict(color="#F5A623", width=2, dash='dot')
            ), secondary_y=True)
            
            fig_rev.update_layout(
                title="REVENUE & NET MARGIN",
                template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"),
                margin=dict(l=0, r=0, t=40, b=0), height=350,
                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
            )
            fig_rev.update_xaxes(showgrid=False)
            fig_rev.update_yaxes(showgrid=True, gridcolor='#333333', secondary_y=False, title_text="Revenue ($)")
            fig_rev.update_yaxes(showgrid=False, secondary_y=True, tickformat=".1%", title_text="Margin")
            
            st.plotly_chart(fig_rev, width="stretch")
            
        with growth_col2:
            colors = ['#2ECC40' if val >= 0 else '#FF4136' for val in net_income]
            
            fig_inc = go.Figure(go.Bar(
                x=dates, y=net_income, marker_color=colors, name="Net Income"
            ))
            
            fig_inc.update_layout(
                title="NET INCOME (QoQ)",
                template="plotly_dark", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"),
                margin=dict(l=0, r=0, t=40, b=0), height=350,
                showlegend=False
            )
            fig_inc.update_xaxes(showgrid=False)
            fig_inc.update_yaxes(showgrid=True, gridcolor='#333333', title_text="Net Income ($)")
            
            st.plotly_chart(fig_inc, width="stretch")
    else:
        with growth_col1:
            st.markdown("> *INFO : Données comptables (Revenue/Net Income) non disponibles.*")
else:
    with growth_col1:
        st.markdown("> *INFO : Modèle fondamental trimestriel non disponible pour cet actif.*")

st.markdown("<br>", unsafe_allow_html=True)

# --- SECTION 3 : ANALYSE TECHNIQUE (TRADINGVIEW WIDGET) ---
st.subheader("TECHNICAL ANALYSIS")

if selected_ticker:
    render_tradingview_widget(selected_ticker)
else:
    st.markdown("> **ERROR** - Aucun actif sélectionné pour l'affichage du graphique.")