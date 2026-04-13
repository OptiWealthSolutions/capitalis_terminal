
import streamlit as st
import pandas as pd
import numpy as np
from fpdf import FPDF
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
import io
import tempfile
import os
import sys
from pathlib import Path
import yfinance as yf

# --- Ajout du chemin racine au PYTHONPATH ---
ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from src.pf_engine.portfolio_optimization.portfolio_monitoring import calculate_real_drift
from src.pf_engine.risk_management.monte_carlo_simulation import run_monte_carlo_portfolio, calculate_var_cvar

st.set_page_config(page_title="Reporting & Monitoring", layout="wide")

# --- Configuration UI & Raccourcis ---
from src.utils.ui_config import set_terminal_margins, setup_bloomberg_shortcuts
set_terminal_margins()
setup_bloomberg_shortcuts()

# --- Classe FPDF Personnalisée ---
class InstitutionalPDF(FPDF):
    def header(self):
        # DESSIN DU BANDEAU NOIR DYNAMIQUE
        self.set_fill_color(0, 0, 0)
        self.rect(0, 0, self.w, 25, 'F')
        
        # INSERTION DU TEXTE BLANC
        self.set_y(8)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(255, 255, 255)
        self.cell(0, 10, "HORACLE CAPITAL", 0, 0, "L")
        
        # SOUS-TITRE INSTITUTIONNEL
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(200, 200, 200)
        self.cell(0, 10, "CAPITALIS V2 - INSTITUTIONAL REPORTING", 0, 0, "R")
        
        # RETOUR DU CURSEUR ET RESET DES COULEURS
        self.ln(20)
        self.set_text_color(0, 0, 0)
        
    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, 'CONFIDENTIAL - FOR INTERNAL USE ONLY | CAPITALIS V2 QUANTITATIVE ENGINE', 0, 0, 'L')
        self.set_x(self.l_margin)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'R')

