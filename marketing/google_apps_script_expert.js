/**
 * DASHBOARD EXPERT CAPITALIS V2 - SYSTEME DE PILOTAGE STRATÉGIQUE
 * Version: 2.0 (Expert Marketing & Lead Gen)
 * 
 * Ce script transforme votre Google Sheet en un centre de commandement.
 * Fonctionnalités : Sidebar de contrôle, Graphiques auto, Calcul de ROI, Santé de Campagne.
 */

const COLORS = {
  primary: "#1A73E8",
  secondary: "#5F6368",
  success: "#188038",
  warning: "#F9AB00",
  danger: "#D93025",
  bg: "#F8F9FA",
  white: "#FFFFFF"
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🚀 CAPITALIS EXPERT')
    .addItem('🔧 Initialisation Complète', 'setupExpertDashboard')
    .addItem('📊 Actualiser les Data & Graphiques', 'refreshDashboard')
    .addSeparator()
    .addItem('📱 Ouvrir le Panneau de Contrôle', 'showSidebar')
    .addToUi();
}

/**
 * Initialisation du Dashboard avec structure Expert
 */
function setupExpertDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Feuille de Données Brutes (INPUT)
  let sheetInput = ss.getSheetByName("📥 DATA_ENTREE");
  if (!sheetInput) sheetInput = ss.insertSheet("📥 DATA_ENTREE");
  sheetInput.clear();
  const headersInput = [["Date", "Plateforme", "Abonnés", "Vues", "Clics Bio", "Leads (Inscriptions)", "Dépenses Ads ($)", "Notes"]];
  sheetInput.getRange(1, 1, 1, headersInput[0].length).setValues(headersInput)
    .setBackground(COLORS.primary).setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  sheetInput.setFrozenRows(1);
  
  // 2. Feuille de Pilotage (VISUAL)
  let sheetDash = ss.getSheetByName("📊 DASHBOARD_PILOTAGE");
  if (!sheetDash) sheetDash = ss.insertSheet("📊 DASHBOARD_PILOTAGE");
  sheetDash.clear();
  sheetDash.getRange("A1:Z100").setBackground(COLORS.bg);
  
  // Design du Header
  sheetDash.getRange("B2:I3").merge().setBackground(COLORS.primary).setFontColor("white")
    .setValue("CAPITALIS V2 : CENTRE DE PILOTAGE MARKETING")
    .setFontSize(20).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  // Section 1: RESUMÉ DES OBJECTIFS (Scorecards)
  createScorecard(sheetDash, "B5", "ABONNÉS TIKTOK", "3500", "B6");
  createScorecard(sheetDash, "D5", "ABONNÉS INSTA", "250", "D6");
  createScorecard(sheetDash, "F5", "ABONNÉS YOUTUBE", "250", "F6");
  createScorecard(sheetDash, "H5", "LEADS BETA", "100", "H6");
  
  // Section 2: ANALYSE DE CONVERSION (Funnel)
  sheetDash.getRange("B9:I9").merge().setValue("🏆 TUNNEL DE CONVERSION (FUNNEL)")
    .setFontWeight("bold").setFontColor(COLORS.secondary).setBackground("#e8f0fe");
  
  const funnelHeaders = [["Total Vues", "Total Clics Bio", "Taux de Clic (CTR)", "Total Leads", "Taux Conv. Lead", "Cout par Lead (CPL)"]];
  sheetDash.getRange(10, 2, 1, funnelHeaders[0].length).setValues(funnelHeaders).setFontWeight("bold").setHorizontalAlignment("center");
  
  // Section 3: ETAT DE SANTÉ DE LA CAMPAGNE
  sheetDash.getRange("B14").setValue("🩺 SANTÉ DE LA CAMPAGNE").setFontWeight("bold");
  sheetDash.getRange("B15:C18").setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
  sheetDash.getRange("B15").setValue("Rythme de publication");
  sheetDash.getRange("B16").setValue("Engagement Moyen");
  sheetDash.getRange("B17").setValue("ROI Estimé");
  sheetDash.getRange("B18").setValue("Statut Global");

  SpreadsheetApp.getUi().alert("Dashboard Expert initialisé ! Commencez à saisir vos données dans '📥 DATA_ENTREE'.");
}

