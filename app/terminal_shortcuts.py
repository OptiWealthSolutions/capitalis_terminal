import streamlit as st
import streamlit.components.v1 as components


def setup_bloomberg_shortcuts():
    """
    Initialise le système de raccourcis clavier global (Style Terminal).
    
    NOTE D'INTÉGRATION :
    Cette fonction doit impérativement être appelée au tout début de 
    chaque fichier de page (ex: pages/01_Main_View.py, pages/02_Screener.py), 
    immédiatement après 'st.set_page_config()'. Cela garantit que l'écouteur
    d'événements est persistant lors de la navigation inter-pages.
    """
    components.html(
        """
        <script>
        const doc = window.parent.document;
        
        if (!window.parent.hasBloombergShortcuts) {
            doc.addEventListener('keydown', function(e) {
                if (e.target && (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea')) {
                    return;
                }

                const navLinks = doc.querySelectorAll('a[data-testid="stSidebarNavLink"]');
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
            });
            window.parent.hasBloombergShortcuts = true;
        }
        </script>
        """,
        height=0,
        width=0
    )