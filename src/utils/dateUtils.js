/**
 * Date and Surveillance Period Utilities
 * Supports:
 * - Season derivation (Summer: Feb–May, Rainy: Jun–Oct, Winter: Nov–Jan)
 * - ISO week (Monday–Sunday) and Epidemiological week (Sunday–Saturday)
 * - Automatic Thai Buddhist Era (BE) to Common Era (CE) conversion for years > 2400
 * - Robust parsing for ISO strings, slash dates, and Excel numeric serial dates
 */

/**
 * Derives epidemiological season from a Date object or date string.
 * Summer: Feb–May (Months 2, 3, 4, 5)
 * Rainy: Jun–Oct (Months 6, 7, 8, 9, 10)
 * Winter: Nov–Jan (Months 11, 12, 1)
 */
export function deriveSeason(dateInput) {
  const d = parseSurveillanceDate(dateInput);
  if (!d || isNaN(d.getTime())) return null;

  const month = d.getMonth() + 1; // 1-indexed: 1 = Jan, 12 = Dec

  if (month >= 2 && month <= 5) {
    return {
      key: "summer",
      labelEn: "Summer",
      labelTh: "ฤดูร้อน (ก.พ.–พ.ค.)",
      isReference: true
    };
  } else if (month >= 6 && month <= 10) {
    return {
      key: "rainy",
      labelEn: "Rainy",
      labelTh: "ฤดูฝน (มิ.ย.–ต.ค.)",
      isReference: false
    };
  } else {
    // 11, 12, 1
    return {
      key: "winter",
      labelEn: "Winter",
      labelTh: "ฤดูหนาว (พ.ย.–ม.ค.)",
      isReference: false
    };
  }
}

/**
 * Parses diverse date inputs (strings, timestamps, Excel serials, Thai BE years).
 * @param {string | number | Date} input
 * @returns {Date | null}
 */
export function parseSurveillanceDate(input) {
  if (!input) return null;
  if (input instanceof Date && !isNaN(input.getTime())) {
    return input;
  }

  // Handle Excel numeric date serials (e.g. 45292)
  if (typeof input === "number") {
    // Excel epoch starts 1899-12-30 (due to 1900 leap year bug)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = input * 86400000;
    const d = new Date(excelEpoch.getTime() + ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Check if string is a numeric Excel serial
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + num * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  // Handle YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    let year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);

    // Auto-detect Thai Buddhist Era (BE > 2400)
    if (year > 2400) {
      year -= 543;
    }
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Handle DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);

    if (year > 2400) {
      year -= 543;
    }
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback standard parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    let y = parsed.getFullYear();
    if (y > 2400) {
      parsed.setFullYear(y - 543);
    }
    return parsed;
  }

  return null;
}

/**
 * Formats a Date as YYYY-MM-DD
 */
export function formatDateISO(date) {
  const d = parseSurveillanceDate(date);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Computes ISO 8601 week (Monday to Sunday)
 */
export function getISOWeekInfo(dateInput) {
  const d = parseSurveillanceDate(dateInput);
  if (!d) return null;

  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  target.setDate(target.getDate() - dayNr + 3); // Nearest Thursday
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
  const year = new Date(firstThursday).getFullYear();

  // Calculate start (Monday) and end (Sunday)
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayNr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStr = `W${String(weekNumber).padStart(2, "0")}`;
  const key = `${year}-${weekStr}`;

  return {
    type: "iso",
    year,
    weekNumber,
    key,
    label: `${year} ${weekStr}`,
    startDate: formatDateISO(monday),
    endDate: formatDateISO(sunday)
  };
}

/**
 * Computes Epidemiological Week (CDC / WHO / Thai DDC standard: Sunday to Saturday)
 */
export function getEpiWeekInfo(dateInput) {
  const d = parseSurveillanceDate(dateInput);
  if (!d) return null;

  // Sunday = 0, Saturday = 6
  const dayOfWeek = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  // The first epi week of the year contains the first Wednesday of the year, or Jan 4
  const wednesday = new Date(sunday);
  wednesday.setDate(sunday.getDate() + 3);
  const year = wednesday.getFullYear();

  // Find the first Sunday of the epi year
  const jan4 = new Date(year, 0, 4);
  const startOfEpiYear = new Date(jan4);
  startOfEpiYear.setDate(jan4.getDate() - jan4.getDay());

  const diffMs = sunday.getTime() - startOfEpiYear.getTime();
  const weekNumber = 1 + Math.round(diffMs / (7 * 86400000));

  const weekStr = `EW${String(weekNumber).padStart(2, "0")}`;
  const key = `${year}-${weekStr}`;

  return {
    type: "epi",
    year,
    weekNumber,
    key,
    label: `${year} ${weekStr}`,
    startDate: formatDateISO(sunday),
    endDate: formatDateISO(saturday)
  };
}

/**
 * Gets surveillance week info depending on current system setting:
 * @param {Date | string} dateInput
 * @param {"iso" | "epi"} weekDefinition
 */
export function getWeekInfo(dateInput, weekDefinition = "epi") {
  return weekDefinition === "iso" ? getISOWeekInfo(dateInput) : getEpiWeekInfo(dateInput);
}

/**
 * Computes Month key YYYY-MM and formatted labels
 */
export function getMonthInfo(dateInput) {
  const d = parseSurveillanceDate(dateInput);
  if (!d) return null;

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const monthKey = `${y}-${String(m).padStart(2, "0")}`;

  const monthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthNamesTh = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

  return {
    key: monthKey,
    year: y,
    month: m,
    labelEn: `${monthNamesEn[m - 1]} ${y}`,
    labelTh: `${monthNamesTh[m - 1]} ${y + 543}`
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    deriveSeason,
    parseSurveillanceDate,
    formatDateISO,
    getISOWeekInfo,
    getEpiWeekInfo,
    getWeekInfo,
    getMonthInfo
  };
}
