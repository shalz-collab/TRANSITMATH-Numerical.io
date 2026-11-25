export type ObservationPresetId = 'pdf_rounded' | 'exact_model' | 'heavy_peak' | 'custom';

export type InterpolationMethodId = 'exact' | 'newton' | 'natural_spline' | 'clamped_spline';

export interface ObservationPreset {
  id: ObservationPresetId;
  label: string;
  description: string;
  times: number[];
  headways: number[];
  usesExactModel: boolean;
}

export const OBSERVATION_TIMES = [0, 1, 2, 3, 4];

export const OBSERVATION_PRESETS: Record<Exclude<ObservationPresetId, 'custom'>, ObservationPreset> = {
  pdf_rounded: {
    id: 'pdf_rounded',
    label: 'PDF Rounded Data (0.1 min)',
    description: 'Hourly GTFS-style observations rounded to 0.1 min from the capstone dataset.',
    times: [0, 1, 2, 3, 4],
    headways: [10.0, 7.2, 6.0, 7.2, 10.0],
    usesExactModel: true,
  },
  exact_model: {
    id: 'exact_model',
    label: 'Exact Analytical Samples',
    description: 'Unrounded samples from h(t) = 10 - 4·sin(πt/4) at t = 0, 1, 2, 3, 4 h.',
    times: [0, 1, 2, 3, 4],
    headways: [
      10.0,
      Number((10 - 4 * Math.sin(Math.PI / 4)).toFixed(6)),
      6.0,
      Number((10 - 4 * Math.sin((3 * Math.PI) / 4)).toFixed(6)),
      10.0,
    ],
    usesExactModel: true,
  },
  heavy_peak: {
    id: 'heavy_peak',
    label: 'Heavy Congestion Surge',
    description: 'High morning dispersion at 7 AM (12.0 min) tightening to 5.2 min at 9 AM.',
    times: [0, 1, 2, 3, 4],
    headways: [12.0, 7.8, 5.2, 7.5, 11.5],
    usesExactModel: false,
  },
};

export interface CorridorStation {
  id: string;
  name: string;
  km: number;
  zone: string;
  coordLabel: string;
  lat: number;
  lng: number;
}

export interface MtcRouteDefinition {
  id: string;
  label: string;
  corridorLengthKm: number;
  corridorDurationMin: number;
  monitoredStationIndex: number;
  stations: CorridorStation[];
}

export const MTC_ROUTES: MtcRouteDefinition[] = [
  {
    id: '570',
    label: 'MTC 570 · SIMATS – CMBT',
    corridorLengthKm: 24.0,
    corridorDurationMin: 36,
    monitoredStationIndex: 1,
    stations: [
      { id: 'st-1', name: 'SIMATS Gate', km: 0.0, zone: 'West Corridor', coordLabel: '13.026°N, 80.017°E', lat: 13.026, lng: 80.017 },
      { id: 'st-2', name: 'Poonamallee', km: 5.4, zone: 'Outer Hub', coordLabel: '13.047°N, 80.095°E', lat: 13.047, lng: 80.095 },
      { id: 'st-3', name: 'Porur', km: 12.6, zone: 'Arterial Junction', coordLabel: '13.038°N, 80.158°E', lat: 13.038, lng: 80.158 },
      { id: 'st-4', name: 'Guindy', km: 18.8, zone: 'South Interchange', coordLabel: '13.008°N, 80.212°E', lat: 13.008, lng: 80.212 },
      { id: 'st-5', name: 'CMBT', km: 24.0, zone: 'Central Terminal', coordLabel: '13.069°N, 80.205°E', lat: 13.069, lng: 80.205 },
    ],
  },
  {
    id: '27B',
    label: 'MTC 27B · CMBT – Anna Sq.',
    corridorLengthKm: 14.5,
    corridorDurationMin: 36,
    monitoredStationIndex: 1,
    stations: [
      { id: 'st-1', name: 'CMBT', km: 0.0, zone: 'Central Terminal', coordLabel: '13.069°N, 80.205°E', lat: 13.069, lng: 80.205 },
      { id: 'st-2', name: 'Aminjikarai', km: 3.8, zone: 'Midtown West', coordLabel: '13.071°N, 80.224°E', lat: 13.071, lng: 80.224 },
      { id: 'st-3', name: 'Egmore', km: 8.2, zone: 'Rail Interchange', coordLabel: '13.073°N, 80.261°E', lat: 13.073, lng: 80.261 },
      { id: 'st-4', name: 'Chepauk', km: 11.9, zone: 'Marina Corridor', coordLabel: '13.063°N, 80.281°E', lat: 13.063, lng: 80.281 },
      { id: 'st-5', name: 'Anna Square', km: 14.5, zone: 'Beach Terminus', coordLabel: '13.068°N, 80.285°E', lat: 13.068, lng: 80.285 },
    ],
  },
  {
    id: '102',
    label: 'MTC 102 · Broadway – Kelambakkam',
    corridorLengthKm: 34.2,
    corridorDurationMin: 36,
    monitoredStationIndex: 1,
    stations: [
      { id: 'st-1', name: 'Broadway', km: 0.0, zone: 'North Terminus', coordLabel: '13.090°N, 80.283°E', lat: 13.090, lng: 80.283 },
      { id: 'st-2', name: 'Adyar', km: 10.6, zone: 'South Gateway', coordLabel: '13.001°N, 80.256°E', lat: 13.001, lng: 80.256 },
      { id: 'st-3', name: 'SRP Tools', km: 16.4, zone: 'OMR Entry', coordLabel: '12.978°N, 80.251°E', lat: 12.978, lng: 80.251 },
      { id: 'st-4', name: 'Sholinganallur', km: 24.8, zone: 'IT Corridor', coordLabel: '12.901°N, 80.228°E', lat: 12.901, lng: 80.228 },
      { id: 'st-5', name: 'Kelambakkam', km: 34.2, zone: 'Outer South', coordLabel: '12.789°N, 80.221°E', lat: 12.789, lng: 80.221 },
    ],
  },
];

