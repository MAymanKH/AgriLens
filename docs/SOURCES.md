# AgriLens | Source Ledger & Evidence Log

**Role Owner:** Research & Data Specialist (Role 06)  
**Project:** AgriLens — NASA Space Apps Challenge (Adapting Farms with NASA Data)  
**Primary Pilot Area:** Zankalon Water Research Station, Sharkia Governorate, Egypt (`30.58057° N, 31.43332° E`)  
**Authority:** Companion to `START_HERE.md`, `AgriLens_NASA_Data_Audit_and_Implementation_Brief.md`, and `docs/METHOD.md`.

---

## 1. Primary Evidence Ledger

| Claim / Metric | Value / Rule | Unit | Geographic Anchor | Primary Source & Citation | Uncertainty & Sensor Caveat |
|---|---|---|---|---|---|
| **Pilot Area Coordinates** | `30.58057° N, 31.43332° E` | Decimal Degrees | Zankalon Water Research Station (EG-ZAN), Sharkia Governorate, East Nile Delta | Sugita et al. (2017) & NWRC Egypt | Exact flux tower location; surrounded by smallholder level-basin agricultural fields (~0.2–0.5 ha). |
| **Meteorological Baseline** | Daily continuous series (2016-01-01 to 2025-12-31) | 3,653 days, 0 missing | NASA POWER grid cell centered on Zankalon | [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Gridded reanalysis (MERRA-2 / GEOS-FP at 0.5° x 0.625° resolution); regional atmospheric assimilation. |
| **Solar Radiation** | `ALLSKY_SFC_SW_DWN` | $MJ/m^2/day$ | Atmospheric column above Zankalon | [NASA POWER Parameters](https://power.larc.nasa.gov/docs/tutorials/parameters/) | Daily all-sky surface shortwave downward irradiance; used in FAO-56 net radiation calculation. |
| **Relative Humidity & Wind** | `RH2M` (%), `WS2M` (m/s) | %, m/s | 2-meter atmospheric surface layer | [NASA POWER Parameters](https://power.larc.nasa.gov/docs/tutorials/parameters/) | Daily surface atmospheric moisture and aerodynamic transfer parameters for Penman-Monteith equation. |
| **Reference ET ($ET_0$)** | Derived daily FAO-56 Penman-Monteith | mm / day | Zankalon (`z = 10.0` m) | Allen et al. (1998) FAO Irrigation and Drainage Paper 56 | Computed grass reference evapotranspiration, NOT actual crop consumptive use ($ET_a$ or $ET_c$). |
| **Extreme Heat Stress** | Daily $T_{\max} \ge 35.0^\circ\text{C}$ (flowering) and $\ge 38.0^\circ\text{C}$ (extreme) | °C | 2-meter air temperature | ICARDA / ARC Cereal Heat Thresholds | High temperature during silking (maize) or grain-fill (wheat) causes pollen sterility and kernel shriveling. |
| **Hottest Scenario Year** | `2024` (Mean $T_{\max} = 31.79^\circ\text{C}$, 117 days $\ge 38^\circ\text{C}$) | °C / days | Complete 2016–2025 series | NASA POWER derived series | 2024 set historical summer heat records across the East Nile Delta. |
| **Driest Scenario Year** | `2025` (Annual rain = $39.80$ mm, annual $ET_0 = 1996.3$ mm) | mm / year | Complete 2016–2025 series | NASA POWER derived series | Validates near-zero effective rainfall; 100% reliance on Nile canal delivery. |
| **Maize Water Need & $K_c$** | [500, 800] mm; $K_{c,\text{mid}} = 1.20$ | mm / cycle | Zankalon level-basin plots | Sugita et al. (2017), Springer (2024) | Measured seasonal $ET_a \approx 550 - 680$ mm under basin irrigation; indicative FAO range is 500–800 mm. |
| **Rice Water Need & $K_c$** | [900, 1400] mm; $K_{c,\text{mid}} = 1.20$ | mm / cycle | Nile Delta paddy fields | Sugita et al. (2017), FAO-56 | Measured consumptive $ET_a \approx 900 - 1100$ mm. Excludes 200–400 mm for nursery prep and percolation. |
| **Rice Regulatory Quota** | Conditional / restricted zoning | Boolean constraint | Southern Sharkia canal commands | MWRI Annual Ministerial Decrees | Regulated by Egyptian Ministry of Water Resources; banned in non-permitted canal reaches. |
| **Cotton Water Need & $K_c$** | [700, 1300] mm; $K_{c,\text{mid}} = 1.20$ | mm / cycle | Long-season cash crop | Sugita et al. (2017), USDA FAS | Longest summer vegetative cycle (April to October); high total seasonal water requirement. |
| **Soybean Water Need & $K_c$** | [450, 700] mm; $K_{c,\text{mid}} = 1.15$ | mm / cycle | Summer grain legume | FAO Paper 24 & FAO Delta Calendar | Fixes atmospheric nitrogen; requires ~200–300 mm less water than maize or cotton. |
| **Wheat Water Need & $K_c$** | [450, 650] mm; $K_{c,\text{mid}} = 1.15$ | mm / cycle | Winter staple cereal | Sugita et al. (2017), Springer (2024) | Measured seasonal $ET_a \approx 420 - 520$ mm at Zankalon; vulnerable to late-season heatwaves. |
| **Berseem Water Need & $K_c$** | [550, 800] mm; $K_{c,\text{mid}} = 1.10$ | mm / cycle | Multi-cut winter forage legume | Sugita et al. (2017), FAO Paper 24 | High biomass yield across 4–5 cuts; enriches soil organic nitrogen through biological fixation. |
| **Faba Bean Water Need & $K_c$** | [350, 500] mm; $K_{c,\text{mid}} = 1.15$ | mm / cycle | Winter food pulse legume | ICARDA Grain Legumes, FAO Paper 24 | Lowest water requirement of winter crops; significant biological nitrogen contribution. |
| **Sugar Beet Water Need & $K_c$** | [500, 700] mm; $K_{c,\text{mid}} = 1.20$ | mm / cycle | Winter root cash crop | Springer (2024), Sugar Crops Research Institute | Deep rooting system, moderate drought and salinity tolerance; alternative winter cash crop. |

---

## 2. Formal Source Registry & Resolving IDs

Every API response plan and crop record references these authoritative IDs in `meta.sources` or `crops.source_ids`:

### `SRC-NASA-POWER-DAILY`
- **Title:** NASA Prediction Of Worldwide Energy Resources (POWER) Daily Temporal API
- **URL:** https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- **Parameters:** `T2M_MAX, T2M_MIN, RH2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN, WS2M`
- **Supports:** Daily meteorological series for Zankalon (`30.58057 N, 31.43332 E`) across 2016-01-01 to 2025-12-31.
- **Caveat:** MERRA-2 global reanalysis model output at 0.5° x 0.625° spatial grid resolution.

### `SRC-FAO-CROPWATER`
- **Title:** FAO Irrigation and Drainage Paper No. 24, 33 & 56 (Crop Evapotranspiration & Indicative Needs)
- **URL:** https://www.fao.org/4/s2022e/s2022e07.htm
- **Supports:** Indicative crop water requirement ranges (mm per full growing period) and baseline stage crop coefficients ($K_c$).
- **Caveat:** Represents crop evapotranspiration under standard agronomic conditions, not conveyance or application losses.

### `SRC-ZANKALON-SUGITA-2017`
- **Title:** Crop Evapotranspiration in the Nile Delta under Different Irrigation Methods (Sugita et al., 2017)
- **Citation:** *Hydrological Sciences Journal*, 62(16), 2634–2648. DOI: 10.1080/02626667.2017.1390317
- **URL:** https://tsukuba.repo.nii.ac.jp/record/41521/files/HydrologicalSciencesJournal_20170314.pdf
- **Supports:** Direct eddy covariance flux tower observations ($ET_a$) and calibrated $K_c$ curves specifically measured at Zankalon (`30.58057 N, 31.43332 E`) for maize, rice, cotton, and wheat under level-basin flood and improved irrigation.

### `SRC-SPRINGER-WATER-PROD-2024`
- **Title:** Evaluation of Water Productivity of Major Crops in the Nile Delta, Egypt Using Remote Sensing and Field Measurements
- **Citation:** *Water Resources Management*, Springer (2024). DOI: 10.1007/s42106-024-00301-7
- **URL:** https://link.springer.com/article/10.1007/s42106-024-00301-7
- **Supports:** Four-crop rotation water productivity, WaPOR satellite ET calibration, and field performance metrics at Zankalon.

### `SRC-FAO-CALENDAR-EG-DELTA`
- **Title:** FAO Crop Calendar: Egypt Nile Delta Agro-ecological Zone (AEZ 001)
- **URL:** https://api-cropcalendar.apps.fao.org/api/v1/countries/EG/cropCalendar?language=en&aez=001
- **Supports:** Agronomic sowing, peak vegetative growth, and harvest windows for Delta crops.

### `SRC-FAO-SPECIES-DIVERSIFICATION`
- **Title:** FAO Conservation Agriculture: Species Diversification & Crop Rotation Principles
- **URL:** https://www.fao.org/conservation-agriculture/in-practice/species-diversification/en/
- **Supports:** Qualitative principles for legume biological nitrogen fixation and botanical family alternation.
- **Caveat:** Does not support numerical on-farm soil carbon/nitrogen quantification without laboratory soil testing.

### `SRC-MWRI-RICE-REGULATION`
- **Title:** Egyptian Ministry of Water Resources and Irrigation (MWRI) - Annual Rice Cultivation Zoning Decrees
- **URL:** https://www.mwri.gov.eg/
- **Supports:** Regulatory zoning boundaries and canal-command acreage quotas for paddy rice in Sharkia Governorate.

### `SRC-USDA-COTTON-EG`
- **Title:** USDA FAS Cotton and Products Annual: Egypt (Report EG2026-0003)
- **URL:** https://apps.fas.usda.gov/newgainapi/api/Report/DownloadReportByFileName?fileName=Cotton%20and%20Products%20Annual_Cairo_Egypt_EG2026-0003.pdf
- **Supports:** Nile Delta long-staple cotton planting schedules, heat resilience, and water regimes.

### `SRC-ICARDA-LEGUMES-MENA`
- **Title:** ICARDA Food Legume Program: Dryland Grain Legumes in Egypt and the MENA Region
- **URL:** https://www.icarda.org/research/crop-improvement/grain-legumes
- **Supports:** Faba bean water consumption and thermal stress thresholds in the Nile Delta.
