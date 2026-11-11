import type { MetricKey } from '../types';
import type { NormalizedRunData } from './normalize';

const chartNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 7,
});

export const METRICS: readonly MetricKey[] = [
  'loss',
  'grad_norm',
  'lr',
];

export interface StepRange {
  start: number;
  end: number;
}

export interface MetricStats {
  latest: number | null;
  min: number | null;
  max: number | null;
  maxStep: number | null;
  finiteCount: number;
  invalidCount: number;
  nonPositiveCount: number;
}

export interface RunPayload {
  data: NormalizedRunData;
  stats: Record<MetricKey, MetricStats>;
  prepared?: PreparedFrames;
}

export interface PreparedFrames {
  bucketCount: number;
  metrics: Record<MetricKey, MetricFrame>;
  navigator: MetricFrame;
}

export function plotBucketCount(width: number): number {
  return Math.max(1, Math.floor((width - 86) / 3));
}

export function prepareFrames(data: NormalizedRunData, bucketCount: number): PreparedFrames {
  const range = {
    start: data.step[0] ?? 0,
    end: data.step[data.step.length - 1] ?? 0,
  };
  return {
    bucketCount,
    metrics: {
      loss: aggregateMetric(data, 'loss', range, bucketCount),
      grad_norm: aggregateMetric(data, 'grad_norm', range, bucketCount),
      lr: aggregateMetric(data, 'lr', range, bucketCount),
    },
    navigator: aggregateMetric(data, 'loss', range, 120),
  };
}

export type RunDataMessage =
  | {
      type: 'ready';
      runId: string;
      payload: RunPayload;
    }
  | {
      type: 'error';
      runId: string;
      message: string;
    };

export interface PlotPoint {
  step: number;
  value: number;
  segment: number;
}

export interface PlotEvent {
  step: number;
  kind: 'invalid' | 'gap';
  count: number;
}

export interface MetricFrame {
  metric: MetricKey;
  range: StepRange;
  points: PlotPoint[];
  events: PlotEvent[];
  min: number | null;
  max: number | null;
  maxStep: number | null;
  visibleCount: number;
  invalidCount: number;
  gapCount: number;
  mode: 'raw' | 'minmax';
}

export interface ChartAxis {
  min: number;
  max: number;
  ticks: number[];
}

