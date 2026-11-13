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
