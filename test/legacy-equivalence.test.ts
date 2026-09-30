// The shared engine must reproduce the results of the two product
// implementations it replaces. Both legacy algorithms are ported verbatim
// below (coordinates only: bigint endpoints instead of Temporal.Instant,
// since Instant.compare is epoch-nanosecond order). A deterministic fuzz
// corpus exercises them against the shared engine on normalized inputs,
// which is exactly the shape both products pass in.

import { describe, expect, it } from 'vitest'
import {
  intersectIntervals,
  intervalsContain,
  normalizeIntervals,
  subtractIntervals,
  type ExactInterval,
} from '../src/index.js'
import {
  intersectSourcedIntervals,
  normalizeSourcedIntervals,
  overlapsSourcedIntervals,
  subtractSourcedIntervals,
  type SourcedInterval,
} from '../src/index.js'

// --- Migratory Time legacy: exactIntervalMath.ts (Instant.compare -> bigint) ---

function legacyMerge(intervals: ExactInterval[]): ExactInterval[] {
  const ordered = [...intervals].sort((left, right) =>
    left.start < right.start ? -1 : left.start > right.start ? 1 : 0,
  )
  const merged: ExactInterval[] = []
  for (const interval of ordered) {
    const previous = merged.at(-1)
    if (previous && interval.start <= previous.end) {
      previous.end = previous.end > interval.end ? previous.end : interval.end
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

function legacyIntersect(left: ExactInterval[], right: ExactInterval[]): ExactInterval[] {
  const intersections: ExactInterval[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const a = left[leftIndex]!
    const b = right[rightIndex]!
    const start = a.start > b.start ? a.start : b.start
    const end = a.end < b.end ? a.end : b.end
    if (start < end) intersections.push({ end, start })
    if (a.end <= b.end) leftIndex += 1
    else rightIndex += 1
  }
  return intersections
}

function legacySubtract(available: ExactInterval[], busy: ExactInterval[]): ExactInterval[] {
  const result: ExactInterval[] = []
  const blockers = legacyMerge(busy)
  for (const interval of available) {
    let cursor = interval.start
    for (const blocker of blockers) {
      if (blocker.end <= cursor) continue
      if (blocker.start >= interval.end) break
      if (blocker.start > cursor) {
        result.push({ end: blocker.start < interval.end ? blocker.start : interval.end, start: cursor })
      }
      if (blocker.end > cursor) cursor = blocker.end
      if (cursor >= interval.end) break
    }
    if (cursor < interval.end) result.push({ end: interval.end, start: cursor })
  }
  return legacyMerge(result)
}

// --- Schedule Algebra legacy: interval-algebra.ts (verbatim, Set<string> sources) ---

// The legacy implementation mutates Set<string> sources during merges, so the
// port runs on its own mutable type and converts at the boundary.
interface LASourced {
  start: bigint
  end: bigint
  sources: Set<string>
}

function saCompare(left: LASourced, right: LASourced): number {
  if (left.start < right.start) return -1
  if (left.start > right.start) return 1
  if (left.end < right.end) return -1
  if (left.end > right.end) return 1
  return [...left.sources].sort().join('\0').localeCompare([...right.sources].sort().join('\0'))
}

function saNormalize(intervals: SourcedInterval[]): LASourced[] {
  const sorted = intervals
    .map((interval) => ({ ...interval, sources: new Set(interval.sources) }))
    .sort(saCompare)
  const result: LASourced[] = []
  for (const interval of sorted) {
    const previous = result.at(-1)
    if (previous && interval.start <= previous.end) {
      previous.end = previous.end > interval.end ? previous.end : interval.end
      for (const source of interval.sources) previous.sources.add(source)
    } else {
      result.push(interval)
    }
  }
  return result
}

function saIntersectTwo(left: readonly SourcedInterval[], right: readonly SourcedInterval[]): LASourced[] {
  const result: LASourced[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const a = left[leftIndex]!
    const b = right[rightIndex]!
    const start = a.start > b.start ? a.start : b.start
    const end = a.end < b.end ? a.end : b.end
    if (start < end) {
      result.push({ start, end, sources: new Set([...a.sources, ...b.sources]) })
    }
    if (a.end <= b.end) leftIndex += 1
    else rightIndex += 1
  }
  return saNormalize(result)
}

function saSubtract(left: readonly SourcedInterval[], right: readonly SourcedInterval[]): LASourced[] {
  const result: LASourced[] = []
  for (const interval of left) {
    let pieces: LASourced[] = [
      { start: interval.start, end: interval.end, sources: new Set(interval.sources) },
    ]
    for (const blocker of right) {
      if (blocker.end <= interval.start) continue
      if (blocker.start >= interval.end) break
      pieces = pieces.flatMap((piece) => {
        if (blocker.end <= piece.start || blocker.start >= piece.end) return [piece]
        const next: LASourced[] = []
        if (blocker.start > piece.start) {
          next.push({ start: piece.start, end: blocker.start, sources: new Set(piece.sources) })
        }
        if (blocker.end < piece.end) {
          next.push({ end: piece.end, start: blocker.end, sources: new Set(piece.sources) })
        }
        return next
      })
      if (pieces.length === 0) break
    }
    result.push(...pieces)
  }
  return saNormalize(result)
}

function saOverlapSegments(intervals: readonly SourcedInterval[]): LASourced[] {
  const events = new Map<bigint, { starts: SourcedInterval[]; ends: SourcedInterval[] }>()
  for (const interval of intervals) {
    const startEvent = events.get(interval.start) ?? { starts: [], ends: [] }
    startEvent.starts.push(interval)
    events.set(interval.start, startEvent)
    const endEvent = events.get(interval.end) ?? { starts: [], ends: [] }
    endEvent.ends.push(interval)
    events.set(interval.end, endEvent)
  }
  const times = [...events.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const active = new Set<SourcedInterval>()
  const result: LASourced[] = []
  let previous: bigint | undefined
  for (const time of times) {
    if (previous !== undefined && previous < time && active.size >= 2) {
      result.push({
        start: previous,
        end: time,
        sources: new Set([...active].flatMap((interval) => [...interval.sources])),
      })
    }
    const event = events.get(time)
    if (!event) continue
    for (const interval of event.ends) active.delete(interval)
    for (const interval of event.starts) active.add(interval)
    previous = time
  }
  // mergeEquivalentSegments
  const merged: LASourced[] = []
  for (const interval of result) {
    const last = merged.at(-1)
    const same = (l: ReadonlySet<string>, r: ReadonlySet<string>) =>
      l.size === r.size && [...l].every((source) => r.has(source))
    if (last && last.end === interval.start && same(last.sources, interval.sources)) {
      last.end = interval.end
    } else {
      merged.push(interval)
    }
  }
  return merged
}

// --- deterministic corpus (xorshift32) with negative and positive epochs ---

let seed = 0x12345678
function rand() {
  seed ^= seed << 13; seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5; seed >>>= 0
  return seed
}
function fuzzSourcedList(maxCount: number, sources: string[]): SourcedInterval[] {
  return Array.from({ length: 1 + rand() % maxCount }, () => {
    const a = BigInt(rand() % 7200) * 1_000_000_000n * (rand() % 2 === 0 ? 1n : -1n)
    const b = a + BigInt(1 + rand() % 3600) * 1_000_000_000n
    const picked = sources.filter(() => rand() % 2 === 0)
    return { start: a, end: b, sources: new Set(picked.length ? picked : ['x']) }
  })
}
const norm = (xs: SourcedInterval[]) => normalizeSourcedIntervals(xs)
const plain = (xs: SourcedInterval[]): ExactInterval[] =>
  xs.map((x) => ({ start: x.start, end: x.end }))
const key = (xs: readonly { start: bigint; end: bigint; sources?: ReadonlySet<string> }[]) =>
  xs.map((x) => [x.start.toString(), x.end.toString(), [...(x.sources ?? [])].sort().join('+')].join('|'))
  .join(';')

describe('legacy equivalence (fuzz, normalized inputs)', () => {
  it('matches the migratory-time algorithms', () => {
    for (let i = 0; i < 400; i++) {
      const left = norm(fuzzSourcedList(8, ['a', 'b']))
      const right = norm(fuzzSourcedList(8, ['c', 'd']))
      expect(key(normalizeIntervals(plain(left)))).toBe(key(legacyMerge(plain(left))))
      expect(key(intersectIntervals(plain(left), plain(right))))
        .toBe(key(legacyIntersect(plain(left), plain(right))))
      expect(key(subtractIntervals(plain(left), plain(right))))
        .toBe(key(legacySubtract(plain(left), plain(right))))
      const s = BigInt(rand() % 14400) * 1_000_000_000n
      const e = s + BigInt(1 + rand() % 14400) * 1_000_000_000n
      expect(intervalsContain(plain(left), s, e))
        .toBe(plain(left).some((x) => x.start <= s && x.end >= e))
    }
  })

  it('matches the schedule-algebra algorithms including sources', () => {
    for (let i = 0; i < 400; i++) {
      const left = norm(fuzzSourcedList(8, ['a', 'b', 'e']))
      const right = norm(fuzzSourcedList(8, ['c', 'd', 'f']))
      expect(key(normalizeSourcedIntervals(left))).toBe(key(saNormalize(left)))
      expect(key(intersectSourcedIntervals(left, right))).toBe(key(saIntersectTwo(left, right)))
      expect(key(subtractSourcedIntervals(left, right))).toBe(key(saSubtract(left, right)))
      const raw = fuzzSourcedList(8, ['a', 'b', 'c'])
      expect(key(overlapsSourcedIntervals(raw))).toBe(key(saOverlapSegments(raw)))
    }
  })

  it('handles unsorted inputs identically to sorting them first', () => {
    for (let i = 0; i < 200; i++) {
      const left = fuzzSourcedList(8, ['a', 'b'])
      const right = fuzzSourcedList(8, ['c', 'd'])
      const shuffled = [...norm(left)].reverse()
      expect(key(normalizeSourcedIntervals(shuffled))).toBe(key(normalizeSourcedIntervals(left)))
      expect(key(intersectSourcedIntervals(shuffled, right)))
        .toBe(key(intersectSourcedIntervals(left, right)))
      expect(key(subtractSourcedIntervals(left, shuffled)))
        .toBe(key(subtractSourcedIntervals(left, norm(left))))
    }
  })
})
