/**
 * Surveillance Data Aggregation Engine
 *
 * Computes:
 * - Summary KPIs
 * - Weekly & Monthly Time Series
 * - Age-Group distributions and Small Multiple Series
 * - Sex-Stratified series
 * - Age × Sex Descriptive and Estimated SARI tables
 * - ICD-10 diagnostic group composition
 * - J-code vs Non-J-code contribution
 * - Seasonal summary (SARI per 100 admissions)
 * - Demographic statistics (Median, IQR, Mean, SD)
 */

import { AGE_GROUPS } from "../models/sariCalculator.js";
import { ICD_CATEGORIES } from "../models/sariCoefficients.js";

/**
 * Calculates statistical median and interquartile range (IQR).
 */
export function calculateMedianIQR(values) {
  if (!values || values.length === 0) return { median: null, q25: null, q75: null, iqr: null };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const getPercentile = (p) => {
    const pos = (n - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };

  const median = getPercentile(0.5);
  const q25 = getPercentile(0.25);
  const q75 = getPercentile(0.75);
  const iqr = q75 - q25;

  return { median, q25, q75, iqr };
}

/**
 * Calculates statistical mean and sample standard deviation.
 */
export function calculateMeanSD(values) {
  if (!values || values.length === 0) return { mean: null, sd: null };
  const n = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  if (n <= 1) return { mean, sd: 0 };
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
  const sd = Math.sqrt(variance);
  return { mean, sd };
}

/**
 * Aggregates processed surveillance dataset.
 *
 * @param {Array<Object>} rows - Array of processed row objects
 * @param {Object} filters - Active filters
 */
export function aggregateSurveillance(rows, filters = {}) {
  // Apply global filters
  const filteredRows = rows.filter((r) => {
    if (filters.startDate && r.admitDate && r.admitDate < filters.startDate) return false;
    if (filters.endDate && r.admitDate && r.admitDate > filters.endDate) return false;
    if (filters.ageGroup && filters.ageGroup !== "all") {
      if (!r.ageGroup || r.ageGroup.key !== filters.ageGroup) return false;
    }
    if (filters.sex && filters.sex !== "all") {
      if (r.sex !== filters.sex) return false;
    }
    if (filters.ageType && filters.ageType !== "all") {
      if (r.ageModel !== filters.ageType) return false;
    }
    if (filters.icdCategory && filters.icdCategory !== "all") {
      if (r.icdCategory !== filters.icdCategory) return false;
    }
    if (filters.jCodeStatus && filters.jCodeStatus !== "all") {
      if (filters.jCodeStatus === "j" && !r.isStudyJCode) return false;
      if (filters.jCodeStatus === "non_j" && (r.isStudyJCode || !r.isModelEligible)) return false;
      if (filters.jCodeStatus === "outside" && r.isModelEligible) return false;
    }
    if (filters.modelUsed && filters.modelUsed !== "all") {
      if (r.modelUsed !== filters.modelUsed) return false;
    }
    return true;
  });

  const totalUploaded = rows.length;
  const totalFiltered = filteredRows.length;

  // Eligible admissions
  const eligibleRows = filteredRows.filter((r) => r.isModelEligible);
  const outsideScopeRows = filteredRows.filter((r) => !r.isModelEligible);

  // Exact sum of individual predicted probabilities
  let estimatedSARITotal = 0;
  let estimatedSARIJCode = 0;
  let estimatedSARINonJCode = 0;
  let studyJCodeAdmissions = 0;
  let studyNonJCodeAdmissions = 0;

  for (const r of eligibleRows) {
    const p = r.predictedSARIProbability || 0;
    estimatedSARITotal += p;
    if (r.isStudyJCode) {
      studyJCodeAdmissions++;
      estimatedSARIJCode += p;
    } else {
      studyNonJCodeAdmissions++;
      estimatedSARINonJCode += p;
    }
  }

  const pctEstimatedSARIFromNonJ =
    estimatedSARITotal > 0 ? (estimatedSARINonJCode / estimatedSARITotal) * 100 : 0;
  const pctJCodeAdmissions =
    eligibleRows.length > 0 ? (studyJCodeAdmissions / eligibleRows.length) * 100 : 0;

  // KPIs
  const kpis = {
    totalUploaded,
    totalFiltered,
    eligibleAdmissions: eligibleRows.length,
    eligiblePercent: totalFiltered > 0 ? (eligibleRows.length / totalFiltered) * 100 : 0,
    estimatedSARITotal,
    studyJCodeAdmissions,
    studyNonJCodeAdmissions,
    estimatedSARIJCode,
    estimatedSARINonJCode,
    pctEstimatedSARIFromNonJ,
    pctJCodeAdmissions,
    outsideScopeCount: outsideScopeRows.length,
    outsideScopePercent: totalFiltered > 0 ? (outsideScopeRows.length / totalFiltered) * 100 : 0
  };

  // Weekly Aggregation
  const weeklyMap = new Map();
  for (const r of filteredRows) {
    if (!r.dateObj) continue;
    const key = r.dateObj.key;
    if (!weeklyMap.has(key)) {
      weeklyMap.set(key, {
        key,
        label: r.dateObj.label,
        year: r.dateObj.year,
        weekNumber: r.dateObj.weekNumber,
        startDate: r.dateObj.startDate,
        endDate: r.dateObj.endDate,
        totalEligible: 0,
        studyJCodes: 0,
        studyNonJCodes: 0,
        estimatedSARI: 0,
        estimatedSARIJ: 0,
        estimatedSARINonJ: 0,
        maleSARI: 0,
        femaleSARI: 0
      });
    }
    const item = weeklyMap.get(key);
    if (r.isModelEligible) {
      item.totalEligible++;
      const p = r.predictedSARIProbability || 0;
      item.estimatedSARI += p;
      if (r.isStudyJCode) {
        item.studyJCodes++;
        item.estimatedSARIJ += p;
      } else {
        item.studyNonJCodes++;
        item.estimatedSARINonJ += p;
      }
      if (r.sex === "male") item.maleSARI += p;
      if (r.sex === "female") item.femaleSARI += p;
    }
  }
  const weeklySeries = Array.from(weeklyMap.values()).sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  // Monthly Aggregation
  const monthlyMap = new Map();
  for (const r of filteredRows) {
    if (!r.month) continue;
    const key = r.month.key;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, {
        key,
        year: r.month.year,
        month: r.month.month,
        labelEn: r.month.labelEn,
        labelTh: r.month.labelTh,
        totalEligible: 0,
        studyJCodes: 0,
        studyNonJCodes: 0,
        estimatedSARI: 0,
        estimatedSARIJ: 0,
        estimatedSARINonJ: 0
      });
    }
    const item = monthlyMap.get(key);
    if (r.isModelEligible) {
      item.totalEligible++;
      const p = r.predictedSARIProbability || 0;
      item.estimatedSARI += p;
      if (r.isStudyJCode) {
        item.studyJCodes++;
        item.estimatedSARIJ += p;
      } else {
        item.studyNonJCodes++;
        item.estimatedSARINonJ += p;
      }
    }
  }
  const monthlySeries = Array.from(monthlyMap.values()).sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  // Age Groups Breakdown & Weekly Small Multiples Series
  const ageGroupMap = new Map();
  for (const g of AGE_GROUPS) {
    ageGroupMap.set(g.key, {
      ...g,
      eligibleAdmissions: 0,
      estimatedSARI: 0,
      studyJCodes: 0,
      weeklyData: new Map()
    });
  }

  for (const r of eligibleRows) {
    if (!r.ageGroup) continue;
    const g = ageGroupMap.get(r.ageGroup.key);
    if (!g) continue;
    g.eligibleAdmissions++;
    const p = r.predictedSARIProbability || 0;
    g.estimatedSARI += p;
    if (r.isStudyJCode) g.studyJCodes++;

    if (r.dateObj) {
      const wkKey = r.dateObj.key;
      if (!g.weeklyData.has(wkKey)) {
        g.weeklyData.set(wkKey, {
          key: wkKey,
          label: r.dateObj.label,
          startDate: r.dateObj.startDate,
          estimatedSARI: 0,
          studyJCodes: 0,
          eligible: 0
        });
      }
      const wk = g.weeklyData.get(wkKey);
      wk.estimatedSARI += p;
      wk.eligible++;
      if (r.isStudyJCode) wk.studyJCodes++;
    }
  }

  const ageGroupsSummary = AGE_GROUPS.map((g) => {
    const data = ageGroupMap.get(g.key);
    // Convert weeklyData map to aligned sorted array matching all known weeks
    const alignedWeekly = weeklySeries.map((w) => {
      const entry = data.weeklyData.get(w.key);
      return {
        key: w.key,
        label: w.label,
        startDate: w.startDate,
        estimatedSARI: entry ? entry.estimatedSARI : 0,
        studyJCodes: entry ? entry.studyJCodes : 0,
        eligible: entry ? entry.eligible : 0
      };
    });

    return {
      key: g.key,
      labelEn: g.labelEn,
      labelTh: g.labelTh,
      eligibleAdmissions: data.eligibleAdmissions,
      eligiblePct: eligibleRows.length > 0 ? (data.eligibleAdmissions / eligibleRows.length) * 100 : 0,
      estimatedSARI: data.estimatedSARI,
      estimatedSARIPct: estimatedSARITotal > 0 ? (data.estimatedSARI / estimatedSARITotal) * 100 : 0,
      studyJCodes: data.studyJCodes,
      weeklySeries: alignedWeekly
    };
  });

  // Age × Sex Descriptive & Estimated SARI Tables
  const ageSexTable = AGE_GROUPS.map((g) => {
    const groupEligible = eligibleRows.filter((r) => r.ageGroup && r.ageGroup.key === g.key);
    const maleRows = groupEligible.filter((r) => r.sex === "male");
    const femaleRows = groupEligible.filter((r) => r.sex === "female");

    const maleCount = maleRows.length;
    const femaleCount = femaleRows.length;
    const totalCount = groupEligible.length;

    const maleSARI = maleRows.reduce((sum, r) => sum + (r.predictedSARIProbability || 0), 0);
    const femaleSARI = femaleRows.reduce((sum, r) => sum + (r.predictedSARIProbability || 0), 0);
    const totalSARI = maleSARI + femaleSARI;

    return {
      ageGroupKey: g.key,
      ageGroupLabelEn: g.labelEn,
      ageGroupLabelTh: g.labelTh,
      maleCount,
      femaleCount,
      totalCount,
      maleSARI,
      femaleSARI,
      totalSARI,
      // Overall percentages
      malePctOverall: eligibleRows.length > 0 ? (maleCount / eligibleRows.length) * 100 : 0,
      femalePctOverall: eligibleRows.length > 0 ? (femaleCount / eligibleRows.length) * 100 : 0,
      totalPctOverall: eligibleRows.length > 0 ? (totalCount / eligibleRows.length) * 100 : 0,
      // Row percentages
      malePctRow: totalCount > 0 ? (maleCount / totalCount) * 100 : 0,
      femalePctRow: totalCount > 0 ? (femaleCount / totalCount) * 100 : 0
    };
  });

  // Sex Summary
  const maleEligible = eligibleRows.filter((r) => r.sex === "male");
  const femaleEligible = eligibleRows.filter((r) => r.sex === "female");
  const maleSARI = maleEligible.reduce((sum, r) => sum + (r.predictedSARIProbability || 0), 0);
  const femaleSARI = femaleEligible.reduce((sum, r) => sum + (r.predictedSARIProbability || 0), 0);

  const sexSummary = {
    male: {
      count: maleEligible.length,
      pctEligible: eligibleRows.length > 0 ? (maleEligible.length / eligibleRows.length) * 100 : 0,
      estimatedSARI: maleSARI,
      pctSARI: estimatedSARITotal > 0 ? (maleSARI / estimatedSARITotal) * 100 : 0
    },
    female: {
      count: femaleEligible.length,
      pctEligible: eligibleRows.length > 0 ? (femaleEligible.length / eligibleRows.length) * 100 : 0,
      estimatedSARI: femaleSARI,
      pctSARI: estimatedSARITotal > 0 ? (femaleSARI / estimatedSARITotal) * 100 : 0
    }
  };

  // ICD Diagnostic Group Composition
  const icdCategoryMap = new Map();
  Object.values(ICD_CATEGORIES).forEach((cat) => {
    icdCategoryMap.set(cat, {
      category: cat,
      admissions: 0,
      estimatedSARI: 0,
      isStudyJCode: [
        ICD_CATEGORIES.URTI,
        ICD_CATEGORIES.INFLUENZA,
        ICD_CATEGORIES.PNEUMONIA,
        ICD_CATEGORIES.OTHER_RESP
      ].includes(cat)
    });
  });

  for (const r of eligibleRows) {
    if (!r.icdCategory || !icdCategoryMap.has(r.icdCategory)) continue;
    const item = icdCategoryMap.get(r.icdCategory);
    item.admissions++;
    item.estimatedSARI += r.predictedSARIProbability || 0;
  }

  const icdComposition = Array.from(icdCategoryMap.values()).map((c) => ({
    ...c,
    admissionsPct: eligibleRows.length > 0 ? (c.admissions / eligibleRows.length) * 100 : 0,
    estimatedSARIPct: estimatedSARITotal > 0 ? (c.estimatedSARI / estimatedSARITotal) * 100 : 0
  })).sort((a, b) => b.admissions - a.admissions);

  // Seasonal Analysis
  const seasonOrder = ["summer", "rainy", "winter"];
  const seasonLabels = {
    summer: { en: "Summer (Feb–May)", th: "ฤดูร้อน (ก.พ.–พ.ค.)" },
    rainy: { en: "Rainy (Jun–Oct)", th: "ฤดูฝน (มิ.ย.–ต.ค.)" },
    winter: { en: "Winter (Nov–Jan)", th: "ฤดูหนาว (พ.ย.–ม.ค.)" }
  };

  const seasonMap = new Map();
  seasonOrder.forEach((s) => {
    seasonMap.set(s, {
      key: s,
      labelEn: seasonLabels[s].en,
      labelTh: seasonLabels[s].th,
      eligibleAdmissions: 0,
      estimatedSARI: 0
    });
  });

  for (const r of eligibleRows) {
    if (!r.season) continue;
    const s = seasonMap.get(r.season.key);
    if (!s) continue;
    s.eligibleAdmissions++;
    s.estimatedSARI += r.predictedSARIProbability || 0;
  }

  const seasonalAnalysis = seasonOrder.map((key) => {
    const s = seasonMap.get(key);
    const sariPer100 = s.eligibleAdmissions > 0 ? (s.estimatedSARI / s.eligibleAdmissions) * 100 : 0;
    return {
      ...s,
      sariPer100
    };
  });

  // Summary Demographics
  const validAges = eligibleRows.map((r) => r.age).filter((a) => a !== null && !isNaN(a));
  const ageMedianIQR = calculateMedianIQR(validAges);
  const ageMeanSD = calculateMeanSD(validAges);

  const pediatricCount = eligibleRows.filter((r) => r.ageModel === "pediatric").length;
  const adultCount = eligibleRows.filter((r) => r.ageModel === "adult").length;

  const demographics = {
    totalEligible: eligibleRows.length,
    ageMedian: ageMedianIQR.median,
    ageIQR: ageMedianIQR.iqr,
    ageQ25: ageMedianIQR.q25,
    ageQ75: ageMedianIQR.q75,
    ageMean: ageMeanSD.mean,
    ageSD: ageMeanSD.sd,
    pediatricCount,
    pediatricPct: eligibleRows.length > 0 ? (pediatricCount / eligibleRows.length) * 100 : 0,
    adultCount,
    adultPct: eligibleRows.length > 0 ? (adultCount / eligibleRows.length) * 100 : 0,
    maleCount: maleEligible.length,
    malePct: sexSummary.male.pctEligible,
    femaleCount: femaleEligible.length,
    femalePct: sexSummary.female.pctEligible
  };

  return {
    kpis,
    weeklySeries,
    monthlySeries,
    ageGroupsSummary,
    sexSummary,
    ageSexTable,
    icdComposition,
    seasonalAnalysis,
    demographics,
    filteredRowCount: filteredRows.length
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateMedianIQR,
    calculateMeanSD,
    aggregateSurveillance
  };
}
