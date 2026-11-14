import { t } from './i18n.js';

export const slots = ['y1_summer', 'y1_winter', 'y2_summer', 'y2_winter'];
export const slotNames = ['Year 1 Summer', 'Year 1 Winter', 'Year 2 Summer', 'Year 2 Winter'];
export const priorities = { water: 'Less water', heat: 'Less heat exposure', soil: 'More crop diversity' };
export const planNames = { baseline: 'Your rotation', water_conscious: 'Alternative 1', diverse: 'Alternative 2' };

export function scenarioName(id, mode, language = 'en') {
  if (id === 'average') return t(language, 'Historical average');
  const extreme = id === 'hottest_year' ? 'Hottest' : 'Driest';
  return t(language, mode === 'unreviewed' ? `${extreme} eligible rotation anchor` : `${extreme} recorded year`);
}

export function modeNotice(mode) {
  if (mode === 'fixture') return 'Synthetic development data. These are not NASA measurements or agricultural recommendations.';
  if (mode === 'unreviewed') return 'Unreviewed prototype. Retained climate records and proposed crop assumptions have not received scientific approval.';
  if (mode !== 'live') return 'Data review status is not supplied. Check the sources and limitations before using these results.';
  return '';
}

export const number = (value, language = 'en') => value === null ? t(language, 'Not evaluated') : new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en', { maximumSignificantDigits: 21 }).format(value);
export const waterRange = (range, language = 'en') => range.min === null || range.max === null ? t(language, 'Not evaluated') : `${number(range.min, language)}–${number(range.max, language)}`;
export function inputErrors(config, baseline) {
  return slots.map((slot, i) => config.crops_by_season[slot.endsWith('summer') ? 'summer' : 'winter'].some(crop => crop.id === baseline[i]) ? '' : `Choose a supported ${slot.endsWith('summer') ? 'summer' : 'winter'} crop.`);
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
