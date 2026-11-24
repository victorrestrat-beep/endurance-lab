/** One raw sample from a device file. */
export interface TimedSample {
  /** Milliseconds since the Unix epoch. */
  readonly time: number;
  readonly value: number | null | undefined;
}

/** Longest activity accepted, s. Longer recordings are almost always a device left running. */
export const MAX_ACTIVITY_SECONDS = 24 * 3600;

/**
 * Places samples on a 1 Hz grid starting at `start`: sample i goes to second
 * round((time − start) / 1000). When several samples land on the same second
 * the last one wins. Seconds without a sample are null; samples before `start`
 * are dropped.
 */
export function toOneHz(
  samples: readonly TimedSample[],
  start: number,
  seconds: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(seconds).fill(null);
  for (const { time, value } of samples) {
    const index = Math.round((time - start) / 1000);
    if (index < 0 || index >= seconds) continue;
    out[index] = typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return out;
}

/**
 * Power for the models: missing seconds (pauses, dropouts), negative values and
 * spikes above `maxWatts` become 0 W, the usual convention for coasting.
 */
export function cleanPower(series: readonly (number | null)[], maxWatts = 2500): Float64Array {
  const out = new Float64Array(series.length);
  for (const [i, watts] of series.entries()) {
    if (watts !== null && watts >= 0 && watts <= maxWatts) out[i] = watts;
  }
  return out;
}
