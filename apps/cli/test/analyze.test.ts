import { describe, expect, it } from 'vitest';
import { byYear, type RideCurve, summarisePeriod, window } from '../src/analyze.js';

const cp = 330;
const wPrime = 20_000;
const curve = (scale: number) =>
  [5, 60, 180, 300, 600, 1200, 3600].map((t) => ({
    duration: t,
    power: scale * (cp + wPrime / t),
  }));

const rides: RideCurve[] = [
  { start: '2024-03-01T08:00:00.000Z', seconds: 3600, curve: curve(0.95) },
  { start: '2025-06-20T08:00:00.000Z', seconds: 7200, curve: curve(1) },
  { start: '2025-07-01T08:00:00.000Z', seconds: 5400, curve: curve(0.9) },
];

describe('summarisePeriod', () => {
  it('fits CP on the best efforts of all rides in the period', () => {
    const summary = summarisePeriod('2025', rides.slice(1));
    expect(summary.rides).toBe(2);
    expect(summary.fit?.cp).toBeCloseTo(cp, 6);
    expect(summary.fit?.wPrime).toBeCloseTo(wPrime, 3);
    expect(summary.best['20min']).toBeCloseTo(cp + wPrime / 1200, 9);
    expect(summary.best['5s']).toBeCloseTo(cp + wPrime / 5, 9);
  });

  it('returns no fit when the period has no 3–20 min efforts', () => {
    const short = [
      { start: '2025-01-01T00:00:00.000Z', seconds: 600, curve: [{ duration: 60, power: 500 }] },
    ];
    expect(summarisePeriod('x', short).fit).toBeNull();
  });
});

describe('periods', () => {
  it('groups rides by calendar year', () => {
    expect(byYear(rides).map((p) => [p.label, p.rides])).toEqual([
      ['2024', 1],
      ['2025', 2],
    ]);
  });

  it('selects the rides of a trailing window', () => {
    const recent = window(rides, new Date('2025-07-01T08:00:00.000Z'), 90);
    expect(recent.map((r) => r.start.slice(0, 10))).toEqual(['2025-06-20', '2025-07-01']);
  });
});