export function lowerBound(
  values: Float64Array,
  target: number,
): number {
  let left = 0;
  let right = values.length;

  while (left < right) {
    const middle = Math.floor((left + right) / 2);

    if (values[middle] < target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return left;
}

export function upperBound(
  values: Float64Array,
  target: number,
): number {
  let left = 0;
  let right = values.length;

  while (left < right) {
    const middle = Math.floor((left + right) / 2);

    if (values[middle] <= target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return left;
}

export function nearestIndex(
  values: Float64Array,
  target: number,
): number {
  if (values.length === 0) {
    return -1;
  }

  const right = lowerBound(values, target);

  if (right === 0) {
    return 0;
  }

  if (right >= values.length) {
    return values.length - 1;
  }

  return target - values[right - 1] <=
    values[right] - target
    ? right - 1
    : right;
}

export function fitRange(
  full: StepRange,
  span: number,
  center: number,
): StepRange {
  const available = full.end - full.start;
  const size = Math.min(
    available,
    Math.max(1, Math.round(span)),
  );

  const start = Math.max(
    full.start,
    Math.min(
      Math.round(center - size / 2),
      full.end - size,
    ),
  );

  return {
    start,
    end: start + size,
  };
}

export function getMetricStats(
  data: NormalizedRunData,
  metric: MetricKey,
): MetricStats {
  const values = data[metric];

  let min = Infinity;
  let max = -Infinity;
  let maxStep: number | null = null;
  let finiteCount = 0;
  let invalidCount = 0;
  let nonPositiveCount = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!Number.isFinite(value)) {
      invalidCount += 1;
      continue;
    }

    finiteCount += 1;

    if (value <= 0) {
      nonPositiveCount += 1;
    }

    min = Math.min(min, value);

    if (value > max) {
      max = value;
      maxStep = data.step[index];
    }
  }

  const last =
    values.length > 0
      ? values[values.length - 1]
      : null;

  return {
    latest:
      last !== null && Number.isFinite(last)
        ? last
        : null,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    maxStep,
    finiteCount,
    invalidCount,
    nonPositiveCount,
  };
}

export function aggregateMetric(
  data: NormalizedRunData,
  metric: MetricKey,
  range: StepRange,
  bucketCount: number,
  preferRaw = false,
): MetricFrame {
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start > range.end
  ) {
    throw new Error('Invalid chart range.');
  }

  if (
    !Number.isFinite(bucketCount) ||
    bucketCount < 1
  ) {
    throw new Error('Invalid chart bucket count.');
  }

  const from = lowerBound(data.step, range.start);
  const to = upperBound(data.step, range.end);
  const visibleCount = to - from;
  const values = data[metric];

  const buckets = Math.min(
    1024,
    Math.max(1, Math.floor(bucketCount)),
  );

  const chunkSize =
    preferRaw && visibleCount <= 2000
      ? 1
      : Math.max(
          1,
          Math.ceil(visibleCount / buckets),
        );

  const points: PlotPoint[] = [];
  const events: PlotEvent[] = [];

  let segment = 0;
  let minValue = Infinity;
  let maxValue = -Infinity;
  let maxStep: number | null = null;
  let invalidCount = 0;
  let gapCount = 0;

  for (let start = from; start < to; start += chunkSize) {
    const end = Math.min(start + chunkSize, to);

    let first = -1;
    let last = -1;
    let min = -1;
    let max = -1;

    let firstSegment = 0;
    let lastSegment = 0;
    let minSegment = 0;
    let maxSegment = 0;

    let bucketInvalidCount = 0;
    let bucketGapCount = 0;
    let firstInvalidStep = 0;
    let firstGapStep = 0;

    for (let index = start; index < end; index += 1) {
      if (
        index > 0 &&
        data.step[index] - data.step[index - 1] >
          data.expectedStepInterval
      ) {
        segment += 1;
        gapCount += 1;

        if (bucketGapCount === 0) {
          firstGapStep = data.step[index];
        }

        bucketGapCount += 1;
      }

      const value = values[index];

      if (!Number.isFinite(value)) {
        segment += 1;
        invalidCount += 1;

        if (bucketInvalidCount === 0) {
          firstInvalidStep = data.step[index];
        }

        bucketInvalidCount += 1;
        continue;
      }

      minValue = Math.min(minValue, value);

      if (value > maxValue) {
        maxValue = value;
        maxStep = data.step[index];
      }

      if (first === -1) {
        first = index;
        firstSegment = segment;
      }

      last = index;
      lastSegment = segment;

      if (min === -1 || value < values[min]) {
        min = index;
        minSegment = segment;
      }

      if (max === -1 || value > values[max]) {
        max = index;
        maxSegment = segment;
      }
    }

    if (bucketInvalidCount > 0) {
      events.push({
        step: firstInvalidStep,
        kind: 'invalid',
        count: bucketInvalidCount,
      });
    }

    if (bucketGapCount > 0) {
      events.push({
        step: firstGapStep,
        kind: 'gap',
        count: bucketGapCount,
      });
    }

    if (first === -1) {
      continue;
    }

    const candidates = [
      { index: first, segment: firstSegment },
      { index: min, segment: minSegment },
      { index: max, segment: maxSegment },
      { index: last, segment: lastSegment },
    ].sort((left, right) => left.index - right.index);

    let previousIndex = -1;

    for (const candidate of candidates) {
      if (candidate.index === previousIndex) {
        continue;
      }

      points.push({
        step: data.step[candidate.index],
        value: values[candidate.index],
        segment: candidate.segment,
      });

      previousIndex = candidate.index;
    }
  }

  return {
    metric,
    range,
    points,
    events,
    min: Number.isFinite(minValue) ? minValue : null,
    max: Number.isFinite(maxValue) ? maxValue : null,
    maxStep,
    visibleCount,
    invalidCount,
    gapCount,
    mode: chunkSize === 1 ? 'raw' : 'minmax',
  };
}

export function makeAxis(
  min: number | null,
  max: number | null,
  log: boolean,
): ChartAxis {
  if (min === null || max === null) {
    return log
      ? { min: 1, max: 10, ticks: [1, 10] }
      : { min: 0, max: 1, ticks: [0, 0.5, 1] };
  }

  if (log) {
    if (min <= 0) {
      throw new Error(
        'Log scale requires positive values.',
      );
    }

    let low = Math.max(
      Number.MIN_VALUE,
      10 ** Math.floor(Math.log10(min)),
    );

    let high = Math.min(
      Number.MAX_VALUE,
      10 ** Math.ceil(Math.log10(max)),
    );

    if (high <= low) {
      low = Math.max(Number.MIN_VALUE, low / 10);
      high = Math.min(Number.MAX_VALUE, high * 10);
    }

    const first = Math.ceil(Math.log10(low));
    const last = Math.floor(Math.log10(high));
    const stride = Math.max(
      1,
      Math.ceil((last - first) / 8),
    );

    const ticks: number[] = [];

    for (
      let exponent = first;
      exponent <= last;
      exponent += stride
    ) {
      const value = 10 ** exponent;

      if (
        Number.isFinite(value) &&
        value >= low &&
        value <= high
      ) {
        ticks.push(value);
      }
    }

    return {
      min: low,
      max: high,
      ticks:
        ticks.length >= 2 ? ticks : [low, high],
    };
  }

  const low = Math.min(0, min);
  const high = max === low ? low + 1 : max;
  const roughStep = (high - low) / 5;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const ratio = roughStep / power;

  const factor =
    [1, 2, 2.5, 5, 10].find(
      (candidate) => candidate >= ratio,
    ) ?? 10;

  const step = factor * power;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const count = Math.round((end - start) / step);

  return {
    min: start,
    max: end,
    ticks: Array.from(
      { length: count + 1 },
      (_, index) => start + index * step,
    ),
  };
}

export function formatChartNumber(
  value: number | null,
): string {
  if (value === null) {
    return 'Unavailable';
  }

  if (Number.isNaN(value)) {
    return 'NaN';
  }

  if (!Number.isFinite(value)) {
    return value > 0 ? 'Infinity' : '-Infinity';
  }

  if (value === 0) {
    return '0';
  }

  if (
    Math.abs(value) < 0.001 ||
    Math.abs(value) >= 10_000_000
  ) {
    return value
      .toExponential(2)
      .replace('.00e', 'e');
  }

  return chartNumberFormatter.format(value);
}
