/**
 * SARI Logistic Regression Estimation Engine
 *
 * Implements:
 * - Age model selection (Pediatric: age 0–14, Adult: age >= 15)
 * - Standard age grouping (<2, 2–4, 5–14, 15–49, 50–64, >=65)
 * - Linear predictor calculation (η) for Model 1 and Model 2
 * - SARI probability prediction via logistic sigmoid: P = 1 / (1 + exp(-η))
 * - Dataset-level estimation and multi-dimensional aggregation
 */

import { SARI_MODELS, MODEL_METADATA } from "./sariCoefficients.js";
import { classifyICD10, OUTSIDE_MODEL_SCOPE } from "./icdClassifier.js";
import { deriveSeason, getWeekInfo, getMonthInfo, formatDateISO } from "../utils/dateUtils.js";

export const AGE_GROUPS = [
  { key: "<2", labelEn: "<2 years", labelTh: "< 2 ปี", min: 0, max: 2 },
  { key: "2-4", labelEn: "2–4 years", labelTh: "2–4 ปี", min: 2, max: 5 },
  { key: "5-14", labelEn: "5–14 years", labelTh: "5–14 ปี", min: 5, max: 15 },
  { key: "15-49", labelEn: "15–49 years", labelTh: "15–49 ปี", min: 15, max: 50 },
  { key: "50-64", labelEn: "50–64 years", labelTh: "50–64 ปี", min: 50, max: 65 },
  { key: ">=65", labelEn: "≥65 years", labelTh: "≥ 65 ปี", min: 65, max: 999 }
];

/**
 * Derives the standardized epidemiological age group for a given numeric age.
 * @param {number} age
 */
export function deriveAgeGroup(age) {
  if (age === null || age === undefined || isNaN(age) || age < 0) return null;
  const numAge = Number(age);

  for (const g of AGE_GROUPS) {
    if (g.key === ">=65" && numAge >= 65) return g;
    if (numAge >= g.min && numAge < g.max) return g;
  }
  return null;
}

/**
 * Selects between pediatric and adult model based on age.
 * Threshold: Age 0–14 -> pediatric, Age >= 15 -> adult.
 * @param {number} age
 */
export function selectAgeModel(age) {
  if (age === null || age === undefined || isNaN(age) || age < 0) return null;
  return Number(age) < MODEL_METADATA.ageThreshold ? "pediatric" : "adult";
}

/**
 * Normalizes sex string to "male", "female", or null.
 * @param {string | number} rawSex
 */
export function normalizeSex(rawSex) {
  if (rawSex === null || rawSex === undefined) return null;
  const s = String(rawSex).trim().toLowerCase();
  if (["male", "m", "ชาย", "1"].includes(s)) return "male";
  if (["female", "f", "หญิง", "2"].includes(s)) return "female";
  return null;
}

/**
 * Calculates linear predictor (η) and predicted SARI probability.
 */
export function calculateSARIForRow({
  age,
  sex,
  seasonKey,
  icdCategory,
  preferredModel = "auto"
}) {
  // Validate age requirement
  if (age === null || age === undefined || isNaN(age) || age < 0) {
    return {
      eligible: false,
      reason: "Missing or invalid age (required to determine pediatric vs adult model)",
      eta: null,
      probability: null,
      modelUsed: null
    };
  }

  // Validate ICD category
  if (!icdCategory || icdCategory === OUTSIDE_MODEL_SCOPE) {
    return {
      eligible: false,
      reason: "Diagnosis is outside validated 11 model categories",
      eta: null,
      probability: null,
      modelUsed: null
    };
  }

  const ageModelKey = selectAgeModel(age);
  const modelConfig = SARI_MODELS[ageModelKey];

  // Determine model selection: Model 1 vs Model 2
  let chosenModel = "model1";
  const normSex = normalizeSex(sex);
  const hasSex = normSex !== null;
  const hasSeason = Boolean(seasonKey);

  if (preferredModel === "model2") {
    if (hasSex && hasSeason) {
      chosenModel = "model2";
    } else {
      return {
        eligible: false,
        reason: `Model 2 requested but missing required predictors: ${!hasSex ? "sex " : ""}${!hasSeason ? "admission season" : ""}`,
        eta: null,
        probability: null,
        modelUsed: null
      };
    }
  } else if (preferredModel === "auto") {
    if (hasSex && hasSeason) {
      chosenModel = "model2";
    } else {
      chosenModel = "model1";
    }
  } else {
    chosenModel = "model1";
  }

  let eta = 0;
  let breakdown = {};

  if (chosenModel === "model1") {
    const m = modelConfig.model1;
    const icdBeta = m.icdCoefficients[icdCategory] ?? 0;
    eta = m.intercept + icdBeta;

    breakdown = {
      modelName: "Model 1 (ICD-10 category only)",
      ageModel: ageModelKey,
      intercept: m.intercept,
      icdBeta,
      ageBeta: 0,
      sexBeta: 0,
      seasonBeta: 0
    };
  } else {
    // Model 2
    const m = modelConfig.model2;
    const icdBeta = m.icdCoefficients[icdCategory] ?? 0;
    const ageBetaContrib = m.ageBeta * Number(age);
    const sexBeta = normSex === "male" ? m.sexBeta.male : m.sexBeta.female;
    const seasonBeta = m.seasonBeta[seasonKey] ?? 0;

    eta = m.intercept + icdBeta + ageBetaContrib + sexBeta + seasonBeta;

    breakdown = {
      modelName: "Model 2 (ICD-10 + age + sex + season)",
      ageModel: ageModelKey,
      intercept: m.intercept,
      icdBeta,
      ageBetaContrib,
      ageBeta: m.ageBeta,
      sexBeta,
      seasonBeta
    };
  }

  // Logistic function: P = 1 / (1 + exp(-η))
  const probability = 1 / (1 + Math.exp(-eta));

  return {
    eligible: true,
    reason: null,
    eta,
    probability,
    modelUsed: chosenModel,
    ageModelKey,
    breakdown
  };
}

