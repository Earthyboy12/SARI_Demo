/**
 * ICD-10 Classification and Normalization Engine
 *
 * Implements strict classification according to the 11 study diagnostic groups
 * defined in the Thailand sentinel hospital study (2023–2024).
 */

import { ICD_CATEGORIES } from "./sariCoefficients.js";

export const OUTSIDE_MODEL_SCOPE = "Outside model scope";

/**
 * Normalizes raw ICD-10 strings:
 * - Trims whitespace
 * - Converts to uppercase
 * - Removes internal whitespace
 * - Ensures canonical format with dot where applicable (e.g., "J189" -> "J18.9", "j18.9" -> "J18.9")
 */
export function normalizeICD10(rawCode) {
  if (rawCode === null || rawCode === undefined) return "";
  let s = String(rawCode).trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";

  // If format is like "J189" (Letter followed by 3+ alphanumeric digits with no dot)
  if (/^[A-Z][0-9]{2}[0-9A-Z]+$/.test(s) && !s.includes(".")) {
    return s.slice(0, 3) + "." + s.slice(3);
  }
  return s;
}

/**
 * Classifies a normalized or raw ICD-10 code into one of the 11 validated study diagnostic groups,
 * or marks it as outside model scope.
 *
 * @param {string} rawCode
 * @returns {{
 *   normalizedCode: string,
 *   category: string | null,
 *   categoryTh: string | null,
 *   isModelEligible: boolean,
 *   isStudyJCode: boolean,
 *   status: "study_j" | "study_non_j" | "outside_scope" | "missing"
 * }}
 */
export function classifyICD10(rawCode) {
  const normalized = normalizeICD10(rawCode);
  if (!normalized) {
    return {
      normalizedCode: "",
      category: null,
      categoryTh: null,
      isModelEligible: false,
      isStudyJCode: false,
      status: "missing"
    };
  }

  // Extract base 3-character rubric (e.g., "J18" from "J18.9" or "J18")
  const match = normalized.match(/^([A-Z])([0-9]{2})/);
  if (!match) {
    return {
      normalizedCode: normalized,
      category: OUTSIDE_MODEL_SCOPE,
      categoryTh: "อยู่นอกขอบเขตแบบจำลอง",
      isModelEligible: false,
      isStudyJCode: false,
      status: "outside_scope"
    };
  }

  const letter = match[1];
  const num = parseInt(match[2], 10);
  const codePrefix = `${letter}${match[2]}`;

  let category = null;
  let categoryTh = null;
  let isStudyJCode = false;

  // 1. Upper respiratory tract infection: J00–J06
  if (letter === "J" && num >= 0 && num <= 6) {
    category = ICD_CATEGORIES.URTI;
    categoryTh = "การติดเชื้อทางเดินหายใจส่วนบน (J00–J06)";
    isStudyJCode = true;
  }
  // 2. Influenza: J09–J11
  else if (letter === "J" && num >= 9 && num <= 11) {
    category = ICD_CATEGORIES.INFLUENZA;
    categoryTh = "ไข้หวัดใหญ่ (J09–J11)";
    isStudyJCode = true;
  }
  // 3. Pneumonia: J12–J18
  else if (letter === "J" && num >= 12 && num <= 18) {
    category = ICD_CATEGORIES.PNEUMONIA;
    categoryTh = "ปอดอักเสบ (J12–J18)";
    isStudyJCode = true;
  }
  // 4. Other respiratory tract diseases: J20–J22, J44, J45
  else if (
    letter === "J" &&
    ((num >= 20 && num <= 22) || num === 44 || num === 45)
  ) {
    category = ICD_CATEGORIES.OTHER_RESP;
    categoryTh = "โรคทางเดินหายใจอื่นๆ (J20–J22, J44, J45)";
    isStudyJCode = true;
  }
  // 5. Other common virus infection: B34, U07
  else if (codePrefix === "B34" || codePrefix === "U07") {
    category = ICD_CATEGORIES.OTHER_VIRUS;
    categoryTh = "การติดเชื้อไวรัสทั่วไปอื่นๆ (B34, U07)";
    isStudyJCode = false;
  }
  // 6. Cough: R05
  else if (codePrefix === "R05") {
    category = ICD_CATEGORIES.COUGH;
    categoryTh = "อาการไอ (R05)";
    isStudyJCode = false;
  }
  // 7. Heart failure: I50
  else if (codePrefix === "I50") {
    category = ICD_CATEGORIES.HEART_FAILURE;
    categoryTh = "ภาวะหัวใจล้มเหลว (I50)";
    isStudyJCode = false;
  }
  // 8. Fever of other and unknown origin: R50
  else if (codePrefix === "R50") {
    category = ICD_CATEGORIES.FEVER;
    categoryTh = "ไข้ที่ไม่ทราบสาเหตุหรือสาเหตุอื่น (R50)";
    isStudyJCode = false;
  }
  // 9. Convulsions, not elsewhere classified: R56
  else if (codePrefix === "R56") {
    category = ICD_CATEGORIES.CONVULSIONS;
    categoryTh = "อาการชัก (R56)";
    isStudyJCode = false;
  }
  // 10. Infectious gastroenteritis and colitis, unspecified: A09 (Regression reference)
  else if (codePrefix === "A09") {
    category = ICD_CATEGORIES.GASTROENTERITIS;
    categoryTh = "กระเพาะและลำไส้อักเสบติดเชื้อ (A09)";
    isStudyJCode = false;
  }
  // 11. Abnormalities of breathing: R06
  else if (codePrefix === "R06") {
    category = ICD_CATEGORIES.BREATHING_ABNORMAL;
    categoryTh = "ความผิดปกติของการหายใจ (R06)";
    isStudyJCode = false;
  }
  // Outside model scope
  else {
    return {
      normalizedCode: normalized,
      category: OUTSIDE_MODEL_SCOPE,
      categoryTh: "อยู่นอกขอบเขตแบบจำลอง",
      isModelEligible: false,
      isStudyJCode: false,
      status: "outside_scope"
    };
  }

  return {
    normalizedCode: normalized,
    category,
    categoryTh,
    isModelEligible: true,
    isStudyJCode,
    status: isStudyJCode ? "study_j" : "study_non_j"
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeICD10,
    classifyICD10,
    OUTSIDE_MODEL_SCOPE
  };
}
