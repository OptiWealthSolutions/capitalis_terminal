/**
 * CAPITALIS V2 - ECOSYSTÈME DE TRACKING ULTIME (v3.0)
 * Architecture : Une feuille par plateforme + Dashboard Global Mensuel
 * 
 * Instructions: Copiez ce code dans Apps Script, enregistrez et lancez 'setupUltimateTracker'.
 */

const THEME = {
  primary: "#1A73E8", // Blue
  tiktok: "#000000",
  insta: "#E1306C",
  youtube: "#FF0000",
  linkedin: "#0077B5",
  bg: "#F8F9FA",
  text: "#3C4043",
  border: "#DADCE0"
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📊 TRACKER CAPITALIS')
    .addItem('🚀 Initialiser l\'Écosystème', 'setupUltimateTracker')
    .addItem('🔄 Actualiser tout le Dashboard', 'refreshAll')
    .addToUi();
}

/**
 * Initialisation complète de l'architecture
 */
function setupUltimateTracker() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Ordre de création
  setupGlobalDashboard(ss);
  setupPlatformSheet(ss, "📱 TIKTOK", THEME.tiktok);
  setupPlatformSheet(ss, "📸 INSTAGRAM", THEME.insta);
  setupPlatformSheet(ss, "🎥 YOUTUBE", THEME.youtube);
  setupPlatformSheet(ss, "💼 LINKEDIN", THEME.linkedin);
  setupPlatformSheet(ss, "📝 ARTICLES_MACRO", THEME.primary);
  
  SpreadsheetApp.getUi().alert("Écosystème initialisé ! \n\n1. Remplissez vos données quotidiennes dans chaque onglet.\n2. Le Dashboard Global se mettra à jour automatiquement.");
}

/**
 * Configure une feuille spécifique pour une plateforme
 */
function setupPlatformSheet(ss, name, color) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  sheet.setTabColor(color);
  
  // En-têtes
  const headers = [["Date", "Mois", "Abonnés Totaux", "Vues", "Likes/Fav", "Partages", "Clics Bio", "Leads", "Note/Engagement"]];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers)
    .setBackground(color).setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  
  // Pré-remplissage pour Mai 2026 (Exemple)
  let startDate = new Date(2026, 4, 8); // 8 Mai 2026
  let rows = [];
  for (let i = 0; i < 30; i++) {
    let d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    let monthName = Utilities.formatDate(d, "GMT", "MMMM");
    rows.push([d, monthName, "", "", "", "", "", "", ""]);
  }
  sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  
  // Formatage
  sheet.setFrozenRows(1);
  sheet.getRange("A2:A100").setNumberFormat("dd/mm/yyyy");
  sheet.setColumnWidths(1, 9, 120);
}

/**
 * Configure le Dashboard Global
 */
function setupGlobalDashboard(ss) {
  let sheet = ss.getSheetByName("📊 DASHBOARD GLOBAL");
  if (!sheet) {
    sheet = ss.insertSheet("📊 DASHBOARD GLOBAL", 0);
  }
  sheet.clear();
  sheet.setTabColor(THEME.primary);
  sheet.getRange("A1:Z100").setBackground(THEME.bg);

  // Header
  sheet.getRange("B2:L3").merge().setBackground(THEME.primary).setFontColor("white")
    .setValue("CAPITALIS V2 - PERFORMANCE MENSUELLE CONSOLIDÉE")
    .setFontSize(22).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  // Tableau récapitulatif par mois
  const monthHeaders = [["Mois", "Abonnés (Total)", "Reach Global", "Engagement Moyen", "Total Leads", "Taux Conv. Lead"]];
  sheet.getRange(5, 2, 1, monthHeaders[0].length).setValues(monthHeaders)
    .setBackground("#ffffff").setFontWeight("bold").setBorder(true, true, true, true, true, true);

  // Lignes pour les mois
  const months = [["Mai 2026"], ["Juin 2026"], ["Juillet 2026"]];
  sheet.getRange(6, 2, 3, 1).setValues(months).setFontWeight("bold");

  // Section Graphiques (Emplacements réservés)
  sheet.getRange("B12").setValue("📉 ÉVOLUTION DE L'AUDIENCE").setFontWeight("bold").setFontSize(14);
  sheet.getRange("H12").setValue("🎯 CONVERSION & LEADS").setFontWeight("bold").setFontSize(14);
}

/**
 * Actualise les données consolidées et les graphiques
 */
function refreshAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName("📊 DASHBOARD GLOBAL");
  const platforms = ["📱 TIKTOK", "📸 INSTAGRAM", "🎥 YOUTUBE", "💼 LINKEDIN"];
  
  // Logique de consolidation (Simplifiée pour l'exemple)
  // En production, ce script bouclerait sur chaque ligne de chaque feuille
  // Ici, nous allons préparer les formules directes pour le dashboard
  
  for (let i = 0; i < 1; i++) { // Pour Mai 2026 (ligne 6)
    let row = 6 + i;
    
    // Formule pour sommer les abonnés (dernière valeur connue de chaque feuille)
    // Note: Utilise une approche simplifiée, idéalement on cherche le MAX ou la dernière ligne
    let subSum = platforms.map(p => `IFERROR(MAX('${p}'!C:C); 0)`).join("+");
    dash.getRange(row, 3).setFormula(`=${subSum}`);
    
    // Reach Global (Somme des vues)
    let reachSum = platforms.map(p => `SUMIF('${p}'!B:B; B${row}; '${p}'!D:D)`).join("+");
    dash.getRange(row, 4).setFormula(`=${reachSum}`);
    
    // Total Leads
    let leadSum = platforms.map(p => `SUMIF('${p}'!B:B; B${row}; '${p}'!H:H)`).join("+");
    dash.getRange(row, 5).setFormula(`=${leadSum}`);
    
    // Taux de conversion
    dash.getRange(row, 6).setFormula(`=IF(D${row}>0; E${row}/D${row}; 0)`).setNumberFormat("0.00%");
  }
  
  updateGlobalCharts(ss, dash);
  SpreadsheetApp.getUi().showAnnotation("Dashboard consolidé mis à jour !");
}

function updateGlobalCharts(ss, dash) {
  const charts = dash.getCharts();
  charts.forEach(c => dash.removeChart(c));

  // Graphique 1 : Croissance Audience
  const audienceChart = dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange("B5:C8"))
    .setPosition(13, 2, 0, 0)
    .setOption('title', 'Abonnés par Mois')
    .setOption('colors', [THEME.primary])
    .build();
    
  // Graphique 2 : Leads
  const leadsChart = dash.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(dash.getRange("B5:B8"))
    .addRange(dash.getRange("E5:E8"))
    .setPosition(13, 8, 0, 0)
    .setOption('title', 'Génération de Leads')
    .setOption('colors', [THEME.insta])
    .build();

  dash.insertChart(audienceChart);
  dash.insertChart(leadsChart);
}
