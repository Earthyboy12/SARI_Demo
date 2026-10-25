/**
 * Main Application Controller for SARI ICD-10 Surveillance Dashboard
 */

import { TRANSLATIONS } from "./i18n/translations.js";
import { MODEL_METADATA, SARI_MODELS, ICD_CATEGORIES } from "./models/sariCoefficients.js";
import { normalizeICD10, classifyICD10, OUTSIDE_MODEL_SCOPE } from "./models/icdClassifier.js";
import { deriveSeason, getWeekInfo, getMonthInfo, formatDateISO } from "./utils/dateUtils.js";
import { deriveAgeGroup, selectAgeModel, normalizeSex, calculateSARIForRow, processSurveillanceDataset, AGE_GROUPS } from "./models/sariCalculator.js";
import { aggregateSurveillance } from "./utils/dataAggregator.js";
import { calculateSARIForecast } from "./utils/forecastEngine.js";
import { generateSyntheticSurveillanceData } from "./utils/demoDataGenerator.js";
import {
  downloadCSVTemplate,
  downloadExcelTemplate,
  downloadProcessedDataCSV,
  downloadAggregatedExcel,
  downloadCanvasAsPNG,
  exportSurveillanceReportDocx
} from "./utils/exportUtils.js";

export const AVAILABLE_THEMES = {
  emerald: {
    id: "emerald",
    name: "Emerald DDC",
    nameTh: "Emerald DDC (กรมควบคุมโรค)",
    dotColor: "#34d399",
    primary: "#059669",
    primaryLight: "rgba(5, 150, 105, 0.15)",
    accent: "#0f766e",
    chartPalette: {
      eligible: "#64748b",
      jcodes: "#2563eb",
      sari: "#059669",
      sariFill: "rgba(5, 150, 105, 0.15)"
    }
  },
  sapphire: {
    id: "sapphire",
    name: "Sapphire Clinical",
    nameTh: "Sapphire Clinical (มาตรฐานสากล)",
    dotColor: "#60a5fa",
    primary: "#1d4ed8",
    primaryLight: "rgba(29, 78, 216, 0.15)",
    accent: "#0284c7",
    chartPalette: {
      eligible: "#64748b",
      jcodes: "#0284c7",
      sari: "#1d4ed8",
      sariFill: "rgba(29, 78, 216, 0.15)"
    }
  },
  midnight: {
    id: "midnight",
    name: "Midnight Executive",
    nameTh: "Midnight Executive (โหมดมืด)",
    dotColor: "#22d3ee",
    primary: "#34d399",
    primaryLight: "rgba(52, 211, 153, 0.22)",
    accent: "#38bdf8",
    chartPalette: {
      eligible: "#38bdf8",
      jcodes: "#818cf8",
      sari: "#34d399",
      sariFill: "rgba(52, 211, 153, 0.22)"
    }
  },
  amethyst: {
    id: "amethyst",
    name: "Amethyst Royal",
    nameTh: "Amethyst Royal (สถาบันการแพทย์)",
    dotColor: "#c084fc",
    primary: "#7c3aed",
    primaryLight: "rgba(124, 58, 237, 0.15)",
    accent: "#6366f1",
    chartPalette: {
      eligible: "#64748b",
      jcodes: "#0284c7",
      sari: "#7c3aed",
      sariFill: "rgba(124, 58, 237, 0.15)"
    }
  }
};

// Global Application State
export const state = {
  lang: "th", // "th" | "en"
  theme: (typeof localStorage !== "undefined" && localStorage.getItem("sari_theme")) || "emerald",
  view: "upload", // "upload" | "mapping" | "dashboard"
  dashboardMode: "simplified", // "simplified" | "advanced"
  quickNavCollapsed: (typeof localStorage !== "undefined" && localStorage.getItem("sari_quick_nav_collapsed") === "true") || false,
  motionEnabled: (typeof localStorage !== "undefined" && localStorage.getItem("sari_motion_enabled") !== null)
    ? localStorage.getItem("sari_motion_enabled") === "true"
    : true,
  rawData: [],
  rawHeaders: [],
  columnMapping: {
    admitDateCol: "",
    ageCol: "",
    sexCol: "",
    icdCol: ""
  },
  settings: {
    preferredModel: "auto", // "auto" | "model1" | "model2"
    weekDefinition: "epi", // "epi" | "iso"
    fullPrecision: false
  },
  filters: {
    startDate: "",
    endDate: "",
    ageGroup: "all",
    sex: "all",
    ageType: "all",
    icdCategory: "all",
    jCodeStatus: "all",
    modelUsed: "all",
    displayMetric: "sari" // "sari" | "jcode" | "eligible"
  },
  chartPreferences: {
    timeAggregation: "weekly", // "weekly" | "monthly"
    mainIcdSubgroup: "all",
    forecastEnabled: false,
    forecastHorizon: "auto", // "auto" | "6m" | "1y" | "2y"
    smallMultiplesSharedY: true,
    overlayJCodes: true,
    sexLayout: "combined", // "combined" | "split"
    pctType: "overall", // "overall" | "row"
    icdMetric: "admissions", // "admissions" | "sari"
    mainSeriesVisible: {
      eligible: true,
      jcodes: true,
      sari: true,
      sariJ: false,
      sariNonJ: false,
      subgroup: true,
      forecast: true
    }
  },
  hospitalInfo: {
    hospitalName: "",
    province: "",
    reportingPeriod: ""
  },
  isDemoData: false,
  processedDataset: null,
  aggregatedResults: null,
  activeCharts: {}
};

export function t(key) {
  const dict = TRANSLATIONS[state.lang] || TRANSLATIONS.en;
  return dict[key] || TRANSLATIONS.en[key] || key;
}

export function setTheme(themeId) {
  if (!AVAILABLE_THEMES[themeId]) themeId = "emerald";
  state.theme = themeId;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("sari_theme", themeId);
    } catch (e) {}
  }

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", themeId);
    
    // Update theme indicator dot
    const dot = document.getElementById("theme-indicator-dot");
    if (dot) {
      dot.style.backgroundColor = AVAILABLE_THEMES[themeId].dotColor;
      dot.style.boxShadow = `0 0 10px ${AVAILABLE_THEMES[themeId].dotColor}`;
    }

    // Update current theme label
    const label = document.getElementById("current-theme-label");
    if (label) {
      label.textContent = state.lang === "th" ? AVAILABLE_THEMES[themeId].nameTh : AVAILABLE_THEMES[themeId].name;
    }

    // Update active checkmarks in menu
    document.querySelectorAll(".theme-check").forEach((el) => {
      if (el.getAttribute("data-theme-check") === themeId) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });

    // Update showcase pills if present
    document.querySelectorAll(".theme-pill-btn").forEach((btn) => {
      if (btn.getAttribute("data-set-theme") === themeId) {
        btn.classList.add("ring-2", "ring-white", "scale-105");
      } else {
        btn.classList.remove("ring-2", "ring-white", "scale-105");
      }
    });

    // If dashboard is currently active, refresh panels so colors and charts match theme
    if (state.aggregatedResults && state.view === "dashboard") {
      renderDashboardPanels();
    }
  }
}

export function toggleQuickNav(forceCollapsed) {
  if (typeof forceCollapsed === "boolean") {
    state.quickNavCollapsed = forceCollapsed;
  } else {
    state.quickNavCollapsed = !state.quickNavCollapsed;
  }

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("sari_quick_nav_collapsed", String(state.quickNavCollapsed));
    } catch (e) {}
  }

  if (typeof document === "undefined") return;

  const card = document.getElementById("quick-nav-card");
  const pillBtn = document.getElementById("quick-nav-collapsed-btn");
  if (card && pillBtn) {
    if (state.quickNavCollapsed) {
      card.classList.add("hidden");
      pillBtn.classList.remove("hidden");
      pillBtn.classList.add("flex");
    } else {
      card.classList.remove("hidden");
      pillBtn.classList.add("hidden");
      pillBtn.classList.remove("flex");
    }
  }
}

export function jumpToDashboardSection(targetId) {
  if (typeof document === "undefined") return;
  const target = document.getElementById(targetId);
  if (!target) return;

  const headerOffset = 90;
  const elementPosition = target.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

  window.scrollTo({
    top: offsetPosition,
    behavior: "smooth"
  });

  // Momentarily flash highlight the target section to draw immediate visual attention
  target.classList.remove("section-flash-highlight");
  void target.offsetWidth; // trigger reflow
  target.classList.add("section-flash-highlight");
  setTimeout(() => {
    target.classList.remove("section-flash-highlight");
  }, 1400);

  updateQuickNavActiveItem(targetId);
}

export function updateQuickNavActiveItem(activeId) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".quick-nav-item").forEach((btn) => {
    const target = btn.getAttribute("data-jump-target");
    if (target === activeId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

export function updateQuickNavScrollSpy() {
  if (typeof document === "undefined") return;
  if (state.view !== "dashboard" || state.dashboardMode !== "advanced") return;

  const sectionIds = [
    "kpi-cards-grid",
    "advanced-filters-toolbar",
    "main-trend-card",
    "age-small-multiples-card",
    "sex-and-j-card",
    "icd-composition-card",
    "age-sex-tables-card",
    "seasonal-and-demog-card",
    "scientific-notes-card"
  ];

  const scrollY = window.pageYOffset;
  const headerOffset = 130;
  let currentSection = sectionIds[0];

  for (const id of sectionIds) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains("hidden")) {
      const top = el.offsetTop - headerOffset;
      if (scrollY >= top) {
        currentSection = id;
      }
    }
  }

  updateQuickNavActiveItem(currentSection);
}


// ========================================================
// MOTION GRAPHICS & ANIMATION ENGINE
// ========================================================
export function setMotionEnabled(enabled) {
  state.motionEnabled = !!enabled;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("sari_motion_enabled", String(state.motionEnabled));
    } catch (e) {}
  }
  updateMotionUI();
  if (state.view === "dashboard" && state.aggregatedResults) {
    renderDashboardPanels();
  }
}

export function toggleMotion() {
  setMotionEnabled(!state.motionEnabled);
}

export function updateMotionUI() {
  if (typeof document === "undefined") return;
  const isEnabled = state.motionEnabled !== false;
  if (isEnabled) {
    document.body.classList.remove("motion-reduced");
    document.body.classList.add("motion-enhanced");
  } else {
    document.body.classList.remove("motion-enhanced");
    document.body.classList.add("motion-reduced");
  }

  const btn = document.getElementById("btn-toggle-motion");
  const label = document.getElementById("motion-toggle-label");
  const icon = document.getElementById("motion-toggle-icon");
  const dot = document.getElementById("motion-indicator-dot");

  if (btn) {
    btn.setAttribute("title", t("motionTitle"));
    btn.setAttribute("aria-pressed", isEnabled ? "true" : "false");
  }
  if (label) {
    label.textContent = isEnabled ? t("motionOn") : t("motionOff");
  }
  if (icon) {
    icon.className = isEnabled
      ? "fa-solid fa-wand-magic-sparkles text-amber-300 text-[11px]"
      : "fa-solid fa-pause text-slate-400 text-[11px]";
  }
  if (dot) {
    dot.className = isEnabled
      ? "w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse"
      : "w-2.5 h-2.5 rounded-full bg-slate-400";
  }
}

const activeNumberCounters = new Map();

export function animateValue(elemId, targetValue, isDecimal = false, decimals = 1, duration = 850) {
  if (typeof document === "undefined") return;
  const elem = document.getElementById(elemId);
  if (!elem) return;

  if (activeNumberCounters.has(elemId)) {
    cancelAnimationFrame(activeNumberCounters.get(elemId));
    activeNumberCounters.delete(elemId);
  }

  const endVal = typeof targetValue === "number" ? targetValue : parseFloat(targetValue) || 0;

  if (!state.motionEnabled) {
    elem.textContent = isDecimal ? endVal.toFixed(decimals) : Math.round(endVal).toLocaleString();
    return;
  }

  let startVal = 0;
  const rawText = elem.textContent.replace(/[^\d.-]/g, "");
  if (rawText && !isNaN(parseFloat(rawText))) {
    startVal = parseFloat(rawText);
  }

  if (Math.abs(startVal - endVal) < (isDecimal ? 0.01 : 1)) {
    elem.textContent = isDecimal ? endVal.toFixed(decimals) : Math.round(endVal).toLocaleString();
    return;
  }

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out expo: 1 - Math.pow(2, -10 * progress)
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = startVal + (endVal - startVal) * ease;

    if (isDecimal) {
      elem.textContent = current.toFixed(decimals);
    } else {
      elem.textContent = Math.round(current).toLocaleString();
    }

    if (progress < 1) {
      const rafId = requestAnimationFrame(step);
      activeNumberCounters.set(elemId, rafId);
    } else {
      activeNumberCounters.delete(elemId);
      elem.textContent = isDecimal ? endVal.toFixed(decimals) : Math.round(endVal).toLocaleString();
    }
  }

  const rafId = requestAnimationFrame(step);
  activeNumberCounters.set(elemId, rafId);
}

export function initApp() {
  bindEvents();
  setTheme(state.theme);
  updateStaticTexts();
  updateMotionUI();
  toggleQuickNav(state.quickNavCollapsed);
  renderApp();
}

export function autoDetectColumns(headers) {
  const mapping = { admitDateCol: "", ageCol: "", sexCol: "", icdCol: "" };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const dateCandidates = ["admitdate", "admissiondate", "dateadmit", "admdate", "date", "visitdate", "dtadmit"];
  const ageCandidates = ["age", "ageyear", "ageyears", "ageyrs", "patientage"];
  const sexCandidates = ["sex", "gender", "ptsex", "patientsex"];
  const icdCandidates = ["primaryicd10", "icd10", "primaryicd", "admissionicd10", "dx1", "pdx", "princdx", "diag1"];

  for (const h of headers) {
    const cleaned = norm(h);
    if (!mapping.admitDateCol && dateCandidates.some((c) => cleaned.includes(c))) mapping.admitDateCol = h;
    if (!mapping.ageCol && ageCandidates.some((c) => cleaned === c || cleaned.startsWith(c))) mapping.ageCol = h;
    if (!mapping.sexCol && sexCandidates.some((c) => cleaned.includes(c))) mapping.sexCol = h;
    if (!mapping.icdCol && icdCandidates.some((c) => cleaned.includes(c))) mapping.icdCol = h;
  }

  if (!mapping.admitDateCol && headers[0]) mapping.admitDateCol = headers[0];
  if (!mapping.sexCol && headers[1]) mapping.sexCol = headers[1];
  if (!mapping.ageCol && headers[2]) mapping.ageCol = headers[2];
  if (!mapping.icdCol && headers[3]) mapping.icdCol = headers[3];

  return mapping;
}

export function loadUploadedData(data, filename, isDemo = false) {
  if (!data || data.length === 0) {
    alert(state.lang === "th" ? "ไม่พบข้อมูลในไฟล์ที่เลือก" : "No data found in uploaded file");
    return;
  }

  state.isDemoData = isDemo;
  state.rawData = data;
  state.rawHeaders = Object.keys(data[0] || {});
  state.columnMapping = autoDetectColumns(state.rawHeaders);
  state.view = "mapping";
  renderApp();
}

export function runAnalysis() {
  if (!state.columnMapping.admitDateCol || !state.columnMapping.ageCol || !state.columnMapping.icdCol) {
    alert(state.lang === "th" ? "กรุณาจับคู่คอลัมน์ วันที่ อายุ และรหัส ICD-10" : "Please map admission date, age, and ICD-10 columns");
    return;
  }

  state.processedDataset = processSurveillanceDataset(state.rawData, state.columnMapping, {
    preferredModel: state.settings.preferredModel,
    weekDefinition: state.settings.weekDefinition
  });

  state.aggregatedResults = aggregateSurveillance(state.processedDataset.processedRows, state.filters);
  state.view = "dashboard";
  renderApp();
}

