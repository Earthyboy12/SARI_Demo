/**
 * Export and Reporting Suite
 * Handles:
 * - CSV & Excel Template downloads
 * - Processed row-level audit CSV export
 * - Comprehensive 10-sheet Excel workbook export via SheetJS
 * - PNG / SVG publication-grade chart export
 */

import { MODEL_METADATA, SARI_MODELS, ICD_CATEGORIES } from "../models/sariCoefficients.js";

/**
 * Triggers a browser file download.
 */
export function triggerBrowserDownload(blob, filename) {
  if (typeof document === 'undefined') {
    if (typeof globalThis.onBrowserDownload === 'function') {
      globalThis.onBrowserDownload(blob, filename);
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads the standardized CSV template.
 */
export function downloadCSVTemplate() {
  const csvContent =
    "admit_date,sex,age,primary_ICD_10\n" +
    "2026-01-01,Male,4,J18.9\n" +
    "2026-01-01,Female,68,R50.9\n" +
    "2026-01-02,Male,32,J10.1\n";

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, "SARI_Surveillance_Template.csv");
}

/**
 * Downloads the standardized Excel template using SheetJS (XLSX).
 */
export function downloadExcelTemplate() {
  if (typeof XLSX === "undefined") {
    downloadCSVTemplate();
    return;
  }

  const data = [
    { admit_date: "2026-01-01", sex: "Male", age: 4, primary_ICD_10: "J18.9" },
    { admit_date: "2026-01-01", sex: "Female", age: 68, primary_ICD_10: "R50.9" },
    { admit_date: "2026-01-02", sex: "Male", age: 32, primary_ICD_10: "J10.1" }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SARI_Template");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerBrowserDownload(blob, "SARI_Surveillance_Template.xlsx");
}

/**
 * Exports complete row-level processed data including statistical predictions to CSV.
 */
export function downloadProcessedDataCSV(processedRows) {
  if (!processedRows || processedRows.length === 0) return;

  const headers = [
    "row_index",
    "admit_date",
    "age",
    "sex",
    "primary_ICD_10_raw",
    "normalized_ICD10",
    "ICD_category",
    "j_code_status",
    "age_group",
    "pediatric_adult",
    "season",
    "model_used",
    "linear_predictor_eta",
    "predicted_SARI_probability",
    "model_eligible",
    "exclusion_reason"
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines = [headers.join(",")];

  for (const r of processedRows) {
    const rowData = [
      r.rowIndex,
      r.admitDate || "",
      r.age !== null ? r.age : "",
      r.sex || r.rawSex || "",
      r.rawICD || "",
      r.normalizedICD || "",
      r.icdCategory || "Outside model scope",
      r.isStudyJCode ? "Study J-code" : (r.isModelEligible ? "Study non-J-code" : "Outside scope"),
      r.ageGroup ? r.ageGroup.labelEn : "",
      r.ageModel || "",
      r.season ? r.season.labelEn : "",
      r.modelUsed || "None",
      r.linearPredictor !== null ? r.linearPredictor.toFixed(6) : "",
      r.predictedSARIProbability !== null ? r.predictedSARIProbability.toFixed(6) : "",
      r.isModelEligible ? "Yes" : "No",
      r.exclusionReason || ""
    ];
    lines.push(rowData.map(escapeCSV).join(","));
  }

  const csvContent = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  triggerBrowserDownload(blob, "SARI_RowLevel_Processed_Data.csv");
}

/**
 * Downloads comprehensive 10-sheet analysis workbook in Excel (.xlsx) format.
 */
export function downloadAggregatedExcel(aggResults, hospitalInfo = {}, metadata = {}) {
  if (typeof XLSX === "undefined") {
    alert("Excel export library is loading. Please try again in a moment.");
    return;
  }

  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summaryData = [
    { Indicator: "Hospital / Healthcare Facility", Value: hospitalInfo.hospitalName || "Not specified" },
    { Indicator: "Province", Value: hospitalInfo.province || "Not specified" },
    { Indicator: "Reporting Period", Value: hospitalInfo.reportingPeriod || "All uploaded dates" },
    { Indicator: "Analysis Timestamp", Value: new Date().toISOString() },
    { Indicator: "Model Version", Value: MODEL_METADATA.version + " (" + MODEL_METADATA.study + ")" },
    { Indicator: "Total Admissions Uploaded", Value: aggResults.kpis.totalUploaded },
    { Indicator: "Study-Eligible Admissions", Value: aggResults.kpis.eligibleAdmissions },
    { Indicator: "Study-Eligible Admissions (%)", Value: Number(aggResults.kpis.eligiblePercent.toFixed(2)) },
    { Indicator: "Estimated SARI Admissions", Value: Number(aggResults.kpis.estimatedSARITotal.toFixed(2)) },
    { Indicator: "Study J-code Admissions", Value: aggResults.kpis.studyJCodeAdmissions },
    { Indicator: "Estimated SARI from J-code Diagnoses", Value: Number(aggResults.kpis.estimatedSARIJCode.toFixed(2)) },
    { Indicator: "Estimated SARI from Non-J Diagnoses", Value: Number(aggResults.kpis.estimatedSARINonJCode.toFixed(2)) },
    { Indicator: "% Estimated SARI from Non-J Diagnoses", Value: Number(aggResults.kpis.pctEstimatedSARIFromNonJ.toFixed(2)) },
    { Indicator: "Outside Model Scope Admissions", Value: aggResults.kpis.outsideScopeCount }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

  // 2. Weekly Estimates Sheet
  const weeklyData = aggResults.weeklySeries.map((w) => ({
    Week: w.label,
    StartDate: w.startDate,
    EndDate: w.endDate,
    EligibleAdmissions: w.totalEligible,
    StudyJCodes: w.studyJCodes,
    StudyNonJCodes: w.studyNonJCodes,
    EstimatedSARI: Number(w.estimatedSARI.toFixed(2)),
    EstimatedSARI_J: Number(w.estimatedSARIJ.toFixed(2)),
    EstimatedSARI_NonJ: Number(w.estimatedSARINonJ.toFixed(2)),
    MaleSARI: Number(w.maleSARI.toFixed(2)),
    FemaleSARI: Number(w.femaleSARI.toFixed(2))
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyData), "Weekly Estimates");

  // 3. Monthly Estimates Sheet
  const monthlyData = aggResults.monthlySeries.map((m) => ({
    MonthKey: m.key,
    MonthLabelEn: m.labelEn,
    MonthLabelTh: m.labelTh,
    EligibleAdmissions: m.totalEligible,
    StudyJCodes: m.studyJCodes,
    StudyNonJCodes: m.studyNonJCodes,
    EstimatedSARI: Number(m.estimatedSARI.toFixed(2)),
    EstimatedSARI_J: Number(m.estimatedSARIJ.toFixed(2)),
    EstimatedSARI_NonJ: Number(m.estimatedSARINonJ.toFixed(2))
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyData), "Monthly Estimates");

  // 4. Age Group Sheet
  const ageGroupData = aggResults.ageGroupsSummary.map((g) => ({
    AgeGroup: g.labelEn,
    EligibleAdmissions: g.eligibleAdmissions,
    AdmissionsPct: Number(g.eligiblePct.toFixed(2)),
    EstimatedSARI: Number(g.estimatedSARI.toFixed(2)),
    EstimatedSARIPct: Number(g.estimatedSARIPct.toFixed(2)),
    StudyJCodes: g.studyJCodes
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ageGroupData), "Age Group");

  // 5. Sex Sheet
  const sexData = [
    {
      Sex: "Male",
      EligibleAdmissions: aggResults.sexSummary.male.count,
      AdmissionsPct: Number(aggResults.sexSummary.male.pctEligible.toFixed(2)),
      EstimatedSARI: Number(aggResults.sexSummary.male.estimatedSARI.toFixed(2)),
      EstimatedSARIPct: Number(aggResults.sexSummary.male.pctSARI.toFixed(2))
    },
    {
      Sex: "Female",
      EligibleAdmissions: aggResults.sexSummary.female.count,
      AdmissionsPct: Number(aggResults.sexSummary.female.pctEligible.toFixed(2)),
      EstimatedSARI: Number(aggResults.sexSummary.female.estimatedSARI.toFixed(2)),
      EstimatedSARIPct: Number(aggResults.sexSummary.female.pctSARI.toFixed(2))
    }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sexData), "Sex");

  // 6. Age × Sex Sheet
  const ageSexData = aggResults.ageSexTable.map((t) => ({
    AgeGroup: t.ageGroupLabelEn,
    Male_N: t.maleCount,
    Male_Pct_Overall: Number(t.malePctOverall.toFixed(2)),
    Male_Pct_Row: Number(t.malePctRow.toFixed(2)),
    Female_N: t.femaleCount,
    Female_Pct_Overall: Number(t.femalePctOverall.toFixed(2)),
    Female_Pct_Row: Number(t.femalePctRow.toFixed(2)),
    Total_N: t.totalCount,
    Total_Pct: Number(t.totalPctOverall.toFixed(2)),
    Male_EstimatedSARI: Number(t.maleSARI.toFixed(2)),
    Female_EstimatedSARI: Number(t.femaleSARI.toFixed(2)),
    Total_EstimatedSARI: Number(t.totalSARI.toFixed(2))
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ageSexData), "Age x Sex");

  // 7. ICD-10 Groups Sheet
  const icdData = aggResults.icdComposition.map((c) => ({
    DiagnosticGroup: c.category,
    IsStudyJCode: c.isStudyJCode ? "Yes" : "No",
    Admissions: c.admissions,
    AdmissionsPct: Number(c.admissionsPct.toFixed(2)),
    EstimatedSARI: Number(c.estimatedSARI.toFixed(2)),
    EstimatedSARIPct: Number(c.estimatedSARIPct.toFixed(2))
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(icdData), "ICD-10 Groups");

  // 8. J vs Non-J Sheet
  const jVsNonJData = [
    {
      DiagnosisType: "Study-eligible J-codes (J00–J06, J09–J11, J12–J18, J20–J22, J44, J45)",
      Admissions: aggResults.kpis.studyJCodeAdmissions,
      AdmissionsPct: Number((100 - aggResults.kpis.pctEstimatedSARIFromNonJ).toFixed(2)),
      EstimatedSARI: Number(aggResults.kpis.estimatedSARIJCode.toFixed(2)),
      EstimatedSARIPct: Number((100 - aggResults.kpis.pctEstimatedSARIFromNonJ).toFixed(2))
    },
    {
      DiagnosisType: "Study-eligible Non-J-codes (B34, U07, R05, I50, R50, R56, A09, R06)",
      Admissions: aggResults.kpis.studyNonJCodeAdmissions,
      AdmissionsPct: Number(aggResults.kpis.pctEstimatedSARIFromNonJ.toFixed(2)),
      EstimatedSARI: Number(aggResults.kpis.estimatedSARINonJCode.toFixed(2)),
      EstimatedSARIPct: Number(aggResults.kpis.pctEstimatedSARIFromNonJ.toFixed(2))
    }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jVsNonJData), "J vs Non-J");

  // 9. Data Quality Sheet
  const dqData = [
    { Metric: "Total Rows Uploaded", Count: aggResults.kpis.totalUploaded },
    { Metric: "Study-Eligible Rows", Count: aggResults.kpis.eligibleAdmissions },
    { Metric: "Diagnoses Outside Model Scope", Count: aggResults.kpis.outsideScopeCount }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dqData), "Data Quality");

  // 10. Model Information Sheet
  const modelInfoData = [
    { Parameter: "Model Version", Description: MODEL_METADATA.version },
    { Parameter: "Study Reference", Description: MODEL_METADATA.study },
    { Parameter: "Pediatric Model Range", Description: "Age 0–14 years" },
    { Parameter: "Adult Model Range", Description: "Age >= 15 years" },
    { Parameter: "ICD Reference Category", Description: MODEL_METADATA.referenceCategoryICD },
    { Parameter: "Sex Reference Category", Description: MODEL_METADATA.referenceCategorySex },
    { Parameter: "Season Reference Category", Description: MODEL_METADATA.referenceCategorySeason },
    { Parameter: "Model 1 Predictor", Description: "Primary ICD-10 Category only" },
    { Parameter: "Model 2 Predictors", Description: "Primary ICD-10 Category + Age + Sex + Admission Season" }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(modelInfoData), "Model Information");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerBrowserDownload(blob, "SARI_Surveillance_Analysis_Results.xlsx");
}

/**
 * Downloads a canvas element as high-resolution PNG.
 */
export function downloadCanvasAsPNG(canvas, filename) {
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/**
 * Downloads an SVG element as SVG file.
 */
export function downloadSVG(svgElement, filename) {
  if (!svgElement) return;
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgElement);

  if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!source.match(/^<svg[^>]+xmlns\:xlink="http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
    source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }

  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  triggerBrowserDownload(svgBlob, filename.endsWith(".svg") ? filename : `${filename}.svg`);
}




/**
 * Exports complete Executive Surveillance Report as editable Microsoft Word (.docx) document.
 * Formatted with professional executive styles, comprehensive tables, and slide-ready presentation snippets.
 */

/**
 * Extracts raw PNG Uint8Array bytes from an HTML canvas element for Word document embedding.
 */
export function getCanvasUint8Array(canvasId) {
  if (typeof document === "undefined") return null;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  try {
    const dataUrl = canvas.toDataURL("image/png");
    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) return null;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.warn("Could not extract canvas image for " + canvasId, err);
    return null;
  }
}

/**
 * Exports complete Executive Surveillance Report as editable Microsoft Word (.docx) document.
 * Includes 100% bilingual accuracy (complete English in EN mode), all surveillance tables,
 * executive slide presentation snippets, and embedded high-resolution figures.
 */
export async function exportSurveillanceReportDocx(aggResults, hospitalInfo = {}, processedDataset = null, lang = "th", images = null) {
  const docxLib = (typeof window !== "undefined" && window.docx) || (typeof globalThis !== "undefined" && globalThis.docx);
  if (!docxLib || !docxLib.Document) {
    alert("Word export engine is loading. Please try again in a few moments.");
    return;
  }

  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
    WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType, Packer
  } = docxLib;

  const isTh = lang === "th";
  const k = aggResults.kpis;
  const d = aggResults.demographics;
  const h = hospitalInfo;

  if (!images && typeof document !== "undefined") {
    images = {
      mainTrend: getCanvasUint8Array("chart-main-timeseries"),
      icdComp: getCanvasUint8Array("chart-icd-composition"),
      jVsNonJ: getCanvasUint8Array("chart-j-vs-non-j")
    };
  }

  const facilityName = h.hospitalName || (isTh ? "โรงพยาบาลทั่วไป / ศูนย์เฝ้าระวัง SARI" : "Sentinel Hospital Surveillance Site");
  const provinceName = h.province || (isTh ? "ประเทศไทย" : "Thailand");
  const periodText = h.reportingPeriod || (isTh ? "ช่วงเวลาทั้งหมดในฐานข้อมูล" : "Full surveillance dataset period");
  const reportDate = new Date().toLocaleDateString(isTh ? "th-TH" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  const timestamp = new Date().toLocaleString(isTh ? "th-TH" : "en-US");

  const createCell = (text, options = {}) => {
    return new TableCell({
      shading: options.fill ? { fill: options.fill } : undefined,
      width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
      children: [
        new Paragraph({
          alignment: options.align || AlignmentType.LEFT,
          spacing: { before: 60, after: 60 },
          children: [
            new TextRun({
              text: String(text !== undefined && text !== null ? text : "-"),
              bold: options.bold || false,
              color: options.color || "1E293B",
              size: options.size || 20
            })
          ]
        })
      ]
    });
  };

  const createHeaderCell = (text, options = {}) => {
    return createCell(text, {
      fill: options.fill || "064E3B",
      bold: true,
      color: "FFFFFF",
      size: 20,
      align: options.align || AlignmentType.LEFT,
      width: options.width
    });
  };

  const children = [];

  // TITLE & HEADER BLOCK
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: isTh
            ? "กองระบาดวิทยา กรมควบคุมโรค กระทรวงสาธารณสุข ร่วมกับ FETP Thailand และ U.S. CDC"
            : "Division of Epidemiology, Department of Disease Control, Thailand | FETP Thailand | U.S. CDC",
          bold: true,
          size: 20,
          color: "064E3B"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: isTh ? "รายงานการเฝ้าระวังและประมาณการผู้ป่วย SARI จากรหัส ICD-10" : "SARI ICD-10 Surveillance & Estimation Executive Report",
          bold: true,
          size: 32,
          color: "064E3B"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: isTh
            ? "ระบบสนับสนุนการบริหารและเฝ้าระวังโรคติดเชื้อเฉียบพลันระบบทางเดินหายใจรุนแรง (ฉบับผู้บริหาร)"
            : "Hospital Executive Surveillance & Decision Support Bulletin",
          italics: true,
          size: 22,
          color: "047857"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: isTh ? "หน่วยบริการ: " : "Facility: ", bold: true }),
        new TextRun({ text: `${facilityName}  |  ` }),
        new TextRun({ text: isTh ? "จังหวัด: " : "Province: ", bold: true }),
        new TextRun({ text: `${provinceName}  |  ` }),
        new TextRun({ text: isTh ? "ช่วงเวลา: " : "Period: ", bold: true }),
        new TextRun({ text: `${periodText}  |  ` }),
        new TextRun({ text: isTh ? "วันที่จัดทำ: " : "Date: ", bold: true }),
        new TextRun({ text: reportDate })
      ]
    })
  );

  // 1. EXECUTIVE SUMMARY
  children.push(
    new Paragraph({
      text: isTh ? "1. บทสรุปสำหรับผู้บริหาร (Executive Summary)" : "1. Executive Summary",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    }),
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 80 },
      children: [
        new TextRun({ text: isTh ? "จำนวนการรับเข้ารักษาทั้งหมดในระบบ: " : "Total Inpatient Admissions Analyzed: ", bold: true }),
        new TextRun({
          text: isTh
            ? `${k.totalUploaded.toLocaleString()} ราย โดยมีผู้ป่วยที่เข้าเกณฑ์แบบจำลองการศึกษา (11 กลุ่มโรค ICD-10) ทั้งสิ้น `
            : `${k.totalUploaded.toLocaleString()} admissions, of which `
        }),
        new TextRun({
          text: isTh
            ? `${k.eligibleAdmissions.toLocaleString()} ราย `
            : `${k.eligibleAdmissions.toLocaleString()} admissions `,
          bold: true
        }),
        new TextRun({
          text: isTh
            ? `(${k.eligiblePercent.toFixed(1)}% ของการรับรักษา)`
            : `(${k.eligiblePercent.toFixed(1)}% of total volume) met study model eligibility criteria.`
        })
      ]
    }),
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 80 },
      children: [
        new TextRun({ text: isTh ? "การประมาณการผู้ป่วย SARI (Estimated SARI): " : "Estimated SARI Burden: ", bold: true }),
        new TextRun({
          text: isTh
            ? `คำนวณจากผลรวมความน่าจะเป็น (Sum of predicted probabilities) ได้จำนวน `
            : `Calculated from the sum of individual logistic model predicted probabilities, yielding `
        }),
        new TextRun({ text: `${k.estimatedSARITotal.toFixed(1)} ${isTh ? "ราย " : "cases "}`, bold: true, color: "E11D48" }),
        new TextRun({
          text: isTh
            ? `คิดเป็นอัตราความชุกประมาณการ `
            : `representing an estimated rate of `
        }),
        new TextRun({
          text: isTh
            ? `${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} รายต่อ 100 การรับรักษาเข้าเกณฑ์`
            : `${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} cases per 100 eligible admissions.`,
          bold: true
        })
      ]
    }),
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 80 },
      children: [
        new TextRun({ text: isTh ? "การมีส่วนร่วมของกลุ่มรหัส J (Study J-codes): " : "Study J-Code Diagnoses Contribution: ", bold: true }),
        new TextRun({
          text: isTh
            ? `ผู้ป่วยรับรักษาด้วยรหัสกลุ่ม J ในการศึกษา (J00–J06, J09–J11, J12–J18, J20–J22, J44, J45) มีจำนวน `
            : `Admissions with study respiratory J-codes accounted for `
        }),
        new TextRun({ text: `${k.studyJCodeAdmissions.toLocaleString()} ${isTh ? "ราย " : "admissions "}`, bold: true }),
        new TextRun({
          text: isTh
            ? `คิดเป็นสัดส่วน SARI ประมาณการเท่ากับ `
            : `and contributed `
        }),
        new TextRun({
          text: isTh
            ? `${k.estimatedSARIJCode.toFixed(1)} ราย (${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}%)`
            : `${k.estimatedSARIJCode.toFixed(1)} cases (${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}% of total SARI).`,
          bold: true
        })
      ]
    }),
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: isTh ? "ประเด็นค้นพบสำคัญจากรหัสโรคนอกกลุ่ม J (Non-J Diagnoses): " : "Crucial Non-J Diagnoses Finding: ",
          bold: true,
          color: "0F766E"
        }),
        new TextRun({
          text: isTh
            ? `ผู้ป่วยที่เข้าเกณฑ์ด้วยรหัสอื่น (B34, U07, R05, I50, R50, R56, A09, R06) ก่อให้เกิด SARI ประมาณการถึง `
            : `Admissions within non-J study categories (viral infections B34/U07, cough R05, heart failure I50, fever R50, convulsions R56, abnormalities of breathing R06) contributed `
        }),
        new TextRun({
          text: isTh
            ? `${k.estimatedSARINonJCode.toFixed(1)} ราย (${k.pctEstimatedSARIFromNonJ.toFixed(1)}%) `
            : `${k.estimatedSARINonJCode.toFixed(1)} cases (${k.pctEstimatedSARIFromNonJ.toFixed(1)}% of total SARI). `,
          bold: true,
          color: "0F766E"
        }),
        new TextRun({
          text: isTh
            ? `สะท้อนให้เห็นว่า หากระบบเฝ้าระวังนับเฉพาะรหัสกลุ่ม J จะตกหล่นผู้ป่วยที่เข้าเกณฑ์ SARI ไปถึงประมาณ 1 ใน 5 ของภาระโรคทั้งหมด`
            : `This demonstrates that surveillance systems relying strictly on ICD Chapter J diagnoses miss approximately 1 in 5 SARI patients.`
        })
      ]
    }),
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 120 },
      children: [
        new TextRun({ text: isTh ? "กลุ่มประชากรเปราะบางสูง: " : "High-Risk Vulnerable Groups: ", bold: true }),
        new TextRun({
          text: isTh
            ? `ภาระ SARI สูงสุดกระจุกตัวอยู่ในกลุ่มเด็กเล็กอายุต่ำกว่า 2 ปี และผู้สูงอายุตั้งแต่ 65 ปีขึ้นไป โดยมีมัธยฐานอายุของผู้ป่วยเข้าเกณฑ์อยู่ที่ `
            : `Peak SARI burden was concentrated among infants/young children under 2 years and elderly adults aged 65 and older. Median patient age was `
        }),
        new TextRun({
          text: `${d.ageMedian !== null ? d.ageMedian.toFixed(1) : "-"} ${isTh ? "ปี " : "years "}(IQR: ${d.ageQ25 !== null ? d.ageQ25.toFixed(1) : "-"}–${d.ageQ75 !== null ? d.ageQ75.toFixed(1) : "-"})`,
          bold: true
        })
      ]
    })
  );

  // 2. SLIDE-READY PRESENTATION SNIPPETS
  children.push(
    new Paragraph({
      text: isTh ? "2. ชุดข้อความพร้อมใส่สไลด์นำเสนอผู้บริหาร (Slide-Ready Presentation Snippets)" : "2. Executive Slide-Ready Presentation Snippets",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: isTh
            ? "คำแนะนำ: เจ้าหน้าที่สามารถคัดลอก (Copy & Paste) ข้อความในกรอบด้านล่างนี้ไปวางในโปรแกรมนำเสนอ (PowerPoint / Keynote / Google Slides) ได้ทันที:"
            : "Tip: Surveillance officers can directly copy & paste the structured points below into PowerPoint / Keynote / Google Slides:",
          italics: true,
          color: "64748B"
        })
      ]
    }),

    // Box Slide 1
    new Paragraph({
      shading: { fill: "F1F5F9" },
      spacing: { before: 80, after: 40 },
      children: [
        new TextRun({
          text: isTh ? "  [สไลด์ที่ 1: สถานการณ์ภาพรวมและภาระโรค SARI]" : "  [Slide 1: Overall Situation & SARI Burden]",
          bold: true,
          color: "0284C7"
        })
      ]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `หน่วยบริการ: ${facilityName} (${provinceName}) | ช่วงเวลา: ${periodText}` : `Facility: ${facilityName} (${provinceName}) | Period: ${periodText}` })]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `รับผู้ป่วยในทั้งหมด ${k.totalUploaded.toLocaleString()} ราย เข้าเกณฑ์ศึกษา 11 กลุ่มโรค ${k.eligibleAdmissions.toLocaleString()} ราย (${k.eligiblePercent.toFixed(1)}%)` : `Total admissions analyzed: ${k.totalUploaded.toLocaleString()}; Study-eligible in 11 ICD groups: ${k.eligibleAdmissions.toLocaleString()} (${k.eligiblePercent.toFixed(1)}%)` })]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `ประมาณการผู้ป่วย SARI รวมทั้งสิ้น ${k.estimatedSARITotal.toFixed(1)} ราย (อัตราประมาณการ ${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} ต่อ 100 การรับรักษา)` : `Total Estimated SARI: ${k.estimatedSARITotal.toFixed(1)} cases (Estimated rate: ${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} per 100 eligible admissions)`, bold: true })]
    }),

    // Box Slide 2
    new Paragraph({
      shading: { fill: "F1F5F9" },
      spacing: { before: 120, after: 40 },
      children: [
        new TextRun({
          text: isTh ? "  [สไลด์ที่ 2: บทบาทของรหัสกลุ่ม J เทียบกับรหัสอื่นๆ]" : "  [Slide 2: J-codes vs. Non-J Diagnoses SARI Contribution]",
          bold: true,
          color: "0F766E"
        })
      ]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `รหัสกลุ่ม J (J00-J22, J44, J45): คิดเป็น ${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}% ของ SARI (${k.estimatedSARIJCode.toFixed(1)} ราย)` : `Study J-codes (J00-J22, J44, J45): Contributed ${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}% of SARI (${k.estimatedSARIJCode.toFixed(1)} cases)` })]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `รหัสนอกกลุ่ม J (ไวรัสอื่นๆ, ไข้, ไอ, ชัก, หายใจผิดปกติ): คิดเป็น ${k.pctEstimatedSARIFromNonJ.toFixed(1)}% ของ SARI (${k.estimatedSARINonJCode.toFixed(1)} ราย)` : `Study Non-J codes (other virus, fever, cough, convulsions, dyspnea): Contributed ${k.pctEstimatedSARIFromNonJ.toFixed(1)}% of SARI (${k.estimatedSARINonJCode.toFixed(1)} cases)`, bold: true })]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `ข้อพิจารณาสำคัญ: การใช้เฉพาะรหัส J ทำให้ขาดข้อมูลผู้ป่วย SARI ถึง 1 ใน 5 จึงต้องใช้แบบจำลองเสริมเพื่อประมาณการภาระโรคที่แท้จริง` : `Key Takeaway: Counting only J-codes misses ~20% of SARI burden. Model-based estimation is required to capture the full epidemiological burden.` })]
    }),

    // Box Slide 3
    new Paragraph({
      shading: { fill: "F1F5F9" },
      spacing: { before: 120, after: 40 },
      children: [
        new TextRun({
          text: isTh ? "  [สไลด์ที่ 3: ข้อเสนอแนะเชิงนโยบายและการบริหารจัดการเตียง/ยา]" : "  [Slide 3: Recommendations for Executive Leadership]",
          bold: true,
          color: "E11D48"
        })
      ]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `การสำรองเตียงและเวชภัณฑ์: เตรียมความพร้อมรองรับผู้ป่วยเด็กเล็ก (<2 ปี) และผู้สูงอายุ (≥65 ปี) ในช่วงฤดูฝนและฤดูหนาว` : `Resource Allocation: Prepare surge bed capacity and respiratory therapeutics for infants (<2 yrs) and elderly (≥65 yrs) during rainy/winter peaks.` })]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `การตรวจวินิจฉัยเชื้อก่อโรค: ขยายการส่งตรวจทางโมเลกุลในกลุ่มผู้ป่วยอาการสงสัยแม้ไม่ได้วินิจฉัยด้วยรหัส J ตั้งแต่แรกรับ` : `Laboratory Diagnostics: Broaden respiratory multiplex testing for patients presenting with non-J respiratory symptoms upon admission.` })]
    }),
    new Paragraph({
      shading: { fill: "F8FAFC" },
      bullet: { level: 0 },
      children: [new TextRun({ text: isTh ? `การพัฒนาคุณภาพการลงรหัส: สนับสนุนแพทย์และผู้ให้รหัสโรคให้บันทึกการวินิจฉัยโรคติดเชื้อทางเดินหายใจอย่างจำเพาะเจาะจง` : `Coding Practices: Promote accurate, specific coding of acute respiratory infections across clinical admission departments.` })]
    })
  );

  // 3. KEY SURVEILLANCE KPI TABLE
  children.push(
    new Paragraph({
      text: isTh ? "3. ตารางสรุปตัวชี้วัดสำคัญระดับบริหาร (Surveillance KPI Summary)" : "3. Key Surveillance Indicators (KPI Table)",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    })
  );

  const kpiTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        createHeaderCell(isTh ? "ตัวชี้วัดการเฝ้าระวัง (Surveillance Indicator)" : "Surveillance Indicator", { width: 45 }),
        createHeaderCell(isTh ? "จำนวน (N)" : "Count (N)", { width: 18, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "สัดส่วน (%)" : "Percent (%)", { width: 15, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "ความหมายเชิงระบาดวิทยา" : "Epidemiological Interpretation", { width: 22 })
      ]
    }),
    new TableRow({
      children: [
        createCell(isTh ? "1. จำนวนการรับผู้ป่วยในทั้งหมดที่นำเข้า (Total Admissions)" : "1. Total Inpatient Admissions", { bold: true }),
        createCell(k.totalUploaded.toLocaleString(), { align: AlignmentType.RIGHT, bold: true }),
        createCell("100.0%", { align: AlignmentType.RIGHT }),
        createCell(isTh ? "ฐานข้อมูลรับรักษาทั้งหมด" : "Baseline inpatient volume")
      ]
    }),
    new TableRow({
      children: [
        createCell(isTh ? "2. การรับรักษาที่เข้าเกณฑ์แบบจำลอง (Study-Eligible Admissions)" : "2. Study-Eligible Admissions", { bold: true }),
        createCell(k.eligibleAdmissions.toLocaleString(), { align: AlignmentType.RIGHT, bold: true }),
        createCell(`${k.eligiblePercent.toFixed(1)}%`, { align: AlignmentType.RIGHT }),
        createCell(isTh ? "ตรงตาม 11 กลุ่มโรคที่ศึกษา" : "Matched 11 ICD-10 categories")
      ]
    }),
    new TableRow({
      shading: { fill: "FFF1F2" },
      children: [
        createCell(isTh ? "3. การประมาณการผู้ป่วย SARI (Estimated SARI Admissions)" : "3. Estimated SARI Admissions", { bold: true, color: "E11D48" }),
        createCell(k.estimatedSARITotal.toFixed(1), { align: AlignmentType.RIGHT, bold: true, color: "E11D48" }),
        createCell(`${((k.estimatedSARITotal / (k.eligibleAdmissions || 1)) * 100).toFixed(1)} /100`, { align: AlignmentType.RIGHT, bold: true, color: "E11D48" }),
        createCell(isTh ? "ผลรวมความน่าจะเป็นจากแบบจำลอง" : "Sum of model probabilities", { color: "9F1239" })
      ]
    }),
    new TableRow({
      children: [
        createCell(isTh ? "4. การรับรักษาด้วยรหัสกลุ่ม J ในการศึกษา (Study J-codes)" : "4. Study J-code Admissions"),
        createCell(k.studyJCodeAdmissions.toLocaleString(), { align: AlignmentType.RIGHT }),
        createCell(`${k.pctJCodeAdmissions.toFixed(1)}%`, { align: AlignmentType.RIGHT }),
        createCell(isTh ? "J00-J22, J44, J45" : "Standard respiratory ICDs")
      ]
    }),
    new TableRow({
      children: [
        createCell(isTh ? "5. SARI ประมาณการจากรหัสกลุ่ม J (SARI from J-codes)" : "5. Estimated SARI from J-codes"),
        createCell(k.estimatedSARIJCode.toFixed(1), { align: AlignmentType.RIGHT }),
        createCell(`${(100 - k.pctEstimatedSARIFromNonJ).toFixed(1)}%`, { align: AlignmentType.RIGHT }),
        createCell(isTh ? "สัดส่วน SARI จากรหัส J" : "% SARI burden from J-codes")
      ]
    }),
    new TableRow({
      children: [
        createCell(isTh ? "6. SARI ประมาณการจากรหัสอื่นๆ ที่ไม่ใช่ J (SARI from Non-J)" : "6. Estimated SARI from Non-J Codes"),
        createCell(k.estimatedSARINonJCode.toFixed(1), { align: AlignmentType.RIGHT, bold: true, color: "0F766E" }),
        createCell(`${k.pctEstimatedSARIFromNonJ.toFixed(1)}%`, { align: AlignmentType.RIGHT, bold: true, color: "0F766E" }),
        createCell(isTh ? "รหัสไวรัส ไข้ ไอ ชัก หายใจผิดปกติ" : "Non-J clinical presentations", { color: "0F766E" })
      ]
    }),
    new TableRow({
      children: [
        createCell(isTh ? "7. รหัสโรคนอกขอบเขตแบบจำลอง (Outside Model Scope)" : "7. Diagnoses Outside Model Scope"),
        createCell(k.outsideScopeCount.toLocaleString(), { align: AlignmentType.RIGHT }),
        createCell(`${k.outsideScopePercent.toFixed(1)}%`, { align: AlignmentType.RIGHT }),
        createCell(isTh ? "แยกออกจากการประมาณการ SARI" : "Excluded from SARI estimation")
      ]
    })
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: kpiTableRows
    })
  );

  // EMBEDDED FIGURE 1: MAIN TIME-SERIES SURVEILLANCE TRENDS
  if (images && images.mainTrend) {
    children.push(
      new Paragraph({
        text: isTh ? "ภาพที่ 1: แนวโน้มการเฝ้าระวังผู้ป่วย SARI ตามช่วงเวลา" : "Figure 1: SARI Surveillance Trends Over Time",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 }
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new ImageRun({
            data: images.mainTrend,
            transformation: { width: 580, height: 260 }
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: isTh
              ? "รูปที่ 1: การเปรียบเทียบการรับรักษาเข้าเกณฑ์ รหัสกลุ่ม J และการประมาณการผู้ป่วย SARI ตามช่วงเวลา"
              : "Figure 1: Time trends of observed eligible admissions, study J-code admissions, and model-estimated SARI activity.",
            italics: true,
            size: 18,
            color: "64748B"
          })
        ]
      })
    );
  }

  // 4. AGE-GROUP BREAKDOWN TABLE
  children.push(
    new Paragraph({
      text: isTh ? "4. การจำแนกตามกลุ่มอายุ 6 กลุ่ม (Age-Group Stratification)" : "4. Age-Group Stratification",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    })
  );

  const ageTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        createHeaderCell(isTh ? "กลุ่มอายุ (Age Group)" : "Age Group", { width: 28 }),
        createHeaderCell(isTh ? "การรับรักษาเข้าเกณฑ์ N (%)" : "Eligible Admissions N (%)", { width: 26, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "SARI ประมาณการ (ราย)" : "Estimated SARI (Cases)", { width: 24, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "SARI ต่อ 100 การรับรักษา" : "SARI per 100 Admissions", { width: 22, align: AlignmentType.RIGHT })
      ]
    })
  ];

  aggResults.ageGroupsSummary.forEach((g) => {
    const rate = g.eligibleAdmissions > 0 ? (g.estimatedSARI / g.eligibleAdmissions) * 100 : 0;
    ageTableRows.push(
      new TableRow({
        children: [
          createCell(isTh ? g.labelTh : g.labelEn, { bold: true }),
          createCell(`${g.eligibleAdmissions.toLocaleString()} (${g.eligiblePct.toFixed(1)}%)`, { align: AlignmentType.RIGHT }),
          createCell(g.estimatedSARI.toFixed(1), { align: AlignmentType.RIGHT, bold: true, color: "E11D48" }),
          createCell(rate.toFixed(1), { align: AlignmentType.RIGHT, bold: true })
        ]
      })
    );
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: ageTableRows
    })
  );

  // 5. SEX & AGE x SEX CROSS-TABULATION
  children.push(
    new Paragraph({
      text: isTh ? "5. ตารางจำแนกตามกลุ่มอายุและเพศ (Age × Sex Cross-Tabulation)" : "5. Age × Sex Cross-Tabulation",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    })
  );

  const crossTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        createHeaderCell(isTh ? "กลุ่มอายุ" : "Age Group", { width: 22 }),
        createHeaderCell(isTh ? "เพศชาย n (%)" : "Male n (%)", { width: 18, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "เพศหญิง n (%)" : "Female n (%)", { width: 18, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "ชาย SARI ประมาณการ" : "Male SARI", { width: 21, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "หญิง SARI ประมาณการ" : "Female SARI", { width: 21, align: AlignmentType.RIGHT })
      ]
    })
  ];

  aggResults.ageSexTable.forEach((row) => {
    crossTableRows.push(
      new TableRow({
        children: [
          createCell(isTh ? row.ageGroupLabelTh : row.ageGroupLabelEn, { bold: true }),
          createCell(`${row.maleCount.toLocaleString()} (${row.malePctOverall.toFixed(1)}%)`, { align: AlignmentType.RIGHT }),
          createCell(`${row.femaleCount.toLocaleString()} (${row.femalePctOverall.toFixed(1)}%)`, { align: AlignmentType.RIGHT }),
          createCell(row.maleSARI.toFixed(1), { align: AlignmentType.RIGHT, color: "0284C7" }),
          createCell(row.femaleSARI.toFixed(1), { align: AlignmentType.RIGHT, color: "9333EA" })
        ]
      })
    );
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: crossTableRows
    })
  );

  // 6. ICD-10 DIAGNOSTIC GROUPS RANKING
  children.push(
    new Paragraph({
      text: isTh ? "6. การกระจายของกลุ่มโรค ICD-10 ในการศึกษา (ICD-10 Diagnostic Groups)" : "6. ICD-10 Diagnostic Groups Distribution",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    })
  );

  const icdTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        createHeaderCell(isTh ? "กลุ่มการวินิจฉัย ICD-10" : "ICD-10 Diagnostic Group", { width: 44 }),
        createHeaderCell(isTh ? "กลุ่มรหัส" : "Category Type", { width: 18 }),
        createHeaderCell(isTh ? "การรับรักษา N (%)" : "Admissions N (%)", { width: 20, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "SARI ประมาณการ (%)" : "Estimated SARI (%)", { width: 18, align: AlignmentType.RIGHT })
      ]
    })
  ];

  aggResults.icdComposition.forEach((item) => {
    icdTableRows.push(
      new TableRow({
        children: [
          createCell(item.category, { bold: true }),
          createCell(isTh ? (item.isStudyJCode ? "รหัสกลุ่ม J" : "รหัสอื่นที่ไม่ใช่ J") : (item.isStudyJCode ? "Study J-code" : "Study Non-J"), { color: item.isStudyJCode ? "2563EB" : "0F766E" }),
          createCell(`${item.admissions.toLocaleString()} (${item.admissionsPct.toFixed(1)}%)`, { align: AlignmentType.RIGHT }),
          createCell(`${item.estimatedSARI.toFixed(1)} (${item.estimatedSARIPct.toFixed(1)}%)`, { align: AlignmentType.RIGHT, color: "E11D48", bold: true })
        ]
      })
    );
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: icdTableRows
    })
  );

  // EMBEDDED FIGURE 2: ICD COMPOSITION CHART
  if (images && images.icdComp) {
    children.push(
      new Paragraph({
        text: isTh ? "ภาพที่ 2: สัดส่วนการรับรักษาตามกลุ่มโรค ICD-10" : "Figure 2: Admissions by ICD-10 Diagnostic Group",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 }
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new ImageRun({
            data: images.icdComp,
            transformation: { width: 550, height: 230 }
          })
        ]
      })
    );
  }

  // 7. SEASONAL SURVEILLANCE ANALYSIS
  children.push(
    new Paragraph({
      text: isTh ? "7. การวิเคราะห์ผู้ป่วย SARI ตามฤดูกาลที่รับไว้รักษา (Seasonal Analysis)" : "7. Seasonal Surveillance Analysis",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    })
  );

  const seasonTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        createHeaderCell(isTh ? "ฤดูกาล (Season)" : "Season", { width: 35 }),
        createHeaderCell(isTh ? "การรับรักษาเข้าเกณฑ์ (N)" : "Eligible Admissions (N)", { width: 22, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "SARI ประมาณการ (ราย)" : "Estimated SARI (Cases)", { width: 22, align: AlignmentType.RIGHT }),
        createHeaderCell(isTh ? "SARI ต่อ 100 การรับรักษา" : "SARI per 100 Admissions", { width: 21, align: AlignmentType.RIGHT })
      ]
    })
  ];

  aggResults.seasonalAnalysis.forEach((s) => {
    seasonTableRows.push(
      new TableRow({
        children: [
          createCell(isTh ? s.labelTh : s.labelEn, { bold: true }),
          createCell(s.eligibleAdmissions.toLocaleString(), { align: AlignmentType.RIGHT }),
          createCell(s.estimatedSARI.toFixed(1), { align: AlignmentType.RIGHT, bold: true, color: "E11D48" }),
          createCell(s.sariPer100.toFixed(1), { align: AlignmentType.RIGHT, bold: true })
        ]
      })
    );
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: seasonTableRows
    })
  );

  // EMBEDDED FIGURE 3: J VS NON-J CONTRIBUTION
  if (images && images.jVsNonJ) {
    children.push(
      new Paragraph({
        text: isTh ? "ภาพที่ 3: สัดส่วนการมีส่วนร่วมของรหัสกลุ่ม J เทียบกับรหัสอื่นๆ ต่อ SARI" : "Figure 3: Contribution of J-codes vs. Non-J Diagnoses to SARI",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 }
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new ImageRun({
            data: images.jVsNonJ,
            transformation: { width: 520, height: 210 }
          })
        ]
      })
    );
  }

  // 8. DATA QUALITY AUDIT SUMMARY
  if (processedDataset && processedDataset.qualitySummary) {
    const q = processedDataset.qualitySummary;
    children.push(
      new Paragraph({
        text: isTh ? "8. การตรวจสอบคุณภาพและความครบถ้วนของข้อมูล (Data Quality Audit)" : "8. Data Quality & Audit Summary",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 }
      }),
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: isTh ? `แถวข้อมูลทั้งหมดที่นำเข้า: ${q.totalUploaded.toLocaleString()} รายการ` : `Total uploaded inpatient records: ${q.totalUploaded.toLocaleString()}` })]
      }),
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: isTh ? `แถวที่เข้าเกณฑ์และนำไปคำนวณแบบจำลอง: ${q.modelEligible.toLocaleString()} รายการ` : `Model-eligible records analyzed: ${q.modelEligible.toLocaleString()}` })]
      }),
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: isTh ? `แถวที่มีรหัสโรคนอก 11 กลุ่มที่ศึกษา (Excluded): ${q.outsideScopeICD.toLocaleString()} รายการ` : `Diagnoses outside 11 validated categories (Excluded): ${q.outsideScopeICD.toLocaleString()}` })]
      }),
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: isTh ? `แถวที่ไม่มีข้อมูลอายุ / อายุผิดปกติ: ${(q.missingAges + q.invalidAges).toLocaleString()} รายการ` : `Records with missing or invalid age: ${(q.missingAges + q.invalidAges).toLocaleString()}` })]
      }),
      new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: isTh ? `แถวที่วันที่ไม่ถูกต้องหรือไม่สามารถแปลงได้: ${q.invalidDates.toLocaleString()} รายการ` : `Records with invalid/unparseable admission dates: ${q.invalidDates.toLocaleString()}` })]
      })
    );
  }

  // 9. METHODOLOGICAL NOTES & DISCLAIMERS
  children.push(
    new Paragraph({
      text: isTh ? "9. ข้อกำหนดแบบจำลองและการแปลผลทางวิทยาการระบาด (Methodology & Disclaimers)" : "9. Model Specifications & Methodological Notes",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 }
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: isTh ? "สมการแบบจำลองถดถอยโลจิสติก (Logistic Regression Equation): " : "Logistic Model Formula: ", bold: true }),
        new TextRun({ text: "η = intercept + β_ICD + β_age × age + β_sex × I(male) + β_season;  P = 1 / (1 + exp(-η))" })
      ]
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: isTh ? "ข้อสังเกตสำคัญในการแปลผล: " : "Interpretation Note: ", bold: true }),
        new TextRun({
          text: isTh
            ? "การประมาณการผู้ป่วย SARI เป็นผลรวมของค่าความน่าจะเป็นที่คำนวณได้จากแบบจำลอง และควรแปลผลเป็นจำนวนผู้ป่วยโดยประมาณในระดับประชากร มิใช่การยืนยันการวินิจฉัยทางคลินิกเป็นรายบุคคล และเครื่องมือนี้มีจุดประสงค์เพื่อเสริมการเฝ้าระวังที่มีอยู่เดิม มิใช่เพื่อทดแทน"
            : "Estimated SARI represents the sum of model-predicted probabilities and should be interpreted as an estimated case count at population level rather than patient-level clinical diagnosis. This tool complements, rather than replaces, syndromic and laboratory SARI surveillance."
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: isTh ? "ข้อจำกัดในการนำไปใช้ (Generalizability Warning): " : "Generalizability Warning: ", bold: true }),
        new TextRun({
          text: isTh
            ? "แบบจำลองทางสถิตินี้พัฒนาขึ้นจากข้อมูลการทบทวนเวชระเบียนของโรงพยาบาลเครือข่ายเฝ้าระวัง SARI 6 แห่งในประเทศไทย ระหว่างปี 2566–2567 ประสิทธิภาพของแบบจำลองอาจผันแปรตามความแตกต่างของแนวปฏิบัติในการลงรหัสโรค ประชากรผู้ป่วย หรือเชื้อก่อโรคที่กำลังระบาด"
            : "The underlying models were developed using medical record review data from six SARI sentinel hospitals in Thailand during 2023–2024. Periodic local validation is recommended."
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 240 },
      children: [
        new TextRun({ text: `Generated by SARI ICD-10 Surveillance System v1.0  |  Timestamp: ${timestamp}`, italics: true, size: 18, color: "94A3B8" })
      ]
    })
  );

  // BUILD DOCUMENT
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 }
          }
        },
        children
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const cleanFac = (facilityName || "Hospital").replace(/[^a-zA-Z0-9_฀-๿]/g, "_");
  const filename = `SARI_Surveillance_Report_${cleanFac}_${new Date().toISOString().slice(0, 10)}.docx`;
  triggerBrowserDownload(blob, filename);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    downloadCSVTemplate,
    downloadExcelTemplate,
    downloadProcessedDataCSV,
    downloadAggregatedExcel,
    downloadCanvasAsPNG,
    downloadSVG,
    getCanvasUint8Array,
    exportSurveillanceReportDocx
  };
}
