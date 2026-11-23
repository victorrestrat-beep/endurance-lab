# ADR 0002: Models are pure functions over 1 Hz arrays

- Status: accepted
- Date: 2026-11-23

## Context

The same model will run in a pipeline on a six-hour ride, in an API request and in the browser while
a coach drags a slider. Device files differ in sampling rate and in how they encode pauses and
dropouts.

## Decision

- `@endurance-lab/models` has **no runtime dependencies and no I/O**. Every function is synchronous
  and pure: arrays in, plain objects out.
- Inputs are **1 Hz series in SI units** (seconds, watts, joules). Any `ArrayLike<number>` is
  accepted, so callers can pass a `number[]` or a `Float64Array`. Resampling, gap filling and spike
  removal happen once, at ingestion; `sanitizePower` is the last line of defence.
- Invalid input throws a **`ModelInputError`** whose message names the offending value. A result
  that may be undefined, such as the normalized power of a 10-s ride or the monotony of a week where
  every day carries the same load, is `null`, never `NaN`.
- Numeric kernels use **prefix sums over `Float64Array`**. Where a loop bound already keeps an index
  in range, the code uses a non-null assertion (`prefix[i]!`) instead of a runtime check;
  `noUncheckedIndexedAccess` stays on everywhere else.

## Consequences

- The models are simple to test and benchmark, and they run unchanged in Node, in a worker or in the
  browser.
- Callers must resample to 1 Hz first. A model that needs higher-rate data, such as torque within a
  pedal stroke, will take an explicit sample-rate parameter.
