import { describe, expect, it } from 'vitest';
import type { RunData } from '../types';
import { generateRunData, RUNS } from './generate';
import {
  hasDataIssues,
  summarizeRun,
} from './overview';

function makeData(
  losses: number[],
  steps: number[] = losses.map((_, index) => index),
): RunData {
  return {
    runId: 'overview-test',
    expectedStepInterval: 1,
    step: Float64Array.from(steps),
    loss: Float64Array.from(losses),
    lr: new Float64Array(losses.length).fill(0.001),
    grad_norm: new Float64Array(losses.length).fill(1),
  };
}

describe('run overview', () => {
  it('does not substitute an older value for an invalid latest loss', () => {
    const result = summarizeRun(
      makeData([3, Number.NaN]),
    );

    expect(result.latestLoss).toBeNull();
    expect(result.bestLoss).toBe(3);
    expect(result.peakLoss).toBe(3);
    expect(hasDataIssues(result)).toBe(true);
  });

  it('preserves a real zero', () => {
    const result = summarizeRun(
      makeData([2, 1, 0]),
    );

    expect(result.latestLoss).toBe(0);
    expect(result.bestLoss).toBe(0);
    expect(result.peakLoss).toBe(2);
    expect(hasDataIssues(result)).toBe(false);
  });

  it('returns unavailable values when every loss is invalid', () => {
    const result = summarizeRun(
      makeData([Number.NaN, Infinity, -Infinity]),
    );

    expect(result.latestLoss).toBeNull();
    expect(result.bestLoss).toBeNull();
    expect(result.peakLoss).toBeNull();
    expect(result.peakStep).toBeNull();
    expect(result.preview).toEqual([]);
    expect(
      result.quality.sourceInvalidValues.loss,
    ).toBe(3);
  });

  it('calculates summaries after sorting and duplicate resolution', () => {
    const result = summarizeRun(
      makeData([10, 2, 4, 3], [2, 0, 1, 1]),
    );

    expect(result.latestLoss).toBe(10);
    expect(result.bestLoss).toBe(2);
    expect(result.peakLoss).toBe(10);
    expect(result.peakStep).toBe(2);
    expect(result.normalizedPointCount).toBe(3);
    expect(result.quality.duplicatesRemoved).toBe(1);
    expect(result.quality.wasReordered).toBe(true);
  });

  it('retains the million-point spike in a bounded preview', () => {
    const run = RUNS.find(
      (candidate) =>
        candidate.scenario === 'million-spike',
    );

    if (!run) {
      throw new Error('Missing million-point fixture.');
    }

    const result = summarizeRun(
      generateRunData(run),
    );

    expect(result.preview.length).toBeLessThanOrEqual(192);

    expect(
      result.preview.some(
        (point) =>
          point.step === 500_000 &&
          point.value === 250,
      ),
    ).toBe(true);
  });

  it('separates preview segments across non-finite values', () => {
    const result = summarizeRun(
      makeData([3, Number.NaN, 2]),
    );

    expect(
      result.preview.map((point) => point.step),
    ).toEqual([0, 2]);

    expect(result.preview[0].segment).not.toBe(
      result.preview[1].segment,
    );
  });

  it('separates preview segments across missing steps', () => {
    const result = summarizeRun(
      makeData([3, 2, 1], [0, 1, 5]),
    );

    expect(result.preview).toHaveLength(3);

    expect(result.preview[0].segment).toBe(
      result.preview[1].segment,
    );

    expect(result.preview[1].segment).not.toBe(
      result.preview[2].segment,
    );
  });
});