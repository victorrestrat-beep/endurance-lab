import { describe, expect, it } from 'vitest';
import { ModelInputError } from '../src/errors.js';
import { cumulativeWork, sanitizePower } from '../src/series.js';

describe('sanitizePower', () => {
  it('replaces missing, invalid and spiky samples with 0 W', () => {
    const { power, replaced } = sanitizePower([200, null, Number.NaN, -5, 3000, undefined, 250]);
    expect(Array.from(power)).toEqual([200, 0, 0, 0, 0, 0, 250]);
    expect(replaced).toBe(5);
  });

  it('honours a custom spike threshold', () => {
    const { power, replaced } = sanitizePower([1200, 1800], { maxWatts: 1500 });
    expect(Array.from(power)).toEqual([1200, 0]);
    expect(replaced).toBe(1);
  });

  it('rejects a meaningless spike threshold', () => {
    expect(() => sanitizePower([200], { maxWatts: 0 })).toThrow(ModelInputError);
  });
});

describe('cumulativeWork', () => {
  it('accumulates joules second by second', () => {
    expect(Array.from(cumulativeWork([100, 200, 300]))).toEqual([100, 300, 600]);
  });

  it('rejects empty, negative and non-finite series', () => {
    expect(() => cumulativeWork([])).toThrow(ModelInputError);
    expect(() => cumulativeWork([100, -1])).toThrow(ModelInputError);
    expect(() => cumulativeWork([100, Number.NaN])).toThrow(ModelInputError);
  });
});
