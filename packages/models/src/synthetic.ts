/**
 * Deterministic generators for tests, benchmarks and demos. Each one returns a
 * 1 Hz power series, in watts, whose ground truth is known.
 */
import { ModelInputError } from './errors.js';
import { assertPositive, assertPositiveInteger } from './internal/validate.js';

/** One block of a structured session. */
export interface Step {
  /** Length of the block, in whole seconds. */
  readonly seconds: number;
  /** Target power, W. */
  readonly watts: number;
}

/** A steady effort. */
export function constant(watts: number, seconds: number): Float64Array {
  return structuredWorkout([{ seconds, watts }]);
}

/** Blocks played back to back. */
export function structuredWorkout(steps: readonly Step[]): Float64Array {
  let total = 0;
  for (const step of steps) {
    assertPositiveInteger(step.seconds, 'step.seconds');
    assertWatts(step.watts);
    total += step.seconds;
  }
  const out = new Float64Array(total);
  let at = 0;
  for (const step of steps) {
    out.fill(step.watts, at, at + step.seconds);
    at += step.seconds;
  }
  return out;
}

/** `times` copies of `block`, for example five 4-min repeats with their recoveries. */
export function repeat(block: readonly Step[], times: number): Step[] {
  assertPositiveInteger(times, 'times');
  return Array.from({ length: times }, () => block).flat();
}

/** Seedable pseudo-random generator (mulberry32) returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adds Gaussian noise with standard deviation `sd` (W), clipped at 0 W. The same seed gives the same series. */
export function addNoise(series: ArrayLike<number>, sd: number, seed = 1): Float64Array {
  if (!Number.isFinite(sd) || sd < 0) {
    throw new ModelInputError(`sd must be a finite number ≥ 0 (got ${sd})`);
  }
  const random = mulberry32(seed);
  const out = new Float64Array(series.length);
  for (let i = 0; i < series.length; i++) {
    // Box–Muller transform; 1 - random() keeps the logarithm finite.
    const z = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    out[i] = Math.max(0, series[i]! + sd * z);
  }
  return out;
}

export interface AllOutTraceOptions {
  /** Critical power the effort decays towards, W. */
  readonly cp: number;
  /** Work available above CP, J. */
  readonly wPrime: number;
  /** Power at the very start of the effort, W. Default: CP + 700 W. */
  readonly peak?: number;
  /** Test length, s. Default: 180. */
  readonly seconds?: number;
}

/**
 * An idealised 3-minute all-out test. Power decays exponentially from `peak`
 * towards CP with time constant τ = W′ / (peak − CP), so the work done above CP
 * tends to exactly W′. Each sample is the mean of that curve over its second.
 */
export function allOutTrace(options: AllOutTraceOptions): Float64Array {
  const { cp, wPrime } = options;
  const peak = options.peak ?? cp + 700;
  const seconds = options.seconds ?? 180;
  assertPositive(cp, 'cp');
  assertPositive(wPrime, 'wPrime');
  assertPositiveInteger(seconds, 'seconds');
  if (!(peak > cp)) {
    throw new ModelInputError(`peak (${peak} W) must be above cp (${cp} W)`);
  }
  const tau = wPrime / (peak - cp);
  const out = new Float64Array(seconds);
  for (let t = 0; t < seconds; t++) {
    out[t] = cp + (peak - cp) * tau * (Math.exp(-t / tau) - Math.exp(-(t + 1) / tau));
  }
  return out;
}

function assertWatts(watts: number): void {
  if (!Number.isFinite(watts) || watts < 0) {
    throw new ModelInputError(`watts must be a finite number ≥ 0 (got ${watts})`);
  }
}
