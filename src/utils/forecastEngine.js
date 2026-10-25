/**
 * SARI Surveillance Forecasting Engine
 *
 * Implements a simple, transparent, and robust Monthly Seasonal Linear Regression model
 * without complex hyperparameter tuning:
 *
 * 1. Trend Estimation: Ordinary Least Squares (OLS) Linear Regression: Trend(t) = alpha + beta * t
 * 2. Monthly Seasonality: 12-Month Calendar Seasonal Index derived from historical detrended residuals
 * 3. Forecast Formulation: y_hat(t) = max(0, Trend(t) + Seasonal_m(t))
 * 4. Prediction Intervals: 95% Confidence / Prediction Interval based on residual standard error
 *
 * Designed specifically for respiratory infection surveillance (SARI/Influenza)
 * to model both long-term trajectories and month-by-month outbreak waves.
 */

import { parseSurveillanceDate, formatDateISO, getWeekInfo } from "./dateUtils.js";

const MONTH_NAMES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * Calculates a forward forecast for SARI time-series data.
 *
 * @param {Object} params
 * @param {Array} params.series - Array of historical series items (weeklySeries or monthlySeries)
 * @param {"weekly" | "monthly"} [params.timeAggregation="weekly"] - Current time aggregation
 * @param {"auto" | "6m" | "1y" | "2y"} [params.horizonOption="auto"] - Forecast horizon length
 * @returns {Object | null} Forecast results containing forecastPoints, summary, and monthlyIndices
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

  // 4. Determine Calendar Month for Each Historical Point and Compute Monthly Seasonal Factors
  // Month is 1-indexed (1 = Jan, 12 = Dec)
  const monthResiduals = Array.from({ length: 13 }, () => []);

  for (let i = 0; i < N; i++) {
    const item = series[i];
    let calendarMonth = 1;
    if (!isWeekly && item.month) {
      calendarMonth = item.month;
    } else if (item.startDate) {
      const d = parseSurveillanceDate(item.startDate);
      if (d) calendarMonth = d.getMonth() + 1;
    } else if (item.key && item.key.includes("-")) {
      const parts = item.key.split("-");
      if (parts[1] && !isNaN(parseInt(parts[1], 10))) {
        calendarMonth = parseInt(parts[1], 10);
      }
    }

    if (calendarMonth < 1 || calendarMonth > 12) calendarMonth = 1;
    const residual = yValues[i] - trend(i);
    monthResiduals[calendarMonth].push(residual);
  }

  // Calculate average seasonal deviation for each calendar month (1..12)
  const rawSeasonal = [0];
  let sumSeasonal = 0;
  let countedMonths = 0;

  for (let m = 1; m <= 12; m++) {
    const resList = monthResiduals[m];
    if (resList.length > 0) {
      const avgRes = resList.reduce((acc, v) => acc + v, 0) / resList.length;
      rawSeasonal.push(avgRes);
      sumSeasonal += avgRes;
      countedMonths++;
    } else {
      rawSeasonal.push(0);
    }
  }

  // Center seasonal indices so their sum over 12 months is 0
  const seasonalCenter = countedMonths > 0 ? sumSeasonal / 12 : 0;
  const seasonalIndices = [0];
  for (let m = 1; m <= 12; m++) {
    seasonalIndices.push(rawSeasonal[m] - seasonalCenter);
  }

  // 5. In-Sample Model Fit & Residual Standard Error
  let rss = 0;
  for (let i = 0; i < N; i++) {
    const item = series[i];
    let m = 1;
    if (!isWeekly && item.month) {
      m = item.month;
    } else if (item.startDate) {
      const d = parseSurveillanceDate(item.startDate);
      if (d) m = d.getMonth() + 1;
    }
    if (m < 1 || m > 12) m = 1;
    const yHat = Math.max(0, trend(i) + seasonalIndices[m]);
    const err = yValues[i] - yHat;
    rss += err * err;
  }

  const df = Math.max(1, N - 2);
  const residualStdError = Math.sqrt(rss / df);
  const rSquared = ssYY > 0 ? Math.max(0, 1 - rss / ssYY) : 1;

  // Trend direction text
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
    let calendarMonth = 1;
    let pointKey = "";

    if (!isWeekly) {
      // Monthly horizon advancement
      const curTotalMonths = lastItem.year * 12 + (lastItem.month - 1) + step;
      const futYear = Math.floor(curTotalMonths / 12);
      const futMonth = (curTotalMonths % 12) + 1;
      calendarMonth = futMonth;
      pointKey = `${futYear}-${String(futMonth).padStart(2, "0")}`;
      labelEn = `${MONTH_NAMES_EN[futMonth - 1]} ${futYear} (Fcst)`;
      labelTh = `${MONTH_NAMES_TH[futMonth - 1]} ${futYear + 543} (คาดการณ์)`;
    } else {
      // Weekly horizon advancement (advance by 7 days each step)
      const futDate = new Date(lastDateObj.getTime() + step * 7 * 86400000);
      calendarMonth = futDate.getMonth() + 1;
      const wInfo = getWeekInfo(futDate);
      pointKey = wInfo ? `${wInfo.key}-fcst` : `W+${step}`;
      labelEn = wInfo ? `${wInfo.label} (Fcst)` : `Week +${step} (Fcst)`;
      labelTh = wInfo ? `สัปดาห์ที่ ${wInfo.weekNumber} ${wInfo.year + 543} (คาดการณ์)` : `สัปดาห์ที่ +${step}`;
    }

    // Prediction formula: Linear Trend + Calendar Month Seasonal Component
    const trendComponent = trend(t);
    const seasonalComponent = seasonalIndices[calendarMonth] || 0;
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
      month: calendarMonth,
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
  if (!isWeekly) {
    const years = (H / 12).toFixed(H % 12 === 0 ? 0 : 1);
    horizonLabelEn = `${H} Months (~${years} Years)`;
    horizonLabelTh = `${H} เดือน (~${years} ปี)`;
  } else {
    const years = (H / 52).toFixed(H % 52 === 0 ? 0 : 1);
    horizonLabelEn = `${H} Weeks (~${years} Years)`;
    horizonLabelTh = `${H} สัปดาห์ (~${years} ปี)`;
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
    monthlyIndices: seasonalIndices.slice(1).map((idx, i) => ({
      month: i + 1,
      monthNameEn: MONTH_NAMES_EN[i],
      monthNameTh: MONTH_NAMES_TH[i],
      indexValue: Number(idx.toFixed(2))
    }))
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateSARIForecast
  };
}
