import { describe, expect, it } from 'vitest';
import type { RunData } from '../types';
import { generateRunData, RUNS } from './generate';
import { normalizeRunData } from './normalize';

function makeData(
  steps: number[],
  losses: number[] = steps.map(() => 1),
): RunData {
  return {
    runId: 'test-run',
    expectedStepInterval: 1,
    step: Float64Array.from(steps),
    loss: Float64Array.from(losses),
    lr: Float64Array.from(
      steps,
      (_, index) => index + 0.1,
    ),
    grad_norm: Float64Array.from(
      steps,
      (_, index) => index + 10,
    ),
  };
}

describe('normalization', () => {
  it('sorts steps and keeps complete records together', () => {
    const result = normalizeRunData(
      makeData([2, 0, 1], [20, 0, 10]),
    );

    expect(Array.from(result.step)).toEqual([0, 1, 2]);
    expect(Array.from(result.loss)).toEqual([0, 10, 20]);
    expect(Array.from(result.lr)).toEqual([1.1, 2.1, 0.1]);
    expect(Array.from(result.grad_norm)).toEqual([11, 12, 10]);
    expect(result.quality.wasReordered).toBe(true);
  });

  it('keeps the last source record for a duplicate step', () => {
    const result = normalizeRunData(
      makeData([3, 1, 2, 1], [30, 10, 20, 99]),
    );

    expect(Array.from(result.step)).toEqual([1, 2, 3]);
    expect(Array.from(result.loss)).toEqual([99, 20, 30]);
    expect(Array.from(result.lr)).toEqual([3.1, 2.1, 0.1]);
    expect(Array.from(result.grad_norm)).toEqual([13, 12, 10]);
    expect(result.quality.duplicatesRemoved).toBe(1);
  });

  it('does not replace a newer invalid duplicate with older valid data', () => {
    const result = normalizeRunData(
      makeData([0, 1, 1, 2], [4, 3, Number.NaN, 2]),
    );

    expect(Array.from(result.step)).toEqual([0, 1, 2]);
    expect(result.loss[1]).toBeNaN();
    expect(result.quality.duplicatesRemoved).toBe(1);
  });

  it('preserves NaN and both infinities without inserting zeros', () => {
    const result = normalizeRunData(
      makeData(
        [0, 1, 2, 3],
        [5, Number.NaN, Infinity, -Infinity],
      ),
    );

    expect(result.loss[0]).toBe(5);
    expect(result.loss[1]).toBeNaN();
    expect(result.loss[2]).toBe(Infinity);
    expect(result.loss[3]).toBe(-Infinity);
    expect(result.quality.retainedInvalidValues.loss).toBe(3);
  });

  it('counts invalid source values even when a duplicate is removed', () => {
    const result = normalizeRunData(
      makeData([0, 1, 1], [4, Number.NaN, 2]),
    );

    expect(result.quality.sourceInvalidValues.loss).toBe(1);
    expect(result.quality.retainedInvalidValues.loss).toBe(0);
    expect(Array.from(result.loss)).toEqual([4, 2]);
  });

  it('preserves a real zero as a valid value', () => {
    const result = normalizeRunData(
      makeData([0, 1, 2], [2, 0, 1]),
    );

    expect(result.loss[1]).toBe(0);
    expect(result.quality.retainedInvalidValues.loss).toBe(0);
  });

  it('detects missing-step intervals without filling them', () => {
    const result = normalizeRunData(
      makeData([0, 1, 5, 6, 10]),
    );

    expect(Array.from(result.step)).toEqual([0, 1, 5, 6, 10]);
    expect(result.quality.gapCount).toBe(2);
  });

  it('leaves source arrays unchanged', () => {
    const source = makeData([2, 0, 1, 1], [20, 0, 10, 11]);

    normalizeRunData(source);

    expect(Array.from(source.step)).toEqual([2, 0, 1, 1]);
    expect(Array.from(source.loss)).toEqual([20, 0, 10, 11]);
    expect(Array.from(source.lr)).toEqual([0.1, 1.1, 2.1, 3.1]);
    expect(Array.from(source.grad_norm)).toEqual([10, 11, 12, 13]);
  });

  it('supports an empty dataset', () => {
    const result = normalizeRunData(makeData([]));

    expect(result.step.length).toBe(0);
    expect(result.quality.sourcePointCount).toBe(0);
    expect(result.quality.gapCount).toBe(0);
  });

  it('rejects mismatched column lengths', () => {
    expect(() =>
      normalizeRunData(makeData([0, 1], [5])),
    ).toThrow('different length');
  });

  it.each([Number.NaN, Infinity, -Infinity, -1, 0.5])(
    'rejects an invalid training step: %s',
    (step) => {
      expect(() =>
        normalizeRunData(makeData([0, step])),
      ).toThrow('Invalid step');
    },
  );

  it('rejects an invalid expected step interval', () => {
    const source = makeData([0, 1]);

    source.expectedStepInterval = 0;

    expect(() => normalizeRunData(source)).toThrow(
      'positive safe integer',
    );
  });
});

describe('generated fixtures', () => {
  it('defines exactly 20 runs and one million-point run', () => {
    expect(RUNS).toHaveLength(20);

    expect(
      RUNS.filter((run) => run.pointCount === 1_000_000),
    ).toHaveLength(1);
  });

  it('generates identical values for the same seed', () => {
    const run = RUNS.find(
      (candidate) => candidate.scenario === 'clean',
    );

    if (!run) {
      throw new Error('Missing clean fixture.');
    }

    const first = generateRunData(run);
    const second = generateRunData(run);

    expect(first.step).toEqual(second.step);
    expect(first.loss).toEqual(second.loss);
    expect(first.lr).toEqual(second.lr);
    expect(first.grad_norm).toEqual(second.grad_norm);
  });

  it('preserves the single spike when normalizing one million points', () => {
    const run = RUNS.find(
      (candidate) => candidate.scenario === 'million-spike',
    );

    if (!run) {
      throw new Error('Missing million-point fixture.');
    }

    const source = generateRunData(run);
    const result = normalizeRunData(source);
    const spikeIndex = Math.floor(run.pointCount / 2);

    expect(result.step.length).toBe(1_000_000);
    expect(result.step[spikeIndex]).toBe(500_000);
    expect(result.loss[spikeIndex]).toBe(250);

    let spikeCount = 0;

    for (const value of result.loss) {
      if (value === 250) {
        spikeCount += 1;
      }
    }

    expect(spikeCount).toBe(1);
    expect(result.quality.duplicatesRemoved).toBe(0);
  });
});