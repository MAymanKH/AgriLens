"""Independently check proposed rotation arithmetic and calendar compatibility.

Run from any directory: python scripts/check_rotation_examples.py
Reads the supported-input proposal and retained candidates separately.
Does not rank, approve, or write any data.
"""
import calendar
import datetime as dt
from decimal import Decimal
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLOTS = ('summer', 'winter', 'summer', 'winter')
EXAMPLES = {
    'baseline': ('maize', 'faba_bean', 'maize', 'wheat'),
    'alternative_a': ('soybean', 'faba_bean', 'maize', 'wheat'),
    'alternative_b': ('maize', 'faba_bean', 'soybean', 'wheat'),
}


def summarize(catalog, crop_ids, anchor):
    """Check four month-inclusive slots; retain unknown water as null."""
    if len(crop_ids) != 4:
        raise ValueError('Exactly four crop IDs are required')
    windows = []
    minimum, maximum = Decimal(0), Decimal(0)
    water_known = True
    for slot, crop_id in enumerate(crop_ids):
        crop = catalog[crop_id]
        if SLOTS[slot] not in crop['valid_seasons']:
            raise ValueError('Crop is incompatible with slot season')
        first, last = (crop['grow_window'][key] for key in ('start_month', 'end_month'))
        if any(type(month) is not int or not 1 <= month <= 12 for month in (first, last)):
            raise ValueError('Window months must be integers from 1 through 12')
        start_year = anchor + slot // 2
        end_year = start_year + (first > last)
        start = dt.date(start_year, first, 1)
        end = dt.date(end_year, last, calendar.monthrange(end_year, last)[1])
        windows.append((start, end))
        low, high = (crop['water_need_mm'][key] for key in ('min', 'max'))
        if low is None or high is None:
            water_known = False
        else:
            if any(isinstance(value, bool) or not isinstance(value, (int, float, Decimal))
                   for value in (low, high)):
                raise ValueError('Water bounds must be finite nonnegative numbers or null')
            low, high = Decimal(str(low)), Decimal(str(high))
            if not low.is_finite() or not high.is_finite() or not 0 <= low <= high:
                raise ValueError('Water bounds must be finite, ordered and nonnegative')
            minimum += low
            maximum += high
    overlaps = [max(0, (min(a[1], b[1]) - max(a[0], b[0])).days + 1)
                for a, b in zip(windows, windows[1:])]
    return {
        'crops': list(crop_ids),
        'windows': [{'start': a.isoformat(), 'end': b.isoformat(), 'days': (b-a).days+1}
                    for a, b in windows],
        'overlap_days_between_adjacent_slots': overlaps,
        'calendar_compatible': not any(overlaps),
        'water_need_mm': {'min': float(minimum) if water_known else None,
                                    'max': float(maximum) if water_known else None},
        'scientific_approval': 'pending; candidate arithmetic is not scientific validation',
    }


def main():
    data = json.loads((ROOT/'data/processed/crop_catalog.json').read_text(encoding='utf-8'))
    catalog = {crop['id']: crop for crop in data['crops']}
    assert len(catalog) == len(data['crops']), 'Duplicate crop IDs'
    assert len(set(EXAMPLES.values())) == 3, 'Example rotations must be distinct'
    candidate_results = {name: summarize(catalog, crops, 2016) for name, crops in EXAMPLES.items()}
    expected_water = {'baseline': (1800, 2750), 'alternative_a': (1750, 2650),
                      'alternative_b': (1750, 2650)}
    for name, result in candidate_results.items():
        assert result['calendar_compatible'], name + ': overlapping windows'
        assert tuple(result['water_need_mm'].values()) == expected_water[name]
        assert [window['days'] for window in result['windows']] == [153, 212, 153, 212]
    # Contrast with the reviewed old baseline: May wheat/summer overlap is detected.
    old_baseline = summarize(catalog, ('maize', 'wheat', 'rice', 'wheat'), 2016)
    assert old_baseline['overlap_days_between_adjacent_slots'] == [0, 31, 0]
    assert not old_baseline['calendar_compatible']
    # Leap years extend a real winter window rather than replacing February dates.
    leap = summarize(catalog, EXAMPLES['baseline'], 2019)
    assert leap['windows'][1]['days'] == 213
    # A missing range must remain unknown, never become a partial numeric total.
    unknown_catalog = dict(catalog, maize=dict(catalog['maize'],
                                              water_need_mm={'min': None, 'max': None}))
    assert summarize(unknown_catalog, EXAMPLES['baseline'], 2016)['water_need_mm'] == {
        'min': None, 'max': None}
    try:
        summarize(catalog, ('wheat', 'faba_bean', 'maize', 'wheat'), 2016)
    except ValueError:
        pass
    else:
        raise AssertionError('Wrong-season input was accepted')
    proposal = json.loads((ROOT/'data/processed/four_crop_proposal.json').read_text(encoding='utf-8'))
    supported = {crop['id']: crop for crop in proposal['crops']}
    assert set(supported) == {'maize', 'soybean', 'wheat', 'faba_bean'}
    assert all(crop['eligible_for_live'] is False for crop in supported.values())
    sources = {source['id'] for source in proposal['sources']}
    for crop in supported.values():
        assert crop['calendar_evidence']['source_id'] in sources
        water_source = crop['water_evidence']['source_id']
        assert water_source is None or water_source in sources
    results = {name: summarize(supported, crops, 2016) for name, crops in EXAMPLES.items()}
    for result in results.values():
        assert result['calendar_compatible']
        assert result['water_need_mm'] == {'min': None, 'max': None}
        assert [window['days'] for window in result['windows']] == [153, 212, 153, 181]
    print(json.dumps({'status': 'proposed rotation arithmetic/window checks passed',
                      'anchor_year': 2016, 'supported_input_proposal_examples': results,
                      'retained_candidate_arithmetic_diagnostic_only': candidate_results,
                      'limitations': ['No live recommendation or crop ranking is produced.',
                                      'Exact crop evidence, local applicability and scope approval remain pending.',
                                      'Faba water is unknown, so all supported-input plan totals are Not evaluated.',
                                      'No ET0, Kc or irrigation-delivery model is used.']}, indent=2))


if __name__ == '__main__':
    main()
