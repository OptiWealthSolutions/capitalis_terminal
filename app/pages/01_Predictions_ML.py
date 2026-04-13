"""
This module provides a Streamlit interface for the Predictive Alpha component of CAPITALIS V2.

It allows users to:
- Load the production machine learning models.
- Fetch real-time data for inference.
- Generate and display predictions and confidence scores.
- Visualize model interpretability using SHAP.
"""

import sys
from pathlib import Path
import joblib
import importlib.util
import matplotlib.pyplot as plt

import streamlit as st
import pandas as pd
import yfinance as yf
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import shap

from src.utils.ui_config import set_terminal_margins, setup_bloomberg_shortcuts
from machine_learning_models.data_pipeline.features_engineering import FeatureEngineer
from src.core import config as settings

# --- Configuration de la Page ---
st.set_page_config(page_title="CAPITALIS V2 - Predictions ML", layout="wide")

# --- Définition des chemins des modèles ---
# NOTE: Le script d'entraînement backend (ex: train_pipeline.py) doit exporter les modèles 
# dans ce dossier via `joblib.dump(model, PRIMARY_MODEL_PATH)`.
PRIMARY_MODEL_PATH = settings.PRIMARY_MODEL_PATH
META_MODEL_PATH = settings.META_MODEL_PATH

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

st.title("PREDICTIVE ALPHA (ML INFERENCE)")

with st.expander("MLOPS CONTROL PANEL", expanded=False):
    if st.button("PURGE MEMORY CACHE & RELOAD ARTIFACTS"):
        st.markdown("> STATUS : SYSTEM CACHE PURGED. NEW ARTIFACTS LOADED.")
        st.cache_resource.clear()
        st.cache_data.clear()
        st.rerun()

# --- Chargement des modèles de production ---
@st.cache_resource(show_spinner="LOADING PREDICTIVE MODELS...")
def load_production_models():
    """
    Charge les modèles de production sérialisés (.joblib).
    Retourne (None, None) si les fichiers sont introuvables.
    """
    try:
        if not PRIMARY_MODEL_PATH.exists() or not META_MODEL_PATH.exists():
            return None, None
        primary_model = joblib.load(PRIMARY_MODEL_PATH)
        meta_model = joblib.load(META_MODEL_PATH)
        return primary_model, meta_model
    except Exception as e:
        st.error(f"SYSTEM FAULT : Erreur lors de la désérialisation des modèles - {e}")
        return None, None

primary_model, meta_model = load_production_models()

if primary_model is None or meta_model is None:
    st.warning("MODÈLES NON TROUVÉS : Veuillez exécuter le pipeline d'entraînement Backend pour générer les fichiers .joblib.")
    st.stop()
else:
    st.markdown("> STATUS : OK - MODELES DE PREDICTION EN LIGNE (CHARGEMENT LOCAL).")


st.markdown("---")
st.subheader("INFERENCE ENGINE : S&P 500 DIRECTIONAL SIGNAL")
st.markdown("Extraction du flux de données temps réel, application des transformations fractionnaires et évaluation par le méta-modèle.")

# --- Génération des Features Temps Réel ---
@st.cache_data(ttl=3600, show_spinner=False)
def get_inference_data(tail_days=60):
    try:
        # Téléchargement de l'historique complet (10 ans) pour garantir l'alignement avec les décalages macro (ex: shift de 40 mois)
        data = yf.download("^GSPC", period="10y", interval="1d", progress=False)
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.droplevel(1)
            
        data = data[['Open', 'High', 'Low', 'Close', 'Volume']].copy()
        data.columns = [col.capitalize() for col in data.columns]
        data.dropna(subset=['Close'], inplace=True)
        data['Volume'] = data['Volume'].replace(0, 1)
        
        # Sauvegarde des prix de clôture pour le graphique
        close_prices = data['Close'].copy()
        
        fe = FeatureEngineer()
        # GENERATION GLOBALE INCLUANT LES MOTEURS DE RISQUES
        features = fe.build_all_features(data)
        
        if features.empty:
            return None, None
            
        # On retourne les N dernières observations pour l'historique
        recent_features = features.tail(tail_days)
        recent_close = close_prices.reindex(recent_features.index)
        return recent_features, recent_close
    except Exception as e:
        import traceback
        print(f"Erreur d'inférence: {traceback.format_exc()}")
        return None, None

with st.spinner("ANALYSE DU FLUX DE DONNEES ET INFERENCE EN COURS..."):
    recent_features, recent_close = get_inference_data(tail_days=60)

