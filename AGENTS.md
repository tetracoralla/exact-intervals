# Exact Intervals repository contract

`Exact Intervals` is the product identity and `@openadam/exact-intervals` is
its npm package identifier. The library owns deterministic half-open interval
set algebra on exact bigint endpoints, with an optional source-attribution
layer. Current source and tests are the authority; this contract states the
invariants.

## Product invariants

- Intervals are half-open `[start, end)`; touching endpoints never overlap.
- Endpoints stay exact bigint integers. Never degrade to Number, floats, or
  millisecond precision.
- Plain and sourced APIs are thin adapters over one shared implementation;
  do not fork the algorithms per API.
- Source attribution rules are fixed: merge and intersect union sources,
  subtraction keeps left-piece sources, complement gaps carry none, overlaps
  union all active intervals.
- Operations normalize inputs defensively, never mutate their arguments, and
  return sorted disjoint output.
- No time types, parsing, time zones, recurrence, budgets, I/O, or Agent
  surfaces belong here. Products own those. Do not grow a second date-time
  system behind this library.
- Zero runtime dependencies.

## Delivery boundaries

- The npm package must work from a packed install without a sibling checkout.
- Unpublished candidates are consumed by pinned tarball with a recorded
  digest; `file:` references to sibling source directories are not a
  deliverable.
- Consumers pin exact versions and verify their own public behavior after an
  upgrade; passing this library's tests alone does not release a consumer.
- Do not publish, push, or install globally without explicit owner authority.

Run `npm run check` before handoff. Report library checks and each consumer's
own checks separately.
