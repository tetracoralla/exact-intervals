import { describe, expect, it } from 'vitest'
import {
  clipInterval,
  clipSourcedInterval,
  complementIntervals,
  complementSourcedIntervals,
  intersectIntervals,
  intersectSourcedIntervals,
  intervalsContain,
  isValidInterval,
  normalizeIntervals,
  normalizeSourcedIntervals,
  overlapsIntervals,
  overlapsSourcedIntervals,
  subtractIntervals,
  subtractSourcedIntervals,
} from '../src/index.js'

const iv = (start: number | bigint, end: number | bigint) => ({
  start: BigInt(start),
  end: BigInt(end),
})
const src = (start: number | bigint, end: number | bigint, ...sources: string[]) => ({
  start: BigInt(start),
  end: BigInt(end),
  sources: new Set(sources),
})
const dump = (list: { start: bigint; end: bigint }[]) =>
  list.map((i) => [i.start.toString(), i.end.toString()])
const dumpSourced = (list: { start: bigint; end: bigint; sources: ReadonlySet<string> }[]) =>
  list.map((i) => [i.start.toString(), i.end.toString(), [...i.sources].sort()])

describe('pure interval algebra', () => {
  it('merges overlapping and touching intervals but not separated ones', () => {
    expect(dump(normalizeIntervals([
      iv(10, 20), iv(0, 5), iv(5, 8), iv(18, 30), iv(40, 40), iv(-10, -5),
    ]))).toEqual([['-10', '-5'], ['0', '8'], ['10', '30']])
  })

  it('drops empty intervals and accepts an empty list', () => {
    expect(normalizeIntervals([])).toEqual([])
    expect(normalizeIntervals([iv(3, 3), iv(5, 4)])).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = [iv(5, 10), iv(0, 3)]
    normalizeIntervals(input)
    expect(input).toEqual([iv(5, 10), iv(0, 3)])
  })

  it('intersects with half-open endpoints: touching produces nothing', () => {
    expect(intersectIntervals([iv(0, 10)], [iv(10, 20)])).toEqual([])
    expect(dump(intersectIntervals([iv(0, 10)], [iv(9, 20)]))).toEqual([['9', '10']])
    expect(intersectIntervals([iv(0, 10)], [iv(20, 30)])).toEqual([])
    expect(intersectIntervals([], [iv(0, 10)])).toEqual([])
  })

  it('intersects multiple pieces and handles negative coordinates', () => {
    expect(dump(intersectIntervals(
      [iv(-100, -80), iv(-60, -40), iv(0, 10)],
      [iv(-90, -85), iv(-50, -45), iv(5, 6)],
    ))).toEqual([['-90', '-85'], ['-50', '-45'], ['5', '6']])
  })

  it('intersects unsorted inputs defensively', () => {
    expect(dump(intersectIntervals(
      [iv(0, 10), iv(20, 30)],
      [iv(25, 35), iv(5, 15)],
    ))).toEqual([['5', '10'], ['25', '30']])
  })

  it('splits a difference across multiple blockers', () => {
    expect(dump(subtractIntervals(
      [iv(0, 100)],
      [iv(10, 20), iv(20, 30), iv(60, 90)],
    ))).toEqual([['0', '10'], ['30', '60'], ['90', '100']])
  })

  it('keeps the left side when the right is empty and drops fully blocked intervals', () => {
    expect(dump(subtractIntervals([iv(0, 10)], []))).toEqual([['0', '10']])
    expect(subtractIntervals([iv(0, 10)], [iv(-5, 15)])).toEqual([])
    expect(dump(subtractIntervals([iv(0, 10)], [iv(10, 20)]))).toEqual([['0', '10']])
  })

  it('cuts nested and straddling blockers correctly', () => {
    expect(dump(subtractIntervals([iv(0, 100)], [iv(20, 30)]))).toEqual([['0', '20'], ['30', '100']])
    expect(dump(subtractIntervals([iv(0, 100)], [iv(-20, 30)]))).toEqual([['30', '100']])
    expect(dump(subtractIntervals([iv(0, 100)], [iv(90, 130)]))).toEqual([['0', '90']])
    expect(dump(subtractIntervals([iv(0, 100)], [iv(-20, 130)]))).toEqual([])
  })

  it('complements within a horizon including before, between, and after gaps', () => {
    expect(dump(complementIntervals([], iv(0, 100)))).toEqual([['0', '100']])
    expect(complementIntervals([iv(0, 100)], iv(0, 100))).toEqual([])
    expect(dump(complementIntervals(
      [iv(10, 20), iv(20, 30), iv(70, 80)],
      iv(0, 100),
    ))).toEqual([['0', '10'], ['30', '70'], ['80', '100']])
  })

  it('complements when intervals extend beyond the horizon', () => {
    expect(dump(complementIntervals([iv(-10, 20)], iv(0, 100)))).toEqual([['20', '100']])
    expect(dump(complementIntervals([iv(90, 200)], iv(0, 100)))).toEqual([['0', '90']])
  })

  it('finds only real overlaps, not touching endpoints', () => {
    expect(overlapsIntervals([iv(0, 10), iv(10, 20)])).toEqual([])
    expect(dump(overlapsIntervals([iv(0, 10), iv(5, 20), iv(15, 30)])))
      .toEqual([['5', '10'], ['15', '20']])
    expect(dump(overlapsIntervals([
      iv(0, 10), iv(2, 4), iv(3, 5), iv(6, 8),
    ]))).toEqual([['2', '5'], ['6', '8']])
    expect(overlapsIntervals([iv(0, 10)])).toEqual([])
  })

  it('ignores empty and reversed intervals when counting overlaps', () => {
    expect(overlapsIntervals([iv(0, 0), iv(2, 1), iv(3, 4)])).toEqual([])
    expect(overlapsIntervals([iv(0, 0), iv(2, 1)])).toEqual([])
    expect(dump(overlapsIntervals([
      iv(0, 0), iv(2, 1), iv(3, 6), iv(4, 5), iv(5, 5),
    ]))).toEqual([['4', '5']])
  })

  it('clips to a horizon', () => {
    expect(clipInterval(iv(5, 15), iv(0, 10))).toEqual(iv(5, 10))
    expect(clipInterval(iv(-5, 15), iv(0, 10))).toEqual(iv(0, 10))
    expect(clipInterval(iv(20, 30), iv(0, 10))).toBeUndefined()
    expect(clipInterval(iv(5, 5), iv(0, 10))).toBeUndefined()
  })

  it('checks containment per single interval, not across pieces', () => {
    expect(intervalsContain([iv(0, 10)], 2n, 8n)).toBe(true)
    expect(intervalsContain([iv(0, 10)], 0n, 10n)).toBe(true)
    expect(intervalsContain([iv(0, 10)], 10n, 12n)).toBe(false)
    expect(intervalsContain([iv(0, 5), iv(5, 10)], 0n, 10n)).toBe(false)
    expect(intervalsContain([], 0n, 1n)).toBe(false)
  })

  it('validates interval shape', () => {
    expect(isValidInterval(iv(0, 1))).toBe(true)
    expect(isValidInterval(iv(1, 1))).toBe(false)
    expect(isValidInterval(iv(2, 1))).toBe(false)
  })
})

