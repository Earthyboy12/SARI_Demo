# SARI ICD-10 Surveillance & Estimation Dashboard
### ระบบประมาณการและเฝ้าระวังผู้ป่วยโรคติดเชื้อเฉียบพลันระบบทางเดินหายใจรุนแรง (SARI) จากรหัส ICD-10

A production-quality, scientific, user-friendly web application for hospitals and public-health surveillance teams, based on the study:
**“Evaluation of ICD-10 Admission Data to Complement Severe Acute Respiratory Infection Surveillance in Thailand: A Multicenter Mixed-Methods Study.”**

---

## 🌟 Key Features

1. **100% Client-Side In-Browser Privacy Architecture**:
   - Hospital patient-level data are parsed and calculated strictly within the user's browser.
   - Zero patient-level data are transmitted to any external server.
   - No personal patient identifiers (HN, CID, Name) are required.

2. **Full Bilingual Support (ภาษาไทย & English)**:
   - Instant language switch between Thai and English.
   - Epidemiologically rigorous Thai terminology conforming to Thai Ministry of Public Health (DDC / กรมควบคุมโรค) standards.

3. **Dual Logistic Regression Models (Pediatric & Adult)**:
   - **Pediatric Model (Age 0–14 years)** and **Adult Model (Age ≥15 years)**.
   - Automatic model selection: **Model 2** (ICD + Age + Sex + Season) when predictors are available; otherwise **Model 1** (ICD category only).
   - Strict validation of the 11 study diagnostic categories.
   - Out-of-scope ICD-10 codes are transparently flagged and excluded from estimation.

4. **Rich Surveillance Analytics & Publication Visualizations**:
   - 6 Headline KPI Cards (Total Uploaded, Eligible Admissions, Estimated SARI, Study J-codes, SARI from J-codes, SARI from Non-J codes).
   - Main Surveillance Trends Time-Series (Weekly / Monthly, ISO week vs Epidemiological week [Sun–Sat]).
   - Age-Group Small Multiples (2 × 3 grid for `<2`, `2–4`, `5–14`, `15–49`, `50–64`, `≥65` with shared/free Y-axis).
   - Sex-Stratified Trends (Combined line vs Dual split panels).
   - Age × Sex Descriptive Table and Estimated SARI Table (Overall % vs Row % toggle).
   - ICD-10 Diagnostic Composition Horizontal Bar Chart (Admissions vs Estimated SARI toggle).
   - J-code vs Non-J-code Contribution Stacked Bar Chart.
   - Seasonal Analysis Panel (Summer, Rainy, Winter with SARI per 100 admissions).
   - Demographic Summary (Median, IQR, Mean, SD, Pediatric vs Adult).

5. **Comprehensive Export & Reporting Suite**:
   - CSV and Excel standard templates download.
   - Processed row-level audit CSV export (with linear predictor $\eta$ and probability $P$).
   - 10-Sheet comprehensive Excel workbook export (`.xlsx`).
   - Publication-quality PNG chart exports.
   - Formal hospital printable surveillance report ready for PDF export.

6. **Built-in Realistic Demo Data**:
   - Spans 24 months (~2,400 admissions) with realistic Thai rainy/winter epidemic surges.

---

## 🚀 How to Run Locally

### Option 1: Python HTTP Server (Recommended)
From this directory:
```bash
python -m http.server 3000
```
Then open [http://localhost:3000](http://localhost:3000) in your web browser.

### Option 2: Run Unit Tests
```bash
node tests/sari.test.js
```
