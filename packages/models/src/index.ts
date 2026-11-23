export type {
  Cp3Options,
  CpFit,
  CpModel,
  CpModelParams,
  CpParams,
  EstimateCpOptions,
} from './critical-power.js';
export {
  estimateCriticalPower,
  fitCp3,
  fitCpHyperbolic,
  fitCpLinear,
  powerForDuration,
  timeToExhaustion,
} from './critical-power.js';
export { ModelInputError } from './errors.js';
export type { CurvePoint, MeanMaxPoint } from './mmp.js';
export { combineCurves, DEFAULT_DURATIONS, meanMaxPower, monotoneEnvelope } from './mmp.js';
export type { SanitizedPower, SanitizeOptions } from './series.js';
export { cumulativeWork, sanitizePower } from './series.js';
