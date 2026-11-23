import { ModelInputError } from './errors.js';
import { prefixSums } from './internal/prefix.js';
import { assertPositive, assertPositiveInteger, assertPowerSeries } from './internal/validate.js';

/**
 * Normalized power (Coggan): the fourth-power mean of the 30-s moving average.
 * It weights surges more than average power does. Null for rides shorter than the window.
 */
export function normalizedPower(power: ArrayLike<number>, window = 30): number | null {
  assertPowerSeries(power);
  assertPositiveInteger(window, 'window');
  if (power.length < window) return null;
  const prefix = prefixSums(power);
  let sum = 0;
  for (let end = window; end <= power.length; end++) {
    const mean = (prefix[end]! - prefix[end - window]!) / window;
    sum += mean ** 4;
  }
  return (sum / (power.length - window + 1)) ** 0.25;
}

/** Normalized power divided by a threshold power (here, CP). */
export function intensityFactor(normalized: number, threshold: number): number {
  assertPositive(threshold, 'threshold');
  return normalized / threshold;
}

export interface StressScore {
  readonly normalizedPower: number;
  readonly intensityFactor: number;
  /** Session stress: 100 for one hour at threshold. */
  readonly score: number;
  /** Session length, s. */
  readonly duration: number;
}

/**
 * Power-based session stress, 100 for one hour at threshold: the formula of
 * Coggan's training stress score, computed against CP instead of FTP. Null for
 * rides shorter than 30 s.
 */
export function stressScore(power: ArrayLike<number>, threshold: number): StressScore | null {
  assertPositive(threshold, 'threshold');
  const np = normalizedPower(power);
  if (np === null) return null;
  const intensity = np / threshold;
  const duration = power.length;
  return {
    normalizedPower: np,
    intensityFactor: intensity,
    score: ((duration * np * intensity) / (threshold * 3600)) * 100,
    duration,
  };
}

/** Session-RPE load (Foster et al., 2001): RPE on the CR-10 scale × duration in minutes, in arbitrary units. */
export function sessionRpeLoad(rpe: number, minutes: number): number {
  if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) {
    throw new ModelInputError(`rpe must be between 0 and 10 (got ${rpe})`);
  }
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new ModelInputError(`minutes must be a finite number ≥ 0 (got ${minutes})`);
  }
  return rpe * minutes;
}

/** Exponentially weighted moving average with smoothing factor `alpha`, starting from `initial`. */
export function ewma(values: readonly number[], alpha: number, initial = 0): number[] {
  if (!(alpha > 0 && alpha <= 1)) {
    throw new ModelInputError(`alpha must be in (0, 1] (got ${alpha})`);
  }
  const out: number[] = [];
  let current = initial;
  for (const value of values) {
    current = alpha * value + (1 - alpha) * current;
    out.push(current);
  }
  return out;
}

export interface AcwrOptions {
  /** Acute window, days. Default: 7. */
  readonly acuteDays?: number;
  /** Chronic window, days. Default: 28. */
  readonly chronicDays?: number;
}

/**
 * Acute:chronic workload ratio from exponentially weighted averages
 * (Williams et al., 2017; α = 2 / (N + 1)). Null until a full chronic window of
 * history exists, or while chronic load is 0.
 *
 * Read it as a description of recent changes in load, not as an injury
 * predictor (Impellizzeri et al., 2020).
 */
export function acwrEwma(
  dailyLoad: readonly number[],
  options: AcwrOptions = {},
): (number | null)[] {
  const { acuteDays, chronicDays } = windows(dailyLoad, options);
  const acute = ewma(dailyLoad, 2 / (acuteDays + 1));
  const chronic = ewma(dailyLoad, 2 / (chronicDays + 1));
  return dailyLoad.map((_, i) => {
    const c = chronic[i]!;
    return i < chronicDays - 1 || !(c > 0) ? null : acute[i]! / c;
  });
}

/** Acute:chronic workload ratio from rolling averages (coupled: the acute week is part of the chronic month). */
export function acwrRolling(
  dailyLoad: readonly number[],
  options: AcwrOptions = {},
): (number | null)[] {
  const { acuteDays, chronicDays } = windows(dailyLoad, options);
  const prefix = prefixSums(dailyLoad);
  return dailyLoad.map((_, i) => {
    if (i < chronicDays - 1) return null;
    const chronic = (prefix[i + 1]! - prefix[i + 1 - chronicDays]!) / chronicDays;
    const acute = (prefix[i + 1]! - prefix[i + 1 - acuteDays]!) / acuteDays;
    return chronic > 0 ? acute / chronic : null;
  });
}

