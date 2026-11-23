import { describe, expect, it } from 'vitest';
import { intensityDomain, timeInDomains } from '../src/domains.js';
import { ModelInputError } from '../src/errors.js';
import { structuredWorkout } from '../src/synthetic.js';

const boundaries = { lt1: 245, cp: 330 };

describe('intensityDomain', () => {
  it.each([
    [200, 'moderate'],
    [245, 'heavy'],
    [330, 'heavy'],
    [331, 'severe'],
  ] as const)('%i W is %s', (watts, domain) => {
    expect(intensityDomain(watts, boundaries)).toBe(domain);
  });

  it('rejects boundaries in the wrong order', () => {
    expect(() => intensityDomain(200, { lt1: 330, cp: 245 })).toThrow(ModelInputError);
  });
});

describe('timeInDomains', () => {
  it('counts the seconds spent in each domain', () => {
    const session = structuredWorkout([
      { seconds: 600, watts: 200 },
      { seconds: 300, watts: 300 },
      { seconds: 60, watts: 400 },
    ]);
    expect(timeInDomains(session, boundaries)).toEqual({ moderate: 600, heavy: 300, severe: 60 });
  });
});
