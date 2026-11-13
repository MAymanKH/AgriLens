const NASA_MISSING_VALUE_MAX = -900;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const validDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const datesInPeriod = (firstYear, lastYear) => {
  const result = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const daysInYear = new Date(Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)).getTime() / 86400000;
    for (let day = 0; day < daysInYear; day += 1) {
      result.push(new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10));
    }
  }
  return result;
};

const addIssue = (issues, message) => issues.push(message);

const isMeasurement = (value) => (
  typeof value === "number" && Number.isFinite(value) && value > NASA_MISSING_VALUE_MAX
);

/** Validate stored dates and required daily measurements against a dataset manifest. */
export const validateClimateData = ({ manifest, daily }) => {
  const issues = [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, issues: ["Climate dataset manifest is missing."], completeYears: [], expectedDays: 0 };
  }

  const firstYear = manifest.period?.first_year;
  const lastYear = manifest.period?.last_year;
  if (!Number.isInteger(firstYear) || !Number.isInteger(lastYear) || firstYear < 1000 ||
      lastYear > 9999 || firstYear > lastYear) {
    addIssue(issues, "Period must contain valid inclusive first_year and last_year values.");
    return { ok: false, issues, completeYears: [], expectedDays: 0 };
  }

  const expectedDates = datesInPeriod(firstYear, lastYear);
  const expectedSet = new Set(expectedDates);
  const actualByDate = new Map();
  if (!Array.isArray(daily)) {
    addIssue(issues, "Daily climate records must be an array.");
    return { ok: false, issues, completeYears: [], expectedDays: expectedDates.length };
  }

  for (const [index, row] of daily.entries()) {
    if (!row || typeof row !== "object" || !validDate(row.date)) {
      addIssue(issues, `Record ${index} has an invalid calendar date.`);
      continue;
    }
    if (!expectedSet.has(row.date)) {
      addIssue(issues, `Record ${row.date} falls outside the declared period.`);
      continue;
    }
    if (actualByDate.has(row.date)) {
      addIssue(issues, `Duplicate climate record for ${row.date}.`);
      continue;
    }
    actualByDate.set(row.date, row);

    if (!isMeasurement(row.tmax_c)) {
      addIssue(issues, `${row.date} has an invalid Tmax or NASA missing-value marker.`);
    } else if (row.tmax_c !== null && (row.tmax_c < -90 || row.tmax_c > 65)) {
      addIssue(issues, `${row.date} has a Tmax outside the supported physical range (-90 to 65 C).`);
    }
    if (!isMeasurement(row.rain_mm) || (row.rain_mm !== null && row.rain_mm < 0)) {
      addIssue(issues, `${row.date} has invalid precipitation or a NASA missing-value marker.`);
    }
  }

  const missingDates = expectedDates.filter((date) => !actualByDate.has(date));
  if (missingDates.length) {
    const sample = missingDates.slice(0, 5).join(", ");
    addIssue(issues, `Climate coverage is missing ${missingDates.length} expected date(s): ${sample}.`);
  }
  if (manifest.provenance?.missing_days !== 0) {
    addIssue(issues, "Manifest missing_days must be zero when every expected calendar date is required.");
  }
  if (manifest.validation?.expected_days !== expectedDates.length) {
    addIssue(issues, "Manifest expected_days does not match the declared calendar period.");
  }
  if (manifest.validation?.record_count !== daily.length) {
    addIssue(issues, "Manifest record_count does not match the stored records.");
  }

  const completeYears = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const yearDates = expectedDates.filter((date) => date.startsWith(`${year}-`));
    if (yearDates.length && yearDates.every((date) => {
      const row = actualByDate.get(date);
      return row && typeof row.tmax_c === "number" && typeof row.rain_mm === "number" &&
        isMeasurement(row.tmax_c) && isMeasurement(row.rain_mm) && row.rain_mm >= 0 &&
        row.tmax_c >= -90 && row.tmax_c <= 65;
    })) completeYears.push(year);
  }

  const declaredCompleteYears = manifest.validation?.complete_years;
  if (!Array.isArray(declaredCompleteYears) ||
      JSON.stringify(declaredCompleteYears) !== JSON.stringify(completeYears)) {
    addIssue(issues, "Manifest complete_years does not match the validated daily measurements.");
  }
  for (const scenarioName of ["hottest_year", "driest_year"]) {
    const scenario = manifest.scenarios?.[scenarioName];
    if (!scenario || typeof scenario.rule !== "string" || !scenario.rule.trim()) {
      addIssue(issues, `Scenario ${scenarioName} is missing its selection rule.`);
    } else if (scenario.year !== null && !completeYears.includes(scenario.year)) {
      addIssue(issues, `Scenario ${scenarioName} selects a year that is not complete.`);
    }
  }

  return { ok: issues.length === 0, issues, completeYears, expectedDays: expectedDates.length };
};

