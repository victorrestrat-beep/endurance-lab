import { ModelInputError } from '../errors.js';

/** Throws unless every sample is a finite number of watts, ≥ 0. */
export function assertPowerSeries(power: ArrayLike<number>, label = 'power'): void {
  if (power.length === 0) {
    throw new ModelInputError(`${label} series is empty`);
  }
  for (let i = 0; i < power.length; i++) {
    const watts = power[i];
    if (watts === undefined || !Number.isFinite(watts) || watts < 0) {
      throw new ModelInputError(
        `${label}[${i}] must be a finite number ≥ 0 (got ${String(watts)})`,
      );
    }
  }
}

/** Throws unless `value` is a whole number greater than zero. */
export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ModelInputError(`${label} must be a positive integer (got ${value})`);
  }
}

/** Throws unless `value` is a finite number greater than zero. */
export function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ModelInputError(`${label} must be a finite number > 0 (got ${value})`);
  }
}
