import streamlit as st
import requests

@st.cache_data(ttl=3600)
def fetch_macro_news(api_key: str, limit: int = 15) -> list:
    """
    Récupère les actualités macro-économiques via l'API Alpha Vantage.
    Mise en cache pendant 1 heure pour préserver le quota d'API.
    """
    url = f"https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=economy_macro&sort=LATEST&apikey={api_key}"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Vérification des limites d'API Alpha Vantage
        if "Information" in data:
            st.warning(f"Limite d'API Alpha Vantage atteinte : {data['Information']}")
            return []
            
        if "feed" in data:
            return data["feed"][:limit]
        return []
        
    except requests.exceptions.RequestException as e:
        st.error(f"Erreur de connexion à l'API Alpha Vantage : {e}")
        return []