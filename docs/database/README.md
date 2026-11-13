# MongoDB storage design

Status: Technical Lead implementation defaults, 2026-11-13. No separate service-owner approval round is required. Owners can adapt private storage while preserving the APIs and evidence rules. Scientific decisions marked Pending in [START_HERE.md](../../START_HERE.md) remain Pending.

This design supports the existing one-region prototype. It makes approved data replaceable and reproducible without changing the public API or making services share database internals.

## Consumer experience

The App calls `GET /api/config` and `POST /api/compare`. Comparison obtains crop and climate inputs from the two internal APIs. Neither consumer needs MongoDB credentials or knowledge of these collections.

For example, a Comparison request still has the existing shape. These IDs are synthetic placeholders, not approved crop records.

```json
{
	"region_id": "sample_region",
	"baseline": ["summer_a", "winter_a", "summer_b", "winter_b"],
	"priority": "water",
	"scenario": "average"
}
```

Each internal service reads one explicitly selected, approved snapshot and returns the existing contract. Replacing a dataset does not require changing App code. Storage-only fields never appear in responses by accident.

## Ownership and shape

The local prototype uses one MongoDB instance with separate logical databases. [Runtime defaults](../RUNTIME.md) provide startup commands and connection settings.

| Database | Collection | Owner | Read unit |
|---|---|---|---|
| `agrilens_crops` | `crop_catalogs` | Crop developer | One complete catalog revision for one region |
| `agrilens_climate` | `climate_datasets` | Climate developer | One immutable dataset manifest |
| `agrilens_climate` | `climate_daily` | Climate developer | Daily records belonging to that dataset |

Comparison has no database requirement initially. Approved region configuration, sample baseline, and calculation methods remain version-controlled service configuration. There is no global `regions`, `sources`, or `users` collection to coordinate across owners.

The local prototype runs without authentication or per-service permission restrictions. Service ownership is a code convention: Comparison uses internal APIs. Fixture storage tests use separate databases ending in `_fixtures`; HTTP fixture servers never write to MongoDB. A future production deployment can add scoped credentials without changing APIs.

Logical relationships are:

```text
Crop service -> crop_catalogs[one pinned catalog_id]
                  embeds crops, sources, region and decision revision

Climate service -> climate_datasets[one pinned dataset_id]
                      |
                      +-> climate_daily[dataset_id, date]

Comparison -> Crop API + Climate API -> validated inputs -> comparison
App -> Comparison API
```

Catalogs embed their small crop and source sets because consumers read them together. Climate history uses separate daily documents so extending the historical period does not grow one unbounded array. The service assembles the required `daily` API array in date order. This does not introduce API pagination.

The repository sketches are in [the schema reference](mongodb-schema.md). Publication and implementation responsibilities are in [the implementation handoff](implementation-handoff.md).

## Flexibility with explicit boundaries

Three identifiers solve different problems:

- `schema_version` identifies the storage structure understood by service code.
- `_id` identifies an immutable catalog or climate dataset revision. Corrections produce a new ID.
- `decision_revision` identifies the exact committed root decisions and method notes used to interpret that revision.

Stable `region_id` and crop IDs retain their meanings between revisions. Names can change without replacing IDs. Do not reuse an ID for a different region or crop. Source IDs identify a specific evidence item, including its version where relevant. Identical source IDs across services must mean the same evidence item.

Adding a field is a deliberate schema change with defaults only where scientifically meaningful. Unknown values remain `null`. A document version does not authorize service code to interpret unknown fields or unknown scientific rules.

A new crop, source, or revised fact becomes a new catalog. A changed coordinate, climate period, NASA parameter, time standard, or scenario rule becomes a new climate dataset. Previously verified revisions remain available for rollback and reproduction. No TTL index expires scientific evidence.

## Publication and reproducibility

Each service deployment selects an exact catalog or dataset ID through private configuration. Never select “the newest” record by timestamp. A release record kept with deployment configuration pins both IDs, the decision revision, Comparison code revision, and calculation-method revision. This release record is not a new API field or collection.

Both services reject an unapproved selected revision. The release checks that region identity, coordinates, decision revisions, and calendar assumptions agree. Services run with immutable selections for the release. A release change restarts or redeploys the affected services and reruns the integration check, rather than hot-swapping one input during a request.

Comparison records the release identity in operational logs. For the first implementation it does not persist response caches. This avoids serving an old response after one input changes. The Climate database itself is the checked local NASA cache required by the fallback policy.

An outage does not authorize selecting another revision. A future Comparison cache needs both input revision identities, method/code revision, region, ordered baseline, priority, and scenario in its key, plus a demonstrated provenance and freshness policy. Implementing that cache is separate work.

## Alternatives and design rationale

| Option | Benefit | Reason for selecting or rejecting |
|---|---|---|
| Shared normalized collections for regions, crops, sources, and weather | Less repeated metadata | Rejected. Services would depend on shared joins, writes, and schema migrations. |
| One embedded document for every input and historical day | Single-document reads | Rejected. Climate history and crop revisions change independently; history creates a growing document. |
| Service-owned catalogs plus dataset manifests and daily records | Bounded catalog reads, independently versioned history, small consumer interfaces | Selected. Services hide storage joins and publication rules behind the existing APIs. |

We accept repeated region and source metadata between immutable snapshots in exchange for reproducibility and independent ownership. Cross-service agreement is checked at release time rather than enforced through shared database writes. We accept a manifest-plus-days read in Climate in exchange for bounded documents and efficient date queries.

The configured architecture review models were unavailable. This design compares the three alternatives directly; it does not claim an independent multi-model review.

## Scope and unresolved decisions

No accounts, saved farm history, numerical soil scores, forecasts, price tables, or stored ranking results are introduced. More regions and crops can use the same keys later, but the current release still advertises only the approved region and 4–6 crops.

Owners implement these defaults immediately and can adjust private storage. Research owns the source ledger and scientific methods: region, crop facts, climate period, heat threshold, missing-data method, average/scenario definitions, and winter calendar. The Lead implements ranking and integration. No fixture resolves those scientific decisions.

The role documents now match the root contract: `soil` is the approved **More crop diversity** priority, not an additional soil-input field or numeric score. Climate and Crop deliver runnable services by T+12; T+12–22 is integration and independent verification. The candidate shortlist is due at T+3, initial sourced crop records at T+5, and the verified catalog at T+12. These wording and schedule corrections do not approve pending scientific values or change API fields.

## MongoDB references

The design uses [embedded data](https://www.mongodb.com/docs/manual/data-modeling/embedding/) for bounded catalogs and respects the [16 MiB BSON document limit](https://www.mongodb.com/docs/manual/core/document/). A large raw NASA payload belongs in a durable artifact store or checked file, with its URI and checksum in the manifest.

MongoDB supports [schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/), [unique indexes combined with validation](https://www.mongodb.com/docs/manual/tutorial/unique-indexes-schema-validation/), and [explicit schema versions](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/schema-versioning/). The local runtime selects MongoDB 8.0. Each owner selects and records a compatible driver version.
