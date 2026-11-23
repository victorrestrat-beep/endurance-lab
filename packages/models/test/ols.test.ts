import { describe, expect, it } from 'vitest';
import { ModelInputError } from '../src/errors.js';
import { linearRegression } from '../src/internal/ols.js';

describe('linearRegression', () => {
  it('fits an exact line with zero residual error', () => {
    const fit = linearRegression([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
    expect(fit.sse).toBeCloseTo(0, 12);
    expect(fit.slopeSe).toBeCloseTo(0, 12);
  });

  it('matches a textbook example, standard errors included', () => {
    // x̄ = 3, Sxx = 10, SSE = 2.4, s² = SSE / (n − 2) = 0.8
    const fit = linearRegression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(fit.slope).toBeCloseTo(0.6, 12);
    expect(fit.intercept).toBeCloseTo(2.2, 12);
    expect(fit.sse).toBeCloseTo(2.4, 12);
    expect(fit.slopeSe).toBeCloseTo(Math.sqrt(0.8 / 10), 12);
    expect(fit.interceptSe).toBeCloseTo(Math.sqrt(0.8 * (1 / 5 + 9 / 10)), 12);
  });

  it('rejects degenerate inputs', () => {
    expect(() => linearRegression([1, 2], [1])).toThrow(ModelInputError);
    expect(() => linearRegression([1], [1])).toThrow(ModelInputError);
    expect(() => linearRegression([2, 2, 2], [1, 2, 3])).toThrow(ModelInputError);
  });
});
