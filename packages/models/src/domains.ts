import { ModelInputError } from './errors.js';
import { assertPowerSeries } from './internal/validate.js';

/** Exercise intensity domains. */
export type IntensityDomain = 'moderate' | 'heavy' | 'severe';

export interface DomainBoundaries {
  /** First threshold (LT1, GET or VT1): top of the moderate domain, W. */
  readonly lt1: number;
  /** Critical power: top of the heavy domain, W. */
  readonly cp: number;
}

/**
 * Domain of a power output: moderate below LT1, heavy from LT1 up to CP, and
 * severe above CP, where W′ is being used and oxygen uptake drifts towards its
 * maximum.
 */
export function intensityDomain(power: number, boundaries: DomainBoundaries): IntensityDomain {
  checkBoundaries(boundaries);
  return classify(power, boundaries);
}

/** Seconds spent in each domain. */
export function timeInDomains(
  power: ArrayLike<number>,
  boundaries: DomainBoundaries,
): Record<IntensityDomain, number> {
  assertPowerSeries(power);
  checkBoundaries(boundaries);
  const seconds: Record<IntensityDomain, number> = { moderate: 0, heavy: 0, severe: 0 };
  for (let i = 0; i < power.length; i++) {
    seconds[classify(power[i]!, boundaries)]++;
  }
  return seconds;
}

function classify(power: number, { lt1, cp }: DomainBoundaries): IntensityDomain {
  if (power < lt1) return 'moderate';
  if (power <= cp) return 'heavy';
  return 'severe';
}

function checkBoundaries({ lt1, cp }: DomainBoundaries): void {
  if (!Number.isFinite(lt1) || !Number.isFinite(cp) || lt1 <= 0 || lt1 >= cp) {
    throw new ModelInputError(`expected 0 < lt1 < cp (got lt1 = ${lt1} W, cp = ${cp} W)`);
  }
}
