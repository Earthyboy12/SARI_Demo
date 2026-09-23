/**
 * Realistic Synthetic Surveillance Dataset Generator
 * Generates ~2,400 non-identifiable admission records spanning 24 months (2024-01-01 to 2025-12-31)
 * with authentic seasonal epidemic surges in Thailand:
 * - Rainy season surges (June–October): Influenza peaks, RSV-like pediatric bronchiolitis
 * - Winter surges (November–January): Pneumonia in elderly, viral infections
 * - Summer baseline (February–May)
 * - Proportions matching Thai sentinel surveillance literature
 */

export function generateSyntheticSurveillanceData() {
  const records = [];
  const startDate = new Date(2024, 0, 1);
  const totalDays = 730; // 2 years

  // ICD pool with realistic frequencies
  const pedIcdPool = [
    { code: "J06.9", weight: 22 }, // URTI
    { code: "J10.1", weight: 14 }, // Influenza
    { code: "J18.9", weight: 20 }, // Pneumonia
    { code: "J21.0", weight: 16 }, // Bronchiolitis (Other resp)
    { code: "R50.9", weight: 8 },  // Fever
    { code: "R56.0", weight: 6 },  // Febrile convulsions
    { code: "R05", weight: 4 },    // Cough
    { code: "R06.0", weight: 3 },  // Breathing abnormal
    { code: "B34.9", weight: 4 },  // Other virus
    { code: "A09", weight: 2 },    // Gastroenteritis
    { code: "K35.8", weight: 1 }   // Out of scope appendicitis
  ];

  const adultIcdPool = [
    { code: "J18.9", weight: 26 }, // Pneumonia
    { code: "J10.1", weight: 12 }, // Influenza
    { code: "J44.1", weight: 16 }, // COPD (Other resp)
    { code: "J45.9", weight: 8 },  // Asthma
    { code: "J06.9", weight: 10 }, // URTI
    { code: "I50.9", weight: 8 },  // Heart failure
    { code: "U07.1", weight: 5 },  // COVID-19 (Other virus)
    { code: "R05", weight: 4 },    // Cough
    { code: "R50.9", weight: 4 },  // Fever
    { code: "R06.0", weight: 3 },  // Dyspnea
    { code: "A09", weight: 2 },    // Gastroenteritis
    { code: "C34.9", weight: 1.5 },// Out of scope lung cancer
    { code: "I10", weight: 0.5 }   // Out of scope HT
  ];

  function pickWeighted(pool) {
    const totalWeight = pool.reduce((acc, p) => acc + p.weight, 0);
    let r = Math.random() * totalWeight;
    for (const item of pool) {
      if (r < item.weight) return item.code;
      r -= item.weight;
    }
    return pool[0].code;
  }

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const curDate = new Date(startDate.getTime() + dayOffset * 86400000);
    const month = curDate.getMonth() + 1; // 1 to 12

    // Seasonal multiplier
    let seasonalMult = 1.0;
    if (month >= 6 && month <= 10) {
      // Rainy surge (peaking in Aug/Sep)
      seasonalMult = 1.55 + (month === 8 || month === 9 ? 0.35 : 0.1);
    } else if (month === 11 || month === 12 || month === 1) {
      // Winter surge
      seasonalMult = 1.35;
    } else {
      // Summer low baseline
      seasonalMult = 0.85;
    }

    // Number of daily admissions
    const baseDaily = 2.4;
    const dailyCount = Math.floor(baseDaily * seasonalMult + (Math.random() > 0.45 ? 1 : 0) + (Math.random() > 0.8 ? 1 : 0));

    const y = curDate.getFullYear();
    const mStr = String(month).padStart(2, "0");
    const dStr = String(curDate.getDate()).padStart(2, "0");
    const dateStr = `${y}-${mStr}-${dStr}`;

    for (let i = 0; i < dailyCount; i++) {
      const isPediatric = Math.random() < 0.38; // ~38% pediatric in respiratory surveillance
      let age, code, sex;

      // Realistic sex distribution
      const sexRand = Math.random();
      if (sexRand < 0.48) sex = "Female";
      else if (sexRand < 0.96) sex = "Male";
      else sex = Math.random() > 0.5 ? "หญิง" : "ชาย"; // realistic Thai text occasionally

      if (isPediatric) {
        // Pediatric age distribution (heavier on <2 and 2-4)
        const pedRand = Math.random();
        if (pedRand < 0.42) {
          age = Math.floor(Math.random() * 2); // 0 or 1
        } else if (pedRand < 0.75) {
          age = 2 + Math.floor(Math.random() * 3); // 2, 3, 4
        } else {
          age = 5 + Math.floor(Math.random() * 10); // 5 to 14
        }
        code = pickWeighted(pedIcdPool);
      } else {
        // Adult age distribution (heavier on elderly >=65)
        const adultRand = Math.random();
        if (adultRand < 0.28) {
          age = 15 + Math.floor(Math.random() * 35); // 15–49
        } else if (adultRand < 0.58) {
          age = 50 + Math.floor(Math.random() * 15); // 50–64
        } else {
          age = 65 + Math.floor(Math.random() * 25); // 65–89
        }
        code = pickWeighted(adultIcdPool);
      }

      // Slightly vary formatting to test data normalization
      let formattedCode = code;
      const formatRand = Math.random();
      if (formatRand < 0.08) {
        formattedCode = code.replace(".", ""); // dotless like J189
      } else if (formatRand < 0.12) {
        formattedCode = `  ${code.toLowerCase()}  `; // lowercase + spaces
      }

      records.push({
        admit_date: dateStr,
        sex,
        age,
        primary_ICD_10: formattedCode
      });
    }
  }

  // Inject a small number of realistic data quality check cases (~0.8%)
  records.push({ admit_date: "2024-03-12", sex: "Male", age: 145, primary_ICD_10: "J18.9" }); // Invalid age > 120
  records.push({ admit_date: "2024-07-20", sex: "Female", age: "", primary_ICD_10: "J10.1" }); // Missing age
  records.push({ admit_date: "2024-09-04", sex: "Unknown", age: 45, primary_ICD_10: "R05" }); // Unresolved sex
  records.push({ admit_date: "2025-01-18", sex: "Male", age: 72, primary_ICD_10: "" }); // Missing ICD
  records.push({ admit_date: "2025-08-22", sex: "Female", age: 30, primary_ICD_10: "J42" }); // Non-model J-code

  return records;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateSyntheticSurveillanceData };
}
