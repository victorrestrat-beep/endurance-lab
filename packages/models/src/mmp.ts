import { bestWindow, prefixSums } from './internal/prefix.js';
import { assertPositiveInteger, assertPowerSeries } from './internal/validate.js';

/** A point of a power–duration curve. */
export interface CurvePoint {
  /** Duration, s. */
  readonly duration: number;
  /** Power, W. */
  readonly power: number;
}

/** A mean-maximal power point, with the second at which the best window starts. */
export interface MeanMaxPoint extends CurvePoint {
  readonly start: number;
}

/** Default durations, s: dense below one minute, then roughly log-spaced up to 4 h. */
export const DEFAULT_DURATIONS: readonly number[] = [
  1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480, 600, 720, 900, 1200,
  1500, 1800, 2400, 3600, 5400, 7200, 10800, 14400,
];

/**
 * Mean-maximal power: for each duration, the highest average power held over
 * any window of that length. Durations longer than the series are skipped.
 *
 * Prefix sums make each duration O(n) instead of O(n·d); see `bench/mmp.bench.ts`.
 */
export function meanMaxPower(
  power: ArrayLike<number>,
  durations: readonly number[] = DEFAULT_DURATIONS,
): MeanMaxPoint[] {
  assertPowerSeries(power);
  const prefix = prefixSums(power);
  const out: MeanMaxPoint[] = [];
  for (const duration of normaliseDurations(durations)) {
    const best = bestWindow(prefix, 0, power.length, duration);
    if (best === null) break;
    out.push({ duration, power: best.sum / duration, start: best.start });
  }
  return out;
}

/**
 * Reference implementation that sums every window directly, O(n·d). Kept as a
 * test oracle and as the benchmark baseline.
 * @internal
 */
export function naiveMeanMaxPower(
  power: ArrayLike<number>,
  durations: readonly number[],
): MeanMaxPoint[] {
  assertPowerSeries(power);
  const out: MeanMaxPoint[] = [];
  for (const duration of normaliseDurations(durations)) {
    if (duration > power.length) break;
    let best = Number.NEGATIVE_INFINITY;
    let start = 0;
    for (let s = 0; s + duration <= power.length; s++) {
      let sum = 0;
      for (let i = s; i < s + duration; i++) sum += power[i]!;
      if (sum > best) {
        best = sum;
        start = s;
      }
    }
    out.push({ duration, power: best / duration, start });
  }
  return out;
}

/**
 * Upper monotone envelope: each power becomes the best power held for that
 * duration or longer. A raw mean-maximal curve is not monotone in general
 * ([10, 0, 10] gives 5 W over 2 s but 6.7 W over 3 s), whereas an athlete's
 * capability curve is.
 */
export function monotoneEnvelope(points: readonly CurvePoint[]): CurvePoint[] {
  const sorted = [...points].sort((a, b) => a.duration - b.duration);
  const out: CurvePoint[] = [];
  let best = Number.NEGATIVE_INFINITY;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]!;
    best = Math.max(best, point.power);
    out.push({ duration: point.duration, power: best });
  }
  return out.reverse();
}

/** Point-wise best of several curves, for example every ride of the last 90 days. */
export function combineCurves(curves: readonly (readonly CurvePoint[])[]): CurvePoint[] {
  const best = new Map<number, number>();
  for (const curve of curves) {
    for (const { duration, power } of curve) {
      best.set(duration, Math.max(best.get(duration) ?? Number.NEGATIVE_INFINITY, power));
    }
  }
  return [...best.entries()]
    .sort(([a], [b]) => a - b)
    .map(([duration, power]) => ({ duration, power }));
}

function normaliseDurations(durations: readonly number[]): number[] {
  for (const duration of durations) assertPositiveInteger(duration, 'duration');
  return [...new Set(durations)].sort((a, b) => a - b);
}
