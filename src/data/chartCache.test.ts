import { describe, expect, it } from 'vitest';
import type { NormalizedRunData } from './normalize';
import { aggregateMetric, prepareFrames, plotBucketCount } from './chart';
import { getCachedMetricFrame, primeMetricFrameCache } from './chartCache';

function fixture(length = 10_000): NormalizedRunData {
  return {
    runId: 'cache-test',
    expectedStepInterval: 1,
    step: Float64Array.from({ length }, (_, index) => index),
    loss: Float64Array.from(
      { length },
      (_, index) => 1 + (index % 11) / 1000,
    ),
    lr: new Float64Array(length).fill(0.001),
    grad_norm: new Float64Array(length).fill(0.5),
    quality: {
      sourcePointCount: length,
      duplicatesRemoved: 0,
      gapCount: 0,
      wasReordered: false,
      sourceInvalidValues: { loss: 0, lr: 0, grad_norm: 0 },
      retainedInvalidValues: { loss: 0, lr: 0, grad_norm: 0 },
    },
  };
}

describe('chart frame cache', () => {
  it('uses exactly the frames prepared by the worker for the measured width', () => {
    const data = fixture();
    const buckets = plotBucketCount(1216);
    const prepared = prepareFrames(data, buckets);
    primeMetricFrameCache(data, prepared);
    for (const metric of ['loss', 'grad_norm', 'lr'] as const) {
      const frame = getCachedMetricFrame(data, metric, { start: 0, end: 9999 }, buckets);
      expect(frame).toBe(prepared.metrics[metric]);
      expect(frame).toEqual(aggregateMetric(data, metric, { start: 0, end: 9999 }, buckets));
    }
    expect(prepared.navigator).toEqual(aggregateMetric(data, 'loss', { start: 0, end: 9999 }, 120));
  });

  it('recomputes a truthful frame when the viewport resizes after worker preparation', () => {
    const data = fixture();
    data.loss[5000] = 250;
    const prepared = prepareFrames(data, plotBucketCount(1216));
    primeMetricFrameCache(data, prepared);
    const frame = getCachedMetricFrame(data, 'loss', { start: 0, end: 9999 }, plotBucketCount(288));
    expect(frame).not.toBe(prepared.metrics.loss);
    expect(frame.max).toBe(250);
    expect(frame.maxStep).toBe(5000);
  });

  it('keeps invalid values and breaks when priming worker frames', () => {
    const data = fixture();
    data.loss[5000] = NaN;
    const prepared = prepareFrames(data, 64);
    primeMetricFrameCache(data, prepared);
    const frame = getCachedMetricFrame(data, 'loss', { start: 0, end: 9999 }, 64);
    expect(frame.invalidCount).toBe(1);
    expect(frame).toEqual(aggregateMetric(data, 'loss', { start: 0, end: 9999 }, 64));
    expect(frame.points.every((point) => Number.isFinite(point.value))).toBe(true);
  });
  it('reuses the same frame for equivalent requests', () => {
    const data = fixture();
    const first = getCachedMetricFrame(
      data, 'loss', { start: 0, end: 9999 }, 480,
    );
    const second = getCachedMetricFrame(
      data, 'loss', { start: 0, end: 9999 }, 480,
    );
    expect(second).toBe(first);
    expect(second).toEqual(
      aggregateMetric(data, 'loss', { start: 0, end: 9999 }, 480),
    );
  });

  it('does not reuse a frame across snapshots with the same run ID', () => {
    const firstData = fixture();
    const secondData = fixture();
    secondData.loss[5000] = 250;
    const range = { start: 0, end: 9999 };
    const first = getCachedMetricFrame(firstData, 'loss', range, 64);
    const second = getCachedMetricFrame(secondData, 'loss', range, 64);
    expect(second).not.toBe(first);
    expect(second.max).toBe(250);
    expect(first.max).toBeLessThan(2);
  });

  it('keeps metrics separate', () => {
    const data = fixture();
    const range = { start: 0, end: 9999 };
    const loss = getCachedMetricFrame(data, 'loss', range, 64);
    const lr = getCachedMetricFrame(data, 'lr', range, 64);
    expect(lr).not.toBe(loss);
    expect(lr.metric).toBe('lr');
    expect(lr.max).toBe(0.001);
  });

  it('keeps resolution and raw mode separate', () => {
    const data = fixture();
    const range = { start: 0, end: 1000 };
    const coarse = getCachedMetricFrame(data, 'loss', range, 1);
    const fine = getCachedMetricFrame(data, 'loss', range, 64);
    const raw = getCachedMetricFrame(data, 'loss', range, 64, true);
    expect(fine).not.toBe(coarse);
    expect(raw).not.toBe(fine);
    expect(raw.mode).toBe('raw');
    expect(raw.points).toHaveLength(1001);
    expect(coarse.points.length).toBeLessThan(fine.points.length);
  });

  it('preserves invalid values, real zeros and gaps on cache hits', () => {
    const data = fixture();
    data.loss[100] = NaN;
    data.loss[200] = Infinity;
    data.loss[300] = -Infinity;
    data.loss[400] = 0;
    for (let index = 500; index < data.step.length; index += 1) {
      data.step[index] += 10;
    }
    data.quality.gapCount = 1;
    data.quality.sourceInvalidValues.loss = 3;
    data.quality.retainedInvalidValues.loss = 3;
    const range = { start: 0, end: 10009 };
    const original = aggregateMetric(data, 'loss', range, 64);
    const first = getCachedMetricFrame(data, 'loss', range, 64);
    const cached = getCachedMetricFrame(data, 'loss', range, 64);
    expect(cached).toBe(first);
    expect(cached).toEqual(original);
    expect(cached.invalidCount).toBe(3);
    expect(cached.gapCount).toBe(1);
    expect(cached.min).toBe(0);
  });

  it('retains a million-point spike and respects the visible window', () => {
    const data = fixture(1_000_000);
    data.loss[500000] = 250;
    const full = { start: 0, end: 999999 };
    const first = getCachedMetricFrame(data, 'loss', full, 480);
    expect(first.max).toBe(250);
    expect(first.maxStep).toBe(500000);
    expect(first.points.some(
      (point) => point.step === 500000 && point.value === 250,
    )).toBe(true);
    const zoom = getCachedMetricFrame(
      data, 'loss', { start: 490000, end: 510000 }, 480,
    );
    expect(zoom.max).toBe(250);
    const outside = getCachedMetricFrame(
      data, 'loss', { start: 0, end: 1000 }, 480,
    );
    expect(outside.max).toBeLessThan(2);
    expect(getCachedMetricFrame(data, 'loss', full, 480)).toBe(first);
  });

  it('evicts the least recently used frame after four windows', () => {
    const data = fixture();
    const firstRange = { start: 0, end: 100 };
    const first = getCachedMetricFrame(data, 'loss', firstRange, 64);
    const secondRange = { start: 100, end: 200 };
    const second = getCachedMetricFrame(data, 'loss', secondRange, 64);
    getCachedMetricFrame(data, 'loss', { start: 200, end: 300 }, 64);
    getCachedMetricFrame(data, 'loss', { start: 300, end: 400 }, 64);
    expect(getCachedMetricFrame(data, 'loss', firstRange, 64)).toBe(first);
    getCachedMetricFrame(data, 'loss', { start: 400, end: 500 }, 64);
    expect(getCachedMetricFrame(data, 'loss', firstRange, 64)).toBe(first);
    expect(getCachedMetricFrame(data, 'loss', secondRange, 64)).not.toBe(second);
  });

  it('copies the requested range instead of retaining its mutable object', () => {
    const data = fixture();
    const range = { start: 0, end: 1000 };
    const frame = getCachedMetricFrame(data, 'loss', range, 64);
    range.end = 500;
    expect(frame.range).toEqual({ start: 0, end: 1000 });
    const changed = getCachedMetricFrame(data, 'loss', range, 64);
    expect(changed).not.toBe(frame);
    expect(changed.visibleCount).toBe(501);
  });

  it('keeps input validation for cached requests', () => {
    const data = fixture();
    const range = { start: 0, end: 1000 };
    getCachedMetricFrame(data, 'loss', range, 64);
    expect(() => getCachedMetricFrame(
      data, 'loss', { start: NaN, end: 1000 }, 64,
    )).toThrow('Invalid chart range.');
    expect(() => getCachedMetricFrame(
      data, 'loss', range, Infinity,
    )).toThrow('Invalid chart bucket count.');
  });

  it('supports an empty snapshot', () => {
    const data = fixture(0);
    const frame = getCachedMetricFrame(
      data, 'loss', { start: 0, end: 0 }, 64,
    );
    expect(frame.visibleCount).toBe(0);
    expect(frame.points).toHaveLength(0);
    expect(frame.min).toBeNull();
    expect(frame.max).toBeNull();
  });
});
