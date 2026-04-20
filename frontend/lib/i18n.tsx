"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Locale = "en" | "fr";

const translations = {
  en: {
    nav: {
      dashboard:  "DASHBOARD",
      screener:   "SCREENER",
      scorer:     "SCORER",
      mlAlpha:    "AI SIGNALS",
      portfolio:  "ALLOCATION",
      tracker:    "PORTFOLIO TRACKER",
      equity:     "EQUITY REVIEW",
      reporting:  "REPORTING",
      docs:       "DOCS",
      settings:   "Settings",
      account:    "Account",
    },
    sections: {
      overview:  "Overview",
      research:  "Research",
      capital:   "Capital",
      deepDive:  "Deep dive",
    },
    sidebar: {
      search:  "Search",
      tagline: "INVEST SMARTER",
    },
    topbar: {
      investSmarter:       "INVEST SMARTER",
      live:                "LIVE",
      light:               "LIGHT",
      dark:                "DARK",
      last:                "Last",
      expReturn:           "Exp. Return",
      sharpe:              "Sharpe",
      buildFirstPortfolio: "Build your first portfolio to see quick stats here.",
    },
    user: {
      signOut: "Sign out",
      plan: {
        free:          "free",
        institutional: "institutional",
      },
    },
    auth: {
      login: {
        title:        "Sign In",
        subtitle:     "Institutional Quantitative Terminal",
        email:        "Email",
        password:     "Password",
        showPassword: "Show password",
        submit:       "Sign in",
        loading:      "Signing in…",
        noAccount:    "No account?",
        createOne:    "Create one",
      },
      register: {
        title:            "Create Account",
        subtitle:         "Institutional Quantitative Terminal",
        tagline:          "V2 TERMINAL",
        email:            "Email",
        password:         "Password",
        confirmPassword:  "Confirm Password",
        passwordHint:     "Min. 8 characters",
        submit:           "Create Account",
        loading:          "Creating account…",
        hasAccount:       "Already have an account?",
        signIn:           "Sign in",
        passwordMismatch: "Passwords do not match",
        passwordTooShort: "Password must be at least 8 characters",
      },
    },
    settings: {
      title:      "Settings",
      breadcrumb: "Capital / Preferences",
      tabs: {
        appearance: "Appearance",
        defaults:   "Defaults",
        simulation: "Simulation",
        data:       "Data",
        system:     "System",
      },
      appearance: {
        theme:       "Theme",
        dark:        "Dark",
        light:       "Light",
        accentColor: "Accent Color",
        uiDensity:   "UI Density",
      },
      defaults: {
        capital:    "Default Capital",
        currency:   "Currency",
        method:     "Optimization Method",
        benchmark:  "Default Benchmark",
        riskFree:   "Risk-Free Rate",
        decimals:   "Decimals",
      },
      simulation: {
        mcSimulations: "Monte Carlo Simulations",
      },
      data: {
        dataHorizon:   "Data Horizon",
        displayName:   "Display Name",
      },
      save:        "Save",
      reset:       "Reset to Defaults",
      delete:      "Delete Account",
      export:      "Export Data",
      saved:       "Preferences saved",
      saveFailed:  "Failed to save preferences",
      resetDone:   "Preferences reset to defaults",
    },
    dashboard: {
      title:           "Dashboard",
      breadcrumb:      "Capital / Overview",
      marketOverview:  "Market Overview",
      stressIndicator: "Market Stress",
      portfolios:      "Your Portfolios",
      noPortfolio:     "No portfolio yet",
      createFirst:     "Create your first portfolio in Allocation",
      events:          "Upcoming Events",
      noEvents:        "No upcoming events",
      regime:          "Regime",
      portfolioPerf:   "Portfolio Performance",
      annReturn:       "Ann. Return",
      sharpe:          "Sharpe",
      value:           "Value",
      change1d:        "1D",
      change5d:        "5D",
      refresh:         "Refresh",
      goToAllocation:  "Go to Allocation",
      trackerSection:  "Live Positions",
      noTracker:       "No tracker portfolios yet",
      goToTracker:     "Go to Tracker",
    },
    equity: {
      title:      "Equity Review",
      search:     "Search ticker…",
      tabs: {
        overview:   "Overview",
        financials: "Financials",
        charts:     "Charts",
        ownership:  "Ownership",
      },
      period: {
        annual:    "Annual",
        quarterly: "Quarterly",
      },
      metrics: {
        annReturn:   "Ann. Return",
        volatility:  "Volatility",
        sharpe:      "Sharpe",
        maxDrawdown: "Max Drawdown",
        cagr:        "CAGR",
      },
      sections: {
        valuation:     "Valuation",
        profitability: "Profitability",
        growth:        "Growth",
        health:        "Financial Health",
      },
    },
    screener: {
      title:      "Screener",
      pageTitle:  "Equity Screener",
      breadcrumb: "Capital / Fundamental",
      subtitle:   "Filter the full universe by fundamentals · save criteria as presets",
      search:     "Search stocks…",
      run:        "Run Screen",
      reset:      "Reset",
      noResults:  "No results",
      loading:    "Running screen…",
    },
    scorer: {
      title:      "Scorer",
      pageTitle:  "Equity Scorer",
      breadcrumb: "Research / Multi-Factor",
      subtitle:   "Composite Z-score ranking across quality, valuation and momentum factors",
      run:        "Run Scorer",
      loading:    "Scoring…",
    },
    predictions: {
      pageTitle:  "Predictive Alpha",
      breadcrumb: "Research / AI Signals",
      subtitle:   "ML inference engine · BUY / HOLD / SELL signals with confidence scores",
    },
    portfolio: {
      title:      "Allocation",
      pageTitle:  "Portfolio Allocation",
      breadcrumb: "Capital / Quantitative",
      optimize:   "Optimize",
      loading:    "Optimizing…",
      save:       "Save Portfolio",
      reset:      "Reset",
      tabs: {
        optimize:    "Optimization",
        montecarlo:  "Risk Sim",
        compare:     "Compare",
        performance: "Track",
      },
    },
    tracker: {
      title:      "Portfolio Tracker",
      subtitle:   "Real positions — entry price vs. live market value.",
      addPosition:"Add Position",
      noPositions:"No positions yet",
    },
    reporting: {
      title:      "Reporting",
      pageTitle:  "Institutional Reporting",
      breadcrumb: "Capital / Reporting",
      generate:   "Generate Report",
      download:   "Download PDF",
      loading:    "Generating…",
    },
    docs: {
      pageTitle:  "User Guide",
      breadcrumb: "Capital / Documentation",
      subtitle:   "Complete manual for CAPITALIS — start with \"Getting started\" if this is your first time.",
    },
    account: {
      title:      "Account",
      breadcrumb: "Capital / Account",
    },
    common: {
      loading:   "Loading…",
      error:     "Error",
      retry:     "Retry",
      cancel:    "Cancel",
      confirm:   "Confirm",
      close:     "Close",
      noData:    "No data available",
      annual:    "Annual",
      quarterly: "Quarterly",
      search:    "Search",
    },
  },

  fr: {
    nav: {
      dashboard:  "TABLEAU DE BORD",
      screener:   "SCREENER",
      scorer:     "SCORER",
      mlAlpha:    "SIGNAUX IA",
      portfolio:  "ALLOCATION",
      tracker:    "SUIVI PORTEFEUILLE",
      equity:     "ANALYSE ACTION",
      reporting:  "RAPPORTS",
      docs:       "DOCS",
      settings:   "Paramètres",
      account:    "Compte",
    },
    sections: {
      overview:  "Vue d'ensemble",
      research:  "Recherche",
      capital:   "Capital",
      deepDive:  "Analyse approfondie",
    },
    sidebar: {
      search:  "Rechercher",
      tagline: "INVESTIR MIEUX",
    },
    topbar: {
      investSmarter:       "INVESTIR MIEUX",
      live:                "EN DIRECT",
      light:               "CLAIR",
      dark:                "SOMBRE",
      last:                "Dernier",
      expReturn:           "Ret. Espéré",
      sharpe:              "Sharpe",
      buildFirstPortfolio: "Créez votre premier portefeuille pour voir les stats ici.",
    },
    user: {
      signOut: "Déconnexion",
      plan: {
        free:          "gratuit",
        institutional: "institutionnel",
      },
    },
    auth: {
      login: {
        title:        "Connexion",
        subtitle:     "Terminal Quantitatif Institutionnel",
        email:        "E-mail",
        password:     "Mot de passe",
        showPassword: "Afficher le mot de passe",
        submit:       "Se connecter",
        loading:      "Connexion…",
        noAccount:    "Pas de compte ?",
        createOne:    "Créer un",
      },
      register: {
        title:            "Créer un compte",
        subtitle:         "Terminal Quantitatif Institutionnel",
        tagline:          "V2 TERMINAL",
        email:            "E-mail",
        password:         "Mot de passe",
        confirmPassword:  "Confirmer le mot de passe",
        passwordHint:     "Min. 8 caractères",
        submit:           "Créer le compte",
        loading:          "Création du compte…",
        hasAccount:       "Vous avez déjà un compte ?",
        signIn:           "Se connecter",
        passwordMismatch: "Les mots de passe ne correspondent pas",
        passwordTooShort: "Le mot de passe doit comporter au moins 8 caractères",
      },
    },
    settings: {
      title:      "Paramètres",
      breadcrumb: "Capital / Préférences",
      tabs: {
        appearance: "Apparence",
        defaults:   "Valeurs par défaut",
        simulation: "Simulation",
        data:       "Données",
        system:     "Système",
      },
      appearance: {
        theme:       "Thème",
        dark:        "Sombre",
        light:       "Clair",
        accentColor: "Couleur d'accent",
        uiDensity:   "Densité de l'interface",
      },
      defaults: {
        capital:    "Capital par défaut",
        currency:   "Devise",
        method:     "Méthode d'optimisation",
        benchmark:  "Benchmark par défaut",
        riskFree:   "Taux sans risque",
        decimals:   "Décimales",
      },
      simulation: {
        mcSimulations: "Simulations Monte Carlo",
      },
      data: {
        dataHorizon:   "Horizon de données",
        displayName:   "Nom d'affichage",
      },
      save:        "Enregistrer",
      reset:       "Réinitialiser",
      delete:      "Supprimer le compte",
      export:      "Exporter les données",
      saved:       "Préférences enregistrées",
      saveFailed:  "Échec de l'enregistrement",
      resetDone:   "Préférences réinitialisées",
    },
    dashboard: {
      title:           "Tableau de bord",
      breadcrumb:      "Capital / Vue d'ensemble",
      marketOverview:  "Vue du marché",
      stressIndicator: "Stress de marché",
      portfolios:      "Vos portefeuilles",
      noPortfolio:     "Aucun portefeuille",
      createFirst:     "Créez votre premier portefeuille dans Allocation",
      events:          "Événements à venir",
      noEvents:        "Aucun événement à venir",
      regime:          "Régime",
      portfolioPerf:   "Performance portefeuille",
      annReturn:       "Ret. ann.",
      sharpe:          "Sharpe",
      value:           "Valeur",
      change1d:        "1J",
      change5d:        "5J",
      refresh:         "Actualiser",
      goToAllocation:  "Aller à Allocation",
      trackerSection:  "Positions en direct",
      noTracker:       "Aucun portefeuille suivi",
      goToTracker:     "Aller au suivi",
    },
    equity: {
      title:      "Analyse Action",
      search:     "Chercher un ticker…",
      tabs: {
        overview:   "Vue d'ensemble",
        financials: "Financiers",
        charts:     "Graphiques",
        ownership:  "Actionnariat",
      },
      period: {
        annual:    "Annuel",
        quarterly: "Trimestriel",
      },
      metrics: {
        annReturn:   "Ret. ann.",
        volatility:  "Volatilité",
        sharpe:      "Sharpe",
        maxDrawdown: "Drawdown max",
        cagr:        "CAGR",
      },
      sections: {
        valuation:     "Valorisation",
        profitability: "Rentabilité",
        growth:        "Croissance",
        health:        "Santé financière",
      },
    },
    screener: {
      title:      "Screener",
      pageTitle:  "Screener Actions",
      breadcrumb: "Capital / Fondamentaux",
      subtitle:   "Filtrez l'univers complet par fondamentaux · sauvegardez des critères comme préréglages",
      search:     "Rechercher des actions…",
      run:        "Lancer le filtre",
      reset:      "Réinitialiser",
      noResults:  "Aucun résultat",
      loading:    "Filtrage en cours…",
    },
    scorer: {
      title:      "Scorer",
      pageTitle:  "Scorer Actions",
      breadcrumb: "Recherche / Multi-Facteurs",
      subtitle:   "Classement par score Z composite : qualité, valorisation et momentum",
      run:        "Lancer le scorer",
      loading:    "Scoring…",
    },
    predictions: {
      pageTitle:  "Alpha Prédictif",
      breadcrumb: "Recherche / Signaux IA",
      subtitle:   "Moteur d'inférence ML · signaux ACHAT / CONSERVER / VENDRE avec scores de confiance",
    },
    portfolio: {
      title:      "Allocation",
      pageTitle:  "Allocation de Portefeuille",
      breadcrumb: "Capital / Quantitatif",
      optimize:   "Optimiser",
      loading:    "Optimisation…",
      save:       "Enregistrer",
      reset:      "Réinitialiser",
      tabs: {
        optimize:    "Optimisation",
        montecarlo:  "Sim. Risque",
        compare:     "Comparaison",
        performance: "Suivi",
      },
    },
    tracker: {
      title:       "Suivi de portefeuille",
      subtitle:    "Positions réelles — prix d'entrée vs valeur marché en direct.",
      addPosition: "Ajouter une position",
      noPositions: "Aucune position",
    },
    reporting: {
      title:      "Rapports",
      pageTitle:  "Rapports Institutionnels",
      breadcrumb: "Capital / Rapports",
      generate:   "Générer un rapport",
      download:   "Télécharger PDF",
      loading:    "Génération…",
    },
    docs: {
      pageTitle:  "Guide Utilisateur",
      breadcrumb: "Capital / Documentation",
      subtitle:   "Manuel complet de CAPITALIS — commencez par « Démarrage rapide » si c'est votre première visite.",
    },
    account: {
      title:      "Compte",
      breadcrumb: "Capital / Compte",
    },
    common: {
      loading:   "Chargement…",
      error:     "Erreur",
      retry:     "Réessayer",
      cancel:    "Annuler",
      confirm:   "Confirmer",
      close:     "Fermer",
      noData:    "Données indisponibles",
      annual:    "Annuel",
      quarterly: "Trimestriel",
      search:    "Rechercher",
    },
  },
} as const;

export type Translations = typeof translations.en;

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "capitalis_locale";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "en" || stored === "fr") setLocaleState(stored);
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translations[locale] as unknown as Translations }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside LanguageProvider");
  return ctx;
}
