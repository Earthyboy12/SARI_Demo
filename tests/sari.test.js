/**
 * Automated Unit Test Suite for SARI ICD-10 Surveillance Application
 * Tests:
 * 1. ICD-10 Normalization & Classification
 * 2. Age Model Selection (Pediatric vs Adult)
 * 3. Age Group Boundary Bins
 * 4. Epidemiological Season Assignment
 * 5. Logistic Regression Formula Mathematics (Model 1 & Model 2)
 * 6. Mathematical Consistency of Aggregations
 */

import assert from "assert";

async function runTests() {
  console.log("=================================================");
  console.log("STARTING SCIENTIFIC SARI ICD-10 UNIT TESTS");
  console.log("=================================================");

  const { normalizeICD10, classifyICD10, OUTSIDE_MODEL_SCOPE } = await import("../src/models/icdClassifier.js");
  const { deriveAgeGroup, selectAgeModel, calculateSARIForRow, processSurveillanceDataset } = await import("../src/models/sariCalculator.js");
  const { deriveSeason, parseSurveillanceDate, getISOWeekInfo, getEpiWeekInfo } = await import("../src/utils/dateUtils.js");
  const { aggregateSurveillance } = await import("../src/utils/dataAggregator.js");
  const { ICD_CATEGORIES } = await import("../src/models/sariCoefficients.js");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error("    ", err.message);
      failed++;
    }
  }

  console.log("\n[1] Testing ICD-10 Normalization and Classification:");

  test("Normalizes lowercase, whitespace, and dotless formats", () => {
    assert.strictEqual(normalizeICD10("j18.9"), "J18.9");
    assert.strictEqual(normalizeICD10("J189"), "J18.9");
    assert.strictEqual(normalizeICD10("  r50.9  "), "R50.9");
    assert.strictEqual(normalizeICD10("J 10 . 1"), "J10.1");
    assert.strictEqual(normalizeICD10("A09"), "A09");
  });

  test("Classifies all 11 validated model diagnostic categories correctly", () => {
    // 1. URTI: J00–J06
    assert.strictEqual(classifyICD10("J00.9").category, ICD_CATEGORIES.URTI);
    assert.strictEqual(classifyICD10("J06.9").category, ICD_CATEGORIES.URTI);
    assert.strictEqual(classifyICD10("J06.9").isStudyJCode, true);

    // 2. Influenza: J09–J11
    assert.strictEqual(classifyICD10("J10.1").category, ICD_CATEGORIES.INFLUENZA);
    assert.strictEqual(classifyICD10("J11.0").category, ICD_CATEGORIES.INFLUENZA);
    assert.strictEqual(classifyICD10("J10.1").isStudyJCode, true);

    // 3. Pneumonia: J12–J18
    assert.strictEqual(classifyICD10("J18.9").category, ICD_CATEGORIES.PNEUMONIA);
    assert.strictEqual(classifyICD10("J12.8").category, ICD_CATEGORIES.PNEUMONIA);
    assert.strictEqual(classifyICD10("J18.9").isStudyJCode, true);

    // 4. Other respiratory tract diseases: J20–J22, J44, J45
    assert.strictEqual(classifyICD10("J21.0").category, ICD_CATEGORIES.OTHER_RESP);
    assert.strictEqual(classifyICD10("J44.1").category, ICD_CATEGORIES.OTHER_RESP);
    assert.strictEqual(classifyICD10("J45.9").category, ICD_CATEGORIES.OTHER_RESP);
    assert.strictEqual(classifyICD10("J44.1").isStudyJCode, true);

    // 5. Other common virus: B34, U07
    assert.strictEqual(classifyICD10("B34.9").category, ICD_CATEGORIES.OTHER_VIRUS);
    assert.strictEqual(classifyICD10("U07.1").category, ICD_CATEGORIES.OTHER_VIRUS);
    assert.strictEqual(classifyICD10("B34.9").isStudyJCode, false);

    // 6. Cough: R05
    assert.strictEqual(classifyICD10("R05.9").category, ICD_CATEGORIES.COUGH);
    assert.strictEqual(classifyICD10("R05").category, ICD_CATEGORIES.COUGH);

    // 7. Heart failure: I50
    assert.strictEqual(classifyICD10("I50.9").category, ICD_CATEGORIES.HEART_FAILURE);

    // 8. Fever: R50
    assert.strictEqual(classifyICD10("R50.9").category, ICD_CATEGORIES.FEVER);

    // 9. Convulsions: R56
    assert.strictEqual(classifyICD10("R56.0").category, ICD_CATEGORIES.CONVULSIONS);

    // 10. Gastroenteritis: A09 (reference)
    assert.strictEqual(classifyICD10("A09").category, ICD_CATEGORIES.GASTROENTERITIS);
    assert.strictEqual(classifyICD10("A09.0").category, ICD_CATEGORIES.GASTROENTERITIS);

    // 11. Abnormalities of breathing: R06
    assert.strictEqual(classifyICD10("R06.0").category, ICD_CATEGORIES.BREATHING_ABNORMAL);
  });

  test("Correctly marks out-of-scope ICD-10 codes and non-model J-codes", () => {
    const j42 = classifyICD10("J42");
    assert.strictEqual(j42.isModelEligible, false);
    assert.strictEqual(j42.category, OUTSIDE_MODEL_SCOPE);

    const c34 = classifyICD10("C34.9");
    assert.strictEqual(c34.isModelEligible, false);
    assert.strictEqual(c34.category, OUTSIDE_MODEL_SCOPE);

    const i10 = classifyICD10("I10");
    assert.strictEqual(i10.isModelEligible, false);
    assert.strictEqual(i10.category, OUTSIDE_MODEL_SCOPE);
  });

  console.log("\n[2] Testing Age Model Selection:");

  test("Age model threshold at 15 years", () => {
    assert.strictEqual(selectAgeModel(0), "pediatric");
    assert.strictEqual(selectAgeModel(4), "pediatric");
    assert.strictEqual(selectAgeModel(14), "pediatric");
    assert.strictEqual(selectAgeModel(14.99), "pediatric");
    assert.strictEqual(selectAgeModel(15), "adult");
    assert.strictEqual(selectAgeModel(15.01), "adult");
    assert.strictEqual(selectAgeModel(65), "adult");
    assert.strictEqual(selectAgeModel(-1), null);
    assert.strictEqual(selectAgeModel(null), null);
  });

  console.log("\n[3] Testing Age Group Classification Boundaries:");

  test("All 6 epidemiological age group boundaries", () => {
    assert.strictEqual(deriveAgeGroup(0).key, "<2");
    assert.strictEqual(deriveAgeGroup(1.99).key, "<2");
    assert.strictEqual(deriveAgeGroup(2).key, "2-4");
    assert.strictEqual(deriveAgeGroup(4.99).key, "2-4");
    assert.strictEqual(deriveAgeGroup(5).key, "5-14");
    assert.strictEqual(deriveAgeGroup(14.99).key, "5-14");
    assert.strictEqual(deriveAgeGroup(15).key, "15-49");
    assert.strictEqual(deriveAgeGroup(49.99).key, "15-49");
    assert.strictEqual(deriveAgeGroup(50).key, "50-64");
    assert.strictEqual(deriveAgeGroup(64.99).key, "50-64");
    assert.strictEqual(deriveAgeGroup(65).key, ">=65");
    assert.strictEqual(deriveAgeGroup(95).key, ">=65");
  });

  console.log("\n[4] Testing Epidemiological Seasons Derivation:");

  test("Derives Summer, Rainy, and Winter across all 12 months", () => {
    // Summer: Feb-May (Months 2, 3, 4, 5)
    assert.strictEqual(deriveSeason("2026-02-15").key, "summer");
    assert.strictEqual(deriveSeason("2026-03-01").key, "summer");
    assert.strictEqual(deriveSeason("2026-04-14").key, "summer");
    assert.strictEqual(deriveSeason("2026-05-31").key, "summer");

    // Rainy: Jun-Oct (Months 6, 7, 8, 9, 10)
    assert.strictEqual(deriveSeason("2026-06-01").key, "rainy");
    assert.strictEqual(deriveSeason("2026-08-15").key, "rainy");
    assert.strictEqual(deriveSeason("2026-10-31").key, "rainy");

    // Winter: Nov-Jan (Months 11, 12, 1)
    assert.strictEqual(deriveSeason("2026-11-01").key, "winter");
    assert.strictEqual(deriveSeason("2026-12-25").key, "winter");
    assert.strictEqual(deriveSeason("2026-01-10").key, "winter");
  });

  test("Handles Thai Buddhist Era (BE > 2400) automatically", () => {
    const d = parseSurveillanceDate("2567-08-15");
    assert.strictEqual(d.getFullYear(), 2024);
    assert.strictEqual(deriveSeason("2567-08-15").key, "rainy");
  });

  console.log("\n[5] Testing Exact Logistic Regression Calculation:");

  test("Adult Model 2 calculation matches hand-calculated benchmark (Adult 65yo, Female, Pneumonia, Rainy)", () => {
    // Hand calculation:
    // η = -2.721175174 + 3.158763163 - (0.005659015 * 65) + 0 - 0.203857226 = -0.134105212
    // P = 1 / (1 + exp(0.134105212)) = 0.466523852135
    const res = calculateSARIForRow({
      age: 65,
      sex: "female",
      seasonKey: "rainy",
      icdCategory: ICD_CATEGORIES.PNEUMONIA,
      preferredModel: "model2"
    });

    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.modelUsed, "model2");
    assert.strictEqual(res.ageModelKey, "adult");

    const expectedEta = -2.721175174 + 3.158763163 - 0.005659015 * 65 - 0.203857226;
    const expectedP = 1 / (1 + Math.exp(-expectedEta));

    assert(Math.abs(res.eta - expectedEta) < 1e-9, `Eta diff too large: ${res.eta} vs ${expectedEta}`);
    assert(Math.abs(res.probability - expectedP) < 1e-9, `P diff too large: ${res.probability} vs ${expectedP}`);
    assert(Math.abs(res.probability - 0.4665238521) < 1e-6);
  });

  test("Pediatric Model 2 calculation matches hand-calculated benchmark (Pediatric 4yo, Male, Influenza, Winter)", () => {
    // Hand calculation:
    // η = -1.6956315454 + 2.6694128122 - (0.0009499213 * 4) - 0.1375864474 + 0.2388286021 = 1.0712237363
    // P = 1 / (1 + exp(-1.0712237363)) = 0.744829567
    const res = calculateSARIForRow({
      age: 4,
      sex: "male",
      seasonKey: "winter",
      icdCategory: ICD_CATEGORIES.INFLUENZA,
      preferredModel: "model2"
    });

    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.modelUsed, "model2");
    assert.strictEqual(res.ageModelKey, "pediatric");

    const expectedEta = -1.6956315454 + 2.6694128122 - 0.0009499213 * 4 - 0.1375864474 + 0.2388286021;
    const expectedP = 1 / (1 + Math.exp(-expectedEta));

    assert(Math.abs(res.eta - expectedEta) < 1e-9);
    assert(Math.abs(res.probability - expectedP) < 1e-9);
    assert(Math.abs(res.probability - 0.744829567) < 1e-6);
  });

  test("Model 1 calculation for Adult and Pediatric reference categories", () => {
    // Adult Model 1 Cough: η = -3.0706336 + 2.5698583 = -0.5007753
    const resAdult = calculateSARIForRow({
      age: 32,
      sex: "male",
      seasonKey: "summer",
      icdCategory: ICD_CATEGORIES.COUGH,
      preferredModel: "model1"
    });
    assert.strictEqual(resAdult.modelUsed, "model1");
    assert(Math.abs(resAdult.eta - (-0.5007753)) < 1e-6);

    // Pediatric Model 1 Reference A09: η = -1.5070759 + 0 = -1.5070759
    const resPed = calculateSARIForRow({
      age: 2,
      sex: "female",
      seasonKey: "summer",
      icdCategory: ICD_CATEGORIES.GASTROENTERITIS,
      preferredModel: "model1"
    });
    assert.strictEqual(resPed.modelUsed, "model1");
    assert(Math.abs(resPed.eta - (-1.5070759)) < 1e-6);
    assert(Math.abs(resPed.probability - (1 / (1 + Math.exp(1.5070759)))) < 1e-6);
  });

  console.log("\n[6] Testing Aggregation Mathematical Consistency:");

  test("Total Estimated SARI exactly equals sum of individual probabilities, J + non-J equals Total, and Age sum equals Total", () => {
    const mockRows = [
      { admit_date: "2026-01-01", age: 4, sex: "Male", primary_ICD_10: "J18.9" },
      { admit_date: "2026-01-02", age: 68, sex: "Female", primary_ICD_10: "R50.9" },
      { admit_date: "2026-01-03", age: 32, sex: "Male", primary_ICD_10: "J10.1" },
      { admit_date: "2026-01-04", age: 1, sex: "Female", primary_ICD_10: "R05" },
      { admit_date: "2026-01-05", age: 72, sex: "Male", primary_ICD_10: "I50.9" },
      { admit_date: "2026-01-06", age: 10, sex: "Female", primary_ICD_10: "R56.0" },
      { admit_date: "2026-01-07", age: 55, sex: "Female", primary_ICD_10: "C34.9" } // Out of scope
    ];

    const mapping = {
      admitDateCol: "admit_date",
      ageCol: "age",
      sexCol: "sex",
      icdCol: "primary_ICD_10"
    };

    const processed = processSurveillanceDataset(mockRows, mapping, { preferredModel: "auto" });
    assert.strictEqual(processed.qualitySummary.totalUploaded, 7);
    assert.strictEqual(processed.qualitySummary.modelEligible, 6);
    assert.strictEqual(processed.qualitySummary.outsideScopeICD, 1);

    const agg = aggregateSurveillance(processed.processedRows);

    // Sum of individual probabilities
    const manualSum = processed.processedRows
      .filter(r => r.isModelEligible)
      .reduce((sum, r) => sum + r.predictedSARIProbability, 0);

    assert(Math.abs(agg.kpis.estimatedSARITotal - manualSum) < 1e-12, "KPI total must match manual sum");

    // J vs Non-J sum equals total
    const jPlusNonJ = agg.kpis.estimatedSARIJCode + agg.kpis.estimatedSARINonJCode;
    assert(Math.abs(jPlusNonJ - agg.kpis.estimatedSARITotal) < 1e-12, "J + Non-J must equal Total");

    // Age groups sum equals total
    const ageGroupSum = agg.ageGroupsSummary.reduce((sum, g) => sum + g.estimatedSARI, 0);
    assert(Math.abs(ageGroupSum - agg.kpis.estimatedSARITotal) < 1e-12, "Age group sum must equal Total");

    // Sex sum equals total
    const sexSum = agg.sexSummary.male.estimatedSARI + agg.sexSummary.female.estimatedSARI;
    assert(Math.abs(sexSum - agg.kpis.estimatedSARITotal) < 1e-12, "Sex sum must equal Total");
  });


  console.log("\n[7] Testing Word Document (.docx) Report Generator:");

  await test("Generates complete editable executive Word document (.docx) in Thai", async () => {
    await import("../src/docx.umd.js");
    const { exportSurveillanceReportDocx } = await import("../src/utils/exportUtils.js");
    const { generateSyntheticSurveillanceData } = await import("../src/utils/demoDataGenerator.js");

    const sampleData = generateSyntheticSurveillanceData().slice(0, 50);
    const mapping = { admitDateCol: "admit_date", ageCol: "age", sexCol: "sex", icdCol: "primary_ICD_10" };
    const processed = processSurveillanceDataset(sampleData, mapping);
    const agg = aggregateSurveillance(processed.processedRows);

    let generatedBlob = null;
    let generatedFilename = null;
    globalThis.onBrowserDownload = (blob, filename) => {
      generatedBlob = blob;
      generatedFilename = filename;
    };

    await exportSurveillanceReportDocx(agg, {
      hospitalName: "โรงพยาบาลศูนย์ทดสอบ",
      province: "กรุงเทพมหานคร",
      reportingPeriod: "2024-2025"
    }, processed, "th");

    assert(generatedBlob !== null, "Word blob must be generated");
    assert(generatedBlob.size > 5000, `Generated docx blob should be > 5KB, got: ${generatedBlob.size}`);
    assert(generatedFilename.endsWith(".docx"), "Filename must have .docx extension");
  });

  await test("Generates 100% pure English Word document (.docx) with no Thai characters when lang === 'en'", async () => {
    const { exportSurveillanceReportDocx } = await import("../src/utils/exportUtils.js");
    const { generateSyntheticSurveillanceData } = await import("../src/utils/demoDataGenerator.js");

    const sampleData = generateSyntheticSurveillanceData().slice(0, 50);
    const mapping = { admitDateCol: "admit_date", ageCol: "age", sexCol: "sex", icdCol: "primary_ICD_10" };
    const processed = processSurveillanceDataset(sampleData, mapping);
    const agg = aggregateSurveillance(processed.processedRows);

    let generatedBlob = null;
    globalThis.onBrowserDownload = (blob) => {
      generatedBlob = blob;
    };

    await exportSurveillanceReportDocx(agg, {
      hospitalName: "Bangkok Sentinel Hospital",
      province: "Bangkok",
      reportingPeriod: "2025-2026"
    }, processed, "en");

    assert(generatedBlob !== null, "Word blob must be generated");
    const arrayBuffer = await generatedBlob.arrayBuffer();
    const docxBuffer = Buffer.from(arrayBuffer);

    // Decompress word/document.xml from ZIP and verify zero Thai characters
    const { inflateRawSync } = await import("node:zlib");
    const docxXmlHeader = Buffer.from("word/document.xml");
    const idx = docxBuffer.indexOf(docxXmlHeader);
    assert(idx !== -1, "word/document.xml must exist in docx");
    const extraLen = docxBuffer.readUInt16LE(idx - 2);
    const dataStart = idx + 17 + extraLen;
    const uncompressedXml = inflateRawSync(docxBuffer.subarray(dataStart)).toString("utf-8");
    const thaiMatches = uncompressedXml.match(/[\u0E00-\u0E7F]/g);
    assert.strictEqual(thaiMatches, null, "English Word document.xml must contain zero Thai characters");
  });

  await test("Embeds chart images into Word document (.docx) via ImageRun", async () => {
    const { exportSurveillanceReportDocx } = await import("../src/utils/exportUtils.js");
    const { generateSyntheticSurveillanceData } = await import("../src/utils/demoDataGenerator.js");

    const sampleData = generateSyntheticSurveillanceData().slice(0, 50);
    const mapping = { admitDateCol: "admit_date", ageCol: "age", sexCol: "sex", icdCol: "primary_ICD_10" };
    const processed = processSurveillanceDataset(sampleData, mapping);
    const agg = aggregateSurveillance(processed.processedRows);

    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const pngBytes = Uint8Array.from(Buffer.from(pngBase64, "base64"));
    const mockImages = {
      mainTrend: pngBytes,
      icdComp: pngBytes,
      jVsNonJ: pngBytes
    };

    let baseBlob = null;
    globalThis.onBrowserDownload = (b) => { baseBlob = b; };
    await exportSurveillanceReportDocx(agg, {}, processed, "en");

    let imgBlob = null;
    globalThis.onBrowserDownload = (b) => { imgBlob = b; };
    await exportSurveillanceReportDocx(agg, {}, processed, "en", mockImages);

    assert(imgBlob !== null, "Word blob with images must be generated");
    assert(imgBlob.size > baseBlob.size, `Word with images (${imgBlob.size}B) must be larger than without (${baseBlob.size}B)`);
  });

  console.log("\n[8] Testing Dashboard Modes & Translations:");

  await test("Simplified and Advanced translations exist in both Thai and English", async () => {
    const { TRANSLATIONS } = await import("../src/i18n/translations.js");
    const requiredKeys = [
      "modeToggleLabel", "modeSimplify", "modeAdvanced", "modeSimplifyTip", "modeAdvancedTip",
      "executiveInsightsTitle", "executiveInsightsSub", "ageSummaryTableTitle", "ageSummaryTableSub",
      "takeaway1Title", "takeaway2Title", "takeaway3Title",
      "colAgeGroup", "colEligibleAdmissionsShort", "colEstimatedSARIShort", "colRatePer100"
    ];
    for (const key of requiredKeys) {
      assert(TRANSLATIONS.th[key], `Missing Thai translation for ${key}`);
      assert(TRANSLATIONS.en[key], `Missing English translation for ${key}`);
    }
  });

  await test("App exports state with default dashboardMode === 'simplified'", async () => {
    const { state } = await import("../src/app.js");
    assert.strictEqual(state.dashboardMode, "simplified");
  });


  console.log("\n=================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
