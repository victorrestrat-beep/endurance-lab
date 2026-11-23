/**
 * Prefix sums: `out[i]` is the sum of the first `i` samples, so the sum of
 * `series[a..b)` is `out[b] - out[a]`. On a 1 Hz power series, `out[i]` is the
 * work, in joules, done during the first `i` seconds.
 */
export function prefixSums(series: ArrayLike<number>): Float64Array {
  const out = new Float64Array(series.length + 1);
  for (let i = 0; i < series.length; i++) {
    out[i + 1] = out[i]! + series[i]!;
  }
  return out;
}

/**
 * Highest sum over the windows of length `length` that fit inside
 * `[from, to)`, with the index where that window starts (the earliest one on
 * ties). Null when the range is shorter than the window.
 */
export function bestWindow(
  prefix: Float64Array,
  from: number,
  to: number,
  length: number,
): { sum: number; start: number } | null {
  if (to - from < length) return null;
  let sum = Number.NEGATIVE_INFINITY;
  let start = from;
  for (let s = from; s + length <= to; s++) {
    const candidate = prefix[s + length]! - prefix[s]!;
    if (candidate > sum) {
      sum = candidate;
      start = s;
    }
  }
  return { sum, start };
}

/**
 * Smallest index `i` such that `prefix[i] >= target`, or -1 when the total
 * never reaches the target. `prefix` must be non-decreasing, which holds for
 * prefix sums of non-negative samples.
 */
export function firstIndexAtLeast(prefix: Float64Array, target: number): number {
  const last = prefix.length - 1;
  if (last < 0 || prefix[last]! < target) return -1;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (prefix[mid]! >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
