import { describe, expect, it } from 'vitest';
import { ModelInputError } from '../src/errors.js';
import { detectIntervals } from '../src/intervals.js';
import { addNoise, repeat, structuredWorkout } from '../src/synthetic.js';

const cp = 330;
const work = { seconds: 240, watts: 380 };
const recovery = { seconds: 180, watts: 150 };
const session = addNoise(
  structuredWorkout([
    { seconds: 600, watts: 180 },
    ...repeat([work, recovery], 5),
    { seconds: 300, watts: 140 },
  ]),
  15,
  7,
);

describe('detectIntervals', () => {
  it('finds each repetition of a noisy 5 × 4 min session', () => {
    const found = detectIntervals(session, { threshold: 0.9 * cp });
    expect(found).toHaveLength(5);
    for (const [i, interval] of found.entries()) {
      expect(Math.abs(interval.start - (600 + i * 420))).toBeLessThanOrEqual(2);
      expect(Math.abs(interval.duration - 240)).toBeLessThanOrEqual(3);
      expect(Math.abs(interval.meanPower - 380)).toBeLessThan(5);
      expect(interval.work).toBeCloseTo(interval.meanPower * interval.duration, 6);
    }
  });

  it('bridges a short drop such as a gear change', () => {
    const effort = structuredWorkout([
      { seconds: 120, watts: 150 },
      { seconds: 150, watts: 350 },
      { seconds: 4, watts: 0 },
      { seconds: 146, watts: 350 },
      { seconds: 120, watts: 150 },
    ]);
    const found = detectIntervals(effort, { threshold: 300 });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ start: 120, end: 420, duration: 300, maxPower: 350 });
  });

  it('ignores sprints shorter than the minimum duration', () => {
    const ride = structuredWorkout([
      { seconds: 200, watts: 150 },
      { seconds: 8, watts: 900 },
      { seconds: 200, watts: 150 },
    ]);
    expect(detectIntervals(ride, { threshold: 300 })).toEqual([]);
    expect(detectIntervals(ride, { threshold: 300, minDuration: 5 })).toMatchObject([
      { start: 200, end: 208, maxPower: 900 },
    ]);
  });

  it('validates its options', () => {
    expect(() => detectIntervals(session, { threshold: 0 })).toThrow(ModelInputError);
    expect(() => detectIntervals(session, { threshold: 300, smoothing: 0 })).toThrow(
      ModelInputError,
    );
    expect(() => detectIntervals(session, { threshold: 300, maxGap: -1 })).toThrow(ModelInputError);
  });
});
