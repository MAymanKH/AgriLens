# AgriLens | Scientific Methodology & Calculation Reference

**Owner:** Research & Data Specialist (Role 06)  
**Authority:** Companion to `START_HERE.md`, `AgriLens_NASA_Data_Audit_and_Implementation_Brief.md`, and `docs/SOURCES.md`.  
**Primary Pilot Area:** Zankalon Water Research Station, Sharkia Governorate, Egypt (`30.58057° N, 31.43332° E`, Elevation: 10.0 m)  
**Last Verified:** 2026-11-13  

---

## 1. Scope & Core Agronomic Model

AgriLens models smallholder farm decision-making over a discrete **two-year agricultural sequence** consisting of **four chronological slots**:
1. `y1_summer`: Year 1 Summer (May – September/October)
2. `y1_winter`: Year 1 Winter (October/November – April/May)
3. `y2_summer`: Year 2 Summer (May – September/October)
4. `y2_winter`: Year 2 Winter (October/November – April/May)

### Seasonal Calendar & Year-Crossing Rules
- **Summer Crops:** Lie strictly within the same calendar year.
  - Maize: 1 May to 30 September (153 days).
  - Rice: 15 May to 15 October (153 days).
  - Cotton: 1 April to 31 October (214 days).
  - Soybean: 15 May to 30 September (138 days).
- **Winter Crops (Cross-Year Convention):** Sown in late autumn of calendar year $n$ and harvested in spring of calendar year $n+1$:
  - Wheat: 15 November (year $n$) to 10 May (year $n+1$) (176 days).
  - Berseem (Multi-cut Miskawi): 1 October (year $n$) to 31 May (year $n+1$) (243 days).
  - Faba Bean: 15 October (year $n$) to 30 April (year $n+1$) (197 days).
  - Sugar Beet: 1 October (year $n$) to 30 April (year $n+1$) (212 days).

Month-level convention: When `start_month > end_month`, the calendar window crosses December/January and evaluates days from month `start_month` in year $n$ through month `end_month` in year $n+1$.

---

## 2. Quantitative Metric Formulas & Calculation Logic

### A. Reference Evapotranspiration ($ET_0$) via FAO-56 Penman-Monteith
Unlike simple temperature formulas, AgriLens derives daily grass-reference evapotranspiration ($ET_0$ in mm/day) from 5 NASA POWER parameters (`T2M_MAX`, `T2M_MIN`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `WS2M`) according to the FAO-56 Penman-Monteith equation (Allen et al., 1998):

$$ET_0 = \frac{0.408 \Delta (R_n - G) + \gamma \frac{900}{T_{\text{mean}} + 273} u_2 (e_s - e_a)}{\Delta + \gamma (1 + 0.34 u_2)}$$

Where:
- $T_{\text{mean}} = \frac{T_{\max} + T_{\min}}{2}$ (°C)
- $u_2 = \text{WS2M}$ (wind speed at 2 m, m/s)
- $e_s = \frac{e^0(T_{\max}) + e^0(T_{\min})}{2}$ (saturation vapour pressure, kPa)
- $e_a = e_s \times \frac{\text{RH2M}}{100}$ (actual vapour pressure, kPa)
- $\Delta = \frac{4098 \left[0.6108 \exp\left(\frac{17.27 T_{\text{mean}}}{T_{\text{mean}} + 237.3}\right)\right]}{(T_{\text{mean}} + 237.3)^2}$ (slope of vapour pressure curve, kPa/°C)
- Psychrometric constant $\gamma = 0.0673$ kPa/°C at $z = 10.0$ m elevation.
- Net radiation $R_n = R_{ns} - R_{nl}$, where $R_{ns} = (1 - 0.23) R_s$ ($R_s = \text{ALLSKY\_SFC\_SW\_DWN}$), and $R_{nl}$ is net longwave radiation.
- Soil heat flux $G = 0$ for daily calculations.

### B. Crop Water Need Quantities
AgriLens maintains strict separation between **three distinct water quantities**:
1. **Indicative Sourced Ranges (`water_need_mm`):** Bounded ranges [min, max] mm across the full crop cycle from FAO Paper 24/33/56. Additive across rotation slots:
   $$\text{Total Water Need}_{\min} = \sum_{i=1}^{4} \text{Crop}_i.\text{water\_need\_mm}.\min$$
   $$\text{Total Water Need}_{\max} = \sum_{i=1}^{4} \text{Crop}_i.\text{water\_need\_mm}.\max$$
2. **Modeled Consumptive Demand ($ET_c$):** Derived using stage-specific crop coefficients ($K_c$) from Sugita et al. (2017) and FAO-56:
   $$ET_c(d) = K_c(d) \times ET_0(d)$$
3. **Paddy Rice Water Requirement:** For rice, consumptive evapotranspiration ($ET_c \approx 900 - 1100$ mm) is augmented by 200–400 mm for seedling nursery preparation, puddling, and ponding percolation losses under Delta level-basin flood irrigation.

### C. Extreme Heat Exposure (`hot_days`)
Heat stress days are quantified across each crop's active growing window based on daily peak temperature ($T_{\max}$):
- **Cereal Flowering Heat Threshold ($35.0^\circ\text{C}$):** Critical threshold for maize silking and late-season wheat grain filling; counts days with $T_{\max} \ge 35.0^\circ\text{C}$.
- **Extreme Thermal Stress Threshold ($38.0^\circ\text{C}$):** Acute threshold causing vegetative heat stunting and stomatal shutdown.