function createScorecard(sheet, range, title, target, valRange) {
  sheet.getRange(range).setValue(title).setFontSize(9).setFontColor(COLORS.secondary).setHorizontalAlignment("center");
  sheet.getRange(valRange).setValue(0).setFontSize(16).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange(sheet.getRange(valRange).getRow() + 1, sheet.getRange(valRange).getColumn()).setValue("Cible: " + target)
    .setFontSize(8).setFontColor("#888888").setHorizontalAlignment("center");
}

/**
 * Fonction de rafraîchissement des données et calculs
 */
function refreshDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const input = ss.getSheetByName("📥 DATA_ENTREE");
  const dash = ss.getSheetByName("📊 DASHBOARD_PILOTAGE");
  const data = input.getDataRange().getValues();
  
  if (data.length <= 1) return;

  let stats = {
    tiktok: 0, insta: 0, youtube: 0, 
    views: 0, clics: 0, leads: 0, spend: 0
  };

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const plat = row[1].toString().toLowerCase();
    if (plat.includes("tiktok")) stats.tiktok = row[2];
    if (plat.includes("insta")) stats.insta = row[2];
    if (plat.includes("youtube")) stats.youtube = row[2];
    
    stats.views += Number(row[3] || 0);
    stats.clics += Number(row[4] || 0);
    stats.leads += Number(row[5] || 0);
    stats.spend += Number(row[6] || 0);
  }

  // Update Scorecards
  dash.getRange("B6").setValue(stats.tiktok);
  dash.getRange("D6").setValue(stats.insta);
  dash.getRange("F6").setValue(stats.youtube);
  dash.getRange("H6").setValue(stats.leads);

  // Update Funnel
  dash.getRange("B11").setValue(stats.views);
  dash.getRange("C11").setValue(stats.clics);
  dash.getRange("D11").setValue(stats.views > 0 ? stats.clics / stats.views : 0).setNumberFormat("0.00%");
  dash.getRange("E11").setValue(stats.leads);
  dash.getRange("F11").setValue(stats.clics > 0 ? stats.leads / stats.clics : 0).setNumberFormat("0.00%");
  dash.getRange("G11").setValue(stats.leads > 0 ? stats.spend / stats.leads : 0).setNumberFormat("0.00$");

  // Health Check Logic
  const healthRange = dash.getRange("C18");
  if (stats.leads >= 50) {
    healthRange.setValue("🔥 EXCELLENT").setFontColor(COLORS.success);
  } else if (stats.leads >= 20) {
    healthRange.setValue("⚖️ STABLE").setFontColor(COLORS.warning);
  } else {
    healthRange.setValue("⚠️ ATTENTION").setFontColor(COLORS.danger);
  }

  updateCharts(dash, input);
  SpreadsheetApp.getUi().showAnnotation("Dashboard mis à jour avec succès !");
}

/**
 * Génération/Mise à jour des graphiques
 */
function updateCharts(sheet, inputSheet) {
  const charts = sheet.getCharts();
  charts.forEach(c => sheet.removeChart(c));

  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.AREA)
    .addRange(inputSheet.getRange("A1:A50"))
    .addRange(inputSheet.getRange("D1:D50"))
    .addRange(inputSheet.getRange("F1:F50"))
    .setPosition(20, 2, 0, 0)
    .setOption('title', 'Évolution Vues vs Leads')
    .setOption('colors', [COLORS.primary, COLORS.success])
    .setOption('width', 800)
    .setOption('height', 300)
    .build();
    
  sheet.insertChart(chart);
}

function showSidebar() {
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family: sans-serif; padding: 20px;">' +
    '<h2>Contrôle CAPITALIS</h2>' +
    '<p>Utilisez ce panneau pour piloter votre campagne.</p>' +
    '<button onclick="google.script.run.refreshDashboard()" style="width:100%; padding:10px; background:#1A73E8; color:white; border:none; border-radius:4px; cursor:pointer;">🔄 Actualiser les Stats</button>' +
    '<hr>' +
    '<h3>Checklist J-14</h3>' +
    '<ul><li>Post LinkedIn OK ?</li><li>Shorts découpés ?</li><li>Article Macro publié ?</li></ul>' +
    '</div>'
  ).setTitle('Pilotage Capitalis').setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}