/**
 * Processes an entire dataset of admission rows.
 *
 * @param {Array<Object>} rawRows - Array of row objects from CSV/XLSX
 * @param {Object} mapping - Column mapping { admitDateCol, ageCol, sexCol, icdCol }
 * @param {Object} options - Options { preferredModel: "auto" | "model1" | "model2", weekDefinition: "epi" | "iso" }
 */
export function processSurveillanceDataset(rawRows, mapping, options = {}) {
  const preferredModel = options.preferredModel || "auto";
  const weekDefinition = options.weekDefinition || "epi";

  const totalUploaded = rawRows.length;
  const processedRows = [];

  const qualitySummary = {
    totalUploaded,
    validDates: 0,
    invalidDates: 0,
    validAges: 0,
    invalidAges: 0,
    missingAges: 0,
    validICD: 0,
    missingICD: 0,
    outsideScopeICD: 0,
    unresolvedSex: 0,
    modelEligible: 0,
    modelExcluded: 0,
    model1UsedCount: 0,
    model2UsedCount: 0
  };

  const problemRows = [];

  for (let index = 0; index < rawRows.length; index++) {
    const r = rawRows[index];
    const rowIssues = [];

    // Extract mapped fields
    const rawDate = r[mapping.admitDateCol];
    const rawAge = r[mapping.ageCol];
    const rawSex = r[mapping.sexCol];
    const rawICD = r[mapping.icdCol];

    // Date parsing
    const parsedDate = rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== ""
      ? getWeekInfo(rawDate, weekDefinition)
      : null;
    const seasonObj = rawDate ? deriveSeason(rawDate) : null;
    const monthObj = rawDate ? getMonthInfo(rawDate) : null;

    if (parsedDate) {
      qualitySummary.validDates++;
    } else {
      qualitySummary.invalidDates++;
      rowIssues.push("Invalid or missing admission date");
    }

    // Age parsing
    let numAge = null;
    if (rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== "") {
      numAge = parseFloat(rawAge);
      if (isNaN(numAge) || numAge < 0 || numAge > 120) {
        qualitySummary.invalidAges++;
        rowIssues.push(`Age out of valid range (0–120): ${rawAge}`);
        numAge = null;
      } else {
        qualitySummary.validAges++;
      }
    } else {
      qualitySummary.missingAges++;
      rowIssues.push("Missing age");
    }

    // Sex parsing
    const normSex = normalizeSex(rawSex);
    if (!normSex) {
      qualitySummary.unresolvedSex++;
      if (rawSex !== undefined && rawSex !== null && String(rawSex).trim() !== "") {
        rowIssues.push(`Unresolved sex representation: '${rawSex}'`);
      }
    }

    // ICD classification
    const icdResult = classifyICD10(rawICD);
    if (icdResult.status === "missing") {
      qualitySummary.missingICD++;
      rowIssues.push("Missing primary ICD-10 diagnosis");
    } else if (icdResult.status === "outside_scope") {
      qualitySummary.outsideScopeICD++;
      rowIssues.push(`Diagnosis '${icdResult.normalizedCode}' outside 11 validated model categories`);
    } else {
      qualitySummary.validICD++;
    }

    // Model estimation
    const ageGroup = numAge !== null ? deriveAgeGroup(numAge) : null;
    const ageModel = numAge !== null ? selectAgeModel(numAge) : null;

    let sariCalc = {
      eligible: false,
      reason: "Not evaluated",
      eta: null,
      probability: null,
      modelUsed: null
    };

    if (numAge !== null && icdResult.isModelEligible) {
      sariCalc = calculateSARIForRow({
        age: numAge,
        sex: normSex,
        seasonKey: seasonObj ? seasonObj.key : null,
        icdCategory: icdResult.category,
        preferredModel
      });
    } else {
      if (numAge === null) {
        sariCalc.reason = "Age is required for model-based SARI estimation";
      } else if (!icdResult.isModelEligible) {
        sariCalc.reason = "ICD-10 code is outside validated model categories";
      }
    }

    if (sariCalc.eligible) {
      qualitySummary.modelEligible++;
      if (sariCalc.modelUsed === "model2") qualitySummary.model2UsedCount++;
      else qualitySummary.model1UsedCount++;
    } else {
      qualitySummary.modelExcluded++;
    }

    const processedRow = {
      rowIndex: index + 1,
      raw: r,
      admitDate: rawDate ? formatDateISO(rawDate) : "",
      dateObj: parsedDate,
      season: seasonObj,
      month: monthObj,
      age: numAge,
      ageGroup,
      ageModel,
      sex: normSex,
      rawSex,
      rawICD,
      normalizedICD: icdResult.normalizedCode,
      icdCategory: icdResult.category,
      icdCategoryTh: icdResult.categoryTh,
      isStudyJCode: icdResult.isStudyJCode,
      isModelEligible: sariCalc.eligible,
      exclusionReason: sariCalc.reason,
      modelUsed: sariCalc.modelUsed,
      linearPredictor: sariCalc.eta,
      predictedSARIProbability: sariCalc.probability,
      issues: rowIssues
    };

    processedRows.push(processedRow);

    if (rowIssues.length > 0) {
      problemRows.push(processedRow);
    }
  }

  return {
    totalUploaded,
    qualitySummary,
    problemRows,
    processedRows,
    options
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AGE_GROUPS,
    deriveAgeGroup,
    selectAgeModel,
    normalizeSex,
    calculateSARIForRow,
    processSurveillanceDataset
  };
}
