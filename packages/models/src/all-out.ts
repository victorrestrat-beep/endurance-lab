import type { CpParams } from './critical-power.js';
import { ModelInputError } from './errors.js';
import { assertPositiveInteger, assertPowerSeries } from './internal/validate.js';

export interface AllOutOptions {
  /** Length of the final window averaged for end-test power, s. Default: 30. */
  readonly finalWindow?: number;
}

export interface AllOutResult {
  /** End-test power: mean of the final window, the estimate of CP, W. */
  readonly endPower: number;
  /** Work done above end-test power, the estimate of W′, J. */
  readonly workAboveEndPower: number;
  /** Highest 1-s power, W. */
  readonly peakPower: number;
  /** Mean power over the whole test, W. */
  readonly meanPower: number;
  /** Test length, s. */
  readonly duration: number;
}

/**
 * Analyses a 3-minute all-out test (Vanhatalo, Doust & Burnley, 2007). After
 * about 2.5 min of all-out effort W′ is spent, so the power of the final 30 s
 * estimates CP and the work done above it estimates W′.
 *
 * Pass the 1 Hz power of the test itself, from the first pedal stroke (~180 s).
 */
export function analyzeAllOutTest(
  power: ArrayLike<number>,
  options: AllOutOptions = {},
): AllOutResult {
  assertPowerSeries(power);
  const finalWindow = options.finalWindow ?? 30;
  assertPositiveInteger(finalWindow, 'finalWindow');
  const n = power.length;
  if (n < 2 * finalWindow) {
    throw new ModelInputError(
      `a ${n}-s test is too short for a ${finalWindow}-s final window (at least ${2 * finalWindow} s needed)`,
    );
  }
  let total = 0;
  let tail = 0;
  let peakPower = 0;
  for (let i = 0; i < n; i++) {
    const watts = power[i]!;
    total += watts;
    if (i >= n - finalWindow) tail += watts;
    if (watts > peakPower) peakPower = watts;
  }
  const endPower = tail / finalWindow;
  let workAboveEndPower = 0;
  for (let i = 0; i < n; i++) {
    workAboveEndPower += Math.max(0, power[i]! - endPower);
  }
  return { endPower, workAboveEndPower, peakPower, meanPower: total / n, duration: n };
}

/** CP and W′ as estimated by a 3-minute all-out test. */
export function allOutToCpParams(result: AllOutResult): CpParams {
  return { cp: result.endPower, wPrime: result.workAboveEndPower };
}