describe('sourced interval algebra', () => {
  it('unions sources when merging touching or overlapping intervals', () => {
    expect(dumpSourced(normalizeSourcedIntervals([
      src(0, 10, 'a'), src(10, 20, 'b'), src(5, 8, 'c'), src(30, 40, 'd'),
    ]))).toEqual([
      ['0', '20', ['a', 'b', 'c']],
      ['30', '40', ['d']],
    ])
  })

  it('unions sources on intersection pieces', () => {
    expect(dumpSourced(intersectSourcedIntervals(
      [src(0, 10, 'a'), src(20, 30, 'b')],
      [src(5, 25, 'c')],
    ))).toEqual([['5', '10', ['a', 'c']], ['20', '25', ['b', 'c']]])
  })

  it('keeps left sources on subtraction and never takes blocker sources', () => {
    expect(dumpSourced(subtractSourcedIntervals(
      [src(0, 100, 'left')],
      [src(10, 20, 'blocker'), src(30, 40, 'other')],
    ))).toEqual([
      ['0', '10', ['left']],
      ['20', '30', ['left']],
      ['40', '100', ['left']],
    ])
  })

  it('emits source-free gaps from complement', () => {
    expect(dumpSourced(complementSourcedIntervals(
      [src(10, 20, 'a'), src(30, 40, 'b')],
      iv(0, 100),
    ))).toEqual([['0', '10', []], ['20', '30', []], ['40', '100', []]])
  })

  it('attributes overlap segments to all active intervals and merges same-source neighbors', () => {
    expect(dumpSourced(overlapsSourcedIntervals([
      src(0, 10, 'a'),
      src(2, 6, 'b'),
      src(4, 12, 'c'),
    ]))).toEqual([
      ['2', '4', ['a', 'b']],
      ['4', '6', ['a', 'b', 'c']],
      ['6', '10', ['a', 'c']],
    ])
    // the whole covered span has one identical active set, so it stays one piece
    expect(dumpSourced(overlapsSourcedIntervals([
      src(0, 10, 'a'),
      src(0, 10, 'a'),
    ]))).toEqual([['0', '10', ['a']]])
  })

  it('never attributes overlap to empty or reversed source intervals', () => {
    expect(dumpSourced(overlapsSourcedIntervals([
      src(0, 0, 'empty'), src(2, 1, 'reversed'),
      src(3, 6, 'left'), src(4, 5, 'right'), src(5, 5, 'empty-at-end'),
    ]))).toEqual([['4', '5', ['left', 'right']]])
  })

  it('clips while keeping sources on a fresh set', () => {
    const clipped = clipSourcedInterval({ start: 5n, end: 15n, sources: new Set(['a']) }, iv(0, 10))
    expect(clipped).toBeDefined()
    expect(dumpSourced([clipped!])).toEqual([['5', '10', ['a']]])
  })

  it('does not share source sets between input and output', () => {
    const input = [src(0, 10, 'a')]
    const output = normalizeSourcedIntervals(input)
    ;(output[0]!.sources as Set<string>).add('mutated')
    expect([...input[0]!.sources]).toEqual(['a'])
  })
})
