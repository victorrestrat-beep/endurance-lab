/**
 * Field critical power from a folder of FIT files.
 *
 *   node apps/cli/dist/field-cp.js <folder-of-fit-files> [output.json]
 *
 * Decodes every activity, keeps cycling sessions with power that last at least
 * 10 minutes, computes their mean-maximal curves and fits CP per year and over
 * the last 90 days. Only aggregated numbers are written out.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeActivity } from '@endurance-lab/fit';
import { meanMaxPower } from '@endurance-lab/models';
import { byYear, type RideCurve, summarisePeriod, window } from './analyze.js';

const DURATIONS = [
  5, 15, 30, 60, 120, 180, 240, 300, 420, 600, 720, 900, 1200, 1800, 2400, 3600, 5400, 7200,
];

function main(): void {
  const [folder, output] = process.argv.slice(2);
  if (folder === undefined) {
    console.error('usage: field-cp <folder-of-fit-files> [output.json]');
    process.exit(1);
  }
  const files = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.fit'));
  const rides = new Map<string, RideCurve>();
  let activities = 0;
  let unreadable = 0;
  for (const [i, name] of files.entries()) {
    if (i > 0 && i % 2000 === 0) console.error(`${i} / ${files.length} files…`);
    let activity: ReturnType<typeof decodeActivity>;
    try {
      activity = decodeActivity(readFileSync(join(folder, name)));
    } catch {
      unreadable++;
      continue;
    }
    if (activity === null) continue;
    activities++;
    if (activity.sport !== 'cycling' || activity.power === null || activity.seconds < 600) continue;
    // The same ride is often uploaded twice (watch and bike computer): keep one per start minute.
    const key = activity.start.toISOString().slice(0, 16);
    const existing = rides.get(key);
    if (existing !== undefined && existing.seconds >= activity.seconds) continue;
    rides.set(key, {
      start: activity.start.toISOString(),
      seconds: activity.seconds,
      curve: meanMaxPower(activity.power, DURATIONS).map(({ duration, power }) => ({
        duration,
        power: Math.round(power * 10) / 10,
      })),
    });
  }

  const sorted = [...rides.values()].sort((a, b) => a.start.localeCompare(b.start));
  const last = sorted.at(-1);
  const summary = {
    files: files.length,
    activities,
    unreadable,
    ridesWithPower: sorted.length,
    firstRide: sorted[0]?.start ?? null,
    lastRide: last?.start ?? null,
    years: byYear(sorted),
    last90Days: last
      ? summarisePeriod('last 90 days', window(sorted, new Date(last.start), 90))
      : null,
    allTime: summarisePeriod('all time', sorted),
  };
  const json = JSON.stringify(summary, null, 2);
  if (output !== undefined) writeFileSync(output, `${json}\n`);
  console.log(json);
}

main();
