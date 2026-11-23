# endurance-lab

Endurance-training analytics in TypeScript, from device files to physiological models.

I'm a long-distance triathlete and a PhD student in sports biomechanics. This repository turns the
physiology I use every day (critical power, W′, durability, training load) into typed, tested and
benchmarked code.

> **Status: v0.1.** The models package is complete and tested. FIT-file ingestion, the database and
> the API come next (see the [roadmap](#roadmap)).

## What's inside

`@endurance-lab/models` is a dependency-free library of pure functions. It takes power sampled at
1 Hz and returns plain objects.

| Functions                                                            | What they compute                                                                     | References                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `meanMaxPower`, `monotoneEnvelope`, `combineCurves`                  | Mean-maximal power curve, O(n) per duration                                           |                                                          |
| `fitCpHyperbolic`, `fitCpLinear`, `fitCp3`, `estimateCriticalPower`  | Critical power and W′ (2- and 3-parameter models), from tests or from everyday riding | Monod & Scherrer 1965; Moritani et al. 1981; Morton 1996 |
| `analyzeAllOutTest`                                                  | CP and W′ from a 3-minute all-out test                                                | Vanhatalo et al. 2007                                    |
| `wPrimeBalanceIntegral`, `wPrimeBalanceDifferential`                 | W′ balance, second by second                                                          | Skiba et al. 2012, 2015                                  |
| `durabilityProfile`                                                  | Best efforts after X kJ (or kJ/kg) of work                                            | Maunder et al. 2021                                      |
| `detectIntervals`                                                    | Sustained efforts, boundaries exact to the second                                     |                                                          |
| `normalizedPower`, `stressScore`, `sessionRpeLoad`                   | Session load from power or from RPE                                                   | Allen & Coggan; Foster et al. 2001                       |
| `acwrEwma`, `acwrRolling`, `monotonyStrain`, `performanceManagement` | Load across days and weeks: ACWR, monotony and strain, CTL/ATL/TSB                    | Williams et al. 2017; Foster 1998; Banister et al. 1975  |
| `intensityDomain`, `timeInDomains`                                   | Moderate, heavy and severe domains                                                    |                                                          |

Equations, assumptions and limits are in [docs/science.md](docs/science.md).

## Quick start

Requires Node.js 22+ and pnpm.

```sh
pnpm install
pnpm check    # lint, types, tests with coverage, build
pnpm bench    # mean-maximal power benchmark
```

```ts
import {
  detectIntervals,
  durabilityProfile,
  estimateCriticalPower,
  meanMaxPower,
  wPrimeBalanceDifferential,
} from '@endurance-lab/models';

// `ride`: power at 1 Hz, in watts (number[] or Float64Array)
const fit = estimateCriticalPower(meanMaxPower(ride)); // { cp, wPrime, r2, cpSe, … }
const { min, minAt } = wPrimeBalanceDifferential(ride, fit); // how deep into W′, and when
const efforts = detectIntervals(ride, { threshold: 0.9 * fit.cp });
const durability = durabilityProfile(ride, { workThresholds: [0, 10, 20, 30], massKg: 80 });
```

## My lab numbers

These values come from tests in a university exercise-physiology lab. They are the reference for
the field estimates that ingestion (v0.2) will compute from my training files.

| Test                                     | Measure                         | Value            |
| ---------------------------------------- | ------------------------------- | ---------------- |
| Incremental, 5-min stages, blood lactate | First lactate threshold (LT1)   | 245 W            |
|                                          | Second lactate threshold (LT2)  | 305 W            |
| Ramp to exhaustion, +25 W/min            | Peak power                      | 425 W            |
|                                          | VO2max                          | 61 mL·kg⁻¹·min⁻¹ |
| 3-min all-out                            | Critical power (end-test power) | 330 W            |
| Training files, no test                  | Critical power and W′           | v0.2             |

With LT1 and CP as boundaries, `intensityDomain` gives: moderate below 245 W, heavy from 245 to
330 W, severe above 330 W.

The lab's own zones put the heavy/severe boundary at LT2, 305 W, which is 25 W below the CP from the
3-min test. A gap of that size is plausible: the maximal lactate steady state usually sits a little
below CP (Jones et al., 2019), and the 3-min test is itself an estimate of CP. A fit over months of
real riding will be the third opinion.

## Engineering notes

- **Strict TypeScript.** `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are
  on, and there is no `any`. Invalid input throws a typed `ModelInputError`.
- **Tests that check the science.** 90 tests and 100 % line coverage. Every model is tested on
  synthetic data whose answer is known. For example, a trace generated with CP = 330 W and
  W′ = 20 kJ must give those values back, and W′ balance must reach zero exactly at the time to
  exhaustion that the CP model predicts.
- **Property-based tests.** fast-check generates thousands of random rides. Writing these tests
  showed that a mean-maximal power curve is not monotone in general: `[10, 0, 10]` holds 5 W over
  2 s but 6.7 W over 3 s. So the tests assert properties that do always hold: the best work never
  decreases with duration, MMP(k·d) ≤ MMP(d), and the fast implementation agrees with a naive
  reference one. For the same reason, fitting goes through `monotoneEnvelope`.
- **Measured performance.** On a 6-hour ride at 1 Hz (21,600 samples, 5 durations), prefix sums
  take 0.23 ms against 38.5 ms for direct window sums, about 170 times faster (Node 26, laptop).
- **CI.** GitHub Actions runs lint (Biome), type checking, tests with coverage thresholds and the
  build on every push and pull request.
- **Decisions are written down** in [docs/adr](docs/adr).

## Roadmap

- [x] **v0.1, models.** Power–duration curve, CP and W′, 3-min test, W′ balance, durability,
      intervals, load.
- [ ] **v0.2, ingestion.** FIT decoding and cleaning, streams stored as Parquet, PostgreSQL with
      Drizzle, a Hono API with idempotent uploads.
- [ ] **v0.3, dashboard.** Power–duration curve with the fitted model, W′ balance per session,
      durability, load.
- [ ] **Multisport.** Critical speed and D′ for running, critical swim speed.
- [ ] **Later.** The pipeline in Effect, and an MCP server over the metrics.

## License

[MIT](LICENSE)
