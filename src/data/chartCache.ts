import type { MetricKey } from '../types';
import type { NormalizedRunData } from './normalize';
import {
  aggregateMetric,
  type MetricFrame,
  type StepRange,
  type PreparedFrames,
} from './chart';

const FRAMES_PER_METRIC = 4;

type MetricCache = Map<string, MetricFrame>;
type RunCache = Map<MetricKey, MetricCache>;

// Data is an immutable snapshot. New data must use a new data object.
// WeakMap lets old snapshots and their cached frames be collected together.
const cache = new WeakMap<NormalizedRunData, RunCache>();

function requestKey(range: StepRange, bucketCount: number, preferRaw: boolean) {
  return JSON.stringify([range.start, range.end, bucketCount, preferRaw]);
}

export function primeMetricFrameCache(data: NormalizedRunData, prepared: PreparedFrames) {
  const runCache: RunCache = new Map();
  for (const metric of ['loss', 'grad_norm', 'lr'] as const) {
    const frame = prepared.metrics[metric];
    runCache.set(metric, new Map([
      [requestKey(frame.range, prepared.bucketCount, false), frame],
    ]));
  }
  cache.set(data, runCache);
}

export function getCachedMetricFrame(
  data: NormalizedRunData,
  metric: MetricKey,
  range: StepRange,
  bucketCount: number,
  preferRaw = false,
): MetricFrame {
  const key = requestKey(range, bucketCount, preferRaw);

  // Validate before looking in the cache: JSON converts NaN and Infinity
  // to null, so invalid input must never collide with a cached request.
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start > range.end ||
    !Number.isFinite(bucketCount) ||
    bucketCount < 1
  ) {
    return aggregateMetric(data, metric, range, bucketCount, preferRaw);
  }

  let runCache = cache.get(data);

  if (!runCache) {
    runCache = new Map();
    cache.set(data, runCache);
  }

  let metricCache = runCache.get(metric);

  if (!metricCache) {
    metricCache = new Map();
    runCache.set(metric, metricCache);
  }

  const cached = metricCache.get(key);

  if (cached) {
    metricCache.delete(key);
    metricCache.set(key, cached);
    return cached;
  }

  const frame = aggregateMetric(
    data,
    metric,
    { start: range.start, end: range.end },
    bucketCount,
    preferRaw,
  );

  metricCache.set(key, frame);

  if (metricCache.size > FRAMES_PER_METRIC) {
    const oldestKey = metricCache.keys().next().value;

    if (oldestKey !== undefined) {
      metricCache.delete(oldestKey);
    }
  }

  return frame;
}
