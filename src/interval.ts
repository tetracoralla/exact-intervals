// Payload-free public API. Endpoints are exact integers (bigint); both
// current consumers use epoch nanoseconds, but any ordered coordinate works.
// Sources on inputs are accepted and ignored.

import {
  type EngineInterval,
  engineComplement,
  engineClip,
  engineIntersect,
  engineNormalize,
  engineOverlaps,
  engineSubtract,
} from './engine.js'

export interface ExactInterval {
  start: bigint
  end: bigint
}

const EMPTY_SOURCES: ReadonlySet<string> = new Set<string>()

function toEngine(intervals: readonly ExactInterval[]): EngineInterval[] {
  return intervals.map((interval) => ({
    start: interval.start,
    end: interval.end,
    sources: EMPTY_SOURCES,
  }))
}

function fromEngine(intervals: EngineInterval[]): ExactInterval[] {
  return intervals.map((interval) => ({ start: interval.start, end: interval.end }))
}

/** True when `end > start`. Operations drop intervals that fail this. */
export function isValidInterval(interval: ExactInterval): boolean {
  return interval.end > interval.start
}

/**
 * Sort, drop empty intervals, and merge overlapping or touching intervals.
 * Touching half-open intervals merge because their union is contiguous.
 */
export function normalizeIntervals(intervals: readonly ExactInterval[]): ExactInterval[] {
  return fromEngine(engineNormalize(toEngine(intervals)))
}

/** Intersection of two sets; the result never contains touching pieces. */
export function intersectIntervals(
  left: readonly ExactInterval[],
  right: readonly ExactInterval[],
): ExactInterval[] {
  return fromEngine(engineIntersect(toEngine(left), toEngine(right)))
}

/** Left set minus right set. */
export function subtractIntervals(
  left: readonly ExactInterval[],
  right: readonly ExactInterval[],
): ExactInterval[] {
  return fromEngine(engineSubtract(toEngine(left), toEngine(right)))
}

/** Portions of `horizon` not covered by `intervals`. */
export function complementIntervals(
  intervals: readonly ExactInterval[],
  horizon: ExactInterval,
): ExactInterval[] {
  return fromEngine(
    engineComplement(toEngine(intervals), {
      start: horizon.start,
      end: horizon.end,
      sources: EMPTY_SOURCES,
    }),
  )
}

/**
 * Segments covered by at least two intervals. Touching endpoints do not
 * overlap, so two intervals that merely touch produce no segment.
 */
export function overlapsIntervals(intervals: readonly ExactInterval[]): ExactInterval[] {
  return fromEngine(engineOverlaps(toEngine(intervals)))
}

/** Clip one interval to a window; undefined when nothing positive remains. */
export function clipInterval(
  interval: ExactInterval,
  horizon: ExactInterval,
): ExactInterval | undefined {
  const clipped = engineClip(
    { start: interval.start, end: interval.end, sources: EMPTY_SOURCES },
    { start: horizon.start, end: horizon.end, sources: EMPTY_SOURCES },
  )
  return clipped ? { start: clipped.start, end: clipped.end } : undefined
}

/**
 * True when some single interval fully covers `[start, end]`. This is list
 * containment, not a union test: adjacent intervals covering the range
 * piecewise do not satisfy it.
 */
export function intervalsContain(
  intervals: readonly ExactInterval[],
  start: bigint,
  end: bigint,
): boolean {
  return intervals.some(
    (interval) => interval.start <= start && interval.end >= end,
  )
}