# --- PDF Generation Function ---
def generate_pdf_report(config, portfolio_data, drift_df, drift_threshold, initial_capital=20000):
    """
    Génère un rapport PDF basé sur la configuration et les données du portefeuille.
    Optimisé avec un thème clair pour l'impression (Print-Friendly).
    """
    pdf = InstitutionalPDF(orientation='P', unit='mm', format='A4')
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "B", 16)

    # --- Titre ---
    pdf.cell(0, 10, "PORTFOLIO REPORT - CAPITALIS V2", 0, 1, "C")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 5, f"Date de génération : {datetime.now().strftime('%d/%m/%Y %H:%M')}", 0, 1, "C")
    pdf.ln(10)

    # --- PRÉPARATION DES DONNÉES GLOBALES POUR LES GRAPHIQUES ---
    df_weights = pd.DataFrame.from_dict(portfolio_data['weights'], orient='index', columns=['Weight'])
    df_weights.index.name = 'Ticker'
    df_weights = df_weights.reset_index()
    
    df_meta = st.session_state.get('scored_df', pd.DataFrame())
    if not df_meta.empty:
        cols_meta = []
        for col in ['Ticker', 'Sector', 'Country']:
            if col in df_meta.columns:
                cols_meta.append(col)
        
        if 'Ticker' not in cols_meta:
            for col in df_meta.columns:
                if str(col).lower() in ['ticker', 'symbol']:
                    df_meta = df_meta.rename(columns={col: 'Ticker'})
                    cols_meta.append('Ticker')
                    break
                    
        if 'Ticker' in cols_meta:
            df_plot = pd.merge(df_weights, df_meta[cols_meta], on='Ticker', how='left')
        else:
            df_plot = df_weights.copy()
    else:
        df_plot = df_weights.copy()
        
    if 'Sector' not in df_plot.columns: df_plot['Sector'] = 'Inconnu'
    if 'Country' not in df_plot.columns: df_plot['Country'] = 'Inconnu'
    df_plot['Sector'] = df_plot['Sector'].fillna('Inconnu')
    df_plot['Country'] = df_plot['Country'].fillna('Inconnu')

    # --- Section Résumé et Métriques ---
    if config.get('include_summary', False) or config.get('include_metrics', False):
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 10, "1. Résumé et Métriques du Portefeuille", 0, 1, "L")
        pdf.ln(2)
        
        cagr = portfolio_data.get('cagr', 0)
        vol = portfolio_data.get('vol', 0)
        sharpe = portfolio_data.get('sharpe', 0)
        
        # CALCUL DE L'OFFSET POUR CENTRAGE DU TABLEAU
        col_widths = [55, 55, 55] 
        page_width = pdf.w - 2 * pdf.l_margin
        offset = (page_width - sum(col_widths)) / 2
        
        # EN-TETES DU TABLEAU
        pdf.set_fill_color(230, 230, 230)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_x(pdf.l_margin + offset)
        pdf.cell(col_widths[0], 8, "Rendement Annuel (CAGR)", 1, 0, "C", True)
        pdf.cell(col_widths[1], 8, "Volatilité Annuelle", 1, 0, "C", True)
        pdf.cell(col_widths[2], 8, "Ratio de Sharpe", 1, 1, "C", True)
        
        # DONNEES DU TABLEAU
        pdf.set_font("Helvetica", "", 11)
        pdf.set_x(pdf.l_margin + offset)
        pdf.cell(col_widths[0], 10, f"{cagr:.2%}", 1, 0, "C")
        pdf.cell(col_widths[1], 10, f"{vol:.2%}", 1, 0, "C")
        pdf.cell(col_widths[2], 10, f"{sharpe:.2f}", 1, 1, "C")
        pdf.ln(8)

    # --- Section Diversification & Risque ---
    if config.get('include_diversification', False):
        pdf.add_page()
        
        df_risk = df_plot.copy()
        df_risk['Weight_%'] = df_risk['Weight'] * 100
        hhi_index = (df_risk['Weight_%'] ** 2).sum()
        top_5_conc = df_risk.nlargest(5, 'Weight_%')['Weight_%'].sum()
        hhi_status = "Diversified" if hhi_index < 1500 else "Concentrated"
        
        df_sector = df_plot.groupby('Sector', as_index=False)['Weight'].sum()
        df_geo = df_plot.groupby('Country', as_index=False)['Weight'].sum()
        dominant_sector = df_sector.loc[df_sector['Weight'].idxmax(), 'Sector'] if not df_sector.empty else "N/A"
        
        # Titre principal
        pdf.set_font('Helvetica', 'B', 16)
        pdf.set_text_color(31, 41, 55) # Gris ardoise tres fonce
        pdf.cell(0, 10, 'PORTFOLIO DIVERSIFICATION & RISK AUDIT', ln=True, align='L')
        pdf.line(10, pdf.get_y(), 200, pdf.get_y()) # Ligne de separation elegante
        pdf.ln(8)
        
        # Bloc Metriques (HHI & Concentration)
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(107, 114, 128) # Gris moyen
        pdf.cell(60, 6, 'HERFINDAHL-HIRSCHMAN INDEX', border=0)
        pdf.cell(60, 6, 'TOP 5 HOLDINGS EXPOSURE', border=0)
        pdf.cell(60, 6, 'DOMINANT SECTOR', border=0, ln=True)
        
        pdf.set_font('Helvetica', 'B', 12)
        pdf.set_text_color(17, 24, 39) # Noir
        pdf.cell(60, 8, f"{hhi_index:.0f} ({hhi_status})", border=0)
        pdf.cell(60, 8, f"{top_5_conc:.2f}%", border=0)
        pdf.cell(60, 8, f"{dominant_sector}", border=0, ln=True)
        pdf.ln(10)
        
        temp_sec_name = None
        temp_geo_name = None
        
        try:
            # Graphique Secteurs
            fig_sec = px.pie(df_sector, values='Weight', names='Sector', hole=0.6, title="Sector Exposure")
            fig_sec.update_traces(textposition='inside', textinfo='percent+label')
            
            # Graphique Geographique
            fig_geo = px.pie(df_geo, values='Weight', names='Country', hole=0.6, title="Geographic Exposure")
            fig_geo.update_traces(textposition='inside', textinfo='percent+label')
            
            # Configuration specifique pour l'impression PDF (Light Mode)
            fig_sec.update_layout(
                template="plotly_white",
                paper_bgcolor='rgba(255,255,255,1)',
                plot_bgcolor='rgba(255,255,255,1)',
                font=dict(color='#111827'),
                title=dict(font=dict(color='#374151'))
            )
            
            fig_geo.update_layout(
                template="plotly_white",
                paper_bgcolor='rgba(255,255,255,1)',
                plot_bgcolor='rgba(255,255,255,1)',
                font=dict(color='#111827'),
                title=dict(font=dict(color='#374151'))
            )
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmpfile_sec:
                temp_sec_name = tmpfile_sec.name
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmpfile_geo:
                temp_geo_name = tmpfile_geo.name
                
            fig_sec.write_image(temp_sec_name, width=800, height=450, scale=2)
            fig_geo.write_image(temp_geo_name, width=800, height=450, scale=2)
                
            if os.path.exists(temp_sec_name):
                pdf.image(temp_sec_name, x=15, y=pdf.get_y(), w=180)
                
            if os.path.exists(temp_geo_name):
                # On place le 2eme graphique plus bas. Avec w=180 (largeur), la hauteur calculee 
                # est d'environ 100mm. On laisse une marge.
                y_position_geo = pdf.get_y() + 110 
                pdf.image(temp_geo_name, x=15, y=y_position_geo, w=180)
                
        except Exception as e:
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(255, 0, 0)
            pdf.cell(0, 5, f"Erreur lors de la génération des graphiques de diversification: {e}", 0, 1)
            pdf.set_text_color(0, 0, 0)
        finally:
            if temp_sec_name and os.path.exists(temp_sec_name):
                os.remove(temp_sec_name)
            if temp_geo_name and os.path.exists(temp_geo_name):
                os.remove(temp_geo_name)

    # --- Section d'Allocation ---
    if config.get('include_allocation', False):
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 10, "2. Graphique d'Allocation Sectorielle", 0, 1, "L")
        
        # Thème clair (Print-friendly) pour le PDF
        fig_sun = px.sunburst(df_plot, path=['Sector', 'Ticker'], values='Weight',
                              color='Weight', color_continuous_scale='YlOrBr')
        fig_sun.update_layout(
            paper_bgcolor="white", plot_bgcolor="white", 
            font=dict(family="monospace", color="black"),
            margin=dict(l=10, r=10, t=30, b=10)
        )

        # Sauvegarder le graphique en image
        try:
            if pdf.get_y() > 150:
                pdf.add_page()
            img_bytes = fig_sun.to_image(format="png", width=600, height=400, scale=2)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmpfile:
                tmpfile.write(img_bytes)
            pdf.image(tmpfile.name, x=pdf.get_x() + 25, w=150)
            pdf.ln(5)
            os.remove(tmpfile.name)
        except Exception as e:
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_text_color(255, 0, 0)
            pdf.cell(0, 5, f"Erreur lors de la génération du graphique: {e}", 0, 1)
            pdf.set_text_color(0, 0, 0)

    # --- Section Composition détaillée ---
    if config.get('include_composition', False) and not drift_df.empty:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 10, "3. Composition Détaillée et Suivi du Drift", 0, 1, "L")
        pdf.set_font("Helvetica", "", 8)

        # Largeurs des colonnes
        col_widths = [40, 40, 40, 40] 
        page_width = pdf.w - 2 * pdf.l_margin
        table_width = sum(col_widths)
        offset = (page_width - table_width) / 2
        
        # En-têtes
        pdf.set_fill_color(230, 230, 230)
        pdf.set_x(pdf.l_margin + offset)
        pdf.cell(col_widths[0], 8, "Ticker", 1, 0, "C", True)
        pdf.cell(col_widths[1], 8, "Poids Cible", 1, 0, "C", True)
        pdf.cell(col_widths[2], 8, "Poids Actuel", 1, 0, "C", True)
        pdf.cell(col_widths[3], 8, "Drift", 1, 1, "C", True)

        # Données
        for index, row in drift_df.iterrows():
            pdf.set_x(pdf.l_margin + offset)
            pdf.cell(col_widths[0], 8, str(index), 1)
            pdf.cell(col_widths[1], 8, f"{row['Target Weight']:.2%}", 1)
            pdf.cell(col_widths[2], 8, f"{row['Current Weight']:.2%}", 1)
            
            # Code couleur pour le drift dans le PDF
            if abs(row['Drift']) > drift_threshold:
                pdf.set_text_color(220, 53, 69) # Rouge
            else:
                pdf.set_text_color(40, 167, 69) # Vert
                
            pdf.cell(col_widths[3], 8, f"{row['Drift']:.2%}", 1, 1, "C")
            pdf.set_text_color(0, 0, 0) # Reset couleur

    # --- Section Monte Carlo & Risque ---
    if config.get('include_monte_carlo', False):
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 10, "4. Stress Test Monte Carlo & Analyse des Risques", 0, 1, "L")
        pdf.set_font("Helvetica", "", 10)
        
        try:
            tickers = list(portfolio_data['weights'].keys())
            weights_array = np.array([portfolio_data['weights'][t] for t in tickers])
            
            # Téléchargement de l'historique pour générer la matrice de covariance
            df_hist = yf.download(tickers, period="2y", interval="1d", progress=False)
            if isinstance(df_hist.columns, pd.MultiIndex):
                df_close = df_hist['Close']
            else:
                df_close = df_hist[['Close']]
                if len(tickers) == 1:
                    df_close.columns = tickers
                    
            df_close = df_close[[t for t in tickers if t in df_close.columns]]
            returns_df = df_close.pct_change().dropna(how='all')
            
            mu_vec = returns_df.mean().fillna(0).values * 252
            cov_matrix = returns_df.cov().fillna(0).values * 252
            cov_matrix += np.eye(cov_matrix.shape[0]) * 1e-5
            
            # Exécution de la simulation tensorielle
            df_paths = run_monte_carlo_portfolio(
                initial_capital=initial_capital,
                weights=weights_array,
                mu_vec=mu_vec,
                cov_matrix=cov_matrix,
                horizon_days=252,
                n_simulations=1000
            )
            
            final_values = df_paths.iloc[-1].values
            var_95, var_99, cvar_95 = calculate_var_cvar(final_values)
            
            # Rédaction des métriques de risque
            pdf.ln(5)
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(0, 8, "Métriques de Risque Extrême (Tail Risk) :", 0, 1)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(0, 8, f"  - Value at Risk (95%) : -{abs(var_95):,.2f} EUR", 0, 1)
            pdf.cell(0, 8, f"  - Value at Risk (99%) : -{abs(var_99):,.2f} EUR", 0, 1)
            pdf.cell(0, 8, f"  - Conditional VaR (CVaR 95%) : -{abs(cvar_95):,.2f} EUR", 0, 1)
            pdf.ln(5)
            
            # Graphique Plotly optimisé et allégé
            fig_mc = go.Figure()
            x_idx = df_paths.index.tolist()
            sample_cols = df_paths.columns[:100] # Ne tracer que 100 chemins
            
            x_vals, y_vals = [], []
            for col in sample_cols:
                x_vals.extend(x_idx)
                x_vals.append(None)
                y_vals.extend(df_paths[col].tolist())
                y_vals.append(None)
                
            fig_mc.add_trace(go.Scatter(
                x=x_vals, y=y_vals, mode='lines',
                line=dict(color='rgba(245, 166, 35, 0.1)', width=1),
                showlegend=False
            ))
            
            fig_mc.add_trace(go.Scatter(
                x=x_idx, y=df_paths.mean(axis=1), mode='lines',
                line=dict(color='#FF0000', width=2), name='Moyenne'
            ))
            
            fig_mc.update_layout(
                title="Simulation des Trajectoires (Mouvement Brownien)",
                paper_bgcolor='white', plot_bgcolor='white',
                font=dict(family="Arial", color="black"),
                margin=dict(l=10, r=10, t=30, b=10), showlegend=False
            )
            
            if pdf.get_y() > 150:
                pdf.add_page()
            img_bytes = fig_mc.to_image(format="png", width=700, height=400, scale=2)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmpfile:
                tmpfile.write(img_bytes)
            pdf.image(tmpfile.name, x=pdf.get_x(), w=180)
            os.remove(tmpfile.name)
            
        except Exception as e:
            pdf.set_text_color(255, 0, 0)
            pdf.cell(0, 5, f"Erreur lors de la simulation Monte Carlo: {e}", 0, 1)
            pdf.set_text_color(0, 0, 0)

    # --- Section Matrice de Corrélation ---
    if config.get('include_correlation', False):
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 10, "5. Matrice de Corrélation (Risk Control)", 0, 1, "L")
        
        try:
            tickers = list(portfolio_data['weights'].keys())
            df_hist = yf.download(tickers, period="1y", interval="1d", progress=False)
            df_close = df_hist['Close'] if isinstance(df_hist.columns, pd.MultiIndex) else df_hist[['Close']]
            if len(tickers) == 1: df_close.columns = tickers
            
            returns_df = df_close[[t for t in tickers if t in df_close.columns]].pct_change().dropna(how='all')
            corr_matrix = returns_df.corr()
            
            fig_corr = go.Figure(data=go.Heatmap(
                z=corr_matrix.values, x=corr_matrix.columns, y=corr_matrix.index,
                colorscale=[[0, '#3B82F6'], [0.5, '#FFFFFF'], [1, '#F5A623']], zmin=-1, zmax=1
            ))
            fig_corr.update_layout(
                paper_bgcolor='white', plot_bgcolor='white', 
                font=dict(family="Arial", color="black"), 
                margin=dict(l=10, r=10, t=30, b=10)
            )
            
            if pdf.get_y() > 150:
                pdf.add_page()
            img_bytes = fig_corr.to_image(format="png", width=600, height=500, scale=2)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmpfile:
                tmpfile.write(img_bytes)
            pdf.image(tmpfile.name, x=pdf.get_x() + 15, w=160)
            os.remove(tmpfile.name)
        except Exception as e:
            pdf.set_text_color(255, 0, 0)
            pdf.cell(0, 5, f"Erreur lors du calcul de la corrélation: {e}", 0, 1)
            pdf.set_text_color(0, 0, 0)

    return pdf.output(dest='S').encode('latin-1')

