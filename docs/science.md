# Science notes

Every function takes power sampled at 1 Hz, in watts, and works in SI units: seconds, watts and
joules. Resampling and cleaning happen before the models run (see `sanitizePower`).

## Power–duration relationship

### Mean-maximal power

For each duration $d$, mean-maximal power (MMP) is the highest mean power over any window of $d$
seconds. With prefix sums $S_i = \sum_{j<i} P_j$, each window's mean costs O(1), so each duration
costs O(n).

MMP is **not** monotone in general: the series $[10, 0, 10]$ gives 5 W over 2 s and 6.7 W over
3 s. Two properties always hold, and the tests check both:

- the best work, $d \cdot \mathrm{MMP}(d)$, never decreases with $d$ when power is non-negative;
- $\mathrm{MMP}(kd) \le \mathrm{MMP}(d)$ for any integer $k \ge 1$, because a window of $kd$ seconds
  splits into $k$ windows of $d$ seconds.

An athlete's capability curve, on the other hand, is monotone. Before a model is fitted,
`monotoneEnvelope` replaces each power with the best power held for that duration or longer.

### Critical power

The two-parameter model:

$$P(t) = CP + \frac{W'}{t} \qquad\Longleftrightarrow\qquad W(t) = CP \cdot t + W'$$

`fitCpHyperbolic` regresses $P$ on $1/t$ (Moritani et al., 1981) and `fitCpLinear` regresses work
on $t$ (Monod & Scherrer, 1965). Both return standard errors for CP and W′. $R^2$ and RMSE are
computed on power for every model, so fits can be compared.

The three-parameter model (Morton, 1996) adds a maximal power $P_{max}$:

$$P(t) = CP + \frac{W'}{t + k}, \qquad k = \frac{W'}{P_{max} - CP}$$

For a fixed $k$ the model is linear in CP and W′. `fitCp3` therefore solves those two by least
squares and searches only $k$: first on a grid, then by golden-section refinement. This is variable
projection; it needs no starting guess and cannot diverge. $P_{max}$ is only identifiable when the
data include short efforts, about a minute or less.

Time to exhaustion at a constant power $P > CP$ is $t_{lim} = W'/(P - CP)$, minus $k$ for the
three-parameter model.

### From training data, without a test

`estimateCriticalPower` fits the envelope of the best efforts between 3 and 20 min (by default).
The result is a lower bound: it is only as good as the hardest efforts in the data. Combine several
weeks of rides with `combineCurves` before fitting.

## 3-minute all-out test

After about 150 s of all-out effort, W′ is spent and power settles at CP (Vanhatalo, Doust &
Burnley, 2007):

- end-test power, $EP$, is the mean power of the final 30 s and estimates CP;
- the work done above it, $WEP = \int \max(P - EP, 0)\,dt$, estimates W′.

In the idealised exponential trace used by the tests, a few watts of the decay remain in the final
30 s. As a result, EP reads about 1 % high and WEP about 3 % low.

## W′ balance

**Integral model** (Skiba et al., 2012):

$$W'_{bal}(t) = W' - \sum_{u \le t} \max(P_u - CP, 0)\, e^{-(t-u)/\tau}, \qquad \tau = 546\, e^{-0.01\, D_{CP}} + 316$$

$D_{CP}$ is CP minus the mean power of the session's seconds below CP. Because $\tau$ is constant
within a session, the sum is computed recursively, in O(n).

**Differential model** (Skiba et al., 2015). Above CP, W′ drains joule for joule:
$W'_{bal} \leftarrow W'_{bal} - (P - CP)$. Below CP, it refills:
$W'_{bal} \leftarrow W' - (W' - W'_{bal})\, e^{-(CP - P)/W'}$.

Under constant power, the differential model reaches zero exactly at $t_{lim}$, which the tests
check. A balance below zero means the session beat the model: CP or W′ is probably underestimated.

## Durability

Durability is the ability to keep power as fatigue builds (Maunder et al., 2021).
`durabilityProfile` recomputes the best efforts using only the part of the ride after $X$ kJ, or
$X$ kJ/kg, of accumulated work. Each effort is also given relative to its fresh value. A later
window is a subset of the whole ride, so a fatigued value can never exceed the fresh one; this is
tested as a property.

## Interval detection

1. Smooth power with a centred 10-s moving average, and keep the runs above a threshold (for
   example 90 % of CP).
2. Snap each run's edges to the raw samples, so boundaries are exact to the second.
3. Bridge drops of up to 10 s (a gear change, a junction), then discard efforts shorter than 30 s.

## Training load

- **Normalized power**: the fourth-power mean of the 30-s moving average $\bar P_{30}$,
  $NP = \left(\frac{1}{n-29}\sum_i \bar P_{30,i}^{\,4}\right)^{1/4}$ (Allen & Coggan).
- **Intensity factor**: $IF = NP / CP$.
- **Stress score**: $100 \cdot \dfrac{t \cdot NP \cdot IF}{CP \cdot 3600}$, which equals 100 for
  one hour at CP. This is the training stress score formula, computed against CP rather than FTP.
  Normalized Power, Intensity Factor and Training Stress Score are trademarks of Peaksware; this
  library uses the published formulas under descriptive names.
- **Session RPE**: RPE on the CR-10 scale × minutes (Foster et al., 2001).
- **Acute:chronic workload ratio**: computed either from exponentially weighted averages with
  $\alpha = 2/(N+1)$ over 7 and 28 days (Williams et al., 2017), or from coupled rolling means. It
  describes recent changes in load. It is not a validated injury predictor (Impellizzeri et al.,
  2020).
- **Monotony and strain** (Foster, 1998): mean daily load over 7 days divided by its population
  standard deviation; strain is weekly load × monotony.
- **CTL, ATL and TSB** (Banister et al., 1975): exponentially weighted averages with
  $k = 1 - e^{-1/\tau}$, where $\tau$ = 42 days for CTL and 7 days for ATL. TSB is the previous
  day's CTL minus its ATL.

## Intensity domains

- **Moderate**: below the first threshold (LT1, GET or VT1).
- **Heavy**: from the first threshold up to CP.
- **Severe**: above CP. W′ is being used and $\dot{V}O_2$ drifts towards its maximum.

## References

- Allen H, Coggan AR. _Training and Racing with a Power Meter_. VeloPress.
- Banister EW, Calvert TW, Savage MV, Bach T (1975). A systems model of training for athletic
  performance. _Aust J Sports Med_ 7:57–61.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. _Med
  Sci Sports Exerc_ 30:1164–1168.
- Foster C, Florhaug JA, Franklin J, et al. (2001). A new approach to monitoring exercise training.
  _J Strength Cond Res_ 15:109–115.
- Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ (2020). Acute:chronic workload ratio:
  conceptual issues and fundamental pitfalls. _Int J Sports Physiol Perform_ 15:907–913.
- Jones AM, Burnley M, Black MI, Poole DC, Vanhatalo A (2019). The maximal metabolic steady state:
  redefining the "gold standard". _Physiol Rep_ 7:e14098.
- Maunder E, Seiler S, Mildenhall MJ, Kilding AE, Plews DJ (2021). The importance of "durability"
  in the physiological profiling of endurance athletes. _Sports Med_ 51:1619–1628.
- Monod H, Scherrer J (1965). The work capacity of a synergic muscular group. _Ergonomics_
  8:329–338.
- Moritani T, Nagata A, deVries HA, Muro M (1981). Critical power as a measure of physical work
  capacity and anaerobic threshold. _Ergonomics_ 24:339–350.
- Morton RH (1996). A 3-parameter critical power model. _Ergonomics_ 39:611–619.
- Skiba PF, Chidnok W, Vanhatalo A, Jones AM (2012). Modeling the expenditure and reconstitution of
  work capacity above critical power. _Med Sci Sports Exerc_ 44:1526–1532.
- Skiba PF, Fulford J, Clarke DC, Vanhatalo A, Jones AM (2015). Intramuscular determinants of the
  ability to recover work capacity above critical power. _Eur J Appl Physiol_ 115:703–713.
- Vanhatalo A, Doust JH, Burnley M (2007). Determination of critical power using a 3-min all-out
  cycling test. _Med Sci Sports Exerc_ 39:548–555.
- Williams S, West S, Cross MJ, Stokes KA (2017). Better way to determine the acute:chronic workload
  ratio? _Br J Sports Med_ 51:209–210.
