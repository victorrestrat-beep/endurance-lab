import { describe, expect, it } from 'vitest';
import { ModelInputError } from '../src/errors.js';
import {
  acwrEwma,
  acwrRolling,
  ewma,
  intensityFactor,
  monotonyStrain,
  normalizedPower,
  performanceManagement,
  sessionRpeLoad,
  stressScore,
} from '../src/load.js';
import { constant, structuredWorkout } from '../src/synthetic.js';

describe('normalizedPower', () => {
  it('equals the power of a perfectly steady ride', () => {
    expect(normalizedPower(constant(250, 3600))).toBeCloseTo(250, 10);
  });

  it('weights surges: 60 s at 400 W then 60 s at 100 W', () => {
    const ride = structuredWorkout([
      { seconds: 60, watts: 400 },
      { seconds: 60, watts: 100 },
    ]);
    // The 91 thirty-second averages: 31 at 400 W, 29 on the way down, 31 at 100 W.
    const averages = [
      ...Array.from({ length: 31 }, () => 400),
      ...Array.from({ length: 29 }, (_, k) => 400 - 10 * (k + 1)),
      ...Array.from({ length: 31 }, () => 100),
    ];
    const expected = (averages.reduce((sum, m) => sum + m ** 4, 0) / averages.length) ** 0.25;
    expect(normalizedPower(ride)).toBeCloseTo(expected, 9);
    expect(expected).toBeGreaterThan(250);
  });

  it('is null for rides shorter than 30 s', () => {
    expect(normalizedPower(constant(250, 29))).toBeNull();
  });
});

describe('stressScore', () => {
  it('is 100 for one hour at threshold', () => {
    const result = stressScore(constant(330, 3600), 330);
    expect(result?.score).toBeCloseTo(100, 9);
    expect(result?.intensityFactor).toBeCloseTo(1, 12);
  });

  it('scales with the square of intensity', () => {
    expect(stressScore(constant(165, 3600), 330)?.score).toBeCloseTo(25, 9);
    expect(intensityFactor(297, 330)).toBeCloseTo(0.9, 12);
  });

  it('is null for rides shorter than 30 s', () => {
    expect(stressScore(constant(330, 10), 330)).toBeNull();
  });
});

describe('sessionRpeLoad', () => {
  it('multiplies RPE by minutes', () => {
    expect(sessionRpeLoad(7, 60)).toBe(420);
  });

  it('rejects RPE outside 0–10 and negative durations', () => {
    expect(() => sessionRpeLoad(11, 60)).toThrow(ModelInputError);
    expect(() => sessionRpeLoad(5, -1)).toThrow(ModelInputError);
  });
});

describe('ewma', () => {
  it('smooths from its initial value', () => {
    expect(ewma([10, 10, 10], 0.5)).toEqual([5, 7.5, 8.75]);
  });

  it('rejects smoothing factors outside (0, 1]', () => {
    expect(() => ewma([1], 0)).toThrow(ModelInputError);
    expect(() => ewma([1], 1.5)).toThrow(ModelInputError);
  });
});

describe('acute:chronic workload ratio', () => {
  const steady = Array.from({ length: 60 }, () => 100);

  it('needs a full chronic window of history', () => {
    const ratio = acwrEwma(steady);
    expect(ratio.slice(0, 27).every((value) => value === null)).toBe(true);
    expect(ratio[27]).not.toBeNull();
  });

  it('settles near 1 under a steady load (EWMA) and is exactly 1 with rolling averages', () => {
    expect(acwrEwma(steady).at(-1)).toBeCloseTo(1, 1);
    expect(
      acwrRolling(steady)
        .slice(27)
        .every((value) => value === 1),
    ).toBe(true);
  });

  it('rises above 1.3 after a sudden week of doubled load', () => {
    const spike = [
      ...Array.from({ length: 28 }, () => 100),
      ...Array.from({ length: 7 }, () => 200),
    ];
    expect(acwrEwma(spike).at(-1)).toBeGreaterThan(1.3);
  });

  it('rejects inconsistent windows and negative loads', () => {
    expect(() => acwrEwma(steady, { acuteDays: 28, chronicDays: 7 })).toThrow(ModelInputError);
    expect(() => acwrRolling([100, -1])).toThrow(ModelInputError);
  });
});

describe('monotonyStrain', () => {
  it('is undefined when every day carries the same load', () => {
    const [, , , , , , week] = monotonyStrain(Array.from({ length: 7 }, () => 100));
    expect(week).toEqual({ weeklyLoad: 700, monotony: null, strain: null });
  });

  it('matches a hand-computed week', () => {
    const result = monotonyStrain([0, 100, 0, 100, 0, 100, 0]);
    expect(result.slice(0, 6).every((value) => value === null)).toBe(true);
    // mean / SD of a 3-in-7 week = sqrt(3/4)
    expect(result[6]?.monotony).toBeCloseTo(Math.sqrt(3 / 4), 12);
    expect(result[6]?.strain).toBeCloseTo(300 * Math.sqrt(3 / 4), 9);
  });
});

describe('performanceManagement', () => {
  it('follows the closed form under a constant load', () => {
    const pmc = performanceManagement(Array.from({ length: 200 }, () => 100));
    expect(pmc[0]?.ctl).toBeCloseTo(100 * (1 - Math.exp(-1 / 42)), 12);
    expect(pmc[0]?.atl).toBeCloseTo(100 * (1 - Math.exp(-1 / 7)), 12);
    expect(pmc[0]?.tsb).toBe(0);
    expect(pmc[1]?.tsb).toBeCloseTo(pmc[0]!.ctl - pmc[0]!.atl, 12);
    expect(pmc[199]?.ctl).toBeCloseTo(100 * (1 - Math.exp(-200 / 42)), 9);
  });

  it('starts from given initial values', () => {
    const [first] = performanceManagement([0], { initialCtl: 50, initialAtl: 60 });
    expect(first?.tsb).toBe(-10);
  });
});
