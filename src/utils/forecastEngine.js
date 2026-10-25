/**
 * SARI Surveillance Forecasting Engine
 *
 * Implements a simple, transparent, and ultra-lightweight Seasonal Linear Regression model
 * without complex hyperparameter tuning:
 *
 * 1. Trend Estimation: Ordinary Least Squares (OLS) Linear Regression: Trend(t) = alpha + beta * t
 * 2. Weekly Seasonality: 52-Week Epidemiological Seasonal Index (for weekly surveillance)
 *    Monthly Seasonality: 12-Month Calendar Seasonal Index (for monthly surveillance)
 * 3. Forecast Formulation: y_hat(t) = max(0, Trend(t) + Seasonal(t))
 * 4. Prediction Intervals: 95% Confidence / Prediction Interval based on residual standard error
 *
 * Execution time is < 0.05 milliseconds (pure linear algebra in JS) — completely lightweight and instantaneous.
 */

import { parseSurveillanceDate, getWeekInfo } from "./dateUtils.js";

const MONTH_NAMES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * Calculates a forward forecast for SARI time-series data.
 *
 * @param {Object} params
 * @param {Array} params.series - Array of historical series items (weeklySeries or monthlySeries)
 * @param {"weekly" | "monthly"} [params.timeAggregation="weekly"] - Current time aggregation
 * @param {"auto" | "6m" | "1y" | "2y"} [params.horizonOption="auto"] - Forecast horizon length
 * @returns {Object | null} Forecast results containing forecastPoints, summary, and seasonalIndices
 */
