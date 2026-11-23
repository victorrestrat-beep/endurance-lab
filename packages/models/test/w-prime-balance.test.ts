import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { timeToExhaustion } from '../src/critical-power.js';
import { ModelInputError } from '../src/errors.js';
import { constant, structuredWorkout } from '../src/synthetic.js';
import { wPrimeBalanceDifferential, wPrimeBalanceIntegral } from '../src/w-prime-balance.js';

const params = { cp: 330, wPrime: 20_000 };

describe.each([
  ['integral model (Skiba 2012)', wPrimeBalanceIntegral],
  ['differential model (Skiba 2015)', wPrimeBalanceDifferential],
] as const)('%s', (_, model) => {
  it('stays full while riding below CP', () => {
    const { balance, min } = model(constant(300, 600), params);
    expect(min).toBe(20_000);
    expect(balance.every((joules) => joules === 20_000)).toBe(true);
  });

  it('never exceeds W′', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 900 }), { minLength: 1, maxLength: 400 }),
        (power) => {
          const { balance } = model(power, params);
          expect(Math.max(...balance)).toBeLessThanOrEqual(20_000 + 1e-9);
        },
      ),
    );
  });

  it('reports the lowest point at the end of the hard block', () => {
    const session = structuredWorkout([
      { seconds: 120, watts: 200 },
      { seconds: 180, watts: 420 },
      { seconds: 300, watts: 150 },
    ]);
    const { balance, min, minAt } = model(session, params);
    expect(minAt).toBe(299);
    expect(min).toBe(balance[299]);
  });

  it('rejects invalid parameters', () => {
    expect(() => model([300], { cp: 0, wPrime: 20_000 })).toThrow(ModelInputError);
    expect(() => model([300], { cp: 330, wPrime: -1 })).toThrow(ModelInputError);
  });
});

describe('differential model', () => {
  it("empties W′ exactly at the CP model's time to exhaustion", () => {
    const tlim = timeToExhaustion(380, params);
    expect(tlim).toBe(400);
    const { balance } = wPrimeBalanceDifferential(constant(380, 500), params);
    expect(balance[tlim - 1]).toBeCloseTo(0, 9);
  });

  it('recovers with a time constant of W′ / D_CP', () => {
    const session = structuredWorkout([
      { seconds: 200, watts: 380 },
      { seconds: 61, watts: 0 },
    ]);
    const { balance } = wPrimeBalanceDifferential(session, params);
    // 10 kJ spent, then 61 s at 0 W: the deficit shrinks by e^(−61 · 330 / 20 000).
    expect(balance[260]).toBeCloseTo(20_000 - 10_000 * Math.exp((-61 * 330) / 20_000), 6);
  });
});

describe('integral model', () => {
  it('derives τ from how far below CP the athlete recovers', () => {
    const session = structuredWorkout([
      { seconds: 300, watts: 380 },
      { seconds: 300, watts: 150 },
    ]);
    const { tau } = wPrimeBalanceIntegral(session, params);
    expect(tau).toBeCloseTo(546 * Math.exp(-0.01 * 180) + 316, 9);
  });
});
