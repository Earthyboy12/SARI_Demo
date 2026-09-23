/**
 * SARI ICD-10 Model Coefficients Configuration
 * Model version: SARI ICD-10 Model v1.0 — Thailand sentinel hospital study, 2023–2024
 *
 * Source: "Evaluation of ICD-10 Admission Data to Complement Severe Acute
 * Respiratory Infection Surveillance in Thailand: A Multicenter Mixed-Methods Study."
 */

export const MODEL_METADATA = {
  version: "SARI ICD-10 Model v1.0",
  study: "Thailand sentinel hospital study, 2023–2024",
  referenceCategoryICD: "Infectious gastroenteritis and colitis, unspecified (A09)",
  referenceCategorySex: "Female",
  referenceCategorySeason: "Summer (February–May)",
  ageThreshold: 15 // Pediatric: age 0–14, Adult: age >= 15
};

export const ICD_CATEGORIES = {
  URTI: "Upper respiratory tract infection",
  INFLUENZA: "Influenza",
  PNEUMONIA: "Pneumonia",
  OTHER_RESP: "Other respiratory tract diseases",
  OTHER_VIRUS: "Other common virus infection",
  COUGH: "Cough",
  HEART_FAILURE: "Heart failure",
  FEVER: "Fever of other and unknown origin",
  CONVULSIONS: "Convulsions, not elsewhere classified",
  GASTROENTERITIS: "Infectious gastroenteritis and colitis, unspecified",
  BREATHING_ABNORMAL: "Abnormalities of breathing"
};