export function calculateSARIForecast({
  series,
  timeAggregation = "weekly",
  horizonOption = "auto"
}) {
  if (!series || !Array.isArray(series) || series.length < 3) {
    return null;
  }

  const N = series.length;
  const isWeekly = timeAggregation === "weekly";

  // 1. Determine Forecast Horizon (Number of steps H)
  let H = N; // Default "auto": exactly matches the length of the historical data
  if (horizonOption === "6m") {
    H = isWeekly ? 26 : 6;
  } else if (horizonOption === "1y") {
    H = isWeekly ? 52 : 12;
  } else if (horizonOption === "2y") {
    H = isWeekly ? 104 : 24;
  } else {
    // "auto": equals historical N
    H = N;
  }

  // 2. Extract Historical Values and Time Indices
  const yValues = series.map((s) => Number(s.estimatedSARI || 0));
  let sumT = 0;
  let sumY = 0;
  for (let i = 0; i < N; i++) {
    sumT += i;
    sumY += yValues[i];
  }
  const meanT = sumT / N;
  const meanY = sumY / N;

  // 3. Compute OLS Linear Trend (alpha, beta)
  let ssTT = 0;
  let ssTY = 0;
  let ssYY = 0;
  for (let i = 0; i < N; i++) {
    const dt = i - meanT;
    const dy = yValues[i] - meanY;
    ssTT += dt * dt;
    ssTY += dt * dy;
    ssYY += dy * dy;
  }

  const beta = ssTT > 0 ? ssTY / ssTT : 0;
  const alpha = meanY - beta * meanT;
  const trend = (t) => alpha + beta * t;

  // 4. Compute Seasonality (52-Week Seasonal Index for weekly, 12-Month for monthly)
  const cycleLength = isWeekly ? 52 : 12;
  const periodResiduals = Array.from({ length: cycleLength + 1 }, () => []);

  for (let i = 0; i < N; i++) {
    const item = series[i];
    let periodIndex = 1;

    if (isWeekly) {
      // Determine week of year (1..52)
      if (item.weekNumber && item.weekNumber >= 1 && item.weekNumber <= 52) {
        periodIndex = item.weekNumber;
      } else if (item.startDate) {
        const wInfo = getWeekInfo(item.startDate);
        periodIndex = wInfo && wInfo.weekNumber <= 52 ? wInfo.weekNumber : ((i % 52) + 1);
      } else {
        periodIndex = (i % 52) + 1;
      }
    } else {
      // Determine month of year (1..12)
      if (item.month && item.month >= 1 && item.month <= 12) {
        periodIndex = item.month;
      } else if (item.startDate) {
        const d = parseSurveillanceDate(item.startDate);
        if (d) periodIndex = d.getMonth() + 1;
      } else if (item.key && item.key.includes("-")) {
        const parts = item.key.split("-");
        if (parts[1] && !isNaN(parseInt(parts[1], 10))) {
          periodIndex = parseInt(parts[1], 10);
        }
      }
      if (periodIndex < 1 || periodIndex > 12) periodIndex = 1;
    }

    const residual = yValues[i] - trend(i);
    periodResiduals[periodIndex].push(residual);
  }

  // Calculate raw seasonal averages
  const rawSeasonal = [0];
  for (let p = 1; p <= cycleLength; p++) {
    const resList = periodResiduals[p];
    if (resList.length > 0) {
      const avg = resList.reduce((acc, v) => acc + v, 0) / resList.length;
      rawSeasonal.push(avg);
    } else {
      rawSeasonal.push(0);
    }
  }

  // For weekly seasonality: apply 3-point circular smoothing [0.25, 0.5, 0.25]
  // to remove single-week random noise while preserving the true epidemiological wave
  const smoothedSeasonal = [0];
  if (isWeekly) {
    for (let w = 1; w <= 52; w++) {
      const prev = w === 1 ? rawSeasonal[52] : rawSeasonal[w - 1];
      const curr = rawSeasonal[w];
      const next = w === 52 ? rawSeasonal[1] : rawSeasonal[w + 1];
      smoothedSeasonal.push(0.25 * prev + 0.5 * curr + 0.25 * next);
    }
  } else {
    for (let m = 1; m <= 12; m++) {
      smoothedSeasonal.push(rawSeasonal[m]);
    }
  }

  // Center seasonal indices so their sum over the cycle equals 0
  let sumSmoothed = 0;
  for (let p = 1; p <= cycleLength; p++) {
    sumSmoothed += smoothedSeasonal[p];
  }
  const cycleMean = sumSmoothed / cycleLength;

  const seasonalIndices = [0];
  for (let p = 1; p <= cycleLength; p++) {
    seasonalIndices.push(smoothedSeasonal[p] - cycleMean);
  }

  // 5. In-Sample Model Fit & Residual Standard Error
  let rss = 0;
  for (let i = 0; i < N; i++) {
    const item = series[i];
    let pIdx = 1;
    if (isWeekly) {
      pIdx = item.weekNumber && item.weekNumber <= 52 ? item.weekNumber : ((i % 52) + 1);
    } else {
      pIdx = item.month && item.month <= 12 ? item.month : 1;
    }
    const yHat = Math.max(0, trend(i) + seasonalIndices[pIdx]);
    const err = yValues[i] - yHat;
    rss += err * err;
  }

  const df = Math.max(1, N - 2);
  const residualStdError = Math.sqrt(rss / df);
  const rSquared = ssYY > 0 ? Math.max(0, 1 - rss / ssYY) : 1;

  let trendDirection = "stable";
  if (beta > 0.05) trendDirection = "increasing";
  else if (beta < -0.05) trendDirection = "decreasing";

  // 6. Generate Future Forecast Points
  const lastItem = series[N - 1];
  const forecastPoints = [];

  // Bridge point at historical N - 1 so the forecast line connects with zero gap
  forecastPoints.push({
    index: N - 1,
    isBridge: true,
    label: lastItem.label || lastItem.labelEn,
    labelTh: lastItem.labelTh || lastItem.label,
    labelEn: lastItem.labelEn || lastItem.label,
    predictedSARI: Number(lastItem.estimatedSARI.toFixed(2)),
    lowerCI: Number(lastItem.estimatedSARI.toFixed(2)),
    upperCI: Number(lastItem.estimatedSARI.toFixed(2)),
    isHistorical: true
  });

  let lastDateObj = null;
  if (isWeekly && lastItem.startDate) {
    lastDateObj = parseSurveillanceDate(lastItem.startDate);
  } else if (!isWeekly && lastItem.year && lastItem.month) {
    lastDateObj = new Date(lastItem.year, lastItem.month - 1, 1);
  } else {
    lastDateObj = new Date();
  }

  let totalForecastSARI = 0;

  for (let step = 1; step <= H; step++) {
    const t = (N - 1) + step;
    let labelEn = "";
    let labelTh = "";
    let pointKey = "";
    let cycleIndex = 1;

    if (isWeekly) {
      // Weekly horizon advancement (advance by 7 days each step)
      const futDate = new Date(lastDateObj.getTime() + step * 7 * 86400000);
      const wInfo = getWeekInfo(futDate);
      const futWeekNum = wInfo && wInfo.weekNumber <= 52
        ? wInfo.weekNumber
        : (((((lastItem.weekNumber || 1) - 1 + step) % 52) + 1));
      cycleIndex = futWeekNum;

      pointKey = wInfo ? `${wInfo.key}-fcst` : `W+${step}`;
      labelEn = wInfo ? `${wInfo.label} (Fcst)` : `Week +${step} (Fcst)`;
      labelTh = wInfo ? `สัปดาห์ที่ ${wInfo.weekNumber} ${wInfo.year + 543} (คาดการณ์)` : `สัปดาห์ที่ +${step}`;
    } else {
      // Monthly horizon advancement
      const curTotalMonths = lastItem.year * 12 + (lastItem.month - 1) + step;
      const futYear = Math.floor(curTotalMonths / 12);
      const futMonth = (curTotalMonths % 12) + 1;
      cycleIndex = futMonth;

      pointKey = `${futYear}-${String(futMonth).padStart(2, "0")}`;
      labelEn = `${MONTH_NAMES_EN[futMonth - 1]} ${futYear} (Fcst)`;
      labelTh = `${MONTH_NAMES_TH[futMonth - 1]} ${futYear + 543} (คาดการณ์)`;
    }

    // Prediction formula: Linear Trend + Seasonal Component
    const trendComponent = trend(t);
    const seasonalComponent = seasonalIndices[cycleIndex] || 0;
    const rawPrediction = trendComponent + seasonalComponent;
    const predictedSARI = Math.max(0, rawPrediction);

    // Prediction Interval (95% CI)
    const dt = t - meanT;
    const sePred = residualStdError * Math.sqrt(1 + 1 / N + (dt * dt) / (ssTT || 1));
    const margin = 1.96 * sePred;
    const upperCI = Number((predictedSARI + margin).toFixed(2));
    const lowerCI = Number(Math.max(0, predictedSARI - margin).toFixed(2));

    totalForecastSARI += predictedSARI;

    forecastPoints.push({
      index: t,
      step,
      key: pointKey,
      label: labelEn,
      labelTh,
      labelEn,
      weekNumber: isWeekly ? cycleIndex : undefined,
      month: !isWeekly ? cycleIndex : undefined,
      trendComponent: Number(trendComponent.toFixed(2)),
      seasonalComponent: Number(seasonalComponent.toFixed(2)),
      predictedSARI: Number(predictedSARI.toFixed(2)),
      lowerCI,
      upperCI,
      isForecast: true
    });
  }

  const avgForecastPerPeriod = H > 0 ? totalForecastSARI / H : 0;
  const historicalAvg = N > 0 ? meanY : 0;
  const pctChangeVsHistorical = historicalAvg > 0
    ? ((avgForecastPerPeriod - historicalAvg) / historicalAvg) * 100
    : 0;

  // Formatted horizon label
  let horizonLabelEn = `${H} periods`;
  let horizonLabelTh = `${H} งวด`;
  if (isWeekly) {
    const years = (H / 52).toFixed(H % 52 === 0 ? 0 : 1);
    horizonLabelEn = `${H} Weeks (~${years} Years)`;
    horizonLabelTh = `${H} สัปดาห์ (~${years} ปี)`;
  } else {
    const years = (H / 12).toFixed(H % 12 === 0 ? 0 : 1);
    horizonLabelEn = `${H} Months (~${years} Years)`;
    horizonLabelTh = `${H} เดือน (~${years} ปี)`;
  }

  return {
    forecastPoints,
    summary: {
      horizonSteps: H,
      horizonOption,
      horizonLabelEn,
      horizonLabelTh,
      historicalSpanPeriods: N,
      timeAggregation,
      modelType: isWeekly ? "Weekly Seasonal Linear Regression (52 Epi-weeks)" : "Monthly Seasonal Linear Regression (12 Months)",
      beta: Number(beta.toFixed(4)),
      alpha: Number(alpha.toFixed(2)),
      trendDirection,
      rSquared: Number(rSquared.toFixed(3)),
      residualStdError: Number(residualStdError.toFixed(2)),
      totalForecastSARI: Number(totalForecastSARI.toFixed(1)),
      avgForecastPerPeriod: Number(avgForecastPerPeriod.toFixed(1)),
      historicalAvg: Number(historicalAvg.toFixed(1)),
      pctChangeVsHistorical: Number(pctChangeVsHistorical.toFixed(1))
    },
    seasonalIndices: seasonalIndices.slice(1).map((idx, i) => ({
      period: i + 1,
      label: isWeekly ? `Week ${i + 1}` : MONTH_NAMES_EN[i],
      indexValue: Number(idx.toFixed(2))
    }))
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateSARIForecast
  };
}