$$\text{hot\_days}(\text{Plan}) = \sum_{i=1}^{4} \sum_{d \in \text{GrowWindow}(\text{Crop}_i)} \mathbb{I}(T_{\max}(d) \ge 35.0^\circ\text{C})$$

---

## 3. Climate Scenario Selection Rules (2016–2025 Baseline)

From the 10-year NASA POWER series for Zankalon (`30.58057° N, 31.43332° E`, 3,653 complete days, 0 missing values):
1. **`average` Scenario:** 10-year historical baseline mean (Annual mean $T_{\max} = 31.14^\circ\text{C}$, annual rainfall = $111.43$ mm, annual $ET_0 = 1964.3$ mm, scenario year = `null`).
2. **`hottest_year` Scenario:** **2024**
   - Annual mean daily $T_{\max} = 31.79^\circ\text{C}$
   - Days $\ge 35^\circ\text{C}$: 146 days
   - Days $\ge 38^\circ\text{C}$: 117 days (East Delta all-time record heat)
   - Annual $ET_0 = 2023.7$ mm
3. **`driest_year` Scenario:** **2025**
   - Total annual precipitation: **39.80 mm**
   - Annual $ET_0 = 1996.3$ mm

---

## 4. Benchmark Verification Test Cases (Zankalon Pilot)

The Comparison Engine and UI must independently reproduce the following benchmark calculations:

### Test Case 1: Baseline Plan (Traditional Intensive Delta Rotation)
- **Sequence:** `maize` (`y1_summer`) $\to$ `wheat` (`y1_winter`) $\to$ `rice` (`y2_summer`) $\to$ `wheat` (`y2_winter`)
- **Indicative Water Demand:**
  - `maize`: [500, 800] mm
  - `wheat`: [450, 650] mm
  - `rice`: [900, 1400] mm (consumptive; add ~300 mm if accounting for puddling percolation)
  - `wheat`: [450, 650] mm
  - **Expected Sum:** **[2300, 3500] mm** (Highest water intensity)
- **Soil & Diversity Note:** Contains **zero legumes** (`is_legume: false`). Heavy cereal repetition (3 slots of `Poaceae`), resulting in severe nitrogen depletion and chronic stem-borer / rust pest carryover risk.
- **Regulatory Warning:** Includes `rice`, which is subject to annual MWRI canal command quotas in Sharkia; conditional/restricted in non-permitted canal reaches.

### Test Case 2: Water-Conscious & Policy-Compliant Alternative
- **Sequence:** `maize` (`y1_summer`) $\to$ `faba_bean` (`y1_winter`) $\to$ `soybean` (`y2_summer`) $\to$ `wheat` (`y2_winter`)
- **Indicative Water Demand:**
  - `maize`: [500, 800] mm
  - `faba_bean`: [350, 500] mm
  - `soybean`: [450, 700] mm
  - `wheat`: [450, 650] mm
  - **Expected Sum:** **[1750, 2650] mm**
  - **Net Indicative Water Saving:** Saves **550 mm (min) to 850 mm (max)** compared to Baseline!
- **Soil & Diversity Note:** Rotates cereals (`Poaceae`) with two distinct food legumes (`Fabaceae`: `faba_bean`, `soybean`), delivering biological nitrogen fixation and eliminating rice quota compliance penalties.

### Test Case 3: Diverse Soil-Building & Cash Crop Alternative
- **Sequence:** `cotton` (`y1_summer`) $\to$ `berseem` (`y1_winter`) $\to$ `soybean` (`y2_summer`) $\to$ `sugar_beet` (`y2_winter`)
- **Indicative Water Demand:**
  - `cotton`: [700, 1300] mm
  - `berseem`: [550, 800] mm
  - `soybean`: [450, 700] mm
  - `sugar_beet`: [500, 700] mm
  - **Expected Sum:** **[2200, 3500] mm**
- **Soil & Diversity Note:** Maximum rotational biodiversity across **three botanical families** (`Malvaceae`, `Fabaceae`, `Amaranthaceae`). Incorporates full-season multi-cut Berseem clover for heavy organic matter restoration and deep-rooting sugar beet for salt management. Zero grass cereal monoculture.

---

## 5. Explicit Limitations & Boundaries

1. **Indicative Ranges vs. Field Delivery:** Sourced FAO ranges represent crop evapotranspirative demand under standard management. They do not represent flood basin distribution losses (~30–40% in unimproved delta ditches) or convey canal delivery scheduling.
2. **Reanalysis Grid Scale:** NASA POWER data represents a 0.5° x 0.625° atmospheric assimilation cell (~55 x 60 km). It does not reflect microclimate variations within shaded canal banks or parcel-level soil moisture without high-resolution sensor integration (e.g., HLS 30m).
3. **Historical Climate Stress Test, Not Weather Forecast:** Historical scenarios (`2024` heat, `2025` drought) demonstrate resilience under observed past meteorological extremes. They are not future climate projections or seasonal forecasts.
4. **Soil Health Claims:** Soil benefits are qualitative agronomic descriptions of biological nitrogen fixation and botanical pest interruption. No laboratory-measured soil organic carbon or nutrient concentration is simulated.