export const DATASET_PROVENANCE = {
  title: 'UBA1024 Morning Peak Headway Sample Dataset (7:00 AM – 11:00 AM)',
  originSummary:
    'Hourly bus arrival headway intervals taken from the UBA1024 Numerical Methods Capstone reference route model h(t) = 10 − 4·sin(πt/4), discretized at t = 0, 1, 2, 3, 4 h and rounded to 0.1 min to represent GPS / Automated Vehicle Location (AVL) stop-time logs.',
  standards: [
    'GTFS (MobilityData) — stop_times.txt arrival_time & departure_time headway fields',
    'AIS-140 (ARAI / AISC, India) — public transit GPS/AVL telemetry frame structure',
    'IEEE 754-2019 — double-precision floating-point representation for all interpolants',
  ],
  window: '07:00:00 AM to 11:00:00 AM (t ∈ [0, 4] hours)',
  samplingInterval: '1.0 hour discrete knots (5 observed points: 10.0, 7.2, 6.0, 7.2, 10.0 min)',
  academicSource: 'SIMATS Engineering · Department of Mathematics / UBA1024 Capstone (2026–2027)',
};

// Exact analytical model from UBA1024 Capstone Presentation
export function exactHeadway(t: number): number {
  return 10 - 4 * Math.sin((Math.PI * t) / 4);
}

export function exactHeadwayDerivative(t: number): number {
  return -Math.PI * Math.cos((Math.PI * t) / 4);
}

export function exactAverageWait(cv = 0): number {
  const baseWait = 5 - 4 / Math.PI; // (1/4) * integral_0^4 (h(t)/2) dt = 3.726760455...
  return baseWait * (1 + cv * cv);
}

export function exactTargetRoot(targetHeadway: number): number | null {
  const ratio = (10 - targetHeadway) / 4;
  if (ratio < -1 || ratio > 1) return null;
  return (4 / Math.PI) * Math.asin(ratio);
}

// ============================================================================
// Objective 1: Newton Divided-Difference Interpolation
// ============================================================================
export interface DividedDifferenceResult {
  times: number[];
  table: number[][]; // table[i][j] = j-th order divided difference starting at i
  coefficients: number[]; // Newton form coefficients: table[0][0..n-1]
}

export function buildDividedDifferenceTable(times: number[], values: number[]): DividedDifferenceResult {
  const n = times.length;
  const table: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    table[i][0] = values[i];
  }
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < n - j; i++) {
      table[i][j] = (table[i + 1][j - 1] - table[i][j - 1]) / (times[i + j] - times[i]);
    }
  }
  const coefficients = table[0].slice();
  return { times, table, coefficients };
}

