import { prefixSums } from './internal/prefix.js';
import { assertPositive, assertPowerSeries } from './internal/validate.js';

export interface SanitizeOptions {
  /** Samples above this value are treated as sensor spikes. Default: 2500 W. */
  readonly maxWatts?: number;
}

export interface SanitizedPower {
  /** Clean 1 Hz series: every sample is finite, ≥ 0 W and ≤ `maxWatts`. */
  readonly power: Float64Array;
  /** Number of samples that were replaced by 0 W. */
  readonly replaced: number;
}

/**
 * Makes a raw 1 Hz power series safe for the models. Missing, non-finite and
 * negative samples, and spikes above `maxWatts`, become 0 W: the usual
 * convention for dropouts and coasting.
 *
 * Time gaps must already be filled, since the models assume one sample per second.
 */
export function sanitizePower(
  raw: ArrayLike<number | null | undefined>,
  options: SanitizeOptions = {},
): SanitizedPower {
  const maxWatts = options.maxWatts ?? 2500;
  assertPositive(maxWatts, 'maxWatts');
  const power = new Float64Array(raw.length);
  let replaced = 0;
  for (let i = 0; i < raw.length; i++) {
    const watts = raw[i];
    if (typeof watts === 'number' && Number.isFinite(watts) && watts >= 0 && watts <= maxWatts) {
      power[i] = watts;
    } else {
      replaced++;
    }
  }
  return { power, replaced };
}

/**
 * Work done after each second of a 1 Hz power series, in joules: `out[i]` is
 * the work done during the first `i + 1` seconds.
 */
export function cumulativeWork(power: ArrayLike<number>): Float64Array {
  assertPowerSeries(power);
  return prefixSums(power).subarray(1);
}