export function refreshDashboardData() {
  if (!state.processedDataset) return;
  state.aggregatedResults = aggregateSurveillance(state.processedDataset.processedRows, state.filters);
  renderDashboardPanels();
}

export function renderApp() {
  updateLanguageUI();

  const uploadView = document.getElementById("view-upload");
  const mappingView = document.getElementById("view-mapping");
  const dashboardView = document.getElementById("view-dashboard");

  if (uploadView) uploadView.classList.toggle("hidden", state.view !== "upload");
  if (mappingView) mappingView.classList.toggle("hidden", state.view !== "mapping");
  if (dashboardView) dashboardView.classList.toggle("hidden", state.view !== "dashboard");

  const demoBadge = document.getElementById("demo-data-badge");
  if (demoBadge) demoBadge.classList.toggle("hidden", !state.isDemoData);

  if (state.view === "mapping") {
    renderMappingView();
  } else if (state.view === "dashboard") {
    renderDashboardPanels();
  }
}

export function updateStaticTexts() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) el.setAttribute("title", t(key));
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });

  updateMotionUI();
}

export function updateHospitalInfo(name, province) {
  if (name !== undefined) state.hospitalInfo.hospitalName = name;
  if (province !== undefined) state.hospitalInfo.province = province;

  if (typeof document === "undefined") return;

  const currentName = state.hospitalInfo.hospitalName || "";
  const currentProv = state.hospitalInfo.province || "";

  // Sync inputs across mapping view and report modal
  ["input-hospital-name", "report-input-hospital"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.value !== currentName) el.value = currentName;
  });
  ["input-province", "report-input-province"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.value !== currentProv) el.value = currentProv;
  });

  // Sync Active Model Bar pill
  const activeDisp = document.getElementById("active-hospital-display");
  if (activeDisp) {
    if (currentName) {
      activeDisp.textContent = `${state.lang === "th" ? "โรงพยาบาล" : "Facility"}: ${currentName}${currentProv ? ` (${currentProv})` : ""}`;
    } else {
      activeDisp.textContent = t("activeHospitalUnset");
    }
  }

  // Sync Surveillance Report Live Preview
  const isTh = state.lang === "th";
  const repFac = document.getElementById("report-facility-name");
  const repProv = document.getElementById("report-province-name");
  if (repFac) {
    repFac.textContent = currentName || (isTh ? "โรงพยาบาลศูนย์ / โรงพยาบาลทั่วไป" : "Sentinel Hospital Surveillance Site");
  }
  if (repProv) {
    repProv.textContent = currentProv || (isTh ? "ประเทศไทย" : "Thailand");
  }
}

function updateLanguageUI() {
  updateStaticTexts();
  updateHospitalInfo();
  const langThBtn = document.getElementById("btn-lang-th");
  const langEnBtn = document.getElementById("btn-lang-en");
  if (langThBtn && langEnBtn) {
    if (state.lang === "th") {
      langThBtn.className = "px-2.5 py-1 text-xs font-bold rounded bg-emerald-600 text-white shadow-sm transition";
      langEnBtn.className = "px-2.5 py-1 text-xs font-medium rounded text-emerald-200 hover:text-white transition";
    } else {
      langEnBtn.className = "px-2.5 py-1 text-xs font-bold rounded bg-emerald-600 text-white shadow-sm transition";
      langThBtn.className = "px-2.5 py-1 text-xs font-medium rounded text-emerald-200 hover:text-white transition";
    }
  }

  const modeTip = document.getElementById("mode-tip-text");
  if (modeTip) {
    modeTip.textContent = state.dashboardMode === "advanced" ? t("modeAdvancedTip") : t("modeSimplifyTip");
  }

  const themeLabel = document.getElementById("current-theme-label");
  if (themeLabel && AVAILABLE_THEMES[state.theme]) {
    themeLabel.textContent = state.lang === "th" ? AVAILABLE_THEMES[state.theme].nameTh : AVAILABLE_THEMES[state.theme].name;
  }

  if (state.view === "dashboard" && state.aggregatedResults && state.dashboardMode === "simplified") {
    renderSimplifiedInsights();
    renderSimplifiedAgeTable();
  }
}

function bindEvents() {
  document.getElementById("btn-lang-th")?.addEventListener("click", () => {
    state.lang = "th";
    updateLanguageUI();
    if (state.view === "dashboard") refreshDashboardData();
    else if (state.view === "mapping") renderMappingView();
  });

  document.getElementById("btn-lang-en")?.addEventListener("click", () => {
    state.lang = "en";
    updateLanguageUI();
    if (state.view === "dashboard") refreshDashboardData();
    else if (state.view === "mapping") renderMappingView();
  });

  document.getElementById("btn-try-demo")?.addEventListener("click", () => {
    const demoData = generateSyntheticSurveillanceData();
    loadUploadedData(demoData, "synthetic_surveillance_demo.csv", true);
  });

  document.getElementById("btn-download-tpl-csv")?.addEventListener("click", downloadCSVTemplate);
  document.getElementById("btn-download-tpl-xlsx")?.addEventListener("click", downloadExcelTemplate);

  const fileInput = document.getElementById("file-upload-input");
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  });

  const dropZone = document.getElementById("upload-dropzone");
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("border-emerald-500", "bg-emerald-50/50");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("border-emerald-500", "bg-emerald-50/50");
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("border-emerald-500", "bg-emerald-50/50");
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    });
  }

  document.getElementById("btn-run-analysis")?.addEventListener("click", runAnalysis);
  document.getElementById("btn-back-upload")?.addEventListener("click", () => {
    state.view = "upload";
    renderApp();
  });

  document.getElementById("btn-upload-new")?.addEventListener("click", () => {
    state.view = "upload";
    renderApp();
  });
  document.getElementById("btn-edit-mapping")?.addEventListener("click", () => {
    state.view = "mapping";
    renderApp();
  });

  document.getElementById("btn-mode-simplify")?.addEventListener("click", () => {
    setDashboardMode("simplified");
  });
  document.getElementById("btn-mode-advanced")?.addEventListener("click", () => {
    setDashboardMode("advanced");
  });
  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    if (state.processedDataset) {
      downloadProcessedDataCSV(state.processedDataset.processedRows);
    }
  });
  document.getElementById("btn-export-excel")?.addEventListener("click", () => {
    if (state.aggregatedResults) {
      downloadAggregatedExcel(state.aggregatedResults, state.hospitalInfo, {
        modelSetting: state.settings.preferredModel,
        weekDefinition: state.settings.weekDefinition
      });
    }
  });

  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    state.filters = {
      startDate: "",
      endDate: "",
      ageGroup: "all",
      sex: "all",
      ageType: "all",
      icdCategory: "all",
      jCodeStatus: "all",
      modelUsed: "all",
      displayMetric: "sari"
    };
    syncFilterInputs();
    refreshDashboardData();
  });

  const filterInputs = [
    "filter-start-date",
    "filter-end-date",
    "filter-age-group",
    "filter-sex",
    "filter-age-type",
    "filter-icd-group",
    "filter-j-status"
  ];
  filterInputs.forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      readFiltersFromDOM();
      refreshDashboardData();
    });
  });

  document.getElementById("toggle-weekly")?.addEventListener("click", () => {
    state.chartPreferences.timeAggregation = "weekly";
    updateTimeToggleStyles();
    renderMainTimeSeriesChart();
  });
  document.getElementById("toggle-monthly")?.addEventListener("click", () => {
    state.chartPreferences.timeAggregation = "monthly";
    updateTimeToggleStyles();
    renderMainTimeSeriesChart();
  });

  document.getElementById("toggle-line-eligible")?.addEventListener("change", (e) => {
    state.chartPreferences.mainSeriesVisible.eligible = e.target.checked;
    renderMainTimeSeriesChart();
  });
  document.getElementById("toggle-line-jcodes")?.addEventListener("change", (e) => {
    state.chartPreferences.mainSeriesVisible.jcodes = e.target.checked;
    renderMainTimeSeriesChart();
  });
  document.getElementById("toggle-line-sari")?.addEventListener("change", (e) => {
    state.chartPreferences.mainSeriesVisible.sari = e.target.checked;
    renderMainTimeSeriesChart();
  });
  document.getElementById("toggle-line-sari-j")?.addEventListener("change", (e) => {
    state.chartPreferences.mainSeriesVisible.sariJ = e.target.checked;
    renderMainTimeSeriesChart();
  });
  document.getElementById("toggle-line-sari-nonj")?.addEventListener("change", (e) => {
    state.chartPreferences.mainSeriesVisible.sariNonJ = e.target.checked;
    renderMainTimeSeriesChart();
  });
  document.getElementById("toggle-line-subgroup")?.addEventListener("change", (e) => {
    state.chartPreferences.mainSeriesVisible.subgroup = e.target.checked;
    renderMainTimeSeriesChart();
  });
    document.getElementById("toggle-forecast-enable")?.addEventListener("change", (e) => {
    setForecastEnabled(e.target.checked);
  });
  document.getElementById("select-forecast-horizon")?.addEventListener("change", (e) => {
    setForecastHorizon(e.target.value);
  });
  document.getElementById("toggle-line-forecast")?.addEventListener("change", (e) => {
    state.chartPreferences.mainSeriesVisible.forecast = e.target.checked;
    renderMainTimeSeriesChart();
  });
  document.getElementById("select-main-icd-subgroup")?.addEventListener("change", (e) => {
    setMainIcdSubgroup(e.target.value);
  });

  document.getElementById("toggle-shared-y")?.addEventListener("change", (e) => {
    state.chartPreferences.smallMultiplesSharedY = e.target.checked;
    renderAgeGroupSmallMultiples();
  });
  document.getElementById("toggle-overlay-j")?.addEventListener("change", (e) => {
    state.chartPreferences.overlayJCodes = e.target.checked;
    renderAgeGroupSmallMultiples();
  });

  document.getElementById("toggle-sex-combined")?.addEventListener("click", () => {
    state.chartPreferences.sexLayout = "combined";
    updateSexToggleStyles();
    renderSexChart();
  });
  document.getElementById("toggle-sex-split")?.addEventListener("click", () => {
    state.chartPreferences.sexLayout = "split";
    updateSexToggleStyles();
    renderSexChart();
  });

  document.getElementById("toggle-pct-overall")?.addEventListener("click", () => {
    state.chartPreferences.pctType = "overall";
    updateTablePctToggleStyles();
    renderAgeSexTables();
  });
  document.getElementById("toggle-pct-row")?.addEventListener("click", () => {
    state.chartPreferences.pctType = "row";
    updateTablePctToggleStyles();
    renderAgeSexTables();
  });

  document.getElementById("toggle-icd-admissions")?.addEventListener("click", () => {
    state.chartPreferences.icdMetric = "admissions";
    updateICDToggleStyles();
    renderICDCompositionChart();
  });
  document.getElementById("toggle-icd-sari")?.addEventListener("click", () => {
    state.chartPreferences.icdMetric = "sari";
    updateICDToggleStyles();
    renderICDCompositionChart();
  });

  document.getElementById("toggle-full-precision")?.addEventListener("change", (e) => {
    state.settings.fullPrecision = e.target.checked;
    renderKPICards();
    renderAgeSexTables();
  });

  document.getElementById("select-week-def")?.addEventListener("change", (e) => {
    state.settings.weekDefinition = e.target.value;
    runAnalysis();
  });

  document.getElementById("select-preferred-model")?.addEventListener("change", (e) => {
    state.settings.preferredModel = e.target.value;
    runAnalysis();
  });

  document.getElementById("input-hospital-name")?.addEventListener("input", (e) => {
    updateHospitalInfo(e.target.value, undefined);
  });
  document.getElementById("input-province")?.addEventListener("input", (e) => {
    updateHospitalInfo(undefined, e.target.value);
  });
  document.getElementById("report-input-hospital")?.addEventListener("input", (e) => {
    updateHospitalInfo(e.target.value, undefined);
  });
  document.getElementById("report-input-province")?.addEventListener("input", (e) => {
    updateHospitalInfo(undefined, e.target.value);
  });
  document.getElementById("btn-quick-facility-modal")?.addEventListener("click", () => {
    openSurveillanceReport();
    setTimeout(() => {
      document.getElementById("report-input-hospital")?.focus();
    }, 150);
  });

  document.getElementById("btn-about-model")?.addEventListener("click", openModelInfoModal);
  document.getElementById("btn-close-model-info")?.addEventListener("click", closeModelInfoModal);
  document.getElementById("btn-open-data-guide")?.addEventListener("click", openDataGuide);
  document.getElementById("btn-close-data-guide")?.addEventListener("click", closeDataGuide);
  document.getElementById("btn-close-data-guide-footer")?.addEventListener("click", closeDataGuide);
  document.getElementById("btn-toggle-guide-collapse")?.addEventListener("click", toggleGuideCollapse);

  const modalDataGuide = document.getElementById("modal-data-guide");
  if (modalDataGuide) {
    modalDataGuide.addEventListener("click", (e) => {
      if (e.target === modalDataGuide) closeDataGuide();
    });
  }

  document.getElementById("btn-data-quality")?.addEventListener("click", openDataQualityModal);
  document.getElementById("btn-close-dq-modal")?.addEventListener("click", closeDataQualityModal);
  document.getElementById("btn-download-dq-report")?.addEventListener("click", downloadDataQualityReport);

  document.getElementById("btn-generate-report")?.addEventListener("click", openSurveillanceReport);
  document.getElementById("btn-close-report")?.addEventListener("click", closeSurveillanceReport);
  document.getElementById("btn-export-report-docx")?.addEventListener("click", () => {
    if (state.aggregatedResults) {
      exportSurveillanceReportDocx(state.aggregatedResults, state.hospitalInfo, state.processedDataset, state.lang);
    }
  });
  document.getElementById("btn-print-report")?.addEventListener("click", () => {
    openSurveillanceReport();
    window.print();
  });

  window.addEventListener("beforeprint", () => {
    if (state.aggregatedResults) {
      openSurveillanceReport();
    }
  });

  document.getElementById("btn-export-main-png")?.addEventListener("click", () => {
    downloadCanvasAsPNG(document.getElementById("chart-main-timeseries"), "SARI_Surveillance_Trends.png");
  });
  document.getElementById("btn-export-icd-png")?.addEventListener("click", () => {
    downloadCanvasAsPNG(document.getElementById("chart-icd-composition"), "SARI_ICD_Composition.png");
  });
  document.getElementById("btn-export-j-non-j-png")?.addEventListener("click", () => {
    downloadCanvasAsPNG(document.getElementById("chart-j-vs-non-j"), "SARI_J_vs_NonJ_Contribution.png");
  });

  // Theme Dropdown Toggle & Outside Click
  const btnThemeDropdown = document.getElementById("btn-theme-dropdown");
  const themeDropdownMenu = document.getElementById("theme-dropdown-menu");
  if (btnThemeDropdown && themeDropdownMenu) {
    btnThemeDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
      themeDropdownMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!themeDropdownMenu.contains(e.target) && !btnThemeDropdown.contains(e.target)) {
        themeDropdownMenu.classList.add("hidden");
      }
    });
  }

  // Theme Selection Click Handlers (Menu items & Showcase pills)
  document.querySelectorAll("[data-set-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const themeId = btn.getAttribute("data-set-theme");
      if (themeId) {
        setTheme(themeId);
        if (themeDropdownMenu) themeDropdownMenu.classList.add("hidden");
      }
    });
  });

  // Quick Navigation Side Menu Events
  document.getElementById("btn-toggle-quick-nav-banner")?.addEventListener("click", () => {
    toggleQuickNav(false);
    const card = document.getElementById("quick-nav-card");
    if (card) {
      card.classList.remove("section-flash-highlight");
      void card.offsetWidth;
      card.classList.add("section-flash-highlight");
    }
  });

  document.getElementById("btn-collapse-quick-nav")?.addEventListener("click", () => {
    toggleQuickNav(true);
  });

  document.getElementById("quick-nav-collapsed-btn")?.addEventListener("click", () => {
    toggleQuickNav(false);
  });

  document.querySelectorAll("[data-jump-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-jump-target");
      if (targetId) jumpToDashboardSection(targetId);
    });
  });

  document.getElementById("btn-quick-nav-top")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ScrollSpy listener
  if (typeof window !== "undefined") {
    let scrollTimeout;
    window.addEventListener("scroll", () => {
      if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
          scrollTimeout = null;
          updateQuickNavScrollSpy();
        }, 60);
      }
    }, { passive: true });
  }
}

