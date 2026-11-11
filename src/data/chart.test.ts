import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import type { RunData } from '../types';

import {
  normalizeRunData,
  type NormalizedRunData,
} from './normalize';

import {
  generateRunData,
  RUNS,
} from './generate';

import {
  aggregateMetric,
  formatChartNumber,
  getMetricStats,
  makeAxis,
} from './chart';

function fixture(
  losses: number[],
  steps: number[] = losses.map((_, index) => index),
): NormalizedRunData {
  const source: RunData = {
    runId: 'chart-test',
    expectedStepInterval: 1,
    step: Float64Array.from(steps),
    loss: Float64Array.from(losses),
    lr: new Float64Array(losses.length).fill(0.001),
    grad_norm: new Float64Array(losses.length).fill(1),
  };

  return normalizeRunData(source);
}

describe('chart aggregation', () => {
  let million: NormalizedRunData;

  beforeAll(() => {
    const run = RUNS.find(
      (candidate) =>
        candidate.scenario === 'million-spike',
    );

    if (!run) {
      throw new Error('Missing million-point fixture.');
    }

    million = normalizeRunData(
      generateRunData(run),
    );
  });

  const ranges = [
    { start: 0, end: 999_999 },
    { start: 400_000, end: 600_000 },
    { start: 499_000, end: 501_000 },
    { start: 499_990, end: 500_010 },
    { start: 500_000, end: 500_000 },
  ];

  const cases = [1, 8, 64, 480].flatMap(
    (width) =>
      ranges.map((range) => ({
        width,
        ...range,
      })),
  );

  it.each(cases)(
    'retains the spike with $width buckets at $start–$end',
    ({ width, start, end }) => {
      const frame = aggregateMetric(
        million,
        'loss',
        { start, end },
        width,
      );

      expect(frame.max).toBe(250);
      expect(frame.maxStep).toBe(500_000);

      expect(
        frame.points.some(
          (point) =>
            point.step === 500_000 &&
            point.value === 250,
        ),
      ).toBe(true);

      expect(frame.points.length).toBeLessThanOrEqual(
        width * 4,
      );
    },
  );

  it('does not invent the global spike outside its viewport', () => {
    const frame = aggregateMetric(
      million,
      'loss',
      { start: 0, end: 1000 },
      50,
    );

    expect(frame.max).not.toBe(250);

    expect(
      frame.points.every(
        (point) =>
          point.step >= 0 &&
          point.step <= 1000,
      ),
    ).toBe(true);
  });

  it('preserves a real zero and breaks around invalid values', () => {
    const data = fixture([
      3,
      Number.NaN,
      0,
      Infinity,
      -Infinity,
      2,
    ]);

    const frame = aggregateMetric(
      data,
      'loss',
      { start: 0, end: 5 },
      10,
      true,
    );

    expect(frame.invalidCount).toBe(3);

    expect(
      frame.points.map((point) => point.value),
    ).toEqual([3, 0, 2]);

    expect(frame.points[0].segment).not.toBe(
      frame.points[1].segment,
    );

    expect(frame.points[1].segment).not.toBe(
      frame.points[2].segment,
    );
  });

  it('does not connect across missing steps', () => {
    const frame = aggregateMetric(
      fixture([3, 2, 1], [0, 1, 100]),
      'loss',
      { start: 0, end: 100 },
      10,
      true,
    );

    expect(frame.gapCount).toBe(1);
    expect(frame.points[0].segment).toBe(
      frame.points[1].segment,
    );
    expect(frame.points[1].segment).not.toBe(
      frame.points[2].segment,
    );
  });

  it('does not backfill an invalid latest value', () => {
    const stats = getMetricStats(
      fixture([2, 1, Number.NaN]),
      'loss',
    );

    expect(stats.latest).toBeNull();
    expect(stats.min).toBe(1);
    expect(stats.invalidCount).toBe(1);
  });

  it('keeps the axis large enough for the real peak', () => {
    const axis = makeAxis(0.1, 250, false);

    expect(axis.min).toBeLessThanOrEqual(0.1);
    expect(axis.max).toBeGreaterThanOrEqual(250);
    expect(axis.ticks).toContain(250);
  });

  it('does not round a small learning rate to zero', () => {
    const label = formatChartNumber(0.0003);

    expect(Number(label)).toBe(0.0003);
    expect(label).not.toBe('0');
  });

  it('rejects a logarithmic axis containing zero', () => {
    expect(() =>
      makeAxis(0, 3, true),
    ).toThrow('positive values');
  });
});