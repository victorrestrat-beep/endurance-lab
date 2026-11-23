import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  estimateCriticalPower,
  fitCp3,
  fitCpHyperbolic,
  fitCpLinear,
  powerForDuration,
  timeToExhaustion,
} from '../src/critical-power.js';
import { ModelInputError } from '../src/errors.js';
import { mulberry32 } from '../src/synthetic.js';

const truth = { cp: 330, wPrime: 20_000 };
const trialDurations = [180, 300, 600, 900, 1200];
const exact = trialDurations.map((t) => ({ duration: t, power: truth.cp + truth.wPrime / t }));

describe('two-parameter models', () => {
  it.each([
    ['hyperbolic', fitCpHyperbolic],
    ['linear work-time', fitCpLinear],
  ] as const)('%s fit recovers CP and W′ from exact points', (_, fit) => {
    const result = fit(exact);
    expect(result.cp).toBeCloseTo(330, 6);
    expect(result.wPrime).toBeCloseTo(20_000, 3);
    expect(result.r2).toBeCloseTo(1, 10);
    expect(result.rmse).toBeLessThan(1e-6);
    expect(result.cpSe).toBeLessThan(1e-6);
    expect(result.n).toBe(5);
  });

  it('stays close to the truth with ±4 W of measurement noise', () => {
    const random = mulberry32(3);
    const noisy = exact.map((p) => ({ ...p, power: p.power + (random() - 0.5) * 8 }));
    const result = fitCpHyperbolic(noisy);
    expect(Math.abs(result.cp - 330)).toBeLessThan(6);
    expect(Math.abs(result.wPrime - 20_000) / 20_000).toBeLessThan(0.2);
    expect(result.cpSe).toBeGreaterThan(0);
    expect(result.wPrimeSe).toBeGreaterThan(0);
  });

  it('reports no standard errors from only two points', () => {
    const result = fitCpLinear(exact.slice(0, 2));
    expect(result.cpSe).toBeNull();
    expect(result.wPrimeSe).toBeNull();
  });

  it('rejects unusable points', () => {
    expect(() => fitCpHyperbolic(exact.slice(0, 1))).toThrow(ModelInputError);
    expect(() => fitCpHyperbolic([exact[0]!, exact[0]!])).toThrow(ModelInputError);
    expect(() => fitCpHyperbolic([{ duration: 0, power: 400 }, ...exact])).toThrow(ModelInputError);
    const risingWithDuration = [
      { duration: 180, power: 300 },
      { duration: 600, power: 320 },
      { duration: 1200, power: 340 },
    ];
    expect(() => fitCpHyperbolic(risingWithDuration)).toThrow(ModelInputError);
  });
});

describe('three-parameter model', () => {
  const pmax = 1200;
  const k = truth.wPrime / (pmax - truth.cp);
  const points = [10, 30, 60, 180, 300, 600, 900, 1200].map((t) => ({
    duration: t,
    power: truth.cp + truth.wPrime / (t + k),
  }));

  it('recovers CP, W′ and Pmax', () => {
    const result = fitCp3(points);
    expect(result.model).toBe('3p');
    expect(result.cp).toBeCloseTo(330, 3);
    expect(result.wPrime / 20_000).toBeCloseTo(1, 4);
    expect(result.pmax! / 1200).toBeCloseTo(1, 3);
    expect(result.cpSe).toBeNull();
  });

  it('needs at least four points', () => {
    expect(() => fitCp3(points.slice(0, 3))).toThrow(ModelInputError);
  });
});

describe('predictions', () => {
  it('gives the time to exhaustion above CP, and none at or below it', () => {
    expect(timeToExhaustion(380, truth)).toBeCloseTo(400, 10);
    expect(powerForDuration(400, truth)).toBeCloseTo(380, 10);
    expect(timeToExhaustion(330, truth)).toBe(Number.POSITIVE_INFINITY);
    expect(timeToExhaustion(250, truth)).toBe(Number.POSITIVE_INFINITY);
  });

  it('round-trips power → time → power for any power above CP', () => {
    fc.assert(
      fc.property(fc.double({ min: 331, max: 1500, noNaN: true }), (watts) => {
        expect(powerForDuration(timeToExhaustion(watts, truth), truth)).toBeCloseTo(watts, 6);
      }),
    );
  });

  it('supports the three-parameter form', () => {
    const params = { ...truth, pmax: 1200 };
    expect(powerForDuration(timeToExhaustion(500, params), params)).toBeCloseTo(500, 6);
    expect(timeToExhaustion(1300, params)).toBe(0);
  });
});

describe('estimateCriticalPower', () => {
  it('fits CP from a mean-maximal curve, using only the 3–20 min efforts', () => {
    const curve = [5, 60, ...trialDurations, 3600].map((t) => ({
      duration: t,
      power: truth.cp + truth.wPrime / t,
    }));
    curve[0] = { duration: 5, power: 1400 };
    const fit = estimateCriticalPower(curve);
    expect(fit.cp).toBeCloseTo(330, 6);
    expect(fit.n).toBe(5);
  });

  it('can fit the linear and three-parameter models too', () => {
    expect(estimateCriticalPower(exact, { model: '2p-linear' }).cp).toBeCloseTo(330, 6);
    const pmax = 1200;
    const k = truth.wPrime / (pmax - truth.cp);
    const curve = [10, 30, 60, 180, 300, 600, 1200].map((t) => ({
      duration: t,
      power: truth.cp + truth.wPrime / (t + k),
    }));
    expect(estimateCriticalPower(curve, { model: '3p', minDuration: 10 }).cp).toBeCloseTo(330, 3);
  });

  it('fails clearly when too few efforts fall in the window', () => {
    const curve = [
      { duration: 60, power: 450 },
      { duration: 300, power: 360 },
    ];
    expect(() => estimateCriticalPower(curve)).toThrow(ModelInputError);
  });
});
