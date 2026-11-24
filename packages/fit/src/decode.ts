import { Decoder, Stream } from '@garmin/fitsdk';
import { cleanPower, MAX_ACTIVITY_SECONDS, type TimedSample, toOneHz } from './resample.js';

export interface DecodedActivity {
  /** FIT sport, e.g. 'cycling', 'running', 'swimming'. */
  readonly sport: string;
  /** FIT sub-sport, e.g. 'road', 'indoorCycling'; null when absent or generic. */
  readonly subSport: string | null;
  readonly start: Date;
  /** Length of the 1 Hz grid, s (first to last record, pauses included). */
  readonly seconds: number;
  /** Power at 1 Hz, W, cleaned for the models; null when the file has no power data. */
  readonly power: Float64Array | null;
  /** Heart rate at 1 Hz, bpm; null for seconds without a reading, or entirely null without a sensor. */
  readonly heartRate: (number | null)[] | null;
  /** Cadence at 1 Hz, rpm. */
  readonly cadence: (number | null)[] | null;
}

/** Raised when bytes are not a readable FIT file. */
export class FitDecodeError extends Error {
  override readonly name = 'FitDecodeError';
}

/**
 * Decodes an activity FIT file into 1 Hz series. Returns null for files that
 * are not activities (daily monitoring, settings, workouts…) or have no records.
 */
export function decodeActivity(bytes: Uint8Array): DecodedActivity | null {
  const stream = Stream.fromByteArray(Array.from(bytes));
  if (!Decoder.isFIT(stream)) throw new FitDecodeError('not a FIT file');
  const { messages, errors } = new Decoder(stream).read();
  const records = messages.recordMesgs ?? [];
  if (errors.length > 0 && records.length === 0) {
    throw new FitDecodeError(`unreadable FIT file: ${errors[0]?.message ?? 'unknown error'}`);
  }

  const fileType = messages.fileIdMesgs?.[0]?.type;
  if (fileType !== undefined && String(fileType) !== 'activity' && fileType !== 4) return null;

  const times = records.map((r) => toMillis(r.timestamp)).filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  const start = Math.min(...times);
  const seconds = Math.round((Math.max(...times) - start) / 1000) + 1;
  if (seconds > MAX_ACTIVITY_SECONDS) return null;

  const series = (
    pick: (r: (typeof records)[number]) => number | undefined,
  ): (number | null)[] | null => {
    const samples: TimedSample[] = [];
    let any = false;
    for (const record of records) {
      const time = toMillis(record.timestamp);
      if (time === null) continue;
      const value = pick(record);
      if (typeof value === 'number') any = true;
      samples.push({ time, value });
    }
    return any ? toOneHz(samples, start, seconds) : null;
  };

  const rawPower = series((r) => r.power);
  const session = messages.sessionMesgs?.[0];
  const subSport = session?.subSport === undefined ? null : String(session.subSport);
  return {
    sport: session?.sport === undefined ? 'unknown' : String(session.sport),
    subSport: subSport === 'generic' ? null : subSport,
    start: new Date(start),
    seconds,
    power: rawPower?.some((w) => w !== null && w > 0) ? cleanPower(rawPower) : null,
    heartRate: series((r) => r.heartRate),
    cadence: series((r) => r.cadence),
  };
}

function toMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  return null;
}