function handleFileSelect(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    if (typeof Papa === "undefined") {
      alert("CSV parsing library is loading. Please try again.");
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => loadUploadedData(results.data, file.name, false),
      error: (err) => alert("Error parsing CSV: " + err.message)
    });
  } else if (ext === "xlsx" || ext === "xls") {
    if (typeof XLSX === "undefined") {
      alert("Excel parsing library is loading. Please try again.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      loadUploadedData(json, file.name, false);
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert(state.lang === "th" ? "กรุณาเลือกไฟล์ .csv หรือ .xlsx" : "Please select a .csv or .xlsx file");
  }
}

function renderMappingView() {
  const container = document.getElementById("mapping-fields-container");
  if (!container) return;

  const createSelectOptions = (selectedVal) => {
    let opts = `<option value="">-- ${state.lang === "th" ? "เลือกคอลัมน์" : "Select column"} --</option>`;
    for (const h of state.rawHeaders) {
      opts += `<option value="${h}" ${h === selectedVal ? "selected" : ""}>${h}</option>`;
    }
    return opts;
  };

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1">
          ${t("colAdmitDate")} <span class="text-rose-500">*</span>
        </label>
        <select id="map-select-date" class="w-full rounded-lg border-slate-300 text-sm focus:ring-emerald-500 focus:border-emerald-500 p-2.5 border">
          ${createSelectOptions(state.columnMapping.admitDateCol)}
        </select>
        <p class="text-xs text-slate-500 mt-1">e.g. admit_date, admission_date, date_admit</p>
      </div>

      <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1">
          ${t("colAge")} <span class="text-rose-500">*</span>
        </label>
        <select id="map-select-age" class="w-full rounded-lg border-slate-300 text-sm focus:ring-emerald-500 focus:border-emerald-500 p-2.5 border">
          ${createSelectOptions(state.columnMapping.ageCol)}
        </select>
        <p class="text-xs text-slate-500 mt-1">e.g. age, age_year, age_yrs (0–120)</p>
      </div>

      <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1">
          ${t("colSex")} <span class="text-slate-400 font-normal">(${state.lang === "th" ? "จำเป็นสำหรับ Model 2" : "required for Model 2"})</span>
        </label>
        <select id="map-select-sex" class="w-full rounded-lg border-slate-300 text-sm focus:ring-emerald-500 focus:border-emerald-500 p-2.5 border">
          ${createSelectOptions(state.columnMapping.sexCol)}
        </select>
        <p class="text-xs text-slate-500 mt-1">e.g. sex, gender, M/F, Male/Female</p>
      </div>

      <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1">
          ${t("colICD10")} <span class="text-rose-500">*</span>
        </label>
        <select id="map-select-icd" class="w-full rounded-lg border-slate-300 text-sm focus:ring-emerald-500 focus:border-emerald-500 p-2.5 border">
          ${createSelectOptions(state.columnMapping.icdCol)}
        </select>
        <p class="text-xs text-slate-500 mt-1">e.g. primary_ICD_10, primary_icd10, dx1, pdx</p>
      </div>
    </div>
  `;

  document.getElementById("map-select-date")?.addEventListener("change", (e) => {
    state.columnMapping.admitDateCol = e.target.value;
    renderMappingPreviewTable();
  });
  document.getElementById("map-select-age")?.addEventListener("change", (e) => {
    state.columnMapping.ageCol = e.target.value;
    renderMappingPreviewTable();
  });
  document.getElementById("map-select-sex")?.addEventListener("change", (e) => {
    state.columnMapping.sexCol = e.target.value;
    renderMappingPreviewTable();
  });
  document.getElementById("map-select-icd")?.addEventListener("change", (e) => {
    state.columnMapping.icdCol = e.target.value;
    renderMappingPreviewTable();
  });

  renderMappingPreviewTable();
}

function renderMappingPreviewTable() {
  const container = document.getElementById("mapping-preview-table-container");
  if (!container || !state.rawDataset || state.rawDataset.length === 0) return;

  const rows = state.rawDataset.slice(0, 15);
  const { admitDateCol, ageCol, sexCol, icdCol } = state.columnMapping;

  let html = `
    <div class="overflow-x-auto border border-slate-200 rounded-lg">
      <table class="min-w-full text-xs text-left divide-y divide-slate-200">
        <thead class="bg-slate-50 text-slate-700 font-semibold">
          <tr>
            <th class="px-3 py-2 border-r">#</th>
            <th class="px-3 py-2 border-r">${admitDateCol || "admit_date"}</th>
            <th class="px-3 py-2 border-r">${ageCol || "age"}</th>
            <th class="px-3 py-2 border-r">${sexCol || "sex"}</th>
            <th class="px-3 py-2 border-r">${icdCol || "primary_ICD_10"}</th>
            <th class="px-3 py-2 border-r bg-emerald-50 text-emerald-900">Normalized ICD</th>
            <th class="px-3 py-2 border-r bg-emerald-50 text-emerald-900">Diagnostic Category</th>
            <th class="px-3 py-2 border-r bg-emerald-50 text-emerald-900">Age Model</th>
            <th class="px-3 py-2 border-r bg-emerald-50 text-emerald-900">Season</th>
            <th class="px-3 py-2 bg-emerald-50 text-emerald-900">Model Eligibility</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
  `;

  rows.forEach((r, idx) => {
    const rawDate = r[admitDateCol];
    const rawAge = r[ageCol];
    const rawSex = r[sexCol];
    const rawICD = r[icdCol];

    const icdRes = classifyICD10(rawICD);
    const numAge = parseFloat(rawAge);
    const ageModel = !isNaN(numAge) && numAge >= 0 ? selectAgeModel(numAge) : null;
    const season = rawDate ? deriveSeason(rawDate) : null;
    const isEligible = !isNaN(numAge) && numAge >= 0 && icdRes.isModelEligible;

    html += `
      <tr class="hover:bg-slate-50">
        <td class="px-3 py-1.5 border-r font-mono text-slate-400">${idx + 1}</td>
        <td class="px-3 py-1.5 border-r font-mono">${rawDate || "-"}</td>
        <td class="px-3 py-1.5 border-r">${rawAge !== undefined ? rawAge : "-"}</td>
        <td class="px-3 py-1.5 border-r">${rawSex || "-"}</td>
        <td class="px-3 py-1.5 border-r font-mono font-medium">${rawICD || "-"}</td>
        <td class="px-3 py-1.5 border-r font-mono text-emerald-800 bg-emerald-50/20">${icdRes.normalizedCode || "-"}</td>
        <td class="px-3 py-1.5 border-r bg-emerald-50/20">
          <span class="inline-block px-1.5 py-0.5 rounded text-[11px] ${icdRes.isModelEligible ? "bg-slate-100 text-slate-800" : "bg-amber-100 text-amber-800"}">
            ${state.lang === "th" ? (icdRes.categoryTh || icdRes.category || "อยู่นอกขอบเขต") : (icdRes.category || "Outside scope")}
          </span>
        </td>
        <td class="px-3 py-1.5 border-r capitalize bg-emerald-50/20 text-slate-600">${ageModel || "-"}</td>
        <td class="px-3 py-1.5 border-r capitalize bg-emerald-50/20 text-slate-600">${season ? season.labelEn : "-"}</td>
        <td class="px-3 py-1.5 bg-emerald-50/20">
          ${isEligible
            ? `<span class="text-emerald-700 font-semibold flex items-center gap-1">✓ ${state.lang === "th" ? "เข้าเกณฑ์" : "Eligible"}</span>`
            : `<span class="text-amber-600 font-medium flex items-center gap-1">⚠ ${state.lang === "th" ? "ไม่เข้าเกณฑ์" : "Excluded"}</span>`
          }
        </td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  tableContainer.innerHTML = html;
}

export function renderDashboardPanels() {
  if (!state.aggregatedResults) return;

  renderActiveModelBadge();
  renderKPICards();
  renderMainTimeSeriesChart();

  if (state.dashboardMode === "simplified") {
    renderSimplifiedInsights();
    renderSimplifiedAgeTable();
  } else {
    renderAgeGroupSmallMultiples();
    renderSexChart();
    renderAgeSexTables();
    renderICDCompositionChart();
    renderJVsNonJChart();
    renderSeasonalPanel();
    renderDemographicsPanel();
    renderFooterMetadata();
  }

  applyDashboardModeLayout(state.dashboardMode || "simplified");
}

function applyDashboardModeLayout(mode) {
  const isSimplify = mode === "simplified";

  const btnSimp = document.getElementById("btn-mode-simplify");
  const btnAdv = document.getElementById("btn-mode-advanced");
  const modeTip = document.getElementById("mode-tip-text");
  const kpiGrid = document.getElementById("kpi-cards-grid");

  if (btnSimp && btnAdv) {
    if (isSimplify) {
      btnSimp.className = "px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 bg-emerald-700 text-white shadow-xs";
      btnAdv.className = "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 text-slate-600 hover:text-slate-900";
    } else {
      btnAdv.className = "px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 bg-emerald-700 text-white shadow-xs";
      btnSimp.className = "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 text-slate-600 hover:text-slate-900";
    }
  }

  if (modeTip) {
    modeTip.textContent = isSimplify ? t("modeSimplifyTip") : t("modeAdvancedTip");
  }

  document.querySelectorAll(".dashboard-simplified-only").forEach((el) => {
    el.classList.toggle("hidden", !isSimplify);
  });

  document.querySelectorAll(".dashboard-advanced-only").forEach((el) => {
    el.classList.toggle("hidden", isSimplify);
  });

  if (kpiGrid) {
    kpiGrid.className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5";
  }

  if (!isSimplify) {
    toggleQuickNav(state.quickNavCollapsed);
    setTimeout(updateQuickNavScrollSpy, 100);
  }

  setTimeout(() => {
    if (state.activeCharts.main && typeof state.activeCharts.main.resize === "function") {
      state.activeCharts.main.resize();
    }
  }, 50);
}

export function setDashboardMode(mode) {
  state.dashboardMode = mode;
  applyDashboardModeLayout(mode);

  if (state.aggregatedResults) {
    if (mode === "simplified") {
      renderSimplifiedInsights();
      renderSimplifiedAgeTable();
    } else {
      renderAgeGroupSmallMultiples();
      renderSexChart();
      renderAgeSexTables();
      renderICDCompositionChart();
      renderJVsNonJChart();
      renderSeasonalPanel();
      renderDemographicsPanel();
      renderFooterMetadata();
    }
  }
}

function renderSimplifiedInsights() {
  if (!state.aggregatedResults) return;

  const k = state.aggregatedResults.kpis;
  const ageSummary = state.aggregatedResults.ageGroupsSummary || [];
  const isTh = state.lang === "th";
  const ratePer100 = k.eligibleAdmissions > 0 ? (k.estimatedSARITotal / k.eligibleAdmissions) * 100 : 0;

  // Insight 1: SARI Burden & Overall Rate
  const insight1El = document.getElementById("simplified-insight-1");
  if (insight1El) {
    if (isTh) {
      insight1El.innerHTML = `
        พบผู้ป่วยประมาณการ SARI ทั้งหมด <strong class="text-white text-base">${k.estimatedSARITotal.toFixed(1)}</strong> ราย 
        คิดเป็นอัตราความชุก <strong class="text-emerald-200 text-base">${ratePer100.toFixed(1)} ต่อ 100 การรับรักษา</strong> 
        ที่เข้าเกณฑ์แบบจำลองการศึกษา (${k.eligibleAdmissions.toLocaleString()} ราย จากทั้งหมด ${k.totalUploaded.toLocaleString()} ราย) 
        สะท้อนภาระโรคทางเดินหายใจเฉียบพลันรุนแรงที่แท้จริงในพื้นที่
      `;
    } else {
      insight1El.innerHTML = `
        Estimated <strong class="text-white text-base">${k.estimatedSARITotal.toFixed(1)}</strong> total SARI cases, 
        representing an overall rate of <strong class="text-emerald-200 text-base">${ratePer100.toFixed(1)} per 100 eligible admissions</strong> 
        (${k.eligibleAdmissions.toLocaleString()} study-eligible of ${k.totalUploaded.toLocaleString()} total admissions). 
        Captures the true facility burden beyond routine diagnostic coding.
      `;
    }
  }

  // Insight 2: Non-J Diagnoses Impact
  const insight2El = document.getElementById("simplified-insight-2");
  if (insight2El) {
    const nonJPct = k.pctEstimatedSARIFromNonJ || 0;
    const nonJCases = k.estimatedSARINonJCode || 0;
    const ratioApprox = nonJPct > 0 ? Math.round(100 / nonJPct) : 0;
    const ratioTextTh = ratioApprox > 0 ? `(เกือบ 1 ในทุกๆ ${ratioApprox} ราย)` : "";
    const ratioTextEn = ratioApprox > 0 ? `(~1 in every ${ratioApprox} cases)` : "";

    if (isTh) {
      insight2El.innerHTML = `
        ผู้ป่วย SARI ถึง <strong class="text-teal-200 text-base">${nonJPct.toFixed(1)}%</strong> (${nonJCases.toFixed(1)} ราย) 
        ${ratioTextTh} ได้รับการวินิจฉัยหลักด้วย <strong class="text-white">รหัสโรคนอกกลุ่ม J</strong> 
        (เช่น Sepsis, ไข้ไม่ทราบสาเหตุ หรือโรคระบบไหลเวียนโลหิต) 
        การเฝ้าระวังเฉพาะกลุ่มรหัส J เพียงอย่างเดียวจะทำให้พลาดผู้ป่วย SARI จำนวนมาก
      `;
    } else {
      insight2El.innerHTML = `
        <strong class="text-teal-200 text-base">${nonJPct.toFixed(1)}%</strong> (${nonJCases.toFixed(1)} cases) 
        ${ratioTextEn} of estimated SARI patients presented under <strong class="text-white">non-J ICD-10 diagnostic codes</strong> 
        (such as sepsis, pyrexia, or circulatory disease). Relying solely on J-codes misses a critical fraction of SARI admissions.
      `;
    }
  }

  // Insight 3: Vulnerable Cohorts
  const insight3El = document.getElementById("simplified-insight-3");
  if (insight3El) {
    if (ageSummary.length > 0) {
      const sortedBySARI = [...ageSummary].sort((a, b) => b.estimatedSARI - a.estimatedSARI);
      const topBurden = sortedBySARI[0];

      const sortedByRate = [...ageSummary].map((g) => ({
        ...g,
        rate: g.eligibleAdmissions > 0 ? (g.estimatedSARI / g.eligibleAdmissions) * 100 : 0
      })).sort((a, b) => b.rate - a.rate);
      const topRate = sortedByRate[0];

      const topBurdenLabel = isTh ? topBurden.labelTh : topBurden.labelEn;
      const topRateLabel = isTh ? topRate.labelTh : topRate.labelEn;

      if (isTh) {
        insight3El.innerHTML = `
          กลุ่มอายุที่มีภาระโรค SARI สูงสุดคือ <strong class="text-amber-200 text-base">${topBurdenLabel}</strong> 
          (${topBurden.estimatedSARI.toFixed(1)} ราย, ${topBurden.estimatedSARIPct.toFixed(1)}% ของ SARI ทั้งหมด) 
          และกลุ่มที่มีอัตราป่วยสูงสุดคือ <strong class="text-amber-200 text-base">${topRateLabel}</strong> 
          (${topRate.rate.toFixed(1)} ต่อ 100 การรับรักษา) 
          เป็นกลุ่มเป้าหมายลำดับแรกในการจัดสรรเตียงและวัคซีน
        `;
      } else {
        insight3El.innerHTML = `
          Highest volume burden is concentrated in age <strong class="text-amber-200 text-base">${topBurdenLabel}</strong> 
          (${topBurden.estimatedSARI.toFixed(1)} cases, ${topBurden.estimatedSARIPct.toFixed(1)}% of total SARI), 
          while highest clinical rate is in <strong class="text-amber-200 text-base">${topRateLabel}</strong> 
          (${topRate.rate.toFixed(1)} per 100 admissions), prioritizing these cohorts for preventive interventions.
        `;
      }
    } else {
      insight3El.textContent = isTh ? "ไม่มีข้อมูลกลุ่มอายุ" : "No age-group distribution available";
    }
  }
}

function renderSimplifiedAgeTable() {
  const container = document.getElementById("simplified-age-table-container");
  if (!container || !state.aggregatedResults) return;

  const ageSummary = state.aggregatedResults.ageGroupsSummary || [];
  const isTh = state.lang === "th";
  const k = state.aggregatedResults.kpis;

  let maxRate = 0;
  ageSummary.forEach((g) => {
    const rate = g.eligibleAdmissions > 0 ? (g.estimatedSARI / g.eligibleAdmissions) * 100 : 0;
    if (rate > maxRate) maxRate = rate;
  });
  if (maxRate <= 0) maxRate = 1;

  const rows = ageSummary.map((g) => {
    const ratePer100 = g.eligibleAdmissions > 0 ? (g.estimatedSARI / g.eligibleAdmissions) * 100 : 0;
    const barPct = Math.min(100, Math.round((ratePer100 / maxRate) * 100));
    const label = isTh ? g.labelTh : g.labelEn;

    return `
      <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
        <td class="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
          <span>${label}</span>
        </td>
        <td class="py-3 px-4 text-right font-medium text-slate-700">
          ${g.eligibleAdmissions.toLocaleString()} 
          <span class="text-xs text-slate-400">(${g.eligiblePct.toFixed(1)}%)</span>
        </td>
        <td class="py-3 px-4 text-right font-bold text-emerald-800">
          ${g.estimatedSARI.toFixed(1)}
          <span class="text-xs text-emerald-600/70 font-normal">(${g.estimatedSARIPct.toFixed(1)}%)</span>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-3">
            <div class="w-24 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200 hidden sm:block">
              <div class="bg-gradient-to-r from-emerald-500 to-teal-600 h-2 rounded-full" style="width: ${barPct}%"></div>
            </div>
            <span class="font-bold text-slate-900 font-mono text-sm w-12 text-right">${ratePer100.toFixed(1)}</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const overallRate = k.eligibleAdmissions > 0 ? (k.estimatedSARITotal / k.eligibleAdmissions) * 100 : 0;

  const html = `
    <table class="w-full text-left border-collapse text-sm">
      <thead>
        <tr class="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
          <th class="py-3 px-4 uppercase tracking-wider text-xs">${t("colAgeGroup")}</th>
          <th class="py-3 px-4 text-right uppercase tracking-wider text-xs">${t("colEligibleAdmissionsShort")}</th>
          <th class="py-3 px-4 text-right uppercase tracking-wider text-xs">${t("colEstimatedSARIShort")}</th>
          <th class="py-3 px-4 text-right uppercase tracking-wider text-xs">${t("colRatePer100")}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr class="bg-emerald-50/80 font-bold text-emerald-950 border-t-2 border-emerald-500">
          <td class="py-3.5 px-4">${isTh ? "รวมทั้งหมด (Total Eligible)" : "Total (All Ages)"}</td>
          <td class="py-3.5 px-4 text-right">${k.eligibleAdmissions.toLocaleString()} (100.0%)</td>
          <td class="py-3.5 px-4 text-right text-emerald-800 font-black">${k.estimatedSARITotal.toFixed(1)} (100.0%)</td>
          <td class="py-3.5 px-4 text-right">
            <div class="flex items-center justify-end gap-3">
              <div class="w-24 bg-emerald-200/60 rounded-full h-2 overflow-hidden hidden sm:block">
                <div class="bg-emerald-700 h-2 rounded-full" style="width: ${Math.min(100, Math.round((overallRate / maxRate) * 100))}%"></div>
              </div>
              <span class="font-black text-emerald-950 font-mono text-sm w-12 text-right">${overallRate.toFixed(1)}</span>
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
  `;

  container.innerHTML = html;
}

function renderActiveModelBadge() {
  const badgeEl = document.getElementById("active-model-badge");
  const descEl = document.getElementById("active-model-desc");
  if (!badgeEl || !state.processedDataset) return;

  const dq = state.processedDataset.qualitySummary;
  let modelText = "";
  let tooltipText = "";

  if (dq.model2UsedCount > 0 && dq.model1UsedCount === 0) {
    modelText = "Model 2 (ICD-10 + age + sex + season)";
    tooltipText = t("tooltipModel2");
  } else if (dq.model1UsedCount > 0 && dq.model2UsedCount === 0) {
    modelText = "Model 1 (ICD-10 category only)";
    tooltipText = t("tooltipModel1");
  } else {
    modelText = `Model 2 (${dq.model2UsedCount.toLocaleString()}) & Model 1 (${dq.model1UsedCount.toLocaleString()})`;
    tooltipText = t("modelUsedDescAuto");
  }

  badgeEl.textContent = modelText;
  if (descEl) descEl.textContent = tooltipText;
}

export function renderKPICards() {
  const k = state.aggregatedResults.kpis;
  const isFull = state.settings.fullPrecision;
  const decimals = isFull ? 4 : 1;

  const setCard = (valId, subId, numericVal, subVal, isDecimal = false) => {
    animateValue(valId, numericVal, isDecimal, decimals);
    const s = document.getElementById(subId);
    if (s) s.textContent = subVal;
  };

  setCard("kpi-total-val", "kpi-total-sub", k.totalFiltered, `${state.lang === "th" ? "จากทั้งหมด" : "of"} ${k.totalUploaded.toLocaleString()} ${state.lang === "th" ? "รายการ" : "rows"}`, false);
  setCard("kpi-eligible-val", "kpi-eligible-sub", k.eligibleAdmissions, `${k.eligiblePercent.toFixed(1)}% ${state.lang === "th" ? "ของการรับรักษา" : "of admissions"}`, false);
  setCard("kpi-sari-val", "kpi-sari-sub", k.estimatedSARITotal, `${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} ${state.lang === "th" ? "ต่อ 100 การรับรักษา" : "per 100 eligible"}`, true);
  setCard("kpi-jcodes-val", "kpi-jcodes-sub", k.studyJCodeAdmissions, `${k.pctJCodeAdmissions.toFixed(1)}% ${state.lang === "th" ? "ของการรับรักษาเข้าเกณฑ์" : "of eligible"}`, false);
  setCard("kpi-sari-j-val", "kpi-sari-j-sub", k.estimatedSARIJCode, `${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}% ${state.lang === "th" ? "ของ SARI ประมาณการ" : "of estimated SARI"}`, true);
  setCard("kpi-sari-nonj-val", "kpi-sari-nonj-sub", k.estimatedSARINonJCode, `${k.pctEstimatedSARIFromNonJ.toFixed(1)}% ${state.lang === "th" ? "ของ SARI ทั้งหมด" : "of total SARI"}`, true);
}

export function setForecastEnabled(enabled) {
  state.chartPreferences.forecastEnabled = !!enabled;
  renderMainTimeSeriesChart();
}

export function setForecastHorizon(horizon) {
  state.chartPreferences.forecastHorizon = horizon || "auto";
  renderMainTimeSeriesChart();
}

export function setMainIcdSubgroup(subgroup) {
  state.chartPreferences.mainIcdSubgroup = subgroup || "all";
  renderMainTimeSeriesChart();
}

export function renderMainTimeSeriesChart() {
  if (typeof document === "undefined") return;
  const canvas = document.getElementById("chart-main-timeseries");
  if (!canvas || typeof Chart === "undefined") return;

  const isWeekly = state.chartPreferences.timeAggregation === "weekly";
  const series = isWeekly ? state.aggregatedResults.weeklySeries : state.aggregatedResults.monthlySeries;
  const N = series.length;

  const labels = series.map((s) => (state.lang === "th" && s.labelTh ? s.labelTh : s.labelEn || s.label));
  const eligibleData = series.map((s) => s.totalEligible);
  const jCodeData = series.map((s) => s.studyJCodes);
  const sariData = series.map((s) => Number(s.estimatedSARI.toFixed(2)));

  const datasets = [];
  const vis = state.chartPreferences.mainSeriesVisible || { eligible: true, jcodes: true, sari: true, subgroup: true, forecast: true };

  const chkEligible = document.getElementById("toggle-line-eligible");
  const chkJcodes = document.getElementById("toggle-line-jcodes");
  const chkSari = document.getElementById("toggle-line-sari");
  const chkSariJ = document.getElementById("toggle-line-sari-j");
  const chkSariNonJ = document.getElementById("toggle-line-sari-nonj");
  const chkSubgroup = document.getElementById("toggle-line-subgroup");
  const selectSubgroupElem = document.getElementById("select-main-icd-subgroup");
  const pillElem = document.getElementById("main-subgroup-stat-pill");
  const containerToggleSubgroup = document.getElementById("container-toggle-subgroup");
  const labelSubgroupLine = document.getElementById("label-subgroup-line-text");

  // Forecast DOM elements
  const isForecastActive = state.chartPreferences.forecastEnabled === true;
  const chkForecastEnable = document.getElementById("toggle-forecast-enable");
  const containerForecastHorizon = document.getElementById("container-forecast-horizon");
  const selectForecastHorizon = document.getElementById("select-forecast-horizon");
  const pillForecast = document.getElementById("forecast-stat-pill");
  const containerToggleForecast = document.getElementById("container-toggle-forecast");
  const chkLineForecast = document.getElementById("toggle-line-forecast");

  if (chkEligible) chkEligible.checked = vis.eligible !== false;
  if (chkJcodes) chkJcodes.checked = vis.jcodes !== false;
  if (chkSari) chkSari.checked = vis.sari !== false;
  if (chkSariJ) chkSariJ.checked = vis.sariJ === true;
  if (chkSariNonJ) chkSariNonJ.checked = vis.sariNonJ === true;
  if (chkSubgroup) chkSubgroup.checked = vis.subgroup !== false;
  if (chkForecastEnable) chkForecastEnable.checked = isForecastActive;
  if (selectForecastHorizon) {
    selectForecastHorizon.value = state.chartPreferences.forecastHorizon || "auto";
    const isTh = state.lang === "th";
    const optAuto = selectForecastHorizon.querySelector('option[value="auto"]');
    const opt6m = selectForecastHorizon.querySelector('option[value="6m"]');
    const opt1y = selectForecastHorizon.querySelector('option[value="1y"]');
    const opt2y = selectForecastHorizon.querySelector('option[value="2y"]');
    if (isWeekly) {
      if (optAuto) optAuto.textContent = isTh ? `เท่ากับข้อมูลจริง (Auto: ${N} สัปดาห์)` : `Historical Span (Auto: ${N} wks)`;
      if (opt6m) opt6m.textContent = isTh ? "26 สัปดาห์ (~6 เดือน)" : "26 Weeks (~6 Months)";
      if (opt1y) opt1y.textContent = isTh ? "52 สัปดาห์ (~1 ปี)" : "52 Weeks (~1 Year)";
      if (opt2y) opt2y.textContent = isTh ? "104 สัปดาห์ (~2 ปี)" : "104 Weeks (~2 Years)";
    } else {
      if (optAuto) optAuto.textContent = isTh ? `เท่ากับข้อมูลจริง (Auto: ${N} เดือน)` : `Historical Span (Auto: ${N} mos)`;
      if (opt6m) opt6m.textContent = isTh ? "6 เดือน (6 Months)" : "6 Months";
      if (opt1y) opt1y.textContent = isTh ? "12 เดือน (~1 ปี)" : "12 Months (~1 Year)";
      if (opt2y) opt2y.textContent = isTh ? "24 เดือน (~2 ปี)" : "24 Months (~2 Years)";
    }
  }
  if (chkLineForecast) chkLineForecast.checked = vis.forecast !== false;

  const selectedSubgroup = state.chartPreferences.mainIcdSubgroup || "all";
  if (selectSubgroupElem && selectSubgroupElem.value !== selectedSubgroup) {
    selectSubgroupElem.value = selectedSubgroup;
  }

  // Handle Subgroup Stat Pill and Visibility
  if (selectedSubgroup !== "all") {
    const totalSubgroupCount = series.reduce((acc, s) => acc + ((s.icdCounts && s.icdCounts[selectedSubgroup]) || 0), 0);
    const totalEligible = series.reduce((acc, s) => acc + (s.totalEligible || 0), 0);
    const pct = totalEligible > 0 ? ((totalSubgroupCount / totalEligible) * 100).toFixed(1) : "0.0";

    if (pillElem) {
      pillElem.classList.remove("hidden");
      pillElem.innerHTML = `<i class="fa-solid fa-filter text-amber-500"></i><span><strong>${selectedSubgroup}</strong>: ${totalSubgroupCount.toLocaleString()} ${state.lang === "th" ? "ราย" : "cases"} (${pct}% ${state.lang === "th" ? "ของการรับรักษาเข้าเกณฑ์" : "of eligible"}) &bull; <span class="text-amber-800 font-semibold underline underline-offset-2">${t("lineSubgroupAdmissions")}</span></span>`;
    }
    if (containerToggleSubgroup) {
      containerToggleSubgroup.classList.remove("hidden");
    }
    if (labelSubgroupLine) {
      labelSubgroupLine.textContent = `${selectedSubgroup} (Unweighted N)`;
    }
  } else {
    if (pillElem) pillElem.classList.add("hidden");
    if (containerToggleSubgroup) containerToggleSubgroup.classList.add("hidden");
  }

  // Handle Forecast Calculation
  let forecastResult = null;
  if (isForecastActive && N >= 3) {
    forecastResult = calculateSARIForecast({
      series,
      timeAggregation: state.chartPreferences.timeAggregation,
      horizonOption: state.chartPreferences.forecastHorizon || "auto"
    });
  }

  let futurePoints = [];
  let fullLabels = labels;
  let H = 0;

  if (isForecastActive && forecastResult) {
    futurePoints = forecastResult.forecastPoints.filter((p) => !p.isBridge);
    H = futurePoints.length;
    const futureLabels = futurePoints.map((p) => (state.lang === "th" && p.labelTh ? p.labelTh : p.labelEn));
    fullLabels = [...labels, ...futureLabels];

    if (containerForecastHorizon) containerForecastHorizon.classList.remove("hidden");
    if (pillForecast) {
      pillForecast.classList.remove("hidden");
      const sum = forecastResult.summary;
      const isTh = state.lang === "th";
      const dirIcon = sum.trendDirection === "increasing"
        ? "fa-arrow-trend-up text-rose-500"
        : (sum.trendDirection === "decreasing" ? "fa-arrow-trend-down text-emerald-600" : "fa-arrow-right text-slate-500");
      const dirText = sum.trendDirection === "increasing"
        ? (isTh ? "แนวโน้มเพิ่มขึ้น" : "Increasing")
        : (sum.trendDirection === "decreasing" ? (isTh ? "แนวโน้มลดลง" : "Decreasing") : (isTh ? "แนวโน้มทรงตัว" : "Stable"));
      const horizonText = isTh ? sum.horizonLabelTh : sum.horizonLabelEn;
      const periodUnit = isWeekly ? (isTh ? "สัปดาห์" : "wk") : (isTh ? "เดือน" : "mo");

      pillForecast.innerHTML = `
        <i class="fa-solid fa-wand-magic-sparkles text-purple-600"></i>
        <span>${t("forecastStatPrefix")} <strong>${horizonText}</strong>: 
        ประมาณการ SARI รวม <strong class="text-purple-900 font-bold">${sum.totalForecastSARI.toLocaleString()}</strong> ${isTh ? "ราย" : "cases"} 
        (เฉลี่ย ${sum.avgForecastPerPeriod.toLocaleString()} / ${periodUnit}) &bull; 
        <span class="inline-flex items-center gap-1 font-semibold text-purple-800"><i class="fa-solid ${dirIcon}"></i> ${dirText} (R&sup2; = ${sum.rSquared})</span> &bull; 
        <span class="text-purple-700 underline underline-offset-2">${isWeekly ? (isTh ? "โมเดล Simple OLS Trend ผสานรอบฤดูกาลรายสัปดาห์ (52 Epi-weeks)" : "Simple OLS Trend + 52-Week Seasonal Index") : (isTh ? "โมเดล Simple OLS Trend ผสานรอบฤดูกาลรายเดือน (12 Calendar Months)" : "Simple OLS Trend + 12-Month Seasonal Index")}</span></span>
      `;
    }
    if (containerToggleForecast) containerToggleForecast.classList.remove("hidden");
  } else {
    if (containerForecastHorizon) containerForecastHorizon.classList.add("hidden");
    if (pillForecast) pillForecast.classList.add("hidden");
    if (containerToggleForecast) containerToggleForecast.classList.add("hidden");
  }

  // Padding helper for historical series when forecast is active
  const padData = (dataArr) => (H > 0 ? [...dataArr, ...Array(H).fill(null)] : dataArr);

  if (vis.eligible) {
    datasets.push({
      label: t("seriesEligibleAdmissions"),
      data: padData(eligibleData),
      borderColor: "#64748b",
      backgroundColor: "#64748b",
      borderWidth: 2,
      pointRadius: series.length > 50 ? 0 : 2.5,
      tension: 0.1
    });
  }

  if (vis.jcodes) {
    datasets.push({
      label: t("seriesJCodeAdmissions"),
      data: padData(jCodeData),
      borderColor: "#2563eb",
      backgroundColor: "#2563eb",
      borderWidth: 2,
      pointRadius: series.length > 50 ? 0 : 2.5,
      tension: 0.1
    });
  }

  const themeColors = AVAILABLE_THEMES[state.theme] || AVAILABLE_THEMES.emerald;
  const isDark = state.theme === "midnight";

  if (vis.sari) {
    datasets.push({
      label: t("seriesEstimatedSARI"),
      data: padData(sariData),
      borderColor: themeColors.primary,
      backgroundColor: themeColors.primaryLight,
      borderWidth: 3,
      pointRadius: series.length > 50 ? 1 : 3.5,
      fill: true,
      tension: 0.15
    });
  }

  // Decomposed SARI from J-codes Line
  if (vis.sariJ) {
    const sariJData = series.map((s) => Number((s.estimatedSARIJ || 0).toFixed(2)));
    datasets.push({
      label: t("lineSARIFromJ"),
      data: padData(sariJData),
      borderColor: "#06b6d4", // Cyan 500
      backgroundColor: "#06b6d4",
      borderWidth: 2.5,
      borderDash: [4, 3],
      pointRadius: series.length > 50 ? 1 : 3,
      tension: 0.12
    });
  }

  // Decomposed SARI from Non-J Line
  if (vis.sariNonJ) {
    const sariNonJData = series.map((s) => Number((s.estimatedSARINonJ || 0).toFixed(2)));
    datasets.push({
      label: t("lineSARIFromNonJ"),
      data: padData(sariNonJData),
      borderColor: "#14b8a6", // Teal 500
      backgroundColor: "#14b8a6",
      borderWidth: 2.5,
      borderDash: [4, 3],
      pointRadius: series.length > 50 ? 1 : 3,
      tension: 0.12
    });
  }

  // Selected ICD-10 Subgroup Line (Raw unweighted admissions count)
  if (selectedSubgroup !== "all" && vis.subgroup !== false) {
    const subgroupData = series.map((s) => (s.icdCounts && s.icdCounts[selectedSubgroup]) || 0);
    datasets.push({
      label: `${selectedSubgroup} (${t("lineSubgroupAdmissions")})`,
      data: padData(subgroupData),
      borderColor: "#f59e0b",
      backgroundColor: "#f59e0b",
      borderWidth: 2.5,
      borderDash: [5, 4],
      pointStyle: "triangle",
      pointRadius: series.length > 50 ? 2 : 4,
      pointHoverRadius: 6,
      tension: 0.1
    });
  }

  // Forecast Series (Purple / Violet)
  if (isForecastActive && forecastResult && vis.forecast !== false) {
    const lastSariVal = Number(series[N - 1].estimatedSARI.toFixed(2));
    const forecastLineData = [...Array(N - 1).fill(null), lastSariVal, ...futurePoints.map((p) => p.predictedSARI)];
    const forecastUpperData = [...Array(N - 1).fill(null), lastSariVal, ...futurePoints.map((p) => p.upperCI)];
    const forecastLowerData = [...Array(N - 1).fill(null), lastSariVal, ...futurePoints.map((p) => p.lowerCI)];

    // Prediction Interval Band (Upper + Lower fill)
    datasets.push({
      label: state.lang === "th" ? "ขอบเขตบน 95% CI (Upper Bound)" : "95% Prediction Upper",
      data: forecastUpperData,
      borderColor: "rgba(139, 92, 246, 0.35)",
      backgroundColor: "rgba(139, 92, 246, 0.10)",
      fill: "+1",
      borderWidth: 1,
      borderDash: [2, 2],
      pointRadius: 0,
      tension: 0.2
    });

    datasets.push({
      label: state.lang === "th" ? "ขอบเขตล่าง 95% CI (Lower Bound)" : "95% Prediction Lower",
      data: forecastLowerData,
      borderColor: "rgba(139, 92, 246, 0.35)",
      backgroundColor: "transparent",
      fill: false,
      borderWidth: 1,
      borderDash: [2, 2],
      pointRadius: 0,
      tension: 0.2
    });

    // Main Forecast Line
    datasets.push({
      label: t("lineForecastLabel"),
      data: forecastLineData,
      borderColor: "#8b5cf6", // Purple 500
      backgroundColor: "#8b5cf6",
      borderWidth: 3,
      borderDash: [6, 4],
      pointStyle: "circle",
      pointRadius: futurePoints.length > 50 ? 1 : 3.5,
      pointHoverRadius: 6,
      tension: 0.2
    });
  }

  if (state.activeCharts.main) {
    state.activeCharts.main.destroy();
  }

  const ctx = canvas.getContext("2d");
  state.activeCharts.main = new Chart(ctx, {
    type: "line",
    data: {
      labels: fullLabels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: state.motionEnabled ? { duration: 850, easing: "easeOutQuart" } : false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: {
            font: { family: "Sarabun, Inter, sans-serif", size: 12 },
            usePointStyle: true,
            color: isDark ? "#e2e8f0" : "#334155"
          }
        },
        tooltip: {
          callbacks: {
            afterBody: (context) => {
              const idx = context[0].dataIndex;
              if (idx < N) {
                // Historical point
                const item = series[idx];
                if (!item) return "";
                const nonJ = item.estimatedSARINonJ ? item.estimatedSARINonJ.toFixed(1) : "0.0";
                const jSari = item.estimatedSARIJ ? item.estimatedSARIJ.toFixed(1) : "0.0";
                const lines = [
                  "-----------------------",
                  `SARI from J-codes: ${jSari}`,
                  `SARI from Non-J: ${nonJ}`
                ];
                if (selectedSubgroup !== "all") {
                  const subCount = (item.icdCounts && item.icdCounts[selectedSubgroup]) || 0;
                  lines.push(`${selectedSubgroup} (Unweighted N): ${subCount}`);
                }
                return lines;
              } else if (forecastResult && futurePoints.length > 0) {
                // Future forecast point
                const futIdx = idx - N;
                const pt = futurePoints[futIdx];
                if (!pt) return "";
                const isTh = state.lang === "th";
                return [
                  "-----------------------",
                  `${isTh ? "SARI พยากรณ์ล่วงหน้า" : "Forecasted SARI"}: ${pt.predictedSARI}`,
                  `95% CI: ${pt.lowerCI} – ${pt.upperCI}`,
                  `${isTh ? "แบบจำลอง" : "Model"}: OLS Trend + ${isWeekly ? `Weekly Seasonal Index (Epi-week ${pt.weekNumber})` : `Monthly Seasonal Index (Month ${pt.month})`}`
                ];
              }
              return "";
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            maxRotation: 45,
            maxTicksLimit: 20,
            color: isDark ? "#94a3b8" : "#64748b"
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
          ticks: { color: isDark ? "#94a3b8" : "#64748b" }
        }
      }
    }
  });
}

function renderAgeGroupSmallMultiples() {
  const container = document.getElementById("age-small-multiples-container");
  if (!container || typeof Chart === "undefined") return;

  container.innerHTML = "";
  const groups = state.aggregatedResults.ageGroupsSummary;
  const sharedY = state.chartPreferences.smallMultiplesSharedY;
  const overlayJ = state.chartPreferences.overlayJCodes;

  let globalMax = 0;
  if (sharedY) {
    for (const g of groups) {
      for (const w of g.weeklySeries) {
        if (w.estimatedSARI > globalMax) globalMax = w.estimatedSARI;
        if (overlayJ && w.studyJCodes > globalMax) globalMax = w.studyJCodes;
      }
    }
    globalMax = Math.ceil(globalMax * 1.15) || 5;
  }

  if (state.activeCharts.smallMultiples) {
    state.activeCharts.smallMultiples.forEach((c) => c.destroy());
  }
  state.activeCharts.smallMultiples = [];

  groups.forEach((g, idx) => {
    const card = document.createElement("div");
    card.className = "bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col";

    const title = state.lang === "th" ? g.labelTh : g.labelEn;
    const totalSARI = g.estimatedSARI.toFixed(1);
    const totalElig = g.eligibleAdmissions.toLocaleString();

    card.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          ${title}
        </h4>
        <span class="text-xs font-mono text-slate-500">
          SARI: <strong class="text-rose-600">${totalSARI}</strong> | N: ${totalElig}
        </span>
      </div>
      <div class="relative w-full h-36">
        <canvas id="sm-chart-${idx}"></canvas>
      </div>
    `;
    container.appendChild(card);

    const canvas = card.querySelector(`#sm-chart-${idx}`);
    const ctx = canvas.getContext("2d");

    const labels = g.weeklySeries.map((w) => w.label);
    const sariData = g.weeklySeries.map((w) => Number(w.estimatedSARI.toFixed(2)));
    const jData = g.weeklySeries.map((w) => w.studyJCodes);

    const themeColors = AVAILABLE_THEMES[state.theme] || AVAILABLE_THEMES.emerald;
    const isDark = state.theme === "midnight";

    const datasets = [
      {
        label: "Estimated SARI",
        data: sariData,
        borderColor: themeColors.primary,
        backgroundColor: themeColors.primaryLight,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.15
      }
    ];

    if (overlayJ) {
      datasets.push({
        label: "Study J-codes",
        data: jData,
        borderColor: "#2563eb",
        borderWidth: 1.5,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.1
      });
    }

    const chartInstance = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: state.motionEnabled ? { duration: 750, easing: "easeOutQuart" } : false,
        plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
        scales: {
          x: {
            display: idx >= 3,
            ticks: {
              maxTicksLimit: 6,
              font: { size: 10 },
              color: isDark ? "#94a3b8" : "#64748b"
            }
          },
          y: {
            beginAtZero: true,
            max: sharedY ? globalMax : undefined,
            grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
            ticks: {
              font: { size: 10 },
              maxTicksLimit: 4,
              color: isDark ? "#94a3b8" : "#64748b"
            }
          }
        }
      }
    });

    state.activeCharts.smallMultiples.push(chartInstance);
  });
}

