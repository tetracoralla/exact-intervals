// Source-attributing public API. Every interval carries the set of stable ids
// that contributed to it. Merge and intersection union sources; subtraction
// keeps the left side's sources; complement gaps carry none.

import {
  type EngineInterval,
  engineClip,
  engineComplement,
  engineIntersect,
  engineNormalize,
  engineOverlaps,
  engineSubtract,
} from './engine.js'
import type { ExactInterval } from './interval.js'

export interface SourcedInterval extends ExactInterval {
  sources: ReadonlySet<string>
}

function toEngine(intervals: readonly SourcedInterval[]): EngineInterval[] {
  return intervals.map((interval) => ({
    start: interval.start,
    end: interval.end,
    sources: interval.sources,
  }))
}

/**
 * Sort, drop empty intervals, and merge overlapping or touching intervals,
 * unioning the sources of everything merged into each survivor.
 */
export function normalizeSourcedIntervals(
  intervals: readonly SourcedInterval[],
): SourcedInterval[] {
  return engineNormalize(toEngine(intervals))
}

/**
 * Intersection of two sets. Each piece carries the union of the sources of
 * the two pieces that produced it.
 */
export function intersectSourcedIntervals(
  left: readonly SourcedInterval[],
  right: readonly SourcedInterval[],
): SourcedInterval[] {
  return engineIntersect(toEngine(left), toEngine(right))
}

/**
 * Left set minus right set. Pieces keep the sources of the left piece they
 * were cut from; subtracted intervals contribute no sources.
 */
export function subtractSourcedIntervals(
  left: readonly SourcedInterval[],
  right: readonly SourcedInterval[],
): SourcedInterval[] {
  return engineSubtract(toEngine(left), toEngine(right))
}

/** Gaps within `horizon`, carrying no sources. */
export function complementSourcedIntervals(
  intervals: readonly SourcedInterval[],
  horizon: ExactInterval,
): SourcedInterval[] {
  return engineComplement(toEngine(intervals), {
    start: horizon.start,
    end: horizon.end,
    sources: new Set<string>(),
  })
}

/**
 * Segments covered by at least two intervals, each carrying the union of the
 * sources of all intervals active across it. Adjacent segments with identical
 * source sets are merged into one.
 */
export function overlapsSourcedIntervals(
  intervals: readonly SourcedInterval[],
): SourcedInterval[] {
  return engineOverlaps(toEngine(intervals))
}

/** Clip one interval to a window, keeping its sources; undefined if empty. */
export function clipSourcedInterval(
  interval: SourcedInterval,
  horizon: ExactInterval,
): SourcedInterval | undefined {
  return engineClip(interval, {
    start: horizon.start,
    end: horizon.end,
    sources: new Set<string>(),
  })
}
