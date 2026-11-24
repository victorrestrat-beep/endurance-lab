import { Encoder, type Mesg } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { decodeActivity, FitDecodeError } from '../src/decode.js';
import { cleanPower, toOneHz } from '../src/resample.js';

/** Global FIT message numbers (FIT profile). */
const MESG = { fileId: 0, session: 18, record: 20 } as const;
const START = new Date('2025-06-20T08:00:00Z');

/** A synthetic activity file: one record per entry of `power` (null = no record that second). */
function activityFile(power: (number | null)[], sport = 'cycling'): Uint8Array {
  const encoder = new Encoder();
  write(encoder, MESG.fileId, {
    manufacturer: 'development',
    product: 1,
    timeCreated: START,
    type: 'activity',
  });
  for (const [i, watts] of power.entries()) {
    if (watts === null) continue;
    write(encoder, MESG.record, {
      timestamp: new Date(START.getTime() + i * 1000),
      power: watts,
      heartRate: 140,
      cadence: 90,
    });
  }
  const end = new Date(START.getTime() + (power.length - 1) * 1000);
  write(encoder, MESG.session, {
    timestamp: end,
    startTime: START,
    totalElapsedTime: power.length,
    totalTimerTime: power.length,
    sport,
    subSport: 'road',
  });
  return encoder.close();
}

describe('toOneHz', () => {
  it('puts samples on a 1 Hz grid and leaves gaps empty', () => {
    const t0 = START.getTime();
    const samples = [0, 1, 2, 5].map((s) => ({ time: t0 + s * 1000, value: 100 + s }));
    expect(toOneHz(samples, t0, 6)).toEqual([100, 101, 102, null, null, 105]);
  });

  it('keeps the last sample when two land on the same second', () => {
    const t0 = START.getTime();
    const samples = [
      { time: t0, value: 1 },
      { time: t0 + 300, value: 2 },
    ];
    expect(toOneHz(samples, t0, 1)).toEqual([2]);
  });

  it('drops samples outside the grid and non-finite values', () => {
    const t0 = START.getTime();
    const samples = [
      { time: t0 - 1000, value: 5 },
      { time: t0, value: Number.NaN },
      { time: t0 + 5000, value: 1 },
    ];
    expect(toOneHz(samples, t0, 2)).toEqual([null, null]);
  });
});

describe('cleanPower', () => {
  it('turns gaps, negatives and spikes into 0 W', () => {
    expect(Array.from(cleanPower([250, null, -3, 4000, 300]))).toEqual([250, 0, 0, 0, 300]);
  });
});

describe('decodeActivity', () => {
  it('decodes a cycling file into 1 Hz power, heart rate and cadence', () => {
    const activity = decodeActivity(activityFile([200, 210, 220, null, null, 250]));
    expect(activity).not.toBeNull();
    expect(activity?.sport).toBe('cycling');
    expect(activity?.subSport).toBe('road');
    expect(activity?.start.toISOString()).toBe(START.toISOString());
    expect(activity?.seconds).toBe(6);
    expect(Array.from(activity?.power ?? [])).toEqual([200, 210, 220, 0, 0, 250]);
    expect(activity?.heartRate).toEqual([140, 140, 140, null, null, 140]);
  });

  it('falls back to an unknown sport without a session, and hides generic sub-sports', () => {
    const records = [0, 1].map((s) => ({
      timestamp: new Date(START.getTime() + s * 1000),
      power: 200,
    }));
    expect(decodeActivity(rawFile(records))).toMatchObject({ sport: 'unknown', subSport: null });
    const generic = rawFile(records, { timestamp: START, sport: 'cycling', subSport: 'generic' });
    expect(decodeActivity(generic)).toMatchObject({ sport: 'cycling', subSport: null });
  });

  it('ignores activities without timestamps or longer than 24 h', () => {
    expect(decodeActivity(rawFile([{ power: 200 }]))).toBeNull();
    const forgotten = [0, 25 * 3600].map((s) => ({
      timestamp: new Date(START.getTime() + s * 1000),
      power: 100,
    }));
    expect(decodeActivity(rawFile(forgotten))).toBeNull();
  });

  it('reports no power for a ride without a power meter', () => {
    const activity = decodeActivity(activityFile([0, 0, 0], 'running'));
    expect(activity?.sport).toBe('running');
    expect(activity?.power).toBeNull();
  });

  it('ignores files that are not activities', () => {
    const encoder = new Encoder();
    write(encoder, MESG.fileId, {
      manufacturer: 'development',
      product: 1,
      timeCreated: START,
      type: 'monitoringB',
    });
    expect(decodeActivity(encoder.close())).toBeNull();
  });

  it('rejects bytes that are not FIT', () => {
    expect(() =>
      decodeActivity(Uint8Array.from('not a fit file at all', (c) => c.charCodeAt(0))),
    ).toThrow(FitDecodeError);
  });
});

/** An activity file from raw record fields, with an optional session message. */
function rawFile(
  records: Record<string, unknown>[],
  session?: Record<string, unknown>,
): Uint8Array {
  const encoder = new Encoder();
  write(encoder, MESG.fileId, {
    manufacturer: 'development',
    product: 1,
    timeCreated: START,
    type: 'activity',
  });
  for (const record of records) write(encoder, MESG.record, record);
  if (session !== undefined) write(encoder, MESG.session, session);
  return encoder.close();
}

/** The SDK types messages loosely; field names follow the FIT profile in camelCase. */
function write(encoder: Encoder, mesgNum: number, fields: Record<string, unknown>): void {
  encoder.onMesg(mesgNum, fields as Mesg);
}