function renderSexChart() {
  const container = document.getElementById("sex-chart-container");
  if (!container || typeof Chart === "undefined") return;

  const isSplit = state.chartPreferences.sexLayout === "split";
  const isDark = state.theme === "midnight";
  const series = state.aggregatedResults.weeklySeries;
  const labels = series.map((s) => s.label);

  const maleData = series.map((s) => Number(s.maleSARI.toFixed(2)));
  const femaleData = series.map((s) => Number(s.femaleSARI.toFixed(2)));

  if (state.activeCharts.sexCombined) state.activeCharts.sexCombined.destroy();
  if (state.activeCharts.sexMale) state.activeCharts.sexMale.destroy();
  if (state.activeCharts.sexFemale) state.activeCharts.sexFemale.destroy();

  if (!isSplit) {
    container.innerHTML = `<div class="relative w-full h-64"><canvas id="chart-sex-canvas"></canvas></div>`;
    const ctx = document.getElementById("chart-sex-canvas").getContext("2d");

    state.activeCharts.sexCombined = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: state.lang === "th" ? "เพศชาย (Male)" : "Male",
            data: maleData,
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.1)",
            borderWidth: 2.5,
            pointRadius: series.length > 50 ? 0 : 2,
            tension: 0.15
          },
          {
            label: state.lang === "th" ? "เพศหญิง (Female)" : "Female",
            data: femaleData,
            borderColor: "#9333ea",
            backgroundColor: "rgba(147, 51, 234, 0.1)",
            borderWidth: 2.5,
            pointRadius: series.length > 50 ? 0 : 2,
            tension: 0.15
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              color: isDark ? "#e2e8f0" : "#334155"
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 12,
              color: isDark ? "#94a3b8" : "#64748b"
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
            ticks: { color: isDark ? "#94a3b8" : "#64748b" }
          }
        }
      }
    });
  } else {
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h5 class="text-xs font-bold text-sky-800 mb-1.5 flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-sky-600"></span> ${state.lang === "th" ? "เพศชาย" : "Male"}
          </h5>
          <div class="relative w-full h-56"><canvas id="chart-sex-male"></canvas></div>
        </div>
        <div>
          <h5 class="text-xs font-bold text-purple-800 mb-1.5 flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-purple-600"></span> ${state.lang === "th" ? "เพศหญิง" : "Female"}
          </h5>
          <div class="relative w-full h-56"><canvas id="chart-sex-female"></canvas></div>
        </div>
      </div>
    `;

    const ctxM = document.getElementById("chart-sex-male").getContext("2d");
    state.activeCharts.sexMale = new Chart(ctxM, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Male",
          data: maleData,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.15)",
          fill: true,
          borderWidth: 2,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, color: isDark ? "#94a3b8" : "#64748b" } },
          y: {
            beginAtZero: true,
            grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
            ticks: { color: isDark ? "#94a3b8" : "#64748b" }
          }
        }
      }
    });

    const ctxF = document.getElementById("chart-sex-female").getContext("2d");
    state.activeCharts.sexFemale = new Chart(ctxF, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Female",
          data: femaleData,
          borderColor: "#9333ea",
          backgroundColor: "rgba(147, 51, 234, 0.15)",
          fill: true,
          borderWidth: 2,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, color: isDark ? "#94a3b8" : "#64748b" } },
          y: {
            beginAtZero: true,
            grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
            ticks: { color: isDark ? "#94a3b8" : "#64748b" }
          }
        }
      }
    });
  }
}

function renderAgeSexTables() {
  const descContainer = document.getElementById("age-sex-descriptive-table-container");
  const sariContainer = document.getElementById("age-sex-sari-table-container");
  if (!descContainer || !sariContainer) return;

  const tableData = state.aggregatedResults.ageSexTable;
  const isRowPct = state.chartPreferences.pctType === "row";
  const isFull = state.settings.fullPrecision;
  const fmt = (num) => (isFull ? num.toFixed(3) : num.toFixed(1));

  let descHtml = `
    <table class="min-w-full text-xs text-left border border-slate-200 divide-y divide-slate-200">
      <thead class="bg-slate-100 text-slate-700 font-semibold">
        <tr>
          <th class="px-3 py-2 border-r">${t("colAgeGroup")}</th>
          <th class="px-3 py-2 border-r text-right">${t("colMale")} n (%)</th>
          <th class="px-3 py-2 border-r text-right">${t("colFemale")} n (%)</th>
          <th class="px-3 py-2 text-right">${t("colTotal")} n (%)</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white">
  `;

  let totalMale = 0, totalFemale = 0, totalAll = 0;

  tableData.forEach((row) => {
    totalMale += row.maleCount;
    totalFemale += row.femaleCount;
    totalAll += row.totalCount;

    const mPct = isRowPct ? row.malePctRow : row.malePctOverall;
    const fPct = isRowPct ? row.femalePctRow : row.femalePctOverall;
    const tPct = row.totalPctOverall;

    descHtml += `
      <tr class="hover:bg-slate-50">
        <td class="px-3 py-2 border-r font-medium text-slate-800">${state.lang === "th" ? row.ageGroupLabelTh : row.ageGroupLabelEn}</td>
        <td class="px-3 py-2 border-r text-right font-mono">${row.maleCount.toLocaleString()} (${mPct.toFixed(1)}%)</td>
        <td class="px-3 py-2 border-r text-right font-mono">${row.femaleCount.toLocaleString()} (${fPct.toFixed(1)}%)</td>
        <td class="px-3 py-2 text-right font-mono font-medium">${row.totalCount.toLocaleString()} (${tPct.toFixed(1)}%)</td>
      </tr>
    `;
  });

  const totMPct = totalAll > 0 ? (totalMale / totalAll) * 100 : 0;
  const totFPct = totalAll > 0 ? (totalFemale / totalAll) * 100 : 0;

  descHtml += `
      <tr class="bg-slate-100/70 font-semibold border-t-2 border-slate-300">
        <td class="px-3 py-2 border-r text-slate-900">${t("colTotal")}</td>
        <td class="px-3 py-2 border-r text-right font-mono">${totalMale.toLocaleString()} (${totMPct.toFixed(1)}%)</td>
        <td class="px-3 py-2 border-r text-right font-mono">${totalFemale.toLocaleString()} (${totFPct.toFixed(1)}%)</td>
        <td class="px-3 py-2 text-right font-mono">${totalAll.toLocaleString()} (100.0%)</td>
      </tr>
    </tbody>
  </table>`;
  descContainer.innerHTML = descHtml;

  let sariHtml = `
    <table class="min-w-full text-xs text-left border border-slate-200 divide-y divide-slate-200">
      <thead class="bg-slate-100 text-slate-700 font-semibold">
        <tr>
          <th class="px-3 py-2 border-r">${t("colAgeGroup")}</th>
          <th class="px-3 py-2 border-r text-right text-sky-800">${t("colMale")} ${state.lang === "th" ? "SARI ประมาณการ" : "Estimated SARI"}</th>
          <th class="px-3 py-2 border-r text-right text-purple-800">${t("colFemale")} ${state.lang === "th" ? "SARI ประมาณการ" : "Estimated SARI"}</th>
          <th class="px-3 py-2 text-right text-rose-800">${t("colTotal")} ${state.lang === "th" ? "SARI ประมาณการ" : "Estimated SARI"}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white">
  `;

  let totSARIMale = 0, totSARIFemale = 0, totSARIAll = 0;

  tableData.forEach((row) => {
    totSARIMale += row.maleSARI;
    totSARIFemale += row.femaleSARI;
    totSARIAll += row.totalSARI;

    sariHtml += `
      <tr class="hover:bg-slate-50">
        <td class="px-3 py-2 border-r font-medium text-slate-800">${state.lang === "th" ? row.ageGroupLabelTh : row.ageGroupLabelEn}</td>
        <td class="px-3 py-2 border-r text-right font-mono text-sky-900">${fmt(row.maleSARI)}</td>
        <td class="px-3 py-2 border-r text-right font-mono text-purple-900">${fmt(row.femaleSARI)}</td>
        <td class="px-3 py-2 text-right font-mono font-bold text-rose-600">${fmt(row.totalSARI)}</td>
      </tr>
    `;
  });

  sariHtml += `
      <tr class="bg-rose-50/50 font-bold border-t-2 border-slate-300">
        <td class="px-3 py-2 border-r text-slate-900">${t("colTotal")}</td>
        <td class="px-3 py-2 border-r text-right font-mono text-sky-900">${fmt(totSARIMale)}</td>
        <td class="px-3 py-2 border-r text-right font-mono text-purple-900">${fmt(totSARIFemale)}</td>
        <td class="px-3 py-2 text-right font-mono text-rose-700 text-sm">${fmt(totSARIAll)}</td>
      </tr>
    </tbody>
  </table>
  <p class="text-[11px] text-slate-500 mt-2 italic">
    * ${t("tableEstimatedSARILabel")}
  </p>
  `;
  sariContainer.innerHTML = sariHtml;
}

function renderICDCompositionChart() {
  const canvas = document.getElementById("chart-icd-composition");
  if (!canvas || typeof Chart === "undefined") return;

  const isAdmissions = state.chartPreferences.icdMetric === "admissions";
  const items = state.aggregatedResults.icdComposition;
  const themeColors = AVAILABLE_THEMES[state.theme] || AVAILABLE_THEMES.emerald;
  const isDark = state.theme === "midnight";

  const labels = items.map((i) => i.category);
  const data = items.map((i) => isAdmissions ? i.admissions : Number(i.estimatedSARI.toFixed(2)));
  const bgColors = items.map((i) => (i.isStudyJCode ? themeColors.primary : themeColors.accent));

  if (state.activeCharts.icd) {
    state.activeCharts.icd.destroy();
  }

  const ctx = canvas.getContext("2d");
  state.activeCharts.icd = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: isAdmissions ? "Admissions" : "Estimated SARI",
        data,
        backgroundColor: bgColors,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: state.motionEnabled ? { duration: 800, easing: "easeOutQuart" } : false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              const idx = ctx.dataIndex;
              const item = items[idx];
              const pct = isAdmissions ? item.admissionsPct.toFixed(1) : item.estimatedSARIPct.toFixed(1);
              return `${isAdmissions ? "Admissions" : "Estimated SARI"}: ${val.toLocaleString()} (${pct}%)`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
          ticks: { color: isDark ? "#94a3b8" : "#64748b" }
        },
        y: {
          ticks: {
            font: { family: "Sarabun, Inter, sans-serif", size: 11 },
            color: isDark ? "#cbd5e1" : "#334155"
          }
        }
      }
    }
  });
}

function renderJVsNonJChart() {
  const canvas = document.getElementById("chart-j-vs-non-j");
  if (!canvas || typeof Chart === "undefined") return;

  const k = state.aggregatedResults.kpis;
  const themeColors = AVAILABLE_THEMES[state.theme] || AVAILABLE_THEMES.emerald;
  const isDark = state.theme === "midnight";

  const labels = [
    state.lang === "th" ? "การรับรักษาเข้าเกณฑ์ (Admissions)" : "Eligible Admissions",
    state.lang === "th" ? "SARI ประมาณการ (Estimated SARI)" : "Estimated SARI"
  ];

  const jPctAdmissions = k.pctJCodeAdmissions;
  const nonJPctAdmissions = 100 - jPctAdmissions;

  const jPctSARI = 100 - k.pctEstimatedSARIFromNonJ;
  const nonJPctSARI = k.pctEstimatedSARIFromNonJ;

  if (state.activeCharts.jVsNonJ) {
    state.activeCharts.jVsNonJ.destroy();
  }

  const ctx = canvas.getContext("2d");
  state.activeCharts.jVsNonJ = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: state.lang === "th" ? "รหัสกลุ่ม J ที่เข้าเกณฑ์ศึกษา" : "Study J-code Diagnoses",
          data: [Number(jPctAdmissions.toFixed(1)), Number(jPctSARI.toFixed(1))],
          backgroundColor: themeColors.primary,
          stack: "Stack 0"
        },
        {
          label: state.lang === "th" ? "รหัสอื่นๆ ที่เข้าเกณฑ์ศึกษา" : "Study Non-J Diagnoses",
          data: [Number(nonJPctAdmissions.toFixed(1)), Number(nonJPctSARI.toFixed(1))],
          backgroundColor: "#f59e0b",
          stack: "Stack 0"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: isDark ? "#94a3b8" : "#64748b" }
        },
        y: {
          stacked: true,
          max: 100,
          grid: { color: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9" },
          ticks: {
            color: isDark ? "#94a3b8" : "#64748b",
            callback: (v) => `${v}%`
          }
        }
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            color: isDark ? "#e2e8f0" : "#334155"
          }
        },
        tooltip: {
          callbacks: {
            afterBody: (ctxArr) => {
              const idx = ctxArr[0].dataIndex;
              if (idx === 0) {
                return [
                  `J-code N: ${k.studyJCodeAdmissions.toLocaleString()}`,
                  `Non-J N: ${k.studyNonJCodeAdmissions.toLocaleString()}`
                ];
              } else {
                return [
                  `J-code SARI: ${k.estimatedSARIJCode.toFixed(1)}`,
                  `Non-J SARI: ${k.estimatedSARINonJCode.toFixed(1)}`
                ];
              }
            }
          }
        }
      }
    }
  });
}

function renderSeasonalPanel() {
  const container = document.getElementById("seasonal-table-container");
  if (!container) return;

  const data = state.aggregatedResults.seasonalAnalysis;

  let html = `
    <table class="min-w-full text-xs text-left border border-slate-200 divide-y divide-slate-200">
      <thead class="bg-slate-100 text-slate-700 font-semibold">
        <tr>
          <th class="px-3 py-2 border-r">${t("colSeason")}</th>
          <th class="px-3 py-2 border-r text-right">${t("colEligibleCount")}</th>
          <th class="px-3 py-2 border-r text-right">${t("colSARIExpected")}</th>
          <th class="px-3 py-2 text-right">${t("colSARIPer100")}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 bg-white">
  `;

  data.forEach((s) => {
    html += `
      <tr class="hover:bg-slate-50">
        <td class="px-3 py-2 border-r font-medium text-slate-800">${state.lang === "th" ? s.labelTh : s.labelEn}</td>
        <td class="px-3 py-2 border-r text-right font-mono">${s.eligibleAdmissions.toLocaleString()}</td>
        <td class="px-3 py-2 border-r text-right font-mono font-medium text-rose-600">${s.estimatedSARI.toFixed(1)}</td>
        <td class="px-3 py-2 text-right font-mono font-bold text-slate-700">${s.sariPer100.toFixed(1)}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function renderDemographicsPanel() {
  const container = document.getElementById("demographics-content-container");
  if (!container) return;

  const d = state.aggregatedResults.demographics;

  container.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <span class="text-slate-500 block mb-0.5">${t("demogTotalN")}</span>
        <span class="text-base font-bold text-slate-800">${d.totalEligible.toLocaleString()}</span>
      </div>
      <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <span class="text-slate-500 block mb-0.5">${t("demogMedianIQR")}</span>
        <span class="text-base font-bold text-slate-800">${d.ageMedian !== null ? d.ageMedian.toFixed(1) : "-"} <span class="text-xs font-normal text-slate-500">(${d.ageQ25 !== null ? d.ageQ25.toFixed(1) : "-"}–${d.ageQ75 !== null ? d.ageQ75.toFixed(1) : "-"})</span></span>
      </div>
      <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <span class="text-slate-500 block mb-0.5">${t("demogMeanSD")}</span>
        <span class="text-base font-bold text-slate-800">${d.ageMean !== null ? d.ageMean.toFixed(1) : "-"} <span class="text-xs font-normal text-slate-500">± ${d.ageSD !== null ? d.ageSD.toFixed(1) : "-"}</span></span>
      </div>
      <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <span class="text-slate-500 block mb-0.5">${t("demogPediatric")} / ${t("demogAdult")}</span>
        <span class="text-base font-bold text-slate-800">${d.pediatricPct.toFixed(1)}% <span class="text-xs font-normal text-slate-500">/ ${d.adultPct.toFixed(1)}%</span></span>
      </div>
    </div>
  `;
}

function renderFooterMetadata() {
  const el = document.getElementById("analysis-metadata-footer");
  if (!el || !state.processedDataset) return;

  const dq = state.processedDataset.qualitySummary;
  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between text-xs text-slate-500 border-t border-slate-200 pt-4 gap-2">
      <div>
        <strong>App:</strong> SARI Surveillance Dashboard v1.0 |
        <strong>Model:</strong> ${MODEL_METADATA.version} |
        <strong>Week Def:</strong> ${state.settings.weekDefinition.toUpperCase()}
      </div>
      <div>
        <strong>Uploaded Rows:</strong> ${dq.totalUploaded.toLocaleString()} |
        <strong>Model-Eligible:</strong> ${dq.modelEligible.toLocaleString()} |
        <strong>Analysis Timestamp:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
      </div>
    </div>
  `;
}

function syncFilterInputs() {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal("filter-start-date", state.filters.startDate);
  setVal("filter-end-date", state.filters.endDate);
  setVal("filter-age-group", state.filters.ageGroup);
  setVal("filter-sex", state.filters.sex);
  setVal("filter-age-type", state.filters.ageType);
  setVal("filter-icd-group", state.filters.icdCategory);
  setVal("filter-j-status", state.filters.jCodeStatus);
}

function readFiltersFromDOM() {
  state.filters.startDate = document.getElementById("filter-start-date")?.value || "";
  state.filters.endDate = document.getElementById("filter-end-date")?.value || "";
  state.filters.ageGroup = document.getElementById("filter-age-group")?.value || "all";
  state.filters.sex = document.getElementById("filter-sex")?.value || "all";
  state.filters.ageType = document.getElementById("filter-age-type")?.value || "all";
  state.filters.icdCategory = document.getElementById("filter-icd-group")?.value || "all";
  state.filters.jCodeStatus = document.getElementById("filter-j-status")?.value || "all";
}

function updateTimeToggleStyles() {
  const isWeekly = state.chartPreferences.timeAggregation === "weekly";
  const btnW = document.getElementById("toggle-weekly");
  const btnM = document.getElementById("toggle-monthly");
  if (btnW && btnM) {
    btnW.className = isWeekly ? "px-3 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
    btnM.className = !isWeekly ? "px-3 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
  }
}

function updateSexToggleStyles() {
  const isComb = state.chartPreferences.sexLayout === "combined";
  const btnC = document.getElementById("toggle-sex-combined");
  const btnS = document.getElementById("toggle-sex-split");
  if (btnC && btnS) {
    btnC.className = isComb ? "px-2.5 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
    btnS.className = !isComb ? "px-2.5 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
  }
}

function updateTablePctToggleStyles() {
  const isOverall = state.chartPreferences.pctType === "overall";
  const btnO = document.getElementById("toggle-pct-overall");
  const btnR = document.getElementById("toggle-pct-row");
  if (btnO && btnR) {
    btnO.className = isOverall ? "px-2.5 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
    btnR.className = !isOverall ? "px-2.5 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
  }
}

function updateICDToggleStyles() {
  const isAdm = state.chartPreferences.icdMetric === "admissions";
  const btnA = document.getElementById("toggle-icd-admissions");
  const btnS = document.getElementById("toggle-icd-sari");
  if (btnA && btnS) {
    btnA.className = isAdm ? "px-2.5 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
    btnS.className = !isAdm ? "px-2.5 py-1 text-xs font-bold rounded bg-emerald-700 text-white shadow-xs" : "px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900";
  }
}

function openDataQualityModal() {
  const modal = document.getElementById("modal-data-quality");
  if (!modal || !state.processedDataset) return;

  const dq = state.processedDataset.qualitySummary;
  const problems = state.processedDataset.problemRows;

  document.getElementById("dq-val-valid").textContent = dq.modelEligible.toLocaleString();
  document.getElementById("dq-val-dates").textContent = dq.invalidDates.toLocaleString();
  document.getElementById("dq-val-missing-age").textContent = dq.missingAges.toLocaleString();
  document.getElementById("dq-val-invalid-age").textContent = dq.invalidAges.toLocaleString();
  document.getElementById("dq-val-missing-icd").textContent = dq.missingICD.toLocaleString();
  document.getElementById("dq-val-outside-scope").textContent = dq.outsideScopeICD.toLocaleString();
  document.getElementById("dq-val-sex").textContent = dq.unresolvedSex.toLocaleString();

  const tbody = document.getElementById("dq-problem-rows-tbody");
  if (tbody) {
    let rowsHtml = "";
    problems.slice(0, 30).forEach((p) => {
      rowsHtml += `
        <tr class="hover:bg-slate-50 text-xs">
          <td class="px-2.5 py-1.5 font-mono text-slate-400 border-r">${p.rowIndex}</td>
          <td class="px-2.5 py-1.5 font-mono border-r">${p.admitDate || "-"}</td>
          <td class="px-2.5 py-1.5 border-r">${p.age !== null ? p.age : (p.raw[state.columnMapping.ageCol] || "-")}</td>
          <td class="px-2.5 py-1.5 border-r">${p.sex || p.rawSex || "-"}</td>
          <td class="px-2.5 py-1.5 font-mono border-r font-medium">${p.rawICD || "-"}</td>
          <td class="px-2.5 py-1.5 text-amber-700 font-medium">${p.issues.join("; ")}</td>
        </tr>
      `;
    });
    tbody.innerHTML = rowsHtml || `<tr><td colspan="6" class="text-center py-4 text-slate-400">No issues detected!</td></tr>`;
  }

  modal.classList.remove("hidden");
}

function closeDataQualityModal() {
  document.getElementById("modal-data-quality")?.classList.add("hidden");
}

function downloadDataQualityReport() {
  if (!state.processedDataset) return;
  const problems = state.processedDataset.problemRows;
  const lines = ["row_index,admit_date,age,sex,raw_icd,issues"];
  problems.forEach((p) => {
    lines.push([
      p.rowIndex,
      `"${p.admitDate || ""}"`,
      `"${p.age !== null ? p.age : ""}"`,
      `"${p.sex || p.rawSex || ""}"`,
      `"${p.rawICD || ""}"`,
      `"${p.issues.join("; ").replace(/"/g, '""')}"`
    ].join(","));
  });
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, "SARI_Data_Quality_Report.csv");
}

