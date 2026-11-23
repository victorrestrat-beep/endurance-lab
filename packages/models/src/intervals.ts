import { ModelInputError } from './errors.js';
import { prefixSums } from './internal/prefix.js';
import { assertPositive, assertPositiveInteger, assertPowerSeries } from './internal/validate.js';

export interface IntervalDetectionOptions {
  /** Power an effort must reach to count, W; for example 90 % of CP. */
  readonly threshold: number;
  /** Width of the centred moving average used to find candidate efforts, s. Default: 10. */
  readonly smoothing?: number;
  /** Drops below the threshold up to this long are bridged (gear change, junction), s. Default: 10. */
  readonly maxGap?: number;
  /** Efforts shorter than this are ignored, s. Default: 30. */
  readonly minDuration?: number;
}

export interface DetectedInterval {
  /** First second of the effort. */
  readonly start: number;
  /** Second just after the effort (exclusive). */
  readonly end: number;
  /** Length of the effort, s. */
  readonly duration: number;
  readonly meanPower: number;
  readonly maxPower: number;
  /** Work done during the effort, J. */
  readonly work: number;
}

/**
 * Finds sustained efforts above a power threshold:
 *
 * 1. smooth power with a centred moving average and keep the runs above the threshold;
 * 2. snap each run's edges to the raw signal, so boundaries are exact to the second;
 * 3. bridge short drops, then drop efforts shorter than `minDuration`.
 */
export function detectIntervals(
  power: ArrayLike<number>,
  options: IntervalDetectionOptions,
): DetectedInterval[] {
  assertPowerSeries(power);
  const { threshold } = options;
  const smoothing = options.smoothing ?? 10;
  const maxGap = options.maxGap ?? 10;
  const minDuration = options.minDuration ?? 30;
  assertPositive(threshold, 'threshold');
  assertPositiveInteger(smoothing, 'smoothing');
  assertPositiveInteger(minDuration, 'minDuration');
  if (!Number.isInteger(maxGap) || maxGap < 0) {
    throw new ModelInputError(`maxGap must be an integer ≥ 0 (got ${maxGap})`);
  }

  const n = power.length;
  const prefix = prefixSums(power);
  const back = Math.floor((smoothing - 1) / 2);
  const runs: [number, number][] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    let above = false;
    if (i < n) {
      const lo = Math.max(0, i - back);
      const hi = Math.min(n, lo + smoothing);
      above = (prefix[hi]! - prefix[lo]!) / (hi - lo) >= threshold;
    }
    if (above && runStart < 0) runStart = i;
    if (!above && runStart >= 0) {
      runs.push(snap(power, runStart, i, threshold));
      runStart = -1;
    }
  }

  const merged: [number, number][] = [];
  for (const [start, end] of runs) {
    const last = merged.at(-1);
    if (last !== undefined && start - last[1] <= maxGap) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged
    .filter(([start, end]) => end - start >= minDuration)
    .map(([start, end]) => summarise(power, prefix, start, end));
}

/** Moves a run's edges onto the raw samples that are actually at or above the threshold. */
function snap(
  power: ArrayLike<number>,
  start: number,
  end: number,
  threshold: number,
): [number, number] {
  let s = start;
  let e = end;
  while (s > 0 && power[s - 1]! >= threshold) s--;
  while (s < e && power[s]! < threshold) s++;
  while (e < power.length && power[e]! >= threshold) e++;
  while (e > s && power[e - 1]! < threshold) e--;
  return [s, e];
}

function summarise(
  power: ArrayLike<number>,
  prefix: Float64Array,
  start: number,
  end: number,
): DetectedInterval {
  let maxPower = 0;
  for (let i = start; i < end; i++) maxPower = Math.max(maxPower, power[i]!);
  const work = prefix[end]! - prefix[start]!;
  const duration = end - start;
  return { start, end, duration, meanPower: work / duration, maxPower, work };
}