export function evaluateNewtonPolynomial(dd: DividedDifferenceResult, t: number): number {
  const { times, coefficients } = dd;
  const n = coefficients.length;
  // Nested Horner-like evaluation from highest degree down
  let result = coefficients[n - 1];
  for (let k = n - 2; k >= 0; k--) {
    result = result * (t - times[k]) + coefficients[k];
  }
  return result;
}

export function evaluateNewtonDerivative(dd: DividedDifferenceResult, t: number): number {
  const h = 1e-6;
  return (evaluateNewtonPolynomial(dd, t + h) - evaluateNewtonPolynomial(dd, t - h)) / (2 * h);
}

// ============================================================================
// Extension 3: Natural & Clamped Cubic Spline Interpolation
// ============================================================================
export interface CubicSplineSegment {
  x0: number;
  x1: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export function buildCubicSpline(
  x: number[],
  y: number[],
  mode: 'natural' | 'clamped',
  clampedSlopes: [number, number] = [-Math.PI, Math.PI]
): CubicSplineSegment[] {
  const n = x.length - 1;
  const h: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    h[i] = x[i + 1] - x[i];
  }

  const alpha: number[] = Array(n + 1).fill(0);
  if (mode === 'clamped') {
    alpha[0] = (3 * (y[1] - y[0])) / h[0] - 3 * clampedSlopes[0];
    alpha[n] = 3 * clampedSlopes[1] - (3 * (y[n] - y[n - 1])) / h[n - 1];
  }
  for (let i = 1; i < n; i++) {
    alpha[i] = (3 / h[i]) * (y[i + 1] - y[i]) - (3 / h[i - 1]) * (y[i] - y[i - 1]);
  }

  const l: number[] = Array(n + 1).fill(0);
  const mu: number[] = Array(n + 1).fill(0);
  const z: number[] = Array(n + 1).fill(0);

  if (mode === 'natural') {
    l[0] = 1;
    mu[0] = 0;
    z[0] = 0;
  } else {
    l[0] = 2 * h[0];
    mu[0] = 0.5;
    z[0] = alpha[0] / l[0];
  }

