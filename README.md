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

Install the versioned [GitHub release artifact](https://github.com/tetracoralla/exact-intervals/releases/tag/v0.1.1) directly:

```sh
npm install https://github.com/tetracoralla/exact-intervals/releases/download/v0.1.1/openadam-exact-intervals-0.1.1.tgz
```

Once this version is available on npm, registry installation is:

```sh
npm install @openadam/exact-intervals@0.1.1
```

```js
import { subtractIntervals } from "@openadam/exact-intervals";

// Coordinates remain exact even above Number.MAX_SAFE_INTEGER.
const start = 9007199254740993n;
const available = [{ start, end: start + 10n }];
const occupied = [{ start: start + 3n, end: start + 6n }];
const result = subtractIntervals(available, occupied);
// [{ start, end: start + 3n }, { start: start + 6n, end: start + 10n }]
```

Apache-2.0, ESM, Node >= 20.19.0, zero runtime dependencies. CI exercises
Linux, macOS and Windows. A packed install works without this source checkout.
Use exact registry versions with a lockfile; offline builds can vendor the same
published tarball and record its digest. See [RELEASING.md](RELEASING.md).

## Non-goals

No time types, parsing, time zones, recurrence, budgets, or I/O. Products own
their instants, sources of truth, limits, and error contracts; this library
only computes exact interval sets.

## Development

```sh
npm ci --ignore-scripts
npm run check   # typecheck + tests + build
```

The test suite includes deterministic fuzz comparisons against verbatim ports
of the two legacy product algorithms it replaces.
