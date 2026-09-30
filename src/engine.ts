// Single implementation of the interval set algorithms. Public pure and
// sourced APIs in this package are thin adapters over this engine, so there is
// exactly one place that owns ordering, merging, and source propagation.

export interface EngineInterval {
  /** Inclusive start. Coordinates are any exact ordered integers (bigint). */
  start: bigint
  /** Exclusive end. Empty intervals (end <= start) are dropped by operations. */
  end: bigint
  /** Contributors carried through merges; empty for payload-free consumers. */
  sources: ReadonlySet<string>
}

/** Internal working copies own mutable source sets; they are only exposed as
 * the readonly public shape. */
interface MutableEngineInterval {
  start: bigint
  end: bigint
  sources: Set<string>
}

function compareStartThenEnd(left: EngineInterval, right: EngineInterval): number {
  if (left.start < right.start) return -1
  if (left.start > right.start) return 1
  if (left.end < right.end) return -1
  if (left.end > right.end) return 1
  return 0
}

function copyWithSources(
  interval: EngineInterval,
  sources: Iterable<string>,
): MutableEngineInterval {
  return { start: interval.start, end: interval.end, sources: new Set(sources) }
}

function mergeSources(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  const merged = new Set<string>(left)
  for (const source of right) merged.add(source)
  return merged
}

function sameSources(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false
  for (const source of left) {
    if (!right.has(source)) return false
  }
  return true
}

/**
 * Sort by (start, end), drop empty intervals, and merge overlapping or
 * touching intervals (half-open: `start <= previous.end` merges), unioning
 * sources. Never mutates inputs; returned intervals own their source sets.
 */
export function engineNormalize(intervals: readonly EngineInterval[]): EngineInterval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .map((interval) => copyWithSources(interval, interval.sources))
    .sort(compareStartThenEnd)
  const result: MutableEngineInterval[] = []
  for (const interval of sorted) {
    const previous = result.at(-1)
    if (previous && interval.start <= previous.end) {
      if (interval.end > previous.end) previous.end = interval.end
      for (const source of interval.sources) previous.sources.add(source)
    } else {
      result.push(interval)
    }
  }
  return result
}

/**
 * Intersection of two interval sets. Inputs are normalized first, so callers
 * may pass unsorted or overlapping lists. Each result piece carries the union
 * of the sources of the two pieces that produced it.
 */
export function engineIntersect(
  left: readonly EngineInterval[],
  right: readonly EngineInterval[],
): EngineInterval[] {
  const orderedLeft = engineNormalize(left)
  const orderedRight = engineNormalize(right)
  const result: MutableEngineInterval[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < orderedLeft.length && rightIndex < orderedRight.length) {
    const a = orderedLeft[leftIndex]
    const b = orderedRight[rightIndex]
    if (!a || !b) break
    const start = a.start > b.start ? a.start : b.start
    const end = a.end < b.end ? a.end : b.end
    if (start < end) {
      result.push({ start, end, sources: mergeSources(a.sources, b.sources) })
    }
    if (a.end <= b.end) leftIndex += 1
    else rightIndex += 1
  }
  return result
}

/**
 * Left intervals minus right intervals. Result pieces keep the sources of the
 * left piece they were cut from; subtracted intervals contribute nothing.
 */
export function engineSubtract(
  left: readonly EngineInterval[],
  right: readonly EngineInterval[],
): EngineInterval[] {
  const blockers = engineNormalize(right)
  const result: MutableEngineInterval[] = []
  for (const interval of engineNormalize(left)) {
    let cursor = interval.start
    for (const blocker of blockers) {
      if (blocker.end <= cursor) continue
      if (blocker.start >= interval.end) break
      if (blocker.start > cursor) {
        result.push({
          start: cursor,
          end: blocker.start < interval.end ? blocker.start : interval.end,
          sources: new Set(interval.sources),
        })
      }
      if (blocker.end > cursor) cursor = blocker.end
      if (cursor >= interval.end) break
    }
    if (cursor < interval.end) {
      result.push({
        start: cursor,
        end: interval.end,
        sources: new Set(interval.sources),
      })
    }
  }
  return engineNormalize(result)
}

/**
 * Gaps of `intervals` within `horizon`, as half-open pieces carrying no
 * sources. Intervals may extend past the horizon; only the covered horizon
 * span matters.
 */
export function engineComplement(
  intervals: readonly EngineInterval[],
  horizon: EngineInterval,
): EngineInterval[] {
  const gaps: MutableEngineInterval[] = []
  let cursor = horizon.start
  for (const interval of engineNormalize(intervals)) {
    if (interval.end <= cursor) continue
    if (interval.start > cursor) {
      const end = interval.start < horizon.end ? interval.start : horizon.end
      if (end > cursor) {
        gaps.push({ start: cursor, end, sources: new Set<string>() })
      }
    }
    if (interval.end > cursor) cursor = interval.end
    if (cursor >= horizon.end) break
  }
  if (cursor < horizon.end) {
    gaps.push({ start: cursor, end: horizon.end, sources: new Set<string>() })
  }
  return gaps
}

/**
 * Segments covered by at least two intervals ("real overlaps"). Touching
 * endpoints do not overlap. Each segment carries the union of the sources of
 * all intervals active across it; adjacent segments with identical source
 * sets merge into one. Input order and duplicates are preserved for coverage
 * counting, matching a raw sweep over the given intervals.
 */
export function engineOverlaps(intervals: readonly EngineInterval[]): EngineInterval[] {
  const events = new Map<bigint, { starts: EngineInterval[]; ends: EngineInterval[] }>()
  for (const interval of intervals) {
    if (interval.end <= interval.start) continue
    const startEvent = events.get(interval.start) ?? { starts: [], ends: [] }
    startEvent.starts.push(interval)
    events.set(interval.start, startEvent)
    const endEvent = events.get(interval.end) ?? { starts: [], ends: [] }
    endEvent.ends.push(interval)
    events.set(interval.end, endEvent)
  }
  const times = [...events.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const active = new Set<EngineInterval>()
  const raw: MutableEngineInterval[] = []
  let previous: bigint | undefined
  for (const time of times) {
    if (previous !== undefined && previous < time && active.size >= 2) {
      const sources = new Set<string>()
      for (const interval of active) {
        for (const source of interval.sources) sources.add(source)
      }
      raw.push({ start: previous, end: time, sources })
    }
    const event = events.get(time)
    if (event) {
      for (const interval of event.ends) active.delete(interval)
      for (const interval of event.starts) active.add(interval)
    }
    previous = time
  }
  const result: MutableEngineInterval[] = []
  for (const segment of raw) {
    const last = result.at(-1)
    if (
      last
      && last.end === segment.start
      && sameSources(last.sources, segment.sources)
    ) {
      last.end = segment.end
    } else {
      result.push(segment)
    }
  }
  return result
}

/**
 * Clip one interval to a horizon window. Returns undefined when no positive
 * overlap remains. The result keeps the interval's sources on a fresh set.
 */
export function engineClip(
  interval: EngineInterval,
  horizon: EngineInterval,
): EngineInterval | undefined {
  const start = interval.start > horizon.start ? interval.start : horizon.start
  const end = interval.end < horizon.end ? interval.end : horizon.end
  if (end <= start) return undefined
  return { start, end, sources: new Set(interval.sources) }
}
