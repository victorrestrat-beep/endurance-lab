import {
  type CpFit,
  type CurvePoint,
  combineCurves,
  estimateCriticalPower,
} from '@endurance-lab/models';

/** What we keep of a ride: when it happened and its mean-maximal power curve. */
export interface RideCurve {
  /** ISO date-time of the start. */
  readonly start: string;
  readonly seconds: number;
  readonly curve: readonly CurvePoint[];
}

export interface PeriodSummary {
  readonly label: string;
  readonly rides: number;
  /** Best mean power for a few reference durations, W. */
  readonly best: Readonly<Record<'5s' | '1min' | '5min' | '20min' | '60min', number | null>>;
  /** CP and W′ fitted on the period's 3–20 min envelope; null when it cannot be fitted. */
  readonly fit: Pick<CpFit, 'cp' | 'wPrime' | 'r2' | 'cpSe'> | null;
}

const REFERENCE: Record<keyof PeriodSummary['best'], number> = {
  '5s': 5,
  '1min': 60,
  '5min': 300,
  '20min': 1200,
  '60min': 3600,
};

/** Combines the rides of a period and fits CP on their best efforts. */
export function summarisePeriod(label: string, rides: readonly RideCurve[]): PeriodSummary {
  const curve = combineCurves(rides.map((ride) => ride.curve));
  const at = (duration: number) => curve.find((p) => p.duration === duration)?.power ?? null;
  const best = Object.fromEntries(
    Object.entries(REFERENCE).map(([key, duration]) => [key, at(duration)]),
  ) as PeriodSummary['best'];
  let fit: PeriodSummary['fit'] = null;
  try {
    const { cp, wPrime, r2, cpSe } = estimateCriticalPower(curve);
    fit = { cp, wPrime, r2, cpSe };
  } catch {
    fit = null;
  }
  return { label, rides: rides.length, best, fit };
}

/** One summary per calendar year, oldest first. */
export function byYear(rides: readonly RideCurve[]): PeriodSummary[] {
  const groups = new Map<string, RideCurve[]>();
  for (const ride of rides) {
    const year = ride.start.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), ride]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, group]) => summarisePeriod(year, group));
}

/** Rides that started in the `days` days up to and including `end`. */
export function window(rides: readonly RideCurve[], end: Date, days: number): RideCurve[] {
  const from = end.getTime() - days * 86_400_000;
  return rides.filter((ride) => {
    const t = Date.parse(ride.start);
    return t > from && t <= end.getTime();
  });
}