function openModelInfoModal() {
  const modal = document.getElementById("modal-model-info");
  if (!modal) return;
  modal.classList.remove("hidden");
}

function closeModelInfoModal() {
  document.getElementById("modal-model-info")?.classList.add("hidden");
}

export function openDataGuide() {
  if (typeof document === "undefined") return;
  const modal = document.getElementById("modal-data-guide");
  if (!modal) return;
  modal.classList.remove("hidden");
}

export function closeDataGuide() {
  if (typeof document === "undefined") return;
  document.getElementById("modal-data-guide")?.classList.add("hidden");
}

export function toggleGuideCollapse() {
  if (typeof document === "undefined") return;
  const body = document.getElementById("guide-content-body");
  const icon = document.getElementById("icon-toggle-guide");
  if (!body) return;
  const isHidden = body.classList.contains("hidden");
  if (isHidden) {
    body.classList.remove("hidden");
    if (icon) {
      icon.classList.remove("rotate-180");
    }
  } else {
    body.classList.add("hidden");
    if (icon) {
      icon.classList.add("rotate-180");
    }
  }
}

function getCanvasDataURL(canvas) {
  if (!canvas) return "";
  try {
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width || 800;
    offscreen.height = canvas.height || 400;
    const ctx = offscreen.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, 0);
    return offscreen.toDataURL("image/png");
  } catch (err) {
    try {
      return canvas.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }
}

