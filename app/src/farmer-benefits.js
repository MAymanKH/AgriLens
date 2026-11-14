import { waterMidpoint } from './model.js';

// Presentation conversions only. These do not predict irrigation or crop losses.
export function farmerBenefits(baseline, alternative) {
  const before = waterMidpoint(baseline.water_need_mm);
  const after = waterMidpoint(alternative.water_need_mm);
  return {
    waterChangeM3PerHectare: before === null || after === null ? null : (after - before) * 10,
    hotDayChange: baseline.hot_days === null || alternative.hot_days === null ? null : alternative.hot_days - baseline.hot_days,
    baselineCropCount: new Set(baseline.crops).size,
    alternativeCropCount: new Set(alternative.crops).size,
  };
}
