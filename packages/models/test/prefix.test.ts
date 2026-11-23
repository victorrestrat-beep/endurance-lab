import { describe, expect, it } from 'vitest';
import { bestWindow, firstIndexAtLeast, prefixSums } from '../src/internal/prefix.js';

describe('prefix sums', () => {
  it('starts at zero and accumulates', () => {
    expect(Array.from(prefixSums([100, 0, 200]))).toEqual([0, 100, 100, 300]);
  });

  it('finds the first index that reaches a target', () => {
    const prefix = prefixSums([100, 0, 200]);
    expect(firstIndexAtLeast(prefix, 0)).toBe(0);
    expect(firstIndexAtLeast(prefix, 100)).toBe(1);
    expect(firstIndexAtLeast(prefix, 150)).toBe(3);
    expect(firstIndexAtLeast(prefix, 301)).toBe(-1);
  });

  it('finds the best window inside a range, or none when it does not fit', () => {
    const prefix = prefixSums([1, 2, 3]);
    expect(bestWindow(prefix, 1, 3, 2)).toEqual({ sum: 5, start: 1 });
    expect(bestWindow(prefix, 1, 3, 3)).toBeNull();
  });
});