function renderPrintableKpiTable(k, isTh) {
  return `
    <div class="print-section print-break-inside-avoid">
      <h3 class="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1 flex items-center justify-between">
        <span>${isTh ? "1. ตารางสรุปตัวชี้วัดสำคัญระดับบริหาร (Surveillance KPI Summary)" : "1. Key Surveillance Indicators (KPI Table)"}</span>
      </h3>
      <table class="print-table w-full text-xs text-left border border-slate-300">
        <thead>
          <tr class="bg-[#064e3b] text-white font-bold border-b border-emerald-900">
            <th class="p-2 border border-emerald-800 text-white">${isTh ? "ตัวชี้วัดการเฝ้าระวัง (Surveillance Indicator)" : "Surveillance Indicator"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "จำนวน (N)" : "Count (N)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "สัดส่วน (%)" : "Percent (%)"}</th>
            <th class="p-2 border border-emerald-800 text-white">${isTh ? "ความหมายเชิงระบาดวิทยา" : "Epidemiological Interpretation"}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          <tr>
            <td class="p-2 font-semibold border border-slate-300">${isTh ? "1. จำนวนการรับผู้ป่วยในทั้งหมดที่นำเข้า (Total Admissions)" : "1. Total Inpatient Admissions"}</td>
            <td class="p-2 text-right font-bold border border-slate-300">${k.totalUploaded.toLocaleString()}</td>
            <td class="p-2 text-right border border-slate-300">100.0%</td>
            <td class="p-2 text-slate-600 border border-slate-300">${isTh ? "ฐานข้อมูลรับรักษาทั้งหมด" : "Baseline inpatient volume"}</td>
          </tr>
          <tr>
            <td class="p-2 font-semibold border border-slate-300">${isTh ? "2. การรับรักษาที่เข้าเกณฑ์แบบจำลอง (Study-Eligible Admissions)" : "2. Study-Eligible Admissions"}</td>
            <td class="p-2 text-right font-bold border border-slate-300">${k.eligibleAdmissions.toLocaleString()}</td>
            <td class="p-2 text-right border border-slate-300">${k.eligiblePercent.toFixed(1)}%</td>
            <td class="p-2 text-slate-600 border border-slate-300">${isTh ? "ตรงตาม 11 กลุ่มโรคที่ศึกษา" : "Matched 11 ICD-10 categories"}</td>
          </tr>
          <tr class="bg-emerald-50/70">
            <td class="p-2 font-bold text-emerald-950 border border-slate-300">${isTh ? "3. การประมาณการผู้ป่วย SARI (Estimated SARI Admissions)" : "3. Estimated SARI Admissions"}</td>
            <td class="p-2 text-right font-extrabold text-emerald-800 border border-slate-300">${k.estimatedSARITotal.toFixed(1)}</td>
            <td class="p-2 text-right font-extrabold text-emerald-800 border border-slate-300">${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} /100</td>
            <td class="p-2 text-emerald-900 border border-slate-300">${isTh ? "ผลรวมความน่าจะเป็นจากแบบจำลอง" : "Sum of model probabilities"}</td>
          </tr>
          <tr>
            <td class="p-2 font-medium border border-slate-300">${isTh ? "4. การรับรักษาด้วยรหัสกลุ่ม J ในการศึกษา (Study J-codes)" : "4. Study J-code Admissions"}</td>
            <td class="p-2 text-right border border-slate-300">${k.studyJCodeAdmissions.toLocaleString()}</td>
            <td class="p-2 text-right border border-slate-300">${k.pctJCodeAdmissions.toFixed(1)}%</td>
            <td class="p-2 text-slate-600 border border-slate-300">${isTh ? "J00-J22, J44, J45" : "Standard respiratory ICDs"}</td>
          </tr>
          <tr>
            <td class="p-2 font-medium border border-slate-300">${isTh ? "5. SARI ประมาณการจากรหัสกลุ่ม J (SARI from J-codes)" : "5. Estimated SARI from J-codes"}</td>
            <td class="p-2 text-right border border-slate-300">${k.estimatedSARIJCode.toFixed(1)}</td>
            <td class="p-2 text-right border border-slate-300">${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}%</td>
            <td class="p-2 text-slate-600 border border-slate-300">${isTh ? "สัดส่วน SARI จากรหัส J" : "% SARI burden from J-codes"}</td>
          </tr>
          <tr class="bg-teal-50/50">
            <td class="p-2 font-bold text-teal-800 border border-slate-300">${isTh ? "6. SARI ประมาณการจากรหัสอื่นๆ ที่ไม่ใช่ J (SARI from Non-J)" : "6. Estimated SARI from Non-J Codes"}</td>
            <td class="p-2 text-right font-bold text-teal-700 border border-slate-300">${k.estimatedSARINonJCode.toFixed(1)}</td>
            <td class="p-2 text-right font-bold text-teal-700 border border-slate-300">${k.pctEstimatedSARIFromNonJ.toFixed(1)}%</td>
            <td class="p-2 text-teal-900 border border-slate-300">${isTh ? "รหัสไวรัส ไข้ ไอ ชัก หายใจผิดปกติ" : "Non-J clinical presentations"}</td>
          </tr>
          <tr>
            <td class="p-2 text-slate-600 border border-slate-300">${isTh ? "7. รหัสโรคนอกขอบเขตแบบจำลอง (Outside Model Scope)" : "7. Diagnoses Outside Model Scope"}</td>
            <td class="p-2 text-right border border-slate-300">${k.outsideScopeCount.toLocaleString()}</td>
            <td class="p-2 text-right border border-slate-300">${k.outsideScopePercent.toFixed(1)}%</td>
            <td class="p-2 text-slate-500 border border-slate-300">${isTh ? "แยกออกจากการประมาณการ SARI" : "Excluded from SARI estimation"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderPrintableFigure1(imgUrl, isTh) {
  if (!imgUrl) return "";
  return `
    <div class="print-section print-break-inside-avoid">
      <h3 class="text-sm font-bold text-slate-900 mb-1 border-b border-slate-300 pb-1">
        ${isTh ? "ภาพที่ 1: แนวโน้มการเฝ้าระวังผู้ป่วย SARI ตามช่วงเวลา (SARI Surveillance Trends Over Time)" : "Figure 1: SARI Surveillance Trends Over Time"}
      </h3>
      <div class="text-center my-2 p-2 bg-white border border-slate-200 rounded-lg">
        <img src="${imgUrl}" alt="Figure 1" class="print-chart-img max-h-80 mx-auto" />
      </div>
      <p class="text-[11px] text-slate-500 italic text-center">
        ${isTh ? "รูปที่ 1: การเปรียบเทียบการรับรักษาเข้าเกณฑ์ รหัสกลุ่ม J และการประมาณการผู้ป่วย SARI ตามช่วงเวลา" : "Figure 1: Time trends of observed eligible admissions, study J-code admissions, and model-estimated SARI activity."}
      </p>
    </div>
  `;
}

function renderPrintableAgeTable(ageGroupsSummary, isTh) {
  const groups = ageGroupsSummary || [];
  const rows = groups.map((g) => {
    const ratePer100 = (g.estimatedSARI / (g.eligibleAdmissions || 1)) * 100;
    const pct = g.eligiblePct !== undefined ? g.eligiblePct.toFixed(1) : "0.0";
    return `
      <tr>
        <td class="p-2 font-semibold border border-slate-300">${isTh ? g.labelTh : g.labelEn}</td>
        <td class="p-2 text-right border border-slate-300">${g.eligibleAdmissions.toLocaleString()} (${pct}%)</td>
        <td class="p-2 text-right font-bold text-emerald-800 border border-slate-300">${g.estimatedSARI.toFixed(1)}</td>
        <td class="p-2 text-right font-semibold border border-slate-300">${ratePer100.toFixed(1)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="print-section print-break-inside-avoid">
      <h3 class="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1">
        ${isTh ? "2. การจำแนกตามกลุ่มอายุ 6 กลุ่ม (Age-Group Stratification)" : "2. Age-Group Stratification"}
      </h3>
      <table class="print-table w-full text-xs text-left border border-slate-300">
        <thead>
          <tr class="bg-[#064e3b] text-white font-bold border-b border-emerald-900">
            <th class="p-2 border border-emerald-800 text-white">${isTh ? "กลุ่มอายุ (Age Group)" : "Age Group"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "การรับรักษาเข้าเกณฑ์ N (%)" : "Eligible Admissions N (%)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "SARI ประมาณการ (ราย)" : "Estimated SARI (Cases)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "SARI ต่อ 100 การรับรักษา" : "SARI per 100 Admissions"}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderPrintableAgeSexTable(ageSexTable, isTh) {
  const rows = (ageSexTable || []).map((r) => {
    const malePct = r.malePctOverall !== undefined ? r.malePctOverall.toFixed(1) : "0.0";
    const femalePct = r.femalePctOverall !== undefined ? r.femalePctOverall.toFixed(1) : "0.0";
    return `
      <tr>
        <td class="p-2 font-semibold border border-slate-300">${isTh ? r.ageGroupLabelTh : r.ageGroupLabelEn}</td>
        <td class="p-2 text-right border border-slate-300">${r.maleCount.toLocaleString()} (${malePct}%)</td>
        <td class="p-2 text-right border border-slate-300">${r.femaleCount.toLocaleString()} (${femalePct}%)</td>
        <td class="p-2 text-right font-medium text-teal-800 border border-slate-300">${r.maleSARI.toFixed(1)}</td>
        <td class="p-2 text-right font-medium text-emerald-800 border border-slate-300">${r.femaleSARI.toFixed(1)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="print-section print-break-inside-avoid">
      <h3 class="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1">
        ${isTh ? "3. ตารางจำแนกตามกลุ่มอายุและเพศ (Age × Sex Cross-Tabulation)" : "3. Age × Sex Cross-Tabulation"}
      </h3>
      <table class="print-table w-full text-xs text-left border border-slate-300">
        <thead>
          <tr class="bg-[#064e3b] text-white font-bold border-b border-emerald-900">
            <th class="p-2 border border-emerald-800 text-white">${isTh ? "กลุ่มอายุ" : "Age Group"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "เพศชาย n (%)" : "Male n (%)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "เพศหญิง n (%)" : "Female n (%)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "ชาย SARI ประมาณการ" : "Male SARI"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "หญิง SARI ประมาณการ" : "Female SARI"}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderPrintableIcdSection(icdComposition, imgUrl, isTh) {
  const rows = (icdComposition || []).map((item) => `
    <tr>
      <td class="p-2 font-semibold border border-slate-300">${item.category}</td>
      <td class="p-2 border border-slate-300 ${item.isStudyJCode ? "text-emerald-700 font-bold" : "text-teal-700 font-medium"}">
        ${isTh ? (item.isStudyJCode ? "รหัสกลุ่ม J" : "รหัสอื่นที่ไม่ใช่ J") : (item.isStudyJCode ? "Study J-code" : "Study Non-J")}
      </td>
      <td class="p-2 text-right border border-slate-300">${item.admissions.toLocaleString()} (${item.admissionsPct.toFixed(1)}%)</td>
      <td class="p-2 text-right font-bold text-emerald-800 border border-slate-300">${item.estimatedSARI.toFixed(1)} (${item.estimatedSARIPct.toFixed(1)}%)</td>
    </tr>
  `).join("");

  return `
    <div class="print-section print-break-inside-avoid">
      <h3 class="text-sm font-bold text-slate-900 mb-1 border-b border-slate-300 pb-1">
        ${isTh ? "4. การกระจายของกลุ่มโรค ICD-10 ในการศึกษา (ICD-10 Diagnostic Groups)" : "4. ICD-10 Diagnostic Groups Distribution"}
      </h3>
      ${imgUrl ? `
      <div class="text-center my-2 p-2 bg-white border border-slate-200 rounded-lg">
        <img src="${imgUrl}" alt="Figure 2" class="print-chart-img max-h-72 mx-auto" />
        <p class="text-[11px] text-slate-500 italic mt-1">${isTh ? "ภาพที่ 2: สัดส่วนการรับรักษาตามกลุ่มโรค ICD-10" : "Figure 2: Admissions by ICD-10 Diagnostic Group"}</p>
      </div>` : ''}
      <table class="print-table w-full text-xs text-left border border-slate-300 mt-2">
        <thead>
          <tr class="bg-[#064e3b] text-white font-bold border-b border-emerald-900">
            <th class="p-2 border border-emerald-800 text-white">${isTh ? "กลุ่มการวินิจฉัย ICD-10" : "ICD-10 Diagnostic Group"}</th>
            <th class="p-2 border border-emerald-800 text-white">${isTh ? "กลุ่มรหัส" : "Category Type"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "การรับรักษา N (%)" : "Admissions N (%)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "SARI ประมาณการ (%)" : "Estimated SARI (%)"}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderPrintableSeasonalSection(seasonalAnalysis, imgUrl, isTh) {
  const rows = (seasonalAnalysis || []).map((s) => `
    <tr>
      <td class="p-2 font-semibold border border-slate-300">${isTh ? s.labelTh : s.labelEn}</td>
      <td class="p-2 text-right border border-slate-300">${s.eligibleAdmissions.toLocaleString()}</td>
      <td class="p-2 text-right font-bold text-emerald-800 border border-slate-300">${s.estimatedSARI.toFixed(1)}</td>
      <td class="p-2 text-right font-semibold border border-slate-300">${s.sariPer100.toFixed(1)}</td>
    </tr>
  `).join("");

  return `
    <div class="print-section print-break-inside-avoid">
      <h3 class="text-sm font-bold text-slate-900 mb-1 border-b border-slate-300 pb-1">
        ${isTh ? "5. การวิเคราะห์ตามฤดูกาลและสัดส่วนรหัส J vs Non-J (Seasonal & J vs Non-J Analysis)" : "5. Seasonal Surveillance & J vs. Non-J Contribution"}
      </h3>
      <table class="print-table w-full text-xs text-left border border-slate-300 my-2">
        <thead>
          <tr class="bg-[#064e3b] text-white font-bold border-b border-emerald-900">
            <th class="p-2 border border-emerald-800 text-white">${isTh ? "ฤดูกาล (Season)" : "Season"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "การรับรักษาเข้าเกณฑ์ (N)" : "Eligible Admissions (N)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "SARI ประมาณการ (ราย)" : "Estimated SARI (Cases)"}</th>
            <th class="p-2 text-right border border-emerald-800 text-white">${isTh ? "SARI ต่อ 100 การรับรักษา" : "SARI per 100 Admissions"}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${rows}
        </tbody>
      </table>
      ${imgUrl ? `
      <div class="text-center my-2 p-2 bg-white border border-slate-200 rounded-lg">
        <img src="${imgUrl}" alt="Figure 3" class="print-chart-img max-h-64 mx-auto" />
        <p class="text-[11px] text-slate-500 italic mt-1">${isTh ? "ภาพที่ 3: สัดส่วนการมีส่วนร่วมของรหัสกลุ่ม J เทียบกับรหัสอื่นๆ ต่อ SARI" : "Figure 3: Contribution of J-codes vs. Non-J Diagnoses to SARI"}</p>
      </div>` : ''}
    </div>
  `;
}

function renderPrintableAuditTable(qualitySummary, isTh) {
  if (!qualitySummary) return "";
  const q = qualitySummary;
  return `
    <div class="print-section print-break-inside-avoid">
      <h3 class="text-sm font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1">
        ${isTh ? "6. การตรวจสอบคุณภาพและความครบถ้วนของข้อมูล (Data Quality Audit Summary)" : "6. Data Quality & Audit Summary"}
      </h3>
      <table class="print-table w-full text-xs text-left border border-slate-300">
        <tbody class="divide-y divide-slate-200">
          <tr>
            <td class="p-2 font-medium border border-slate-300">${isTh ? "แถวข้อมูลทั้งหมดที่นำเข้า (Total Uploaded Records)" : "Total Uploaded Inpatient Records"}</td>
            <td class="p-2 text-right font-bold border border-slate-300">${q.totalUploaded.toLocaleString()}</td>
          </tr>
          <tr>
            <td class="p-2 font-medium border border-slate-300">${isTh ? "แถวที่เข้าเกณฑ์และคำนวณแบบจำลอง (Model-Eligible Records)" : "Model-Eligible Records Analyzed"}</td>
            <td class="p-2 text-right font-bold text-sky-700 border border-slate-300">${q.modelEligible.toLocaleString()}</td>
          </tr>
          <tr>
            <td class="p-2 font-medium border border-slate-300">${isTh ? "แถวที่มีรหัสโรคนอก 11 กลุ่มที่ศึกษา (Excluded Outside Scope)" : "Diagnoses Outside 11 Validated Categories (Excluded)"}</td>
            <td class="p-2 text-right border border-slate-300">${q.outsideScopeICD.toLocaleString()}</td>
          </tr>
          <tr>
            <td class="p-2 font-medium border border-slate-300">${isTh ? "แถวที่ไม่มีข้อมูลอายุ หรืออายุผิดปกติ" : "Records with Missing / Invalid Age"}</td>
            <td class="p-2 text-right border border-slate-300">${(q.missingAges + q.invalidAges).toLocaleString()}</td>
          </tr>
          <tr>
            <td class="p-2 font-medium border border-slate-300">${isTh ? "แถวที่วันที่ไม่ถูกต้อง หรือแปลงไม่ได้" : "Records with Invalid / Unparseable Dates"}</td>
            <td class="p-2 text-right border border-slate-300">${q.invalidDates.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderPrintableMethodology(isTh) {
  return `
    <div class="print-section print-break-inside-avoid text-[11px] text-slate-600 leading-relaxed border-t border-slate-300 pt-3">
      <p><strong>${isTh ? "สมการแบบจำลองถดถอยโลจิสติก (Logistic Model Formula):" : "Logistic Regression Formula:"}</strong> <span class="font-mono text-slate-800">η = intercept + β_ICD + β_age × age + β_sex × I(male) + β_season; P = 1 / (1 + exp(-η))</span></p>
      <p class="mt-1.5"><strong>${isTh ? "ข้อสังเกตสำคัญในการแปลผล:" : "Epidemiological Interpretation:"}</strong> ${isTh ? "การประมาณการผู้ป่วย SARI เป็นผลรวมของค่าความน่าจะเป็นที่คำนวณได้จากแบบจำลอง และควรแปลผลเป็นจำนวนผู้ป่วยโดยประมาณในระดับประชากร มิใช่การยืนยันการวินิจฉัยทางคลินิกเป็นรายบุคคล และเครื่องมือนี้มีจุดประสงค์เพื่อเสริมการเฝ้าระวังที่มีอยู่เดิม มิใช่เพื่อทดแทน" : "Estimated SARI represents the sum of model-predicted probabilities and should be interpreted as an estimated case count at population level rather than patient-level clinical diagnosis. This tool complements, rather than replaces, syndromic and laboratory SARI surveillance."}</p>
      <p class="mt-1 text-slate-500 italic"><strong>${isTh ? "แหล่งที่มาของแบบจำลอง:" : "Study Citation:"}</strong> ${isTh ? "แบบจำลองพัฒนาจากข้อมูลทบทวนเวชระเบียนของโรงพยาบาลเครือข่ายเฝ้าระวัง SARI 6 แห่งในประเทศไทย ระหว่างปี 2566–2567" : "Models were developed using medical record review data from six SARI sentinel hospitals in Thailand (2023–2024)."}</p>
      <p class="mt-2 text-[10px] text-slate-500 text-right">Version 2.0 (01/10/2026 Developed by Sethapong Lertsakulbunlue the Principal investigator) | ${new Date().toLocaleString(isTh ? 'th-TH' : 'en-US')}</p>
    </div>
  `;
}

function openSurveillanceReport() {
  const reportModal = document.getElementById("modal-surveillance-report");
  if (!reportModal || !state.aggregatedResults) return;

  const k = state.aggregatedResults.kpis;
  const isTh = state.lang === "th";

  const inpFac = document.getElementById("report-input-hospital");
  const inpProv = document.getElementById("report-input-province");
  if (inpFac) inpFac.value = state.hospitalInfo.hospitalName || "";
  if (inpProv) inpProv.value = state.hospitalInfo.province || "";

  document.getElementById("report-facility-name").textContent =
    state.hospitalInfo.hospitalName || (isTh ? "โรงพยาบาลศูนย์ / โรงพยาบาลทั่วไป" : "Sentinel Hospital Surveillance Site");
  document.getElementById("report-province-name").textContent =
    state.hospitalInfo.province || (isTh ? "ประเทศไทย" : "Thailand");
  document.getElementById("report-period-text").textContent =
    state.hospitalInfo.reportingPeriod || (isTh ? "ช่วงเวลาทั้งหมดในชุดข้อมูล" : "Full dataset period");
  document.getElementById("report-date-generated").textContent =
    new Date().toLocaleDateString(isTh ? "th-TH" : "en-US", { year: "numeric", month: "long", day: "numeric" });

  document.getElementById("rep-val-total").textContent = k.totalUploaded.toLocaleString();
  document.getElementById("rep-val-eligible").textContent = `${k.eligibleAdmissions.toLocaleString()} (${k.eligiblePercent.toFixed(1)}%)`;
  document.getElementById("rep-val-sari").textContent = k.estimatedSARITotal.toFixed(1);
  document.getElementById("rep-val-jcodes").textContent = `${k.studyJCodeAdmissions.toLocaleString()} (${k.pctJCodeAdmissions.toFixed(1)}%)`;
  document.getElementById("rep-val-nonj").textContent = `${k.estimatedSARINonJCode.toFixed(1)} (${k.pctEstimatedSARIFromNonJ.toFixed(1)}%)`;

  const slideContainer = document.getElementById("report-slide-snippets");
  if (slideContainer) {
    slideContainer.innerHTML = `
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
            <i class="fa-solid fa-file-powerpoint text-amber-600"></i>
            ${isTh ? "ข้อความพร้อมคัดลอกใส่สไลด์นำเสนอผู้บริหาร (Slide-Ready)" : "Executive Slide-Ready Presentation Points"}
          </span>
          <span class="text-[11px] text-slate-500 italic">${isTh ? "รวมอยู่ในไฟล์ Word (.docx) แล้ว" : "Included in Word .docx export"}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
          <div class="bg-white p-2.5 rounded-lg border border-slate-200">
            <strong class="text-sky-800 block mb-1">${isTh ? "Slide 1: ภาพรวมและภาระ SARI" : "Slide 1: Overview & SARI Burden"}</strong>
            <ul class="list-disc pl-3.5 space-y-0.5 text-slate-600">
              <li>${isTh ? `รับผู้ป่วยในทั้งหมด ${k.totalUploaded.toLocaleString()} ราย เข้าเกณฑ์ ${k.eligibleAdmissions.toLocaleString()} ราย (${k.eligiblePercent.toFixed(1)}%)` : `Total admissions analyzed: ${k.totalUploaded.toLocaleString()}, eligible in 11 categories: ${k.eligibleAdmissions.toLocaleString()} (${k.eligiblePercent.toFixed(1)}%)`}</li>
              <li>${isTh ? `ประมาณการผู้ป่วย SARI รวม <strong class="text-rose-600">${k.estimatedSARITotal.toFixed(1)} ราย</strong> (${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} ต่อ 100 การรับรักษา)` : `Total Estimated SARI: <strong class="text-rose-600">${k.estimatedSARITotal.toFixed(1)} cases</strong> (${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} per 100 admissions)`}</li>
            </ul>
          </div>
          <div class="bg-white p-2.5 rounded-lg border border-slate-200">
            <strong class="text-teal-800 block mb-1">${isTh ? "Slide 2: บทบาทรหัสนอกกลุ่ม J (Non-J)" : "Slide 2: Role of Non-J Diagnoses"}</strong>
            <ul class="list-disc pl-3.5 space-y-0.5 text-slate-600">
              <li>${isTh ? `รหัสกลุ่ม J: ${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}% ของ SARI (${k.estimatedSARIJCode.toFixed(1)} ราย)` : `Study J-codes: ${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}% of SARI (${k.estimatedSARIJCode.toFixed(1)} cases)`}</li>
              <li>${isTh ? `รหัสนอกกลุ่ม J: <strong class="text-teal-700">${k.pctEstimatedSARIFromNonJ.toFixed(1)}%</strong> (${k.estimatedSARINonJCode.toFixed(1)} ราย) - แสดงถึงความจำเป็นที่ต้องเฝ้าระวังเสริม` : `Study Non-J codes: <strong class="text-teal-700">${k.pctEstimatedSARIFromNonJ.toFixed(1)}%</strong> (${k.estimatedSARINonJCode.toFixed(1)} cases) - demonstrates need for model estimation`}</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  // If in simplified mode, advanced charts might not be rendered yet; render them so canvas snapshots exist
  if (!state.activeCharts.icd) renderICDCompositionChart();
  if (!state.activeCharts.jVsNonJ) renderJVsNonJChart();

  // Capture Canvas Images with crisp white background
  const mainImgUrl = getCanvasDataURL(document.getElementById("chart-main-timeseries"));
  const icdImgUrl = getCanvasDataURL(document.getElementById("chart-icd-composition"));
  const jVsNonJImgUrl = getCanvasDataURL(document.getElementById("chart-j-vs-non-j"));

  // Render All Tables and Visual Figures
  const kpiContainer = document.getElementById("report-sec-kpis");
  if (kpiContainer) kpiContainer.innerHTML = renderPrintableKpiTable(k, isTh);

  const fig1Container = document.getElementById("report-sec-fig1");
  if (fig1Container) fig1Container.innerHTML = renderPrintableFigure1(mainImgUrl, isTh);

  const ageContainer = document.getElementById("report-sec-age");
  if (ageContainer) ageContainer.innerHTML = renderPrintableAgeTable(state.aggregatedResults.ageGroupsSummary, isTh);

  const ageSexContainer = document.getElementById("report-sec-agesex");
  if (ageSexContainer) ageSexContainer.innerHTML = renderPrintableAgeSexTable(state.aggregatedResults.ageSexTable, isTh);

  const icdContainer = document.getElementById("report-sec-icd");
  if (icdContainer) icdContainer.innerHTML = renderPrintableIcdSection(state.aggregatedResults.icdComposition, icdImgUrl, isTh);

  const seasonalContainer = document.getElementById("report-sec-seasonal");
  if (seasonalContainer) seasonalContainer.innerHTML = renderPrintableSeasonalSection(state.aggregatedResults.seasonalAnalysis, jVsNonJImgUrl, isTh);

  const auditContainer = document.getElementById("report-sec-audit");
  if (auditContainer) auditContainer.innerHTML = renderPrintableAuditTable(state.processedDataset?.qualitySummary, isTh);

  const methodologyContainer = document.getElementById("report-sec-methodology");
  if (methodologyContainer) methodologyContainer.innerHTML = renderPrintableMethodology(isTh);

  reportModal.classList.remove("hidden");
}

function closeSurveillanceReport() {
  document.getElementById("modal-surveillance-report")?.classList.add("hidden");
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    initApp();
  });
}