  for (let i = 1; i < n; i++) {
    l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  const c: number[] = Array(n + 1).fill(0);
  const b: number[] = Array(n).fill(0);
  const d: number[] = Array(n).fill(0);

  if (mode === 'natural') {
    l[n] = 1;
    z[n] = 0;
    c[n] = 0;
  } else {
    l[n] = h[n - 1] * (2 - mu[n - 1]);
    z[n] = (alpha[n] - h[n - 1] * z[n - 1]) / l[n];
    c[n] = z[n];
  }

  for (let j = n - 1; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (y[j + 1] - y[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  const segments: CubicSplineSegment[] = [];
  for (let i = 0; i < n; i++) {
    segments.push({
      x0: x[i],
      x1: x[i + 1],
      a: y[i],
      b: b[i],
      c: c[i],
      d: d[i],
    });
  }
  return segments;
}

export function evaluateCubicSpline(segments: CubicSplineSegment[], t: number): number {
  const clampedT = Math.max(segments[0].x0, Math.min(segments[segments.length - 1].x1, t));
  let seg = segments[segments.length - 1];
  for (let i = 0; i < segments.length; i++) {
    if (clampedT <= segments[i].x1) {
      seg = segments[i];
      break;
    }
  }
  const dx = clampedT - seg.x0;
  return seg.a + seg.b * dx + seg.c * dx * dx + seg.d * dx * dx * dx;
}

export function evaluateCubicSplineDerivative(segments: CubicSplineSegment[], t: number): number {
  const clampedT = Math.max(segments[0].x0, Math.min(segments[segments.length - 1].x1, t));
  let seg = segments[segments.length - 1];
  for (let i = 0; i < segments.length; i++) {
    if (clampedT <= segments[i].x1) {
      seg = segments[i];
      break;
    }
  }
  const dx = clampedT - seg.x0;
  return seg.b + 2 * seg.c * dx + 3 * seg.d * dx * dx;
}

export function computeMaxErrorAgainstExact(fn: (t: number) => number, samples = 2000): { maxError: number; atTime: number } {
  let maxError = 0;
  let atTime = 0;
  for (let i = 0; i <= samples; i++) {
    const t = (4 * i) / samples;
    const err = Math.abs(fn(t) - exactHeadway(t));
    if (err > maxError) {
      maxError = err;
      atTime = t;
    }
  }
  return { maxError, atTime };
}

// ============================================================================
// Objective 2 & Extension 2: Numerical Integration of W(t) = (h(t)/2)*(1+CV^2)
// ============================================================================
export interface IntegrationComparisonRow {
  method: string;
  panels: number;
  avgWaitMin: number;
  totalWaitArea: number;
  absError: number | null;
  relErrorPct: number | null;
  applicable: boolean;
  note: string;
}

export function integrateTrapezoidal(fn: (t: number) => number, a: number, b: number, n: number): number {
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    sum += 2 * fn(a + i * h);
  }
  return (h / 2) * sum;
}

export function integrateSimpsonsOneThird(fn: (t: number) => number, a: number, b: number, n: number): number | null {
  if (n % 2 !== 0 || n < 2) return null;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    sum += (i % 2 === 1 ? 4 : 2) * fn(a + i * h);
  }
  return (h / 3) * sum;
}

export function integrateSimpsonsThreeEighth(fn: (t: number) => number, a: number, b: number, n: number): number | null {
  if (n % 3 !== 0 || n < 3) return null;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    sum += (i % 3 === 0 ? 2 : 3) * fn(a + i * h);
  }
  return ((3 * h) / 8) * sum;
}

export interface RombergResult {
  matrix: number[][]; // R[k][j] where row k has n = 2^k panels
  panelsPerRow: number[];
  bestEstimate: number;
}

export function computeRombergAverageWait(fn: (t: number) => number, a: number, b: number, maxLevel = 4): RombergResult {
  // maxLevel = 4 => rows k = 0,1,2,3,4 corresponding to n = 1, 2, 4, 8, 16 panels
  const R: number[][] = Array.from({ length: maxLevel + 1 }, () => []);
  const panelsPerRow: number[] = [];
  const duration = b - a;

  for (let k = 0; k <= maxLevel; k++) {
    const n = Math.pow(2, k);
    panelsPerRow.push(n);
    // Average wait = (1 / (b - a)) * integral_a^b W(t) dt
    R[k][0] = integrateTrapezoidal(fn, a, b, n) / duration;
    for (let j = 1; j <= k; j++) {
      const factor = Math.pow(4, j);
      R[k][j] = (factor * R[k][j - 1] - R[k - 1][j - 1]) / (factor - 1);
    }
  }

  return {
    matrix: R,
    panelsPerRow,
    bestEstimate: R[maxLevel][maxLevel],
  };
}

// ============================================================================
// Objective 3 & Extension 1: Root Finding for h(t*) = target
// ============================================================================
export interface RootIterationStep {
  iteration: number;
  approximation: number;
  stepError: number;
  trueError: number | null;
  fValue: number;
}

export interface RootSolverSummary {
  method: 'Newton-Raphson' | 'Secant' | 'Bisection';
  converged: boolean;
  root: number | null;
  iterations: number;
  steps: RootIterationStep[];
  reason?: string;
}

export function solveNewtonRaphson(
  f: (t: number) => number,
  df: (t: number) => number,
  x0: number,
  tol: number,
  exactRootVal: number | null,
  maxIter = 50
): RootSolverSummary {
  const steps: RootIterationStep[] = [];
  let x = x0;

  for (let k = 1; k <= maxIter; k++) {
    const fx = f(x);
    const dfx = df(x);
    if (Math.abs(dfx) < 1e-12) {
      return {
        method: 'Newton-Raphson',
        converged: false,
        root: null,
        iterations: k - 1,
        steps,
        reason: 'Derivative near zero; try a different initial guess.',
      };
    }
    const xNew = x - fx / dfx;
    const stepError = Math.abs(xNew - x);
    const trueError = exactRootVal !== null ? Math.abs(xNew - exactRootVal) : null;
    steps.push({
      iteration: k,
      approximation: xNew,
      stepError,
      trueError,
      fValue: f(xNew),
    });
    if (stepError < tol) {
      return {
        method: 'Newton-Raphson',
        converged: true,
        root: xNew,
        iterations: k,
        steps,
      };
    }
    x = xNew;
  }

  return {
    method: 'Newton-Raphson',
    converged: false,
    root: x,
    iterations: maxIter,
    steps,
    reason: 'Maximum iterations reached without meeting tolerance.',
  };
}

export function solveSecant(
  f: (t: number) => number,
  x0: number,
  x1: number,
  tol: number,
  exactRootVal: number | null,
  maxIter = 50
): RootSolverSummary {
  const steps: RootIterationStep[] = [];
  let prev = x0;
  let curr = x1;
  let fPrev = f(prev);
  let fCurr = f(curr);

  for (let k = 1; k <= maxIter; k++) {
    const denom = fCurr - fPrev;
    if (Math.abs(denom) < 1e-14) {
      return {
        method: 'Secant',
        converged: false,
        root: null,
        iterations: k - 1,
        steps,
        reason: 'Secant denominator approached zero.',
      };
    }
    const next = curr - fCurr * ((curr - prev) / denom);
    const stepError = Math.abs(next - curr);
    const trueError = exactRootVal !== null ? Math.abs(next - exactRootVal) : null;
    steps.push({
      iteration: k,
      approximation: next,
      stepError,
      trueError,
      fValue: f(next),
    });
    if (stepError < tol) {
      return {
        method: 'Secant',
        converged: true,
        root: next,
        iterations: k,
        steps,
      };
    }
    prev = curr;
    fPrev = fCurr;
    curr = next;
    fCurr = f(curr);
  }

  return {
    method: 'Secant',
    converged: false,
    root: curr,
    iterations: maxIter,
    steps,
    reason: 'Maximum iterations reached.',
  };
}

export function solveBisection(
  f: (t: number) => number,
  aInit: number,
  bInit: number,
  tol: number,
  exactRootVal: number | null,
  maxIter = 60
): RootSolverSummary {
  const steps: RootIterationStep[] = [];
  let a = aInit;
  let b = bInit;
  let fa = f(a);
  const fb = f(b);

  if (fa * fb > 0) {
    return {
      method: 'Bisection',
      converged: false,
      root: null,
      iterations: 0,
      steps: [],
      reason: `Interval [${a.toFixed(2)}, ${b.toFixed(2)}] does not bracket a root (f(a)·f(b) > 0).`,
    };
  }

  let prevMid = a;
  for (let k = 1; k <= maxIter; k++) {
    const mid = (a + b) / 2;
    const fMid = f(mid);
    const halfWidth = (b - a) / 2;
    const stepError = k === 1 ? halfWidth : Math.abs(mid - prevMid);
    const trueError = exactRootVal !== null ? Math.abs(mid - exactRootVal) : null;

    steps.push({
      iteration: k,
      approximation: mid,
      stepError: halfWidth,
      trueError,
      fValue: fMid,
    });

    if (halfWidth < tol || Math.abs(fMid) < 1e-14) {
      return {
        method: 'Bisection',
        converged: true,
        root: mid,
        iterations: k,
        steps,
      };
    }

    if (fa * fMid < 0) {
      b = mid;
    } else {
      a = mid;
      fa = fMid;
    }
    prevMid = mid;
  }

  return {
    method: 'Bisection',
    converged: false,
    root: (a + b) / 2,
    iterations: maxIter,
    steps,
    reason: 'Maximum bisection steps reached.',
  };
}

// ============================================================================
// Formatting Helpers
// ============================================================================
export function formatClockTime(tHours: number, includeSeconds = true): string {
  const clamped = Math.max(0, Math.min(4, tHours));
  const totalSeconds = Math.round(7 * 3600 + clamped * 3600);
  const hours24 = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 > 12 ? hours24 - 12 : hours24;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return includeSeconds ? `${hours12}:${mm}:${ss} ${period}` : `${hours12}:${mm} ${period}`;
}

export function formatSci(val: number): string {
  if (val === 0) return '0.00';
  if (Math.abs(val) >= 1e-3 && Math.abs(val) < 1000) {
    return val.toFixed(6);
  }
  const exp = Math.floor(Math.log10(Math.abs(val)));
  const mantissa = val / Math.pow(10, exp);
  return `${mantissa.toFixed(2)}e${exp}`;
}
