import { describe, expect, it } from 'vitest';
import { allOutToCpParams, analyzeAllOutTest } from '../src/all-out.js';
import { ModelInputError } from '../src/errors.js';
import { addNoise, allOutTrace } from '../src/synthetic.js';

describe('analyzeAllOutTest', () => {
  const trace = allOutTrace({ cp: 330, wPrime: 20_000, peak: 1000 });

  it('estimates CP from end-test power', () => {
    const result = analyzeAllOutTest(trace);
    // W′ is not fully spent after 150 s in the idealised trace: about 3 W remain above CP.
    expect(Math.abs(result.endPower - 330)).toBeLessThan(4);
    expect(result.duration).toBe(180);
    expect(result.peakPower).toBeGreaterThan(900);
  });

  it('estimates W′ from the work done above end-test power', () => {
    const result = analyzeAllOutTest(trace);
    expect(Math.abs(result.workAboveEndPower - 20_000) / 20_000).toBeLessThan(0.05);
  });

  it('stays usable with sensor noise', () => {
    const result = analyzeAllOutTest(addNoise(trace, 10, 5));
    expect(Math.abs(result.endPower - 330)).toBeLessThan(8);
  });

  it('converts the result to CP parameters', () => {
    const result = analyzeAllOutTest(trace);
    expect(allOutToCpParams(result)).toEqual({
      cp: result.endPower,
      wPrime: result.workAboveEndPower,
    });
  });

  it('rejects tests shorter than twice the final window', () => {
    expect(() => analyzeAllOutTest(trace.subarray(0, 50))).toThrow(ModelInputError);
    expect(() => analyzeAllOutTest(trace, { finalWindow: 0 })).toThrow(ModelInputError);
  });
});
