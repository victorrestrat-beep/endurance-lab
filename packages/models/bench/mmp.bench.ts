import { test } from 'vitest';
import { meanMaxPower, naiveMeanMaxPower } from '../src/mmp.js';
import { addNoise, constant } from '../src/synthetic.js';

// A 6-hour ride at 1 Hz: 21,600 samples.
const ride = addNoise(constant(220, 6 * 3600), 60, 42);
const durations = [5, 60, 300, 1200, 3600];

test('mean-maximal power, 6 h ride at 1 Hz, 5 durations', async ({ bench }) => {
  await bench.compare(
    bench('prefix sums, O(n) per duration', () => {
      meanMaxPower(ride, durations);
    }),
    bench('naive window sums, O(n·d) per duration', () => {
      naiveMeanMaxPower(ride, durations);
    }),
  );
});