if recent_features is not None and not recent_features.empty:
    try:
        # PURGE STRICTE DES VARIABLES NON-STATIONNAIRES (ALIGNEMENT AVEC L'ENTRAINEMENT)
        colonnes_a_bannir = ['Open', 'High', 'Low', 'Close', 'Volume']
        X_inference = recent_features.drop(columns=[col for col in colonnes_a_bannir if col in recent_features.columns], errors='ignore')
        
        # Prédictions sur toute la période
        preds = primary_model.predict(X_inference)
        probs = meta_model.predict_proba(X_inference)
        
        if probs.shape[1] > 1:
            confidences = probs[:, 1]
        else:
            confidences = probs[:, 0]
            
        latest_date = recent_features.index[-1]
        signal_pred = preds[-1]
        confidence = confidences[-1]
        
        date_str = latest_date.strftime("%d %b %Y").upper()
        
        signal_text = "LONG (ACHAT)" if signal_pred == 1.0 else "SHORT (VENTE)"
        signal_color = "#3B82F6" if signal_pred == 1.0 else "#F5A623" # Bleu = Achat, Orange = Vente
        
        conf_text = "ELEVEE" if confidence >= 0.60 else ("MODEREE" if confidence >= 0.50 else "FAIBLE (REJET)")
        conf_color = "#2ECC40" if confidence >= 0.60 else ("#F5A623" if confidence >= 0.50 else "#FF4136")

        html_result = f"""
        <div style="background-color: #111111; padding: 25px; border-left: 5px solid {signal_color}; margin-top: 20px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="color: #888888; font-size: 0.9rem; text-transform: uppercase; margin-bottom: 5px;">DERNIER SIGNAL (CLOTURE)</div>
                <div style="font-size: 1.4rem; color: #FFFFFF; font-weight: bold;">{date_str}</div>
            </div>
            <div>
                <div style="color: #888888; font-size: 0.9rem; text-transform: uppercase; margin-bottom: 5px;">DIRECTION (PRIMARY MODEL)</div>
                <div style="font-size: 1.8rem; color: {signal_color}; font-weight: bold;">{signal_text}</div>
            </div>
            <div>
                <div style="color: #888888; font-size: 0.9rem; text-transform: uppercase; margin-bottom: 5px;">CONFIANCE (META MODEL)</div>
                <div style="font-size: 1.8rem; color: {conf_color}; font-weight: bold;">{confidence:.1%} - {conf_text}</div>
            </div>
        </div>
        """
        st.markdown(html_result, unsafe_allow_html=True)
        
        st.markdown("### ACTIONABLE TRADING GUIDANCE")
        if confidence >= 0.60:
            st.markdown(f"> **SIGNAL VALIDE** : Le modèle de confiance autorise l'exécution du signal **{signal_text}** sur l'indice S&P 500.")
        else:
            st.markdown(f"> **SIGNAL REJETE** : Le niveau de certitude est insuffisant ({confidence:.1%} < 60%). Maintien de la position neutre ou couverture recommandée.")
            
        st.markdown("---")
        st.subheader("HISTORICAL PREDICTIONS OVERVIEW (LAST 60 DAYS)")
        
        # Création du DataFrame de résultats
        df_results = pd.DataFrame(index=recent_features.index)
        df_results['Close'] = recent_close
        df_results['Signal'] = preds
        df_results['Direction'] = df_results['Signal'].apply(lambda x: 'LONG' if x == 1.0 else ('SHORT' if x == -1.0 else 'NEUTRAL'))
        df_results['Confidence'] = confidences
        
        # Affichage du graphique interactif
        fig = make_subplots(specs=[[{"secondary_y": True}]])
        
        # Confiance du modèle (Area chart pour plus de lisibilité)
        fig.add_trace(go.Scatter(
            x=df_results.index, y=df_results['Confidence'], 
            name='Meta-Model Confidence', mode='lines',
            line=dict(color='#4B5563', width=1),
            fill='tozeroy', fillcolor='rgba(75, 85, 99, 0.2)'
        ), secondary_y=True)
        
        # Ligne de seuil de confiance d'exécution (60%)
        fig.add_hline(y=0.60, line_dash="dash", line_color="#888888", line_width=1, yref="y2", annotation_text="ACTION THRESHOLD (60%)", annotation_font_color="#888888", annotation_position="top left")
        
        # Prix de l'actif
        fig.add_trace(go.Scatter(x=df_results.index, y=df_results['Close'], name='S&P 500', mode='lines', line=dict(color='#FFFFFF', width=2)), secondary_y=False)
        
        # Marqueurs pour les signaux
        long_signals = df_results[df_results['Signal'] == 1.0]
        short_signals = df_results[df_results['Signal'] == -1.0]
        
        fig.add_trace(go.Scatter(
            x=long_signals.index, y=long_signals['Close'], 
            mode='markers', marker=dict(color='#3B82F6', size=12, symbol='triangle-up', line=dict(color='#FFFFFF', width=1)), 
            name='LONG Signal'
        ), secondary_y=False)
        
        fig.add_trace(go.Scatter(
            x=short_signals.index, y=short_signals['Close'], 
            mode='markers', marker=dict(color='#F5A623', size=12, symbol='triangle-down', line=dict(color='#FFFFFF', width=1)), 
            name='SHORT Signal'
        ), secondary_y=False)
        
        fig.update_layout(
            template="plotly_dark",
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            margin=dict(l=0, r=0, t=30, b=0),
            height=400,
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
        )
        fig.update_xaxes(showgrid=False)
        fig.update_yaxes(title_text="Index Price", secondary_y=False, showgrid=True, gridcolor='#333333')
        fig.update_yaxes(title_text="Confidence Score", secondary_y=True, range=[0, 1.05], tickformat=".0%", showgrid=False)
        
        st.plotly_chart(fig, width="stretch")
        
        # Tableau détaillé
        with st.expander("VOIR LA MATRICE DES PREDICTIONS DETAILLEE"):
            display_df = df_results.copy().reset_index()
            display_df.rename(columns={'index': 'Date', 'Close': 'S&P 500 Close'}, inplace=True)
            display_df['Date'] = display_df['Date'].dt.strftime('%Y-%m-%d')
            display_df = display_df.sort_values(by='Date', ascending=False)
            
            st.dataframe(
                display_df[['Date', 'S&P 500 Close', 'Signal', 'Direction', 'Confidence']],
                hide_index=True,
                column_config={
                    "Confidence": st.column_config.ProgressColumn(
                        "Confidence Score",
                        help="Probabilité de succès estimée par le méta-modèle",
                        format="%.1f %%",
                        min_value=0,
                        max_value=1,
                    ),
                    "S&P 500 Close": st.column_config.NumberColumn("S&P 500 Close", format="$ %.2f")
                },
                width="stretch"
            )
            
        st.markdown("---")
        st.subheader("MODEL INTERPRETABILITY (SHAPLEY ADDITIVE EXPLANATIONS)")

        @st.cache_data(ttl=3600, show_spinner=False)
        def compute_shap_values(_clf_model, input_data):
            explainer = shap.TreeExplainer(_clf_model)
            return explainer(input_data)

        with st.spinner("CALCUL DES VALEURS DE SHAPLEY EN COURS..."):
            try:
                # 1. EXTRACTION DU DERNIER VECTEUR DE CARACTERISTIQUES
                X_latest = X_inference.iloc[[-1]]
                
                # 2. ISOLATION DE L'ESTIMATEUR ET PRE-TRAITEMENT DES FEATURES
                clf_step = primary_model.named_steps['clf']
                if len(primary_model.steps) > 1:
                    X_processed = primary_model[:-1].transform(X_latest)
                    
                    # VERIFICATION DE L'ALIGNEMENT DES DIMENSIONS (EX: SI PCA EST ACTIF)
                    if X_processed.shape[1] == len(X_latest.columns):
                        X_processed_df = pd.DataFrame(X_processed, columns=X_latest.columns)
                    else:
                        try:
                            X_processed_df = pd.DataFrame(X_processed, columns=primary_model[:-1].get_feature_names_out())
                        except Exception:
                            X_processed_df = pd.DataFrame(X_processed, columns=[f"Component_{i}" for i in range(X_processed.shape[1])])
                else:
                    X_processed_df = X_latest
                
                # 3. CALCUL MATRICIEL SHAP
                    shap_values = compute_shap_values(clf_step, X_processed_df)
                
                # EXTRACTION DE LA CLASSE POSITIVE POUR LES MODELES BINAIRES
                shap_obj = shap_values[0, :, 1] if len(shap_values.shape) == 3 else shap_values[0]
                
                # 4. RENDU GRAPHIQUE INSTITUTIONNEL (DARK MODE)
                plt.style.use('dark_background')
                fig_shap, ax = plt.subplots(figsize=(8, 4))
                fig_shap.patch.set_facecolor('#111111')
                ax.set_facecolor('#111111')
                
                shap.plots.waterfall(shap_obj, max_display=10, show=False)
                plt.tick_params(colors='white')
                plt.tight_layout()
                st.pyplot(fig_shap)
                plt.clf()
                
                st.markdown("> ANALYSE : LE GRAPHIQUE DECOMPOSE LA DECISION DU MODELE PRIMAIRE. LES VALEURS POSITIVES POUSSENT VERS UN SIGNAL LONG (1), LES VALEURS NEGATIVES VERS UN SIGNAL SHORT (0).")
                
            except Exception as e:
                st.markdown(f"> **ERROR** - ECHEC DE L'EVALUATION SHAP : {e}")
                
    except Exception as e:
        st.markdown(f"> **ERROR** - Echec de la prédiction matricielle. Vérifiez l'alignement des colonnes. Détail : {e}")
else:
    st.markdown("> **WARNING** - Impossible de générer les caractéristiques en temps réel. Données de marché manquantes.")