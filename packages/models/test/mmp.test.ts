import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ModelInputError } from '../src/errors.js';
import { combineCurves, meanMaxPower, monotoneEnvelope, naiveMeanMaxPower } from '../src/mmp.js';

const series = fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 1, maxLength: 300 });

describe('meanMaxPower', () => {
  it('finds the best window for each duration', () => {
    expect(meanMaxPower([100, 200, 300, 400, 500], [1, 2, 3, 5])).toEqual([
      { duration: 1, power: 500, start: 4 },
      { duration: 2, power: 450, start: 3 },
      { duration: 3, power: 400, start: 2 },
      { duration: 5, power: 300, start: 0 },
    ]);
  });

  it('sorts and de-duplicates durations, and skips those longer than the ride', () => {
    const curve = meanMaxPower([300, 300, 300], [10, 2, 2, 1]);
    expect(curve.map((point) => point.duration)).toEqual([1, 2]);
  });

  it('rejects invalid durations and series', () => {
    expect(() => meanMaxPower([100], [0])).toThrow(ModelInputError);
    expect(() => meanMaxPower([100], [1.5])).toThrow(ModelInputError);
    expect(() => meanMaxPower([])).toThrow(ModelInputError);
    expect(() => meanMaxPower([100, -1])).toThrow(ModelInputError);
    expect(() => meanMaxPower([100, Number.NaN])).toThrow(ModelInputError);
  });

  it('is not monotone in general: [10, 0, 10] holds more over 3 s than over 2 s', () => {
    const powers = meanMaxPower([10, 0, 10], [1, 2, 3]).map((point) => point.power);
    expect(powers).toEqual([10, 5, 20 / 3]);
  });
});

describe('meanMaxPower properties', () => {
  it('matches the naive O(n·d) implementation', () => {
    fc.assert(
      fc.property(series, (power) => {
        const durations = [1, 2, 3, 7, 30, 60, 120];
        expect(meanMaxPower(power, durations)).toEqual(naiveMeanMaxPower(power, durations));
      }),
    );
  });

  it('never lowers the best work as the window grows', () => {
    fc.assert(
      fc.property(series, (power) => {
        const durations = Array.from({ length: power.length }, (_, i) => i + 1);
        const curve = meanMaxPower(power, durations);
        for (let i = 1; i < curve.length; i++) {
          const shorter = curve[i - 1]!;
          const longer = curve[i]!;
          expect(longer.power * longer.duration).toBeGreaterThanOrEqual(
            shorter.power * shorter.duration - 1e-6,
          );
        }
      }),
    );
  });

  it('never beats a duration that divides it: MMP(k·d) ≤ MMP(d)', () => {
    fc.assert(
      fc.property(
        series,
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 2, max: 6 }),
        (power, d, k) => {
          const duration = Math.min(d, Math.floor(power.length / k));
          if (duration < 1) return;
          const [short, long] = meanMaxPower(power, [duration, k * duration]);
          expect(long!.power).toBeLessThanOrEqual(short!.power + 1e-9);
        },
      ),
    );
  });

  it('starts at the peak power and ends at the mean power', () => {
    fc.assert(
      fc.property(series, (power) => {
        const curve = meanMaxPower(power, [1, power.length]);
        const mean = power.reduce((sum, watts) => sum + watts, 0) / power.length;
        expect(curve[0]!.power).toBe(Math.max(...power));
        expect(curve.at(-1)!.power).toBeCloseTo(mean, 9);
      }),
    );
  });
});

describe('monotoneEnvelope', () => {
  it('turns a raw curve into a non-increasing capability curve', () => {
    const raw = meanMaxPower([10, 0, 10], [1, 2, 3]);
    expect(monotoneEnvelope(raw)).toEqual([
      { duration: 1, power: 10 },
      { duration: 2, power: 20 / 3 },
      { duration: 3, power: 20 / 3 },
    ]);
  });
});

describe('combineCurves', () => {
  it('keeps the best power per duration across rides', () => {
    const rideA = [
      { duration: 60, power: 400 },
      { duration: 300, power: 320 },
    ];
    const rideB = [
      { duration: 300, power: 335 },
      { duration: 60, power: 380 },
      { duration: 1200, power: 290 },
    ];
    expect(combineCurves([rideA, rideB])).toEqual([
      { duration: 60, power: 400 },
      { duration: 300, power: 335 },
      { duration: 1200, power: 290 },
    ]);
  });
});
