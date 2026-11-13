# PR #1 research follow-up

Reviewed comment: https://github.com/MAymanKH/AgriLens/pull/1#issuecomment-6853973529

At inspected head 6777af9, PR #1 is the only PR. One conversation comment, no submitted reviews, inline review comments, commit comments, check runs or status contexts were returned by authenticated GitHub API requests. No GitHub comments or review states were changed.

| Request | Local response | Remaining gate |
|---|---|---|
| 1. Correct citation ledger | Correct Springer and Sugita metadata; per-field evidence gaps recorded in SOURCES and crop catalogs | Exact primary page/table citations for chosen estimates |
| 2. Reconcile water | Preserve candidate values; distinguish FAO generic ranges from selected estimates and ET from delivery/losses | Actual support for differing rice/bean/beet/berseem ranges; no silent generic substitution |
| 3. Executable heat/calendar | METHOD and independent checker define proposed month-inclusive >=35 C whole-window metric, overlap checks, slot years, complete-anchor average, leap days and ties | Lead and affected consumers approve scientific interpretation before deployment |
| 4. 4-6 crop scope | Four-crop shortlist proposal; extras remain candidates; no candidate eligible for live use | Research evidence and Lead final selection |
| 5. Rice and wording | Permission unknown, candidate gate false; limited soil notes; range arithmetic distinct from irrigation savings | Applicable decree and geographic farm/canal-command permission |
| 6. Benchmark reproducibility | Rain corrected to 39.81; independent raw-cache checker for heat, rainfall, years and unavailable coverage | Independent human scientific sign-off |

## Verification

- `python scripts/validate_research_data.py`: 18,487 structural/cache checks, zero failures. Passing does not approve scientific evidence.
- `python tools/verify_fixtures.py`: 42 HTTP cases passed.
- `python scripts/check_research_benchmarks.py`: independent raw-series arithmetic and calendar checks; see executable assertions and METHOD examples.
- `python tools/verify_runtime.py`: failed on Windows because `Popen.send_signal(SIGINT)` is unsupported. Test-created fixture processes were stopped. This pre-existing runtime issue belongs to Lead/tooling.

## Separate Lead/backend follow-up

The reviewer explicitly assigns stale builder replacement, metadata reproducibility, MongoDB staging/checksums/reports and non-self-approving import validation separately. These files still need that owner’s change: notably `scripts/verify_schema_compliance.py` currently writes approval metadata and is not a read-only validator. Do not run it as scientific approval. Existing MongoDB approved-shaped exports are not released evidence; the root register and candidate review gates supersede those historical payload claims. A complete live release must wait for the Lead publication fix and scientific evidence sign-off.

Local fixes do not resolve evidence that does not exist in the retained sources. No source range, rice eligibility, crop scope or calendar proposal was newly approved by this change. Next: Research supplies exact citations and signs the evidence, then the Lead records final scope/calendar and publishes validated staging data.


## Follow-up review of 0794c46

Review: https://github.com/MAymanKH/AgriLens/pull/1#issuecomment-6854591906

The benchmark input guard now explicitly requires all six NASA variables and all 3,653 expected dates in each. It rejects null, boolean, nonnumeric, nonfinite and sentinel measurements before arithmetic. `--raw` permits auditing a temporary response without changing the retained cache. Negative regression checks cover missing variables, bad measurements, missing leap dates and unexpected dates; each exercises the actual command and requires a nonzero exit with no success report.

Run `python -m unittest discover -s scripts -p test_check_research_benchmarks.py` (five test methods, 20 corrupt-input variants), then `python scripts/check_research_benchmarks.py`. Both pass against the retained data.

The four-crop evidence follow-up is in `docs/FOUR_CROP_EVIDENCE.md`, with explicit source locations, applicability limits and selected calendar proposals. `data/processed/four_crop_proposal.json` separates the supported-input proposal from preserved historical candidate values; `python scripts/check_rotation_examples.py` checks three distinct nonoverlapping examples. Unsupported faba-bean requirement remains null / Not evaluated. The proposed selections are pending Research/Lead and consumer approval; the raw experimental consumptive-use span must not silently become a comparable FAO requirement.

## Lead integration after aae933b

The separate backend fixes are now included. The builder reads the retained Zankalon response, preserves candidate review flags, and produces staging manifests, daily records, checksums, and an integrity report pinned to research revision `aae933bb097d22d97dc615a9b8185ca304b16a4c`. Both validation commands are read-only and cannot approve their inputs. This supersedes the earlier warning about self-approving exports and validators. See [the staging procedure](database/research-staging.md).

The root register retains the agreed MongoDB, storage, runtime, fixture, and milestone decisions. Scientific approval remains pending. Integration checks passed: nine staging regression tests, five benchmark-input test methods covering 20 corrupt-input variants, both independent arithmetic checkers, both staging validation commands, 42 HTTP fixture cases, and the local runtime checks on Linux. The earlier Windows SIGINT limitation is not resolved by this integration.


## Research backlog after document cleanup

Document cleanup on 2026-11-13 removed the duplicate `MODEL_CONTEXT.md` handoff and `AgriLens_NASA_Data_Audit_and_Implementation_Brief.md`. This cleanup approves no scientific input, pilot change, or broader implementation task. Read `START_HERE.md`, `AGENTS.md`, and the assigned role guide for current instructions.

### Current evidence and integration checks

- Research supplies the outstanding source extracts and applicability checks in [SOURCES.md](SOURCES.md) and [FOUR_CROP_EVIDENCE.md](FOUR_CROP_EVIDENCE.md). The Lead records final crop scope, calendar, heat convention, scenario availability, and eligible sample rotations in `START_HERE.md` after the required approvals.
- Research independently checks the FAO-56 derivation, input units, humidity approximation, elevation, and crop-stage coefficients described in [METHOD.md](METHOD.md). Whole-month exposure must not be described as verified flowering-stage damage. Indicative water-range differences must not be presented as measured irrigation savings.
- Lead and service owners verify actual service integration. The fixture server replays synthetic responses and does not prove a real comparison journey. `DATA_MODE=live` in `.env.example` does not establish that live services work. Use the [runtime guide](RUNTIME.md) and [research staging procedure](database/research-staging.md); validation does not confer scientific approval.

### Deferred NASA audit questions

These are research questions for possible future scope approval, not current demo requirements:

- Reproduce any cross-site POWER or CMR comparison before using it to justify pilot selection. Distinguish reference coordinates from actual farm polygons, weather-grid boundaries from local measurements, and catalog matches from quality-filtered crop-stage observations.
- Check the official challenge resource list and actual overlap of crop labels, field boundaries, and historical seasons. Three mapped seasons do not verify a four-slot rotation. Check WaPOR footprint and resolution rather than assuming field coverage.
- Before proposing HLS, ECOSTRESS, or another product, demonstrate usable spatial and temporal support, quality filtering, and a distinct contribution to the comparison. Keep surface temperature, modeled ET, crop demand, and applied irrigation separate; avoid counting shared inputs twice.

Research owns the evidence review. The Technical Lead decides whether to activate a deferred proposal and records approved scope in `START_HERE.md`; service and app owners implement only their assigned areas.
