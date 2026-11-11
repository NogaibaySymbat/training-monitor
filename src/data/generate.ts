import type {
  RunData,
  RunDefinition,
  RunScenario,
  RunStatus,
} from '../types';

const SCENARIOS: readonly RunScenario[] = [
  'clean',
  'clean',
  'non-finite',
  'duplicates',
  'unsorted',
  'gaps',
  'million-spike',
  'zero-loss',
  'diverging',
  'clean',
  'clean',
  'clean',
  'clean',
  'clean',
  'clean',
  'clean',
  'clean',
  'clean',
  'clean',
  'clean',
];

const BASE_TIME = Date.parse('2026-11-10T08:00:00.000Z');

function getRunStatus(index: number): RunStatus {
  if (index === 8) {
    return 'running';
  }

  if (index === 2) {
    return 'failed';
  }

  return index % 4 === 0 ? 'running' : 'completed';
}

export const RUNS: readonly RunDefinition[] = SCENARIOS.map(
  (scenario, index) => {
    const number = String(index + 1).padStart(2, '0');
    const startedAt = BASE_TIME + index * 15 * 60_000;
    const duration = (20 + index * 4) * 60_000;

    return {
      id: `run-${number}`,
      name: `Experiment ${number}`,
      status: getRunStatus(index),
      scenario,
      seed: 1000 + index,
      pointCount:
        scenario === 'million-spike' ? 1_000_000 : 4000 + index * 250,
      startedAt: new Date(startedAt).toISOString(),
      updatedAt: new Date(startedAt + duration).toISOString(),
    };
  },
);

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;

    let value = Math.imul(state ^ (state >>> 15), 1 | state);

    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleRows(data: RunData, random: () => number): void {
  const columns = [
    data.step,
    data.loss,
    data.lr,
    data.grad_norm,
  ];

  for (let index = data.step.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));

    for (const column of columns) {
      const savedValue = column[index];

      column[index] = column[otherIndex];
      column[otherIndex] = savedValue;
    }
  }
}

export function generateRunData(run: RunDefinition): RunData {
  const count = run.pointCount;

  if (!Number.isSafeInteger(count) || count < 2) {
    throw new Error('A run must contain at least two points.');
  }

  const random = createRandom(run.seed);

  const data: RunData = {
    runId: run.id,
    expectedStepInterval: 1,
    step: new Float64Array(count),
    loss: new Float64Array(count),
    lr: new Float64Array(count),
    grad_norm: new Float64Array(count),
  };

  const initialLoss = 2.5 + random() * 1.5;
  const finalLoss = 0.08 + random() * 0.12;
  const initialLearningRate = 0.001 + random() * 0.002;

  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);

    const lossNoise =
      (random() - 0.5) * 0.08 * (1 - progress * 0.7);

    const gradientNoise = (random() - 0.5) * 0.15;

    data.step[index] = index;

    data.loss[index] =
      initialLoss * Math.exp(-progress * 5) +
      finalLoss +
      lossNoise;

    data.lr[index] =
      initialLearningRate *
      (0.05 + 0.95 * (1 + Math.cos(Math.PI * progress)) / 2);

    data.grad_norm[index] = Math.max(
      0,
      1.8 * Math.exp(-progress * 3) +
        0.15 +
        gradientNoise,
    );

    if (run.scenario === 'diverging' && progress > 0.65) {
      const divergence = (progress - 0.65) * 80;

      data.loss[index] += divergence;
      data.grad_norm[index] += divergence * 0.6;
    }
  }

  switch (run.scenario) {
    case 'non-finite': {
      data.loss[Math.floor(count * 0.25)] = Number.NaN;
      data.loss[Math.floor(count * 0.55)] =
        Number.POSITIVE_INFINITY;
      data.loss[Math.floor(count * 0.75)] =
        Number.NEGATIVE_INFINITY;
      break;
    }

    case 'duplicates': {
      for (let index = 200; index < count; index += 200) {
        data.step[index] = data.step[index - 1];

        // Conflicting values make the duplicate policy testable.
        data.loss[index] = data.loss[index - 1] + 0.5;
      }
      break;
    }

    case 'unsorted': {
      // Move all metrics together to preserve each original record.
      shuffleRows(data, random);
      break;
    }

    case 'gaps': {
      const firstGap = Math.floor(count * 0.35);
      const secondGap = Math.floor(count * 0.7);

      for (let index = firstGap; index < count; index += 1) {
        data.step[index] += 100;
      }

      for (let index = secondGap; index < count; index += 1) {
        data.step[index] += 200;
      }
      break;
    }

    case 'million-spike': {
      data.loss[Math.floor(count / 2)] = 250;
      break;
    }

    case 'zero-loss': {
      data.loss[Math.floor(count / 2)] = 0;
      break;
    }

    case 'clean':
    case 'diverging': {
      break;
    }
  }

  return data;
}