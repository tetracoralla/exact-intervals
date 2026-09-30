# Exact Intervals

`@openadam/exact-intervals` is a dependency-free TypeScript library for
deterministic interval set algebra on exact integer endpoints. It owns the
half-open interval algorithms that Migratory Time and Schedule Algebra
previously maintained twice; both products now consume this package and keep
their own time parsing, recurrence expansion, and product semantics.

## Semantics

- Intervals are half-open: `[start, end)`. Touching endpoints do not overlap.
- Endpoints are `bigint`, so nanosecond precision survives every operation;
  consumers typically pass epoch nanoseconds, but any ordered integer
  coordinate works.
- Operations normalize defensively: inputs may be unsorted or overlapping.
  Outputs are always sorted and disjoint, and touching output pieces are
  merged where that cannot change meaning.
- Empty intervals (`end <= start`) are dropped by operations.
- Inputs are never mutated; outputs own fresh source sets.

Two APIs share one implementation:

- **Plain** (`normalizeIntervals`, `intersectIntervals`, `subtractIntervals`,
  `complementIntervals`, `overlapsIntervals`, `clipInterval`,
  `intervalsContain`, `isValidInterval`) works on `{ start, end }`.
- **Sourced** (`normalizeSourcedIntervals`, `intersectSourcedIntervals`,
  `subtractSourcedIntervals`, `complementSourcedIntervals`,
  `overlapsSourcedIntervals`, `clipSourcedInterval`) carries
  `sources: ReadonlySet<string>` through every result:

  | operation   | sources of each result piece                    |
  | ----------- | ---------------------------------------------- |
  | normalize   | union of everything merged into the survivor   |
  | intersect   | union of the two pieces that produced it       |
  | subtract    | kept from the left piece it was cut from       |
  | complement  | none (gaps are not attributable to any input)  |
  | overlaps    | union of all intervals active across the piece |

`overlaps` reports segments covered by at least two intervals; adjacent
segments with identical source sets are merged. `intervalsContain` requires a
single interval to cover the whole range — it is list containment, not a
union test.

## Install

The package is Apache-2.0 with zero runtime dependencies and works from a
packed install (`npm pack`) without any sibling checkout. Unpublished
candidates are consumed by pinned tarball with a recorded digest, for example
`"file:vendor/openadam-exact-intervals-0.1.0.tgz"`.

## Non-goals

No time types, parsing, time zones, recurrence, budgets, or I/O. Products own
their instants, sources of truth, limits, and error contracts; this library
only computes exact interval sets.

## Development

```sh
npm install
npm run check   # typecheck + tests + build
```

The test suite includes deterministic fuzz comparisons against verbatim ports
of the two legacy product algorithms it replaces.
