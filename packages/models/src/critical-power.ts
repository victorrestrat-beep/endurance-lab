import { ModelInputError } from './errors.js';
import { linearRegression } from './internal/ols.js';
import { assertPositive } from './internal/validate.js';
import { type CurvePoint, monotoneEnvelope } from './mmp.js';

/** The two parameters of the critical power model. */
export interface CpParams {
  /** Critical power, W: the boundary between the heavy and severe intensity domains. */
  readonly cp: number;
  /** W′, J: the finite amount of work available above CP. */
  readonly wPrime: number;
}

/** CP parameters, optionally with the maximal power of the 3-parameter model. */
export interface CpModelParams extends CpParams {
  /** Maximal instantaneous power, W (3-parameter model). */
  readonly pmax?: number | null;
}

export type CpModel = '2p-hyperbolic' | '2p-linear' | '3p';

export interface CpFit extends CpParams {
  readonly model: CpModel;
  /** Maximal instantaneous power, W: 3-parameter model only, null otherwise. */
  readonly pmax: number | null;
  /** Coefficient of determination, computed on power for every model so fits are comparable. */
  readonly r2: number;
  /** Root-mean-square error of the predicted powers, W. */
  readonly rmse: number;
  /** Standard error of CP, W; null for the 3-parameter model or with fewer than 3 points. */
  readonly cpSe: number | null;
  /** Standard error of W′, J; null for the 3-parameter model or with fewer than 3 points. */
  readonly wPrimeSe: number | null;
  /** Number of points fitted. */
  readonly n: number;
}

/** P = CP + W′ / t, fitted by least squares on (1/t, P) (Moritani et al., 1981). */
export function fitCpHyperbolic(points: readonly CurvePoint[]): CpFit {
  const pts = checkPoints(points, 2);
  const fit = linearRegression(
    pts.map((p) => 1 / p.duration),
    pts.map((p) => p.power),
  );
  return finish('2p-hyperbolic', pts, {
    cp: fit.intercept,
    wPrime: fit.slope,
    k: 0,
    pmax: null,
    cpSe: fit.interceptSe,
    wPrimeSe: fit.slopeSe,
  });
}

/** W = CP · t + W′ (work–time), fitted by least squares on (t, P·t) (Monod & Scherrer, 1965). */
export function fitCpLinear(points: readonly CurvePoint[]): CpFit {
  const pts = checkPoints(points, 2);
  const fit = linearRegression(
    pts.map((p) => p.duration),
    pts.map((p) => p.power * p.duration),
  );
  return finish('2p-linear', pts, {
    cp: fit.slope,
    wPrime: fit.intercept,
    k: 0,
    pmax: null,
    cpSe: fit.slopeSe,
    wPrimeSe: fit.interceptSe,
  });
}

export interface Cp3Options {
  /** Upper bound of the search for k = W′ / (Pmax − CP), s. Default: 300. */
  readonly maxK?: number;
}

/**
 * P = CP + W′ / (t + k), with k = W′ / (Pmax − CP) (Morton, 1996).
 *
 * For a fixed k the model is linear in CP and W′, so those come from least
 * squares and only k is searched (variable projection): no starting guesses and
 * no divergence. Pmax is only identifiable if the data include short efforts
 * (around one minute or less).
 */
export function fitCp3(points: readonly CurvePoint[], options: Cp3Options = {}): CpFit {
  const pts = checkPoints(points, 4);
  const maxK = options.maxK ?? 300;
  assertPositive(maxK, 'maxK');
  const powers = pts.map((p) => p.power);
  const fitAt = (k: number) =>
    linearRegression(
      pts.map((p) => 1 / (p.duration + k)),
      powers,
    );

  let bestK = 0;
  let bestSse = fitAt(0).sse;
  for (let k = 1; k <= maxK; k++) {
    const { sse } = fitAt(k);
    if (sse < bestSse) {
      bestSse = sse;
      bestK = k;
    }
  }
  const k = goldenSectionMin(
    (x) => fitAt(x).sse,
    Math.max(0, bestK - 1),
    Math.min(maxK, bestK + 1),
  );
  const fit = fitAt(k);
  const cp = fit.intercept;
  const wPrime = fit.slope;
  return finish('3p', pts, {
    cp,
    wPrime,
    k,
    pmax: k > 1e-6 ? cp + wPrime / k : null,
    cpSe: null,
    wPrimeSe: null,
  });
}

