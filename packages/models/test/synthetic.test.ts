import { describe, expect, it } from 'vitest';
import { ModelInputError } from '../src/errors.js';
import {
  addNoise,
  allOutTrace,
  constant,
  mulberry32,
  repeat,
  structuredWorkout,
} from '../src/synthetic.js';

describe('synthetic generators', () => {
  it('plays structured blocks back to back', () => {
    const session = structuredWorkout([
      { seconds: 3, watts: 100 },
      { seconds: 2, watts: 300 },
    ]);
    expect(Array.from(session)).toEqual([100, 100, 100, 300, 300]);
  });

  it('repeats blocks', () => {
    const block = [
      { seconds: 1, watts: 1 },
      { seconds: 1, watts: 2 },
    ];
    expect(repeat(block, 3).map((step) => step.watts)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('draws reproducible random numbers in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const draws = Array.from({ length: 1000 }, () => a());
    expect(draws).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
  });

  it('adds the same noise for the same seed, and never negative power', () => {
    const base = constant(250, 100);
    expect(addNoise(base, 20, 42)).toEqual(addNoise(base, 20, 42));
    expect(addNoise(base, 20, 42)).not.toEqual(addNoise(base, 20, 43));
    expect(Math.min(...addNoise(constant(5, 1000), 50, 1))).toBeGreaterThanOrEqual(0);
  });

  it('builds an all-out trace whose work above CP equals W′', () => {
    const trace = allOutTrace({ cp: 330, wPrime: 20_000, peak: 1000, seconds: 600 });
    const workAboveCp = trace.reduce((sum, watts) => sum + (watts - 330), 0);
    expect(workAboveCp).toBeCloseTo(20_000, 3);
  });

  it('validates its inputs', () => {
    expect(() => constant(200, 0)).toThrow(ModelInputError);
    expect(() => constant(-1, 10)).toThrow(ModelInputError);
    expect(() => structuredWorkout([{ seconds: 1.5, watts: 200 }])).toThrow(ModelInputError);
    expect(() => repeat([], 0)).toThrow(ModelInputError);
    expect(() => addNoise([200], -1)).toThrow(ModelInputError);
    expect(() => allOutTrace({ cp: 330, wPrime: 20_000, peak: 300 })).toThrow(ModelInputError);
  });
});
