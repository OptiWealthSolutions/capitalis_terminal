#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# setup.sh
# -----------------------------------------------------------------------------
# Quick bootstrap script for the Algorithmic Asset Management project.
# It creates a Python virtual environment (named .venv) using Python 3.10,
# activates it, and installs all dependencies.
# -----------------------------------------------------------------------------
set -e  # Quitte immédiatement en cas d'erreur

# On définit explicitement la version cible
TARGET_PYTHON="python3.10"

# 1. Vérifier si python3.10 est installé sur le système
if ! command -v $TARGET_PYTHON &> /dev/null; then
    echo "Erreur : $TARGET_PYTHON n'est pas installé."
    echo "Veuillez l'installer (ex: 'brew install python@3.10' sur Mac ou 'sudo apt install python3.10' sur Ubuntu)."
    exit 1
fi

echo "Utilisation de $($TARGET_PYTHON --version) pour créer l'environnement..."

# 2. Supprimer l'ancien .venv s'il existe et qu'il n'est pas en 3.10
# (Optionnel mais recommandé pour éviter les conflits de versions 3.14 vs 3.10)
if [ -d ".venv" ]; then
    CURRENT_VENV_VERSION=$(.venv/bin/python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "unknown")
    if [ "$CURRENT_VENV_VERSION" != "3.10" ]; then
        echo "L'environnement existant est en version $CURRENT_VENV_VERSION. Recréation en 3.10..."
        rm -rf .venv
    fi
fi

# 3. Création de l'environnement virtuel avec Python 3.10
if [ ! -d ".venv" ]; then
    echo "Création du virtual environment (.venv) ..."
    $TARGET_PYTHON -m venv .venv
fi

# 4. Activation
# shellcheck disable=SC1091
source .venv/bin/activate

# 5. Mise à jour des outils de base
echo "Mise à jour de pip, setuptools et wheel ..."
pip install --upgrade pip setuptools wheel

# 6. Installation des dépendances
if [ -f "requirements.txt" ]; then
    echo "Installation des dépendances du projet ..."
    pip install -r requirements.txt
    echo "Installation des dépendances additionnelles critiques (tvscreener, shap) ..."
    pip install tvscreener shap
else
    echo "Attention : requirements.txt introuvable."
    pip install tvscreener shap
fi

echo "-------------------------------------------------------"
echo "Installation terminée avec succès en Python 3.10 !"
echo "Activez l'environnement avec : source .venv/bin/activate"
echo "-------------------------------------------------------"