export interface EstimateCpOptions {
  /** Shortest effort used, s. Default: 180 (3 min). */
  readonly minDuration?: number;
  /** Longest effort used, s. Default: 1200 (20 min). */
  readonly maxDuration?: number;
  /** Model to fit. Default: '2p-hyperbolic'. */
  readonly model?: CpModel;
}

/**
 * CP from everyday training, with no test protocol: fits the monotone envelope
 * of a mean-maximal curve (typically `combineCurves` over recent rides) between
 * `minDuration` and `maxDuration`.
 *
 * The result is a lower bound: it is only as good as the hardest efforts in the data.
 */
export function estimateCriticalPower(
  curve: readonly CurvePoint[],
  options: EstimateCpOptions = {},
): CpFit {
  const minDuration = options.minDuration ?? 180;
  const maxDuration = options.maxDuration ?? 1200;
  const points = monotoneEnvelope(curve).filter(
    (p) => p.duration >= minDuration && p.duration <= maxDuration,
  );
  switch (options.model ?? '2p-hyperbolic') {
    case '2p-hyperbolic':
      return fitCpHyperbolic(points);
    case '2p-linear':
      return fitCpLinear(points);
    case '3p':
      return fitCp3(points);
  }
}

/** Time to exhaustion at a constant power, s. Infinity at or below CP. */
export function timeToExhaustion(power: number, params: CpModelParams): number {
  if (!(power > params.cp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, params.wPrime / (power - params.cp) - offset(params));
}

/** Power that can be sustained for `duration` seconds, W. */
export function powerForDuration(duration: number, params: CpModelParams): number {
  assertPositive(duration, 'duration');
  return params.cp + params.wPrime / (duration + offset(params));
}

/** k = W′ / (Pmax − CP) for the 3-parameter model, 0 for the 2-parameter one. */
function offset({ cp, wPrime, pmax }: CpModelParams): number {
  return typeof pmax === 'number' && pmax > cp ? wPrime / (pmax - cp) : 0;
}

interface Solution {
  readonly cp: number;
  readonly wPrime: number;
  readonly k: number;
  readonly pmax: number | null;
  readonly cpSe: number | null;
  readonly wPrimeSe: number | null;
}

function finish(model: CpModel, points: readonly CurvePoint[], solution: Solution): CpFit {
  const { cp, wPrime, k } = solution;
  if (!(cp > 0) || !(wPrime > 0)) {
    throw new ModelInputError(
      `these points do not follow a power–duration relationship (CP = ${cp.toFixed(1)} W, W′ = ${wPrime.toFixed(0)} J)`,
    );
  }
  const mean = points.reduce((sum, p) => sum + p.power, 0) / points.length;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    ssRes += (p.power - (cp + wPrime / (p.duration + k))) ** 2;
    ssTot += (p.power - mean) ** 2;
  }
  return {
    model,
    cp,
    wPrime,
    pmax: solution.pmax,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 1,
    rmse: Math.sqrt(ssRes / points.length),
    cpSe: solution.cpSe,
    wPrimeSe: solution.wPrimeSe,
    n: points.length,
  };
}

function checkPoints(points: readonly CurvePoint[], minimum: number): CurvePoint[] {
  if (points.length < minimum) {
    throw new ModelInputError(
      `at least ${minimum} power–duration points are needed (got ${points.length})`,
    );
  }
  const seen = new Set<number>();
  for (const { duration, power } of points) {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(power) || power <= 0) {
      throw new ModelInputError(`invalid point: ${duration} s at ${power} W`);
    }
    if (seen.has(duration)) {
      throw new ModelInputError(`duplicate duration: ${duration} s`);
    }
    seen.add(duration);
  }
  return [...points].sort((a, b) => a.duration - b.duration);
}

/** Minimum of a unimodal function on [lo, hi] by golden-section search. */
function goldenSectionMin(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tolerance = 1e-7,
): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > tolerance) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}
