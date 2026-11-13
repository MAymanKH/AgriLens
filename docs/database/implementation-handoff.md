# Implement the MongoDB design

Implement [the schema defaults](mongodb-schema.md) using [the local runtime](../RUNTIME.md). Native server startup, HTTP fixtures, and a [local staging importer](local-import.md) are provided. Live service adapters, scientific publication, and any richer service-owned validators still need implementation.

## Use the established defaults

1. Use the Lead-set collection shapes, indexes, and importer responsibilities as a starting point. Adapt private storage without waiting for a separate sign-off.
2. Use local MongoDB 8.0 without authentication and the runtime configuration names. Select a compatible driver for your chosen language. Research maintains the source ledger; the Lead maintains release configuration.
3. Have Research approve scientific values and method notes. Keep unresolved values Pending. Use isolated fixtures while work continues.
4. Keep the public and internal API bodies unchanged. Propose exact before/after shapes separately if an implementation needs a contract change. Obtain affected consumer approval and Research approval for scientific meaning.

The runtime agreement includes service base URLs, ports, timeouts, startup commands, database names, and health behavior. Do not put credentials in the repository.

## Implement each service independently

1. Start local MongoDB without authentication. Keep fixture storage tests in databases ending in `_fixtures`; scoped users are not required for this prototype.
2. Install validators and the indexes from the schema reference using repeatable migrations. Fail on incompatible existing definitions instead of silently replacing them.
3. Implement one importer per service. Reject unknown fields with scientific meaning, malformed IDs, invalid dates, conflicting duplicates, and invalid source references.
4. Implement an adapter that reads the selected approved snapshot and projects the existing API body. Keep repository access private to the owning service.
5. Run the service against fixtures without requiring another developer's private code or database.

The Climate repository needs only capabilities to load the selected manifest with its ordered daily records and import a new revision. The Crop repository needs only capabilities to load a selected catalog and import a new revision. Do not expose generic database queries to Comparison.

## Publish a revision without partial reads

1. Allocate a new revision ID and a `staging` manifest. Run one importer for that revision. Concurrent independent imports use different revision IDs.
2. Write records using stable identities. Identical retries are no-ops. Reject different content under an existing identity; allocate a new revision for corrections. Never use retries to mutate an approved dataset.
3. Finish and stop all writers for that revision. Transition the manifest from `staging` to `sealed` with a conditional update. The importer cannot write a sealed revision. No job resumes writes after sealing.
4. Validate the sealed contents. Check references, coverage, metrics, raw-artifact checksum, normalized checksum, and applicable scientific rules. Retain a durable report.
5. Attach Research scientific sign-off and the importer validation report. No separate Lead approval meeting is required. Conditionally transition `sealed` to `approved` only when those records match that exact revision. Failed validation transitions to `rejected`; fixes use a new revision ID.
6. Pin the approved ID in a release record. Test both service selections and the complete app journey before making that release live.

The single-writer importer is a required invariant for each revision. An implementation with concurrent writers must add a proven publication protocol before it can claim this lifecycle. Validators cannot enforce immutability across collections. Local database permissions do not restrict writes. Service code must keep publication inside the controlled importer; relaxed permissions do not authorize changing approved evidence in place.

A crash before approval leaves an unservable staging or sealed revision. On restart, inspect the state and checksum before resuming validation. A retry of an approved import verifies identity and content without rewriting it. Read the manifest once, then load its rows by that fixed ID. Immutability prevents mixing revisions during the two reads.

## Release and recover

1. Record the catalog ID, climate dataset ID, root decision commit, method revision, Comparison commit, and source-ledger revision in deployment configuration.
2. Check that both inputs represent the same approved region and coordinates. Check method and calendar compatibility, data completeness, and that the demo has three distinct valid plans.
3. Retain the previous verified release and its artifacts. Roll back by selecting that complete release and rerunning checks. Do not silently change input revisions inside a failing live request.
4. Back up approved manifests, daily records, catalog revisions, original NASA artifacts, and validation reports. Verify a restore before the demo.

Historical records do not need a fabricated short expiry. Research and the Lead define applicability and freshness for the selected release. Retrieval time alone does not prove a cached dataset matches the approved period and method. If no valid selected cache can be read, return the root unavailable state.

Do not delete approved revisions while a retained release references them. A later cleanup procedure can remove abandoned staging imports after an owner review; no automatic cleanup is part of this prototype.

## Evolve the schema

1. Assign a new `schema_version` when stored structure or interpretation changes. Keep schema and data revision identities separate.
2. Migrate into new revision documents. Preserve original source artifacts and previous approved revisions.
3. Make the owning service read the new shape and project the same API contract. Update validators, importer checks, fixtures, and adapter tests together.
4. Validate and approve the migrated data, then switch the pinned release. Remove temporary old-shape readers after callers have migrated. Fail closed on unsupported versions.

A larger crop catalog can later split into per-crop documents behind the Crop API. Larger climate histories can change physical storage behind the Climate API. Neither change authorizes more product regions, new endpoints, or silently revised scientific methods.

## Acceptance evidence by owner

| Owner | Required evidence before implementation is accepted |
|---|---|
| Crop | Independent startup; exact API projection; invalid-region response; unique embedded IDs; source resolution; crop/season and winter-window checks; invalid water ranges rejected; nulls preserved |
| Climate | Independent startup; exact API projection; duplicate dataset/date rejected; invalid dates and sentinels handled; leap day and cross-year coverage checked; hottest/driest selection and ties independently reproduced |
| Both service owners | Fixture selection blocked in live mode; staging/sealed/rejected selection blocked; repeated import does not change content; crash before approval leaves no readable partial release; unknown schema version rejected; database outage produces useful error |
| Lead + Research | Region/method compatibility; one independently reproduced water sum and heat count; same source ID never names conflicting evidence; water invariant across scenarios unless an approved method changes it |
| Lead + App | Baseline preserved; verified demo returns three plans; fewer alternatives and missing metrics render truthfully; unavailable scenario and service outage recover without silently changing data |
| Lead | Restore and rollback demonstrated; selected snapshot IDs and revisions recorded; no database credentials or storage internals exposed through public APIs |

Read the database documents and `START_HERE.md` for storage rules. Use `fixtures/cases.json` for complete runnable HTTP examples. All development fixture values are synthetic, not scientific acceptance evidence.

Next action: Climate and Crop owners implement validators, importers, and adapters using the established defaults. Research owns source IDs/titles and scientific methods. The Lead implements ranking/integration and maintains release configuration. Native MongoDB startup is supplied in `tools/dev.py`. [Candidate research staging files](research-staging.md) are available, but no scientific dataset is approved for live use.
