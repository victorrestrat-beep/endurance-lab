import { ModelInputError } from '../errors.js';

export interface LinearFit {
  readonly intercept: number;
  readonly slope: number;
  /** Sum of squared residuals. */
  readonly sse: number;
  /** Standard error of the intercept; null with fewer than 3 points. */
  readonly interceptSe: number | null;
  /** Standard error of the slope; null with fewer than 3 points. */
  readonly slopeSe: number | null;
}

/** Ordinary least squares fit of `y = intercept + slope · x`. */
export function linearRegression(x: readonly number[], y: readonly number[]): LinearFit {
  const n = x.length;
  if (n !== y.length) {
    throw new ModelInputError('x and y must have the same length');
  }
  if (n < 2) {
    throw new ModelInputError('a linear fit needs at least 2 points');
  }
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < n; i++) {
    meanX += x[i]!;
    meanY += y[i]!;
  }
  meanX /= n;
  meanY /= n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    sxx += dx * dx;
    sxy += dx * (y[i]! - meanY);
  }
  if (sxx === 0) {
    throw new ModelInputError('x values must not all be identical');
  }
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const residual = y[i]! - (intercept + slope * x[i]!);
    sse += residual * residual;
  }
  if (n < 3) {
    return { intercept, slope, sse, interceptSe: null, slopeSe: null };
  }
  const variance = sse / (n - 2);
  return {
    intercept,
    slope,
    sse,
    interceptSe: Math.sqrt(variance * (1 / n + (meanX * meanX) / sxx)),
    slopeSe: Math.sqrt(variance / sxx),
  };
}