# --- CSS Personnalisé ---
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
    .stTabs [data-baseweb="tab-list"] { gap: 24px; }
    .stTabs [data-baseweb="tab"] { font-size: 1.0rem; padding-bottom: 10px; }
    .metric-card { background-color: #1E1E1E; padding: 15px; border-radius: 5px; border-left: 4px solid #00FFFF; }
</style>
""", unsafe_allow_html=True)

col_title, col_pf = st.columns([2, 1])
with col_title:
    st.title("REPORTING & MONITORING")
    st.markdown("Interface de surveillance des dérives d'allocation (Drift) et génération d'exports de gestion.")
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
                    st.rerun()
        else:
            st.selectbox("PORTEFEUILLE ACTIF :", ["Aucun portefeuille"], disabled=True)
    except Exception:
        pass

# Vérifier si un portefeuille cible a été défini
if 'target_portfolio' not in st.session_state:
    st.markdown("> **WARNING** - Absence de modèle cible. Paramétrage requis au sein du module PORTFOLIO OPTIMIZATION.")
    st.stop()

portfolio_data = st.session_state['target_portfolio']
target_weights = portfolio_data.get('weights', {})
cagr = portfolio_data.get('cagr', 0.0)
vol = portfolio_data.get('vol', 0.0)
sharpe = portfolio_data.get('sharpe', 0.0)

# --- Cache Wrapper pour le Drift ---
@st.cache_data(ttl=3600, show_spinner=False)
def get_cached_drift(weights_dict):
    return calculate_real_drift(weights_dict)

# --- Création des Onglets ---
tab_dash, tab_report = st.tabs(["MONITORING DASHBOARD", "PDF REPORT GENERATION"])

with tab_dash:
    # --- 1. Top Level Metrics ---
    st.subheader("KEY PERFORMANCE INDICATORS")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("CAGR Cible", f"{cagr:.2%}")
    col2.metric("Volatilité", f"{vol:.2%}")
    col3.metric("Ratio de Sharpe", f"{sharpe:.2f}")
    col4.metric("Actifs en Portefeuille", f"{len(target_weights)}")
    
    # --- 2. Drift Engine & UI ---
    col_title, col_btn = st.columns([3, 1])
    with col_title:
        st.subheader("DRIFT MONITORING & REBALANCING")
    with col_btn:
        if st.button("SIMULATE MARKET PRICES", width="stretch"):
            # Bouton purement cosmétique pour re-trigger la simulation aléatoire
            pass

    st.markdown("Comparaison temps réel entre le vecteur cible initial et l'exposition stochastique modélisée.")
    
    col_params, col_alert = st.columns([1, 2])
    with col_params:
        drift_threshold = st.slider("Seuil d'alerte de Drift (%)", min_value=0.5, max_value=10.0, value=2.0, step=0.5) / 100

    # --- Calcul réel du Drift ---
    with st.spinner("Téléchargement des prix de marché actuels et calcul du Drift..."):
        df_drift = get_cached_drift(target_weights)

    # Alertes dynamiques
    with col_alert:
        actifs_en_alerte = df_drift[df_drift['Drift_abs'] > drift_threshold]
        if not actifs_en_alerte.empty:
            st.markdown(f"> **WARNING** - REBALANCING ALERT : {len(actifs_en_alerte)} actif(s) hors des bornes de tolérance ({drift_threshold:.1%}).")
        else:
            st.markdown(f"> **STATUS : OK** - PORTFOLIO STABLE : L'ensemble des pondérations respectent le seuil de tolérance de {drift_threshold:.1%}.")

    # Graphique Comparatif Plotly
    st.markdown("#### EXPOSURE COMPARISON: TARGET VS CURRENT")
    fig_bar = go.Figure(data=[
        go.Bar(name='Allocation Cible', x=df_drift.index, y=df_drift['Target Weight'], marker_color='#F5A623'),
        go.Bar(name='Exposition Actuelle', x=df_drift.index, y=df_drift['Current Weight'], marker_color='#4B5563')
    ])
    fig_bar.update_layout(
        barmode='group', 
        template="plotly_dark",
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family="JetBrains Mono, monospace", color="#D1D5DB"),
        yaxis_tickformat='.1%',
        margin=dict(l=0, r=0, t=30, b=0),
        height=400,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    st.plotly_chart(fig_bar, width="stretch")

    # Tableau détaillé du Drift
    st.markdown("#### DETAILED DRIFT MATRIX")
    def highlight_drift(s):
        return ['color: #FF4B4B; font-weight: bold' if abs(val) > drift_threshold else 'color: #00FF00' for val in s]

    st.dataframe(
        df_drift[['Target Weight', 'Current Weight', 'Drift']].style.format("{:.2%}")
                                                              .apply(highlight_drift, subset=['Drift']),
        hide_index=True,
        width="stretch",
        height=300
    )

with tab_report:
    st.header("PDF REPORT CONFIGURATION")
    st.markdown("Compilation automatisée des états du système pour exportation institutionnelle.")
    
    col_opt, col_prev = st.columns([1, 1])
    
    with col_opt:
        st.subheader("INCLUSION SCOPE")
        report_config = {
            'include_summary': st.checkbox("Résumé et Indicateurs Clés (KPI)", value=True),
            'include_diversification': st.checkbox("Diversification & Risques (Secteurs/Pays, HHI)", value=True),
            'include_allocation': st.checkbox("Graphique d'Allocation Sectorielle", value=False),
            'include_composition': st.checkbox("Table de Composition et Suivi du Drift", value=True),
            'include_monte_carlo': st.checkbox("Stress Test Monte Carlo & VaR", value=True),
            'include_correlation': st.checkbox("Matrice de Corrélation (Risk Control)", value=True),
        }
        st.markdown("<br>", unsafe_allow_html=True)
        initial_capital = st.number_input("Capital Initial de Simulation (€)", min_value=1000, value=20000, step=1000)
        
    with col_prev:
        st.markdown("> *INFO : Le document généré intègre un filtre CSS clair optimisé pour l'impression physique.*")
        st.markdown(f"**Date du rapport :** {datetime.now().strftime('%d/%m/%Y')}")
        st.markdown(f"**Seuil de drift appliqué :** {drift_threshold:.1%}")
        
    # --- Bouton d'Export PDF ---
    if st.button("GENERATE PDF REPORT", key="export_pdf", type="primary"):
        with st.spinner("Compilation binaire du document en cours..."):
            pdf_bytes = generate_pdf_report(
                config=report_config,
                portfolio_data=portfolio_data,
                drift_df=df_drift,
                drift_threshold=drift_threshold,
                initial_capital=initial_capital
            )
            st.download_button(
                label="DOWNLOAD AS PDF",
                data=pdf_bytes,
                file_name=f"Capitalis_Report_{datetime.now().strftime('%Y%m%d')}.pdf",
                mime="application/pdf"
            )

st.sidebar.markdown("> **STATUS : OK** - Monitoring en temps réel actif. Prix basés sur la dernière clôture du marché.")
