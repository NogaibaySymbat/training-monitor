import type { RunData } from '../types';
import {
  normalizeRunData,
  type NormalizedRunData,
} from './normalize';

export interface LossPreviewPoint {
  step: number;
  value: number;
  segment: number;
}

export interface RunOverview {
  runId: string;
  normalizedPointCount: number;
  stepStart: number | null;
  stepEnd: number | null;
  latestLoss: number | null;
  bestLoss: number | null;
  peakLoss: number | null;
  peakStep: number | null;
  preview: LossPreviewPoint[];
  quality: NormalizedRunData['quality'];
}

export type OverviewWorkerMessage =
  | { type: 'row'; overview: RunOverview }
  | { type: 'done' }
  | { type: 'error'; message: string };

function buildLossPreview(
  data: NormalizedRunData,
): LossPreviewPoint[] {
  const points: LossPreviewPoint[] = [];
  const chunkSize = Math.max(
    1,
    Math.ceil(data.loss.length / 48),
  );

  let segment = 0;

  for (
    let start = 0;
    start < data.loss.length;
    start += chunkSize
  ) {
    const end = Math.min(
      start + chunkSize,
      data.loss.length,
    );

    let first = -1;
    let last = -1;
    let min = -1;
    let max = -1;

    let firstSegment = 0;
    let lastSegment = 0;
    let minSegment = 0;
    let maxSegment = 0;

    for (let index = start; index < end; index += 1) {
      if (
        index > 0 &&
        data.step[index] - data.step[index - 1] >
          data.expectedStepInterval
      ) {
        segment += 1;
      }

      const value = data.loss[index];

      if (!Number.isFinite(value)) {
        segment += 1;
        continue;
      }

      if (first === -1) {
        first = index;
        firstSegment = segment;
      }

      last = index;
      lastSegment = segment;

      if (min === -1 || value < data.loss[min]) {
        min = index;
        minSegment = segment;
      }

      if (max === -1 || value > data.loss[max]) {
        max = index;
        maxSegment = segment;
      }
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
        value: data.loss[candidate.index],
        segment: candidate.segment,
      });

      previousIndex = candidate.index;
    }
  }

  return points;
}

export function summarizeRun(
  source: RunData,
): RunOverview {
  const data = normalizeRunData(source);

  let bestLoss = Number.POSITIVE_INFINITY;
  let peakLoss = Number.NEGATIVE_INFINITY;
  let peakStep: number | null = null;

  for (
    let index = 0;
    index < data.loss.length;
    index += 1
  ) {
    const value = data.loss[index];

    if (!Number.isFinite(value)) {
      continue;
    }

    bestLoss = Math.min(bestLoss, value);

    if (value > peakLoss) {
      peakLoss = value;
      peakStep = data.step[index];
    }
  }

  const lastIndex = data.loss.length - 1;
  const lastValue =
    lastIndex >= 0 ? data.loss[lastIndex] : null;

  return {
    runId: data.runId,
    normalizedPointCount: data.step.length,
    stepStart:
      data.step.length > 0 ? data.step[0] : null,
    stepEnd:
      lastIndex >= 0 ? data.step[lastIndex] : null,
    latestLoss:
      lastValue !== null && Number.isFinite(lastValue)
        ? lastValue
        : null,
    bestLoss:
      Number.isFinite(bestLoss) ? bestLoss : null,
    peakLoss:
      Number.isFinite(peakLoss) ? peakLoss : null,
    peakStep,
    preview: buildLossPreview(data),
    quality: data.quality,
  };
}

export function hasDataIssues(
  overview: RunOverview,
): boolean {
  const quality = overview.quality;

  return (
    quality.duplicatesRemoved > 0 ||
    quality.wasReordered ||
    quality.gapCount > 0 ||
    Object.values(
      quality.sourceInvalidValues,
    ).some((count) => count > 0)
  );
}