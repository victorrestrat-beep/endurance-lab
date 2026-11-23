import { ModelInputError } from './errors.js';
import { bestWindow, firstIndexAtLeast, prefixSums } from './internal/prefix.js';
import { assertPositive, assertPositiveInteger, assertPowerSeries } from './internal/validate.js';

export interface DurabilityOptions {
  /** Effort durations, s. Default: 1, 5 and 20 min. */
  readonly durations?: readonly number[];
  /** Accumulated-work thresholds, in kJ, or in kJ/kg when `massKg` is set. Default: 0, 1000, 2000 and 3000 kJ. */
  readonly workThresholds?: readonly number[];
  /** Body mass, kg. When set, thresholds are read as kJ/kg. */
  readonly massKg?: number;
}

export interface DurabilityCell {
  /** Effort duration, s. */
  readonly duration: number;
  /** Best mean power after the threshold, W; null when too little of the ride remains. */
  readonly power: number | null;
  /** `power` divided by the best power over the whole ride (fresh); null when either is unavailable. */
  readonly relativeToFresh: number | null;
}

export interface DurabilityRow {
  readonly threshold: number;
  readonly unit: 'kJ' | 'kJ/kg';
  /** Second at which the threshold was reached; null when the ride never got there. */
  readonly startsAt: number | null;
  readonly cells: DurabilityCell[];
}

/**
 * Durability profile (Maunder et al., 2021): the best efforts of a ride,
 * counted only after a given amount of work has been done. A rider whose 5-min
 * power barely drops after 2000 kJ is durable; a large drop shows that fatigue
 * resistance, not fresh power, is the limiter.
 */
export function durabilityProfile(
  power: ArrayLike<number>,
  options: DurabilityOptions = {},
): DurabilityRow[] {
  assertPowerSeries(power);
  const durations = options.durations ?? [60, 300, 1200];
  const thresholds = options.workThresholds ?? [0, 1000, 2000, 3000];
  const { massKg } = options;
  for (const duration of durations) assertPositiveInteger(duration, 'duration');
  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new ModelInputError(`work thresholds must be finite and ≥ 0 (got ${threshold})`);
    }
  }
  if (massKg !== undefined) assertPositive(massKg, 'massKg');

  const unit = massKg === undefined ? 'kJ' : 'kJ/kg';
  const n = power.length;
  const prefix = prefixSums(power);
  const fresh = durations.map((duration) => {
    const best = bestWindow(prefix, 0, n, duration);
    return best === null ? null : best.sum / duration;
  });

  return thresholds.map((threshold) => {
    const startsAt = firstIndexAtLeast(prefix, threshold * 1000 * (massKg ?? 1));
    const cells = durations.map((duration, i): DurabilityCell => {
      const best = startsAt < 0 ? null : bestWindow(prefix, startsAt, n, duration);
      const watts = best === null ? null : best.sum / duration;
      const freshWatts = fresh[i] ?? null;
      return {
        duration,
        power: watts,
        relativeToFresh: watts !== null && freshWatts ? watts / freshWatts : null,
      };
    });
    return { threshold, unit, startsAt: startsAt < 0 ? null : startsAt, cells };
  });
}
