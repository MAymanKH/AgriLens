# Zankalon historical reference: 1991–2020

Downloaded and audited on 2026-11-14. Status: research candidate; scientific approval and integration pending.

The complete NASA POWER daily reference period has **10,958 dates**, including **8 leap days**, with all six required variables (**65,748 values**). The audit found no missing/extra dates, duplicate JSON keys, null/nonnumeric/nonfinite values or fill sentinels. It also checked returned units, LST, nonnegative rain/wind/radiation, humidity bounds and Tmin <= Tmax.

| Chunk | Dates per variable | Variables | Result |
|---|---:|---:|---|
| 1991–2000 | 3,653 | 6 | PASS |
| 2001–2010 | 3,652 | 6 | PASS |
| 2011–2020 | 3,653 | 6 | PASS |

Variables: T2M_MAX, T2M_MIN, RH2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN, WS2M. Request point: 30.58057 N, 31.43332 E. Time standard: local solar time, not Cairo civil time. Each raw response is retained verbatim. `audit.json` records request URLs, retrieval timestamps, response geometry, source/API headers, units, validation counts and SHA256 checksums.

Reproduce from repository root: `python scripts/audit_power_history.py`. Existing raw files are rechecked without another download; known retrieval timestamps are preserved when checksums match. The command cannot approve, publish or modify the existing product dataset. An invalid cache fails explicitly.

Completeness is not field accuracy. These are gridded model/remote-sensing products, not 30 years of on-farm station measurements. The solar source changes between the pre-2001 SRB period and the subsequent SYN1DEG period. Review those differences before trend analysis or derived ET0 comparisons.

Next steps: have Research review source consistency and methods; retain 1991–2020 as a reference distinct from recent 2016–2025 weather; add a validated 2021–2022 buffer for all 30 four-slot anchor years. Without that buffer, only anchors 1991–2018 fit entirely inside this record, because the final winter for anchor n extends into n+2. Later observations already retained elsewhere must be matched/validated before combining revisions. A 2025 anchor still needs future 2027 observations; a long historical baseline does not solve that gap.

Lead and affected consumers must approve any changes to the current root decision register, scenario selection and API semantics before integration. Unknown crop evidence remains unknown; longer weather coverage does not establish crop-specific thresholds or faba-bean water requirements.


## PR verification and backend handoff

The audit rejects mismatched response coordinates/period/time standard, changed known raw checksums and changed manifest request identities, including when a deleted cache is downloaded again. Response coordinate matching permits three-decimal rounding tolerance (0.00051 degrees per coordinate). Audit manifests use atomic replacement; failed attempts report `audit_failed` and preserve recorded raw provenance. Re-auditing unchanged cached inputs is offline and byte-for-byte reproducible.

Checks completed on the PR branch based on main ae76a7b:

- `python scripts/audit_power_history.py`: PASS, all 65,748 values.
- `python -m unittest discover -s scripts -p test_audit_power_history.py`: 5 methods pass, including 11 corrupt-input variants, duplicate JSON keys, cached-request/checksum rejection, changed redownload rejection, failure status and reproducibility.
- Existing research-import tests: 9 pass. Existing benchmark regression tests: 5 pass. Synthetic fixture verification: 42 HTTP cases pass.
- Comparison service `npm test`: 21 of 22 pass. The existing launcher integration test invokes `python3`; on this Windows machine that command is a Microsoft Store alias reporting Python unavailable. `python` is installed. No services, current data/processed or data/raw files, runtime tools or shared root contracts are changed in this PR.

The Standards review identified three provenance/failure-state issues, all corrected with regression coverage, plus a redownload edge case also corrected. The Spec review independently reproduced the dates, leap days, value counts and checksums; identity-validation and documentation inconsistencies were corrected. No field accuracy or scientific sign-off is asserted. Next owners: Research reviews source consistency; Lead and Climate choose whether/how to introduce the reference and later-year buffer. Merging these research artifacts does not activate them in the backend.
