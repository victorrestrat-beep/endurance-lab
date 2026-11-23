import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { durabilityProfile } from '../src/durability.js';
import { ModelInputError } from '../src/errors.js';
import { constant, structuredWorkout } from '../src/synthetic.js';

describe('durabilityProfile', () => {
  it('is flat for a perfectly steady ride', () => {
    const rows = durabilityProfile(constant(250, 3 * 3600), {
      durations: [60, 300],
      workThresholds: [0, 1000, 2000],
    });
    expect(rows.map((row) => row.startsAt)).toEqual([0, 4000, 8000]);
    for (const row of rows) {
      for (const cell of row.cells) {
        expect(cell.power).toBe(250);
        expect(cell.relativeToFresh).toBe(1);
      }
    }
  });

  it('shows fatigue: the same effort is weaker after two hours of work', () => {
    const ride = structuredWorkout([
      { seconds: 300, watts: 380 },
      { seconds: 7200, watts: 230 },
      { seconds: 300, watts: 360 },
      { seconds: 600, watts: 180 },
    ]);
    const [fresh, tired] = durabilityProfile(ride, { durations: [300], workThresholds: [0, 1500] });
    expect(fresh!.cells[0]!.power).toBe(380);
    expect(tired!.startsAt).toBe(6327);
    expect(tired!.cells[0]!.power).toBe(360);
    expect(tired!.cells[0]!.relativeToFresh).toBeCloseTo(360 / 380, 12);
  });

  it('reads thresholds as kJ/kg when a body mass is given', () => {
    const [row] = durabilityProfile(constant(250, 3 * 3600), {
      durations: [60],
      workThresholds: [10],
      massKg: 80,
    });
    expect(row!.unit).toBe('kJ/kg');
    expect(row!.startsAt).toBe(3200);
  });

  it('leaves cells empty when the threshold is never reached or too little ride remains', () => {
    const [, late, never] = durabilityProfile(constant(200, 3600), {
      durations: [60, 1200],
      workThresholds: [0, 600, 5000],
    });
    expect(late!.startsAt).toBe(3000);
    expect(late!.cells.map((cell) => cell.power)).toEqual([200, null]);
    expect(never!.startsAt).toBeNull();
    expect(never!.cells.every((cell) => cell.power === null && cell.relativeToFresh === null)).toBe(
      true,
    );
  });

  it('never rates a tired effort above the fresh one', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 600 }), { minLength: 1, maxLength: 2000 }),
        (power) => {
          const rows = durabilityProfile(power, {
            durations: [10, 60],
            workThresholds: [0, 50, 100],
          });
          const fresh = rows[0]!;
          for (const row of rows) {
            for (const [i, cell] of row.cells.entries()) {
              const freshPower = fresh.cells[i]!.power;
              if (cell.power !== null && freshPower !== null) {
                expect(cell.power).toBeLessThanOrEqual(freshPower + 1e-9);
              }
            }
          }
        },
      ),
    );
  });

  it('rejects invalid options', () => {
    const ride = constant(200, 600);
    expect(() => durabilityProfile(ride, { workThresholds: [-1] })).toThrow(ModelInputError);
    expect(() => durabilityProfile(ride, { durations: [0] })).toThrow(ModelInputError);
    expect(() => durabilityProfile(ride, { massKg: 0 })).toThrow(ModelInputError);
  });
});
