import type { MetricKey, RunData } from '../types';

const METRICS: readonly MetricKey[] = [
  'loss',
  'lr',
  'grad_norm',
];

interface DataQuality {
  sourcePointCount: number;
  duplicatesRemoved: number;
  wasReordered: boolean;
  gapCount: number;
  sourceInvalidValues: Record<MetricKey, number>;
  retainedInvalidValues: Record<MetricKey, number>;
}

export interface NormalizedRunData extends RunData {
  quality: DataQuality;
}

function createInvalidCounts(): Record<MetricKey, number> {
  return {
    loss: 0,
    lr: 0,
    grad_norm: 0,
  };
}

export function normalizeRunData(
  source: RunData,
): NormalizedRunData {
  const count = source.step.length;

  if (
    !Number.isSafeInteger(source.expectedStepInterval) ||
    source.expectedStepInterval <= 0
  ) {
    throw new Error(
      'Expected step interval must be a positive safe integer.',
    );
  }

  for (const metric of METRICS) {
    if (source[metric].length !== count) {
      throw new Error(
        `Column "${metric}" has a different length from "step".`,
      );
    }
  }

  const sourceInvalidValues = createInvalidCounts();
  const retainedInvalidValues = createInvalidCounts();

  let wasReordered = false;

  for (let index = 0; index < count; index += 1) {
    const step = source.step[index];

    if (!Number.isSafeInteger(step) || step < 0) {
      throw new Error(`Invalid step at source index ${index}.`);
    }

    if (index > 0 && step < source.step[index - 1]) {
      wasReordered = true;
    }

    for (const metric of METRICS) {
      if (!Number.isFinite(source[metric][index])) {
        sourceInvalidValues[metric] += 1;
      }
    }
  }

  // Source indexes keep duplicate resolution deterministic.
  let order: Uint32Array | null = null;

  if (wasReordered) {
    order = Uint32Array.from(
      { length: count },
      (_, index) => index,
    );

    order.sort(
      (left, right) =>
        source.step[left] - source.step[right] ||
        left - right,
    );
  }

  const step = new Float64Array(count);
  const loss = new Float64Array(count);
  const lr = new Float64Array(count);
  const gradNorm = new Float64Array(count);

  const outputColumns = {
    loss,
    lr,
    grad_norm: gradNorm,
  };

  let written = 0;
  let duplicatesRemoved = 0;
  let gapCount = 0;

  for (let position = 0; position < count; position += 1) {
    const sourceIndex = order ? order[position] : position;
    const currentStep = source.step[sourceIndex];

    if (position + 1 < count) {
      const nextIndex = order
        ? order[position + 1]
        : position + 1;

      if (currentStep === source.step[nextIndex]) {
        duplicatesRemoved += 1;
        continue;
      }
    }

    if (
      written > 0 &&
      currentStep - step[written - 1] >
        source.expectedStepInterval
    ) {
      gapCount += 1;
    }

    step[written] = currentStep;

    for (const metric of METRICS) {
      const value = source[metric][sourceIndex];

      // Preserve NaN and Infinity; rendering handles the gap.
      outputColumns[metric][written] = value;

      if (!Number.isFinite(value)) {
        retainedInvalidValues[metric] += 1;
      }
    }

    written += 1;
  }

  return {
    runId: source.runId,
    expectedStepInterval: source.expectedStepInterval,
    step: step.subarray(0, written),
    loss: loss.subarray(0, written),
    lr: lr.subarray(0, written),
    grad_norm: gradNorm.subarray(0, written),
    quality: {
      sourcePointCount: count,
      duplicatesRemoved,
      wasReordered,
      gapCount,
      sourceInvalidValues,
      retainedInvalidValues,
    },
  };
}
