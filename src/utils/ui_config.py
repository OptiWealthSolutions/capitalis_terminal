import streamlit as st
import streamlit.components.v1 as components


def set_terminal_margins():
    """
    Configure les marges, restaure le header en mode transparent,
    et applique un style de 'Cartes' institutionnelles.
    """
    st.markdown(
        """
        <style>
        /* 1. FORCE L'AFFICHAGE DU HEADER EN TRANSPARENT */
        header[data-testid="stHeader"] {
            background-color: transparent !important;
            display: block !important; 
        }
        .stApp > header {
            background-color: transparent !important;
            display: block !important;
        }
        
        /* Contraste forcé pour les icônes du header (Menu hamburger, Deploy) */
        header[data-testid="stHeader"] * {
            color: #D1D4DC !important; 
        }

        /* 2. AJUSTEMENT DES MARGES (Pour ne pas passer sous le header) */
        .block-container {
            padding-top: 3.5rem !important;
            padding-bottom: 1rem !important;
            padding-left: 1.5rem !important;
            padding-right: 1.5rem !important;
            max-width: 100% !important;
        }

        /* 3. STYLE TERMINAL SIDEBAR */
        [data-testid="stSidebar"] {
            background-color: #0b0e14 !important;
            border-right: 1px solid #1E232F !important;
        }
        
        /* Style des liens de navigation de la sidebar */
        [data-testid="stSidebarNavLink"] {
            border-radius: 4px;
            transition: all 0.2s ease;
            padding-left: 10px !important;
        }
        /* Effet au survol */
        [data-testid="stSidebarNavLink"]:hover {
            background-color: #1E232F !important;
        }
        /* Style de la page active (Ligne bleue institutionnelle sur le côté) */
        [data-testid="stSidebarNavLink"][aria-current="page"] {
            background-color: #151A22 !important;
            border-left: 3px solid #3B82F6 !important;
        }

        /* 4.b. AGRANDISSEMENT POLICE SIDEBAR */
        [data-testid="stSidebarNavLink"] span {
            font-size: 1.15rem !important;
            font-weight: 500 !important;
            letter-spacing: 0.5px;
        }

        /* 4. EFFET CARTES/DASHBOARD INSTITUTIONNEL */
        div[data-testid="stMetric"], 
        div[data-testid="stDataFrame"], 
        div[data-testid="stPlotlyChart"], 
        div[data-testid="stVegaLiteChart"],
        div[data-testid="stExpander"] {
            background-color: #151A22;
            border: 1px solid #1E232F;
            border-radius: 6px;
            padding: 10px;
        }

        /* Suppression des bordures par défaut des tableaux pour les fondre dans la carte */
        [data-testid="stDataFrame"] {
            border: none;
            padding: 0px;
        }

        /* 5. OVERRIDE DES ALERTES ET INFO BOXES (st.info, st.success, st.warning, st.error) */
        div[data-testid="stAlert"] {
            background-color: #151A22 !important; /* Force le même fond que les cartes */
            border: 1px solid #1E232F !important; /* Bordure institutionnelle */
            color: #D1D4DC !important;
            border-radius: 6px !important;
        }
        
        /* Ajustement du texte à l'intérieur des alertes */
        div[data-testid="stAlert"] .markdown-text-container {
            color: #D1D4DC !important;
            font-weight: 500;
        }

        /* 6. CORRECTION DES METRICS (Chiffres globaux) */
        [data-testid="stMetricValue"] {
            color: #FFFFFF !important; /* Rend les chiffres principaux plus brillants */
        }
        </style>
        """,
        unsafe_allow_html=True
    )


def setup_bloomberg_shortcuts():
    """
    Initialise le systeme de raccourcis clavier global (Style Terminal).
    Hooking direct de la Sidebar Streamlit native pour eviter les problemes
    de sandboxing et de fuite CSS.
    Écouteur "Double Face" (Parent + Iframe) pour contrer le Focus Trap.
    """
    js_code = """
    <script>
    const parentDoc = window.parent.document;
    const localDoc = document;

    // Fonction centrale de traitement des frappes
    function handleKeydown(e) {
        // Ignorer si l'utilisateur est dans un champ de texte
        if (e.target && (e.target.tagName.toUpperCase() === 'INPUT' || e.target.tagName.toUpperCase() === 'TEXTAREA')) {
            return;
        }

        // Cibler les liens de la Sidebar native de Streamlit
        const navLinks = parentDoc.querySelectorAll('a[data-testid="stSidebarNavLink"]');
        if (!navLinks || navLinks.length === 0) return;

        if (e.key === '0' && navLinks.length > 0) navLinks[0].click();
        if (e.key === '1' && navLinks.length > 1) navLinks[1].click();
        if (e.key === '2' && navLinks.length > 2) navLinks[2].click();
        if (e.key === '3' && navLinks.length > 3) navLinks[3].click();
        if (e.key === '4' && navLinks.length > 4) navLinks[4].click();
        if (e.key === '5' && navLinks.length > 5) navLinks[5].click();
        if (e.key === '6' && navLinks.length > 6) navLinks[6].click();
        if (e.key === '7' && navLinks.length > 7) navLinks[7].click();
        if (e.key === '8' && navLinks.length > 8) navLinks[8].click();
    }

    // Sécurité anti-boucle : s'assurer qu'on ne l'attache qu'une seule fois
    if (!window.parent.hasBloombergShortcutsActive) {
        parentDoc.addEventListener('keydown', handleKeydown);
        localDoc.addEventListener('keydown', handleKeydown);
        window.parent.hasBloombergShortcutsActive = true;
    }
    </script>
    """
    components.html(js_code, height=0, width=0)