export interface MonotonyPoint {
  /** Load summed over the window, AU. */
  readonly weeklyLoad: number;
  /** Mean daily load divided by its standard deviation; null when every day carries the same load. */
  readonly monotony: number | null;
  /** Weekly load × monotony; null when monotony is. */
  readonly strain: number | null;
}

/**
 * Training monotony and strain (Foster, 1998) over a rolling window ending on
 * each day; null for the first `windowDays − 1` days. Uses the population
 * standard deviation of the daily loads.
 */
export function monotonyStrain(
  dailyLoad: readonly number[],
  windowDays = 7,
): (MonotonyPoint | null)[] {
  assertDailyLoad(dailyLoad);
  assertPositiveInteger(windowDays, 'windowDays');
  return dailyLoad.map((_, i) => {
    if (i < windowDays - 1) return null;
    const week = dailyLoad.slice(i + 1 - windowDays, i + 1);
    const weeklyLoad = week.reduce((sum, load) => sum + load, 0);
    const mean = weeklyLoad / windowDays;
    const sd = Math.sqrt(week.reduce((sum, load) => sum + (load - mean) ** 2, 0) / windowDays);
    const monotony = sd > 0 ? mean / sd : null;
    return { weeklyLoad, monotony, strain: monotony === null ? null : weeklyLoad * monotony };
  });
}

export interface PmcOptions {
  /** Fitness (chronic) time constant, days. Default: 42. */
  readonly ctlDays?: number;
  /** Fatigue (acute) time constant, days. Default: 7. */
  readonly atlDays?: number;
  readonly initialCtl?: number;
  readonly initialAtl?: number;
}

export interface PmcPoint {
  /** Chronic training load ("fitness"). */
  readonly ctl: number;
  /** Acute training load ("fatigue"). */
  readonly atl: number;
  /** Balance ("form"): the previous day's CTL minus ATL, i.e. freshness before the day's training. */
  readonly tsb: number;
}

/**
 * Fitness–fatigue model (Banister et al., 1975) as drawn in performance
 * management charts: two exponentially decaying averages of daily load,
 * updated with k = 1 − e^(−1/τ).
 */
export function performanceManagement(
  dailyLoad: readonly number[],
  options: PmcOptions = {},
): PmcPoint[] {
  assertDailyLoad(dailyLoad);
  const ctlDays = options.ctlDays ?? 42;
  const atlDays = options.atlDays ?? 7;
  assertPositive(ctlDays, 'ctlDays');
  assertPositive(atlDays, 'atlDays');
  const kCtl = 1 - Math.exp(-1 / ctlDays);
  const kAtl = 1 - Math.exp(-1 / atlDays);
  let ctl = options.initialCtl ?? 0;
  let atl = options.initialAtl ?? 0;
  return dailyLoad.map((load) => {
    const tsb = ctl - atl;
    ctl += kCtl * (load - ctl);
    atl += kAtl * (load - atl);
    return { ctl, atl, tsb };
  });
}

function windows(
  dailyLoad: readonly number[],
  options: AcwrOptions,
): { acuteDays: number; chronicDays: number } {
  assertDailyLoad(dailyLoad);
  const acuteDays = options.acuteDays ?? 7;
  const chronicDays = options.chronicDays ?? 28;
  assertPositiveInteger(acuteDays, 'acuteDays');
  assertPositiveInteger(chronicDays, 'chronicDays');
  if (acuteDays >= chronicDays) {
    throw new ModelInputError(
      `acuteDays (${acuteDays}) must be shorter than chronicDays (${chronicDays})`,
    );
  }
  return { acuteDays, chronicDays };
}

function assertDailyLoad(dailyLoad: readonly number[]): void {
  for (const [i, load] of dailyLoad.entries()) {
    if (!Number.isFinite(load) || load < 0) {
      throw new ModelInputError(`dailyLoad[${i}] must be a finite number ≥ 0 (got ${load})`);
    }
  }
}
