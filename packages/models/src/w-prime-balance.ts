import type { CpParams } from './critical-power.js';
import { assertPositive, assertPowerSeries } from './internal/validate.js';

export interface WPrimeBalance {
  /**
   * W′ balance at the end of each second, J. It goes below 0 when the session
   * beats the model, a sign that CP or W′ are underestimated.
   */
  readonly balance: Float64Array;
  /** Lowest balance reached, J. */
  readonly min: number;
  /** Second at which the lowest balance was reached. */
  readonly minAt: number;
  /** Recovery time constant, s (integral model only, null otherwise). */
  readonly tau: number | null;
}

/**
 * Integral model (Skiba et al., 2012). Every joule spent above CP is recovered
 * exponentially with a single time constant τ = 546 · e^(−0.01 · D_CP) + 316,
 * where D_CP is how far below CP the athlete rode, on average, during the
 * session's seconds below CP.
 */
export function wPrimeBalanceIntegral(power: ArrayLike<number>, params: CpParams): WPrimeBalance {
  check(power, params);
  const { cp, wPrime } = params;
  let belowSum = 0;
  let belowCount = 0;
  for (let i = 0; i < power.length; i++) {
    const watts = power[i]!;
    if (watts < cp) {
      belowSum += watts;
      belowCount++;
    }
  }
  const dcp = belowCount > 0 ? cp - belowSum / belowCount : 0;
  const tau = 546 * Math.exp(-0.01 * dcp) + 316;
  const decay = Math.exp(-1 / tau);
  const balance = new Float64Array(power.length);
  let spent = 0;
  for (let i = 0; i < power.length; i++) {
    spent = spent * decay + Math.max(0, power[i]! - cp);
    balance[i] = wPrime - spent;
  }
  return summarise(balance, tau);
}

/**
 * Differential model (Skiba et al., 2015). Above CP, W′ drains joule for joule;
 * below CP it refills towards W′ with a time constant W′ / D_CP that depends on
 * how far below CP the athlete is riding at that moment.
 */
export function wPrimeBalanceDifferential(
  power: ArrayLike<number>,
  params: CpParams,
): WPrimeBalance {
  check(power, params);
  const { cp, wPrime } = params;
  const balance = new Float64Array(power.length);
  let current = wPrime;
  for (let i = 0; i < power.length; i++) {
    const watts = power[i]!;
    current =
      watts > cp
        ? current - (watts - cp)
        : wPrime - (wPrime - current) * Math.exp(-(cp - watts) / wPrime);
    balance[i] = current;
  }
  return summarise(balance, null);
}

function check(power: ArrayLike<number>, { cp, wPrime }: CpParams): void {
  assertPowerSeries(power);
  assertPositive(cp, 'cp');
  assertPositive(wPrime, 'wPrime');
}

function summarise(balance: Float64Array, tau: number | null): WPrimeBalance {
  let min = Number.POSITIVE_INFINITY;
  let minAt = 0;
  for (let i = 0; i < balance.length; i++) {
    if (balance[i]! < min) {
      min = balance[i]!;
      minAt = i;
    }
  }
  return { balance, min, minAt, tau };
}
