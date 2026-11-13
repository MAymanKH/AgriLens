"""Independent raw-cache arithmetic audit; does not approve data or write artifacts.

Run: python scripts/check_research_benchmarks.py
Calendar clarification is a proposal in docs/METHOD.md, pending consumer approval.
"""
import calendar
import datetime as dt
from decimal import Decimal
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def dates(start, end):
    return [start + dt.timedelta(days=i) for i in range((end-start).days+1)]


def window(crop, start_year):
    start_month = crop['grow_window']['start_month']
    end_month = crop['grow_window']['end_month']
    end_year = start_year + (start_month > end_month)
    return dates(dt.date(start_year, start_month, 1),
                 dt.date(end_year, end_month, calendar.monthrange(end_year, end_month)[1]))


def exposure(parameters, days):
    keys = [day.strftime('%Y%m%d') for day in days]
    if any(key not in parameters['T2M_MAX'] for key in keys):
        return None
    return sum(parameters['T2M_MAX'][key] >= 35 for key in keys)


def main():
    raw = json.loads((ROOT/'data/raw/nasa_power_zankalon_2016_2025.json').read_text(), parse_float=Decimal)
    p = raw['properties']['parameter']
    expected = {day.strftime('%Y%m%d') for day in dates(dt.date(2016,1,1), dt.date(2025,12,31))}
    for variable, values in p.items():
        assert set(values) == expected, variable + ': incomplete coverage'
        assert all(value != raw['header']['fill_value'] for value in values.values()), variable + ': fill value'
    assert len(expected) == 3653
    annual = {}
    for year in range(2016,2026):
        keys = sorted(key for key in expected if key.startswith(str(year)))
        annual[year] = (sum(p['T2M_MAX'][key] for key in keys)/len(keys),
                        sum(p['PRECTOTCORR'][key] for key in keys))
    hottest = min(annual, key=lambda year: (-annual[year][0], year))
    driest = min(annual, key=lambda year: (annual[year][1], year))
    assert (hottest,driest) == (2024,2025)
    assert annual[2025][1] == Decimal('39.81')
    crops = {crop['id']:crop for crop in json.loads((ROOT/'data/processed/crop_catalog.json').read_text())['crops']}
    maize_days = window(crops['maize'],2024)
    maize_hot = exposure(p,maize_days)
    assert len(maize_days) == 153
    assert maize_hot == 135
    assert exposure({'T2M_MAX': {'20240101': 35}}, [dt.date(2024,1,1)]) == 1
    assert exposure({'T2M_MAX': {}}, [dt.date(2024,1,1)]) is None
    assert maize_hot == sum(value >= 35 for key,value in p['T2M_MAX'].items() if '20240501' <= key <= '20240930')
    baseline = ['maize','wheat','rice','wheat']
    by_anchor = {}
    overlaps = {}
    for anchor in range(2016,2026):
        windows = [window(crops[crop],anchor+i//2) for i,crop in enumerate(baseline)]
        counts = [exposure(p,days) for days in windows]
        by_anchor[anchor] = None if None in counts else sum(counts)
        overlaps[anchor] = sum(len(set(a)&set(b)) for a,b in zip(windows,windows[1:]))
    complete = [year for year,count in by_anchor.items() if count is not None]
    assert complete == list(range(2016,2024))
    assert [by_anchor[y] for y in complete] == [302,324,329,327,328,315,308,317]
    assert all(overlaps[y] == 31 for y in by_anchor)
    assert by_anchor[2024] is None and by_anchor[2025] is None
    assert dt.date(2024,2,29) in window(crops['wheat'],2023)
    assert min([2020,2021],key=lambda year:(0,year)) == 2020
    print(json.dumps({'status':'arithmetic checks passed; scientific approval pending',
        'dates':len(expected), 'time_standard':raw['header']['time_standard'],
        'hottest_year':hottest,'driest_year':driest,'rain_2025_mm':str(annual[2025][1]),
        'maize_2024_window_days':len(maize_days),'maize_2024_hot_days_gte35':maize_hot,
        'baseline_crop_day_exposure_by_anchor':by_anchor,
        'baseline_overlap_days_by_anchor':overlaps,
        'average_complete_anchors':complete,
        'average_baseline_crop_day_exposure':sum(by_anchor[y] for y in complete)/len(complete)
    },indent=2))


if __name__ == '__main__':
    main()