export const SARI_MODELS = Object.freeze({
  pediatric: Object.freeze({
    label: "Pediatric Model (Age 0–14 years)",
    labelTh: "แบบจำลองสำหรับผู้ป่วยเด็ก (อายุ 0–14 ปี)",
    model1: Object.freeze({
      name: "Model 1",
      description: "ICD-10 category only",
      descriptionTh: "ใช้เฉพาะกลุ่มการวินิจฉัย ICD-10",
      intercept: -1.5070759,
      icdCoefficients: Object.freeze({
        [ICD_CATEGORIES.URTI]: 2.3259925,
        [ICD_CATEGORIES.INFLUENZA]: 2.7499378,
        [ICD_CATEGORIES.PNEUMONIA]: 2.2834658,
        [ICD_CATEGORIES.OTHER_RESP]: 2.1883418,
        [ICD_CATEGORIES.OTHER_VIRUS]: 1.7423900,
        [ICD_CATEGORIES.COUGH]: 1.9423940,
        [ICD_CATEGORIES.HEART_FAILURE]: 0.9474601,
        [ICD_CATEGORIES.FEVER]: 2.0056314,
        [ICD_CATEGORIES.CONVULSIONS]: 1.2709986,
        [ICD_CATEGORIES.GASTROENTERITIS]: 0.0, // Reference category
        [ICD_CATEGORIES.BREATHING_ABNORMAL]: 1.6612266
      })
    }),
    model2: Object.freeze({
      name: "Model 2",
      description: "ICD-10 + age + sex + admission season",
      descriptionTh: "ใช้กลุ่ม ICD-10 + อายุ + เพศ + ฤดูกาลที่รับไว้รักษา",
      intercept: -1.6956315454,
      icdCoefficients: Object.freeze({
        [ICD_CATEGORIES.URTI]: 2.3240835929,
        [ICD_CATEGORIES.INFLUENZA]: 2.6694128122,
        [ICD_CATEGORIES.PNEUMONIA]: 2.2364170509,
        [ICD_CATEGORIES.OTHER_RESP]: 2.1343254755,
        [ICD_CATEGORIES.OTHER_VIRUS]: 1.6414348620,
        [ICD_CATEGORIES.COUGH]: 1.8963454911,
        [ICD_CATEGORIES.HEART_FAILURE]: 0.9452093317,
        [ICD_CATEGORIES.FEVER]: 1.9809302479,
        [ICD_CATEGORIES.CONVULSIONS]: 1.2424288083,
        [ICD_CATEGORIES.GASTROENTERITIS]: 0.0, // Reference category
        [ICD_CATEGORIES.BREATHING_ABNORMAL]: 1.5957794481
      }),
      ageBeta: -0.0009499213, // Per 1-year increase
      sexBeta: Object.freeze({
        female: 0.0, // Reference
        male: -0.1375864474
      }),
      seasonBeta: Object.freeze({
        summer: 0.0, // Reference (Feb–May)
        rainy: 0.5112501576, // Jun–Oct
        winter: 0.2388286021 // Nov–Jan
      })
    })
  }),

  adult: Object.freeze({
    label: "Adult Model (Age ≥15 years)",
    labelTh: "แบบจำลองสำหรับผู้ใหญ่ (อายุ 15 ปีขึ้นไป)",
    model1: Object.freeze({
      name: "Model 1",
      description: "ICD-10 category only",
      descriptionTh: "ใช้เฉพาะกลุ่มการวินิจฉัย ICD-10",
      intercept: -3.0706336,
      icdCoefficients: Object.freeze({
        [ICD_CATEGORIES.URTI]: 3.1595811,
        [ICD_CATEGORIES.INFLUENZA]: 4.2870289,
        [ICD_CATEGORIES.PNEUMONIA]: 3.0898649,
        [ICD_CATEGORIES.OTHER_RESP]: 2.3421470,
        [ICD_CATEGORIES.OTHER_VIRUS]: 2.6941560,
        [ICD_CATEGORIES.COUGH]: 2.5698583,
        [ICD_CATEGORIES.HEART_FAILURE]: 0.4239523,
        [ICD_CATEGORIES.FEVER]: 2.3634017,
        [ICD_CATEGORIES.CONVULSIONS]: -0.8270007,
        [ICD_CATEGORIES.GASTROENTERITIS]: 0.0, // Reference category
        [ICD_CATEGORIES.BREATHING_ABNORMAL]: 1.4611957
      })
    }),
    model2: Object.freeze({
      name: "Model 2",
      description: "ICD-10 + age + sex + admission season",
      descriptionTh: "ใช้กลุ่ม ICD-10 + อายุ + เพศ + ฤดูกาลที่รับไว้รักษา",
      intercept: -2.721175174,
      icdCoefficients: Object.freeze({
        [ICD_CATEGORIES.URTI]: 3.166212498,
        [ICD_CATEGORIES.INFLUENZA]: 4.252996649,
        [ICD_CATEGORIES.PNEUMONIA]: 3.158763163,
        [ICD_CATEGORIES.OTHER_RESP]: 2.419300659,
        [ICD_CATEGORIES.OTHER_VIRUS]: 2.687137906,
        [ICD_CATEGORIES.COUGH]: 2.626889395,
        [ICD_CATEGORIES.HEART_FAILURE]: 0.486647426,
        [ICD_CATEGORIES.FEVER]: 2.352656755,
        [ICD_CATEGORIES.CONVULSIONS]: -0.877191620,
        [ICD_CATEGORIES.GASTROENTERITIS]: 0.0, // Reference category
        [ICD_CATEGORIES.BREATHING_ABNORMAL]: 1.498794899
      }),
      ageBeta: -0.005659015, // Per 1-year increase
      sexBeta: Object.freeze({
        female: 0.0, // Reference
        male: 0.002076021
      }),
      seasonBeta: Object.freeze({
        summer: 0.0, // Reference (Feb–May)
        rainy: -0.203857226, // Jun–Oct
        winter: 0.085881590 // Nov–Jan
      })
    })
  })
});

// Provide CommonJS export compatibility if running in Node directly
if (typeof module !== "undefined" && module.exports) {
  module.exports = { MODEL_METADATA, ICD_CATEGORIES, SARI_MODELS };
}
