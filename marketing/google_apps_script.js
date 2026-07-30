/**
 * Google Apps Script pour le Dashboard CAPITALIS V2
 * Instructions: Copiez ce code dans Extensions > Apps Script de votre Google Sheet, enregistrez et lancez 'setupDashboard'.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 CAPITALIS MARKETING')
    .addItem('Initialiser le Dashboard', 'setupDashboard')
    .addItem('Calculer les Progrès', 'calculateProgress')
    .addToUi();
}

function setupDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Création de l'onglet "TRACKING QUOTIDIEN"
  let sheetTracking = ss.getSheetByName("TRACKING QUOTIDIEN");
  if (!sheetTracking) {
    sheetTracking = ss.insertSheet("TRACKING QUOTIDIEN");
  }
  sheetTracking.clear();
  const headersTracking = [["Date", "Plateforme", "Abonnés Cumulés", "Vues Totales (cumul)", "Clics Lien Bio", "Inscriptions (Leads)", "Notes"]];
  sheetTracking.getRange(1, 1, 1, headersTracking[0].length).setValues(headersTracking)
    .setBackground("#1155cc").setFontColor("white").setFontWeight("bold");
  sheetTracking.setFrozenRows(1);
  
  // 2. Création de l'onglet "TABLEAU DE BORD"
  let sheetDash = ss.getSheetByName("TABLEAU DE BORD");
  if (!sheetDash) {
    sheetDash = ss.insertSheet("TABLEAU DE BORD");
  }
  sheetDash.clear();
  
  // Style Global
  sheetDash.getRange("A1:Z100").setBackground("#ffffff");
  
  // Header
  sheetDash.getRange("B2:H2").merge().setValue("🚀 DASHBOARD DE CAMPAGNE - CAPITALIS V2")
    .setFontSize(18).setFontWeight("bold").setFontColor("#1155cc").setHorizontalAlignment("center");
  
  // Section Objectifs
  sheetDash.getRange("B4").setValue("📊 OBJECTIFS DE LA CAMPAGNE").setFontWeight("bold");
  const targetHeaders = [["Réseau", "Situation Initiale", "Objectif J+14", "Actuel", "Progression %", "Statut"]];
  sheetDash.getRange(5, 2, 1, targetHeaders[0].length).setValues(targetHeaders)
    .setBackground("#eeeeee").setFontWeight("bold");
  
  const targetData = [
    ["TikTok", 2300, 3500, "", "", ""],
    ["Instagram", 50, 250, "", "", ""],
    ["YouTube", 80, 250, "", "", ""],
    ["Leads Beta", 0, 100, "", "", ""]
  ];
  sheetDash.getRange(6, 2, 4, targetData[0].length).setValues(targetData);
  
  // Formules pour les objectifs
  for (let i = 0; i < 4; i++) {
    let row = 6 + i;
    // On va chercher la dernière valeur entrée pour chaque plateforme dans l'onglet Tracking
    // Note: Ces formules sont complexes à automatiser via script sans cellule de support, on utilisera calculateProgress pour remplir l'actuel
    sheetDash.getRange(row, 6).setFormula(`=IF(F${row}>=100%; "✅ TERMINÉ"; "⏳ EN COURS")`);
  }

  // Section KPIs Globaux
  sheetDash.getRange("B12").setValue("📈 INDICATEURS DE PERFORMANCE (KPIs)").setFontWeight("bold");
  const kpiHeaders = [["Métrique", "Valeur Totale", "Objectif", "Taux de Conversion"]];
  sheetDash.getRange(13, 2, 1, kpiHeaders[0].length).setValues(kpiHeaders).setBackground("#eeeeee").setFontWeight("bold");
  
  sheetDash.getRange(14, 2, 3, 1).setValues([["Total Vues"], ["Total Clics Bio"], ["Inscriptions Beta"]]);
  sheetDash.getRange("E14").setValue("Conversion Clics/Vues");
  sheetDash.getRange("E15").setFormula("=D16/C15"); // Leads / Clics
  sheetDash.getRange("F14").setValue("Taux d'acquisition");
  sheetDash.getRange("F15").setFormula("=D16/C14"); // Leads / Vues

  // Mise en forme
  sheetDash.getRange("B4:H20").setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
  sheetDash.setColumnWidth(1, 30);
  sheetDash.setColumnWidth(2, 150);
  
  SpreadsheetApp.getUi().alert("Dashboard initialisé ! Remplissez l'onglet 'TRACKING QUOTIDIEN' et cliquez sur 'Calculer les Progrès' dans le menu.");
}

function calculateProgress() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetTracking = ss.getSheetByName("TRACKING QUOTIDIEN");
  const sheetDash = ss.getSheetByName("TABLEAU DE BORD");
  
  const data = sheetTracking.getDataRange().getValues();
  const platforms = ["TikTok", "Instagram", "YouTube", "Leads Beta"];
  
  platforms.forEach((p, idx) => {
    let lastValue = 0;
    let totalVues = 0;
    let totalClics = 0;
    let totalLeads = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === p) {
        lastValue = data[i][2]; // Abonnés
      }
      // Calcul des totaux globaux (toutes plateformes confondues pour les vues/clics)
      if (idx === 0) { // On ne le fait qu'une fois
        totalVues += Number(data[i][3] || 0);
        totalClics += Number(data[i][4] || 0);
        totalLeads += Number(data[i][5] || 0);
      }
    }
    
    // Mise à jour de la ligne correspondante dans le Dashboard
    if (p !== "Leads Beta") {
      sheetDash.getRange(6 + idx, 5).setValue(lastValue); // Actuel Abonnés
      let start = sheetDash.getRange(6 + idx, 3).getValue();
      let target = sheetDash.getRange(6 + idx, 4).getValue();
      let progress = (lastValue - start) / (target - start);
      sheetDash.getRange(6 + idx, 6).setValue(progress).setNumberFormat("0%");
    } else {
      sheetDash.getRange(9, 5).setValue(totalLeads);
      let target = sheetDash.getRange(9, 4).getValue();
      sheetDash.getRange(9, 6).setValue(totalLeads / target).setNumberFormat("0%");
    }
    
    // Totaux KPIs
    sheetDash.getRange(14, 3).setValue(totalVues);
    sheetDash.getRange(15, 3).setValue(totalClics);
    sheetDash.getRange(16, 3).setValue(totalLeads);
  });
  
  SpreadsheetApp.getUi().alert("Statistiques mises à jour !");
}
