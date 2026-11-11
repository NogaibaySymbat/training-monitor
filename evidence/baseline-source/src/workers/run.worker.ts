import {
  generateRunData,
  RUNS,
} from '../data/generate';
import { normalizeRunData } from '../data/normalize';
import {
  getMetricStats,
  type RunDataMessage,
} from '../data/chart';

self.onmessage = (
  event: MessageEvent<{ runId: string }>,
) => {
  const { runId } = event.data;

  try {
    const run = RUNS.find(
      (candidate) => candidate.id === runId,
    );

    if (!run) {
      throw new Error(`Run "${runId}" was not found.`);
    }

    const data = normalizeRunData(
      generateRunData(run),
    );

    const message: RunDataMessage = {
      type: 'ready',
      runId,
      payload: {
        data,
        stats: {
          loss: getMetricStats(data, 'loss'),
          grad_norm: getMetricStats(
            data,
            'grad_norm',
          ),
          lr: getMetricStats(data, 'lr'),
        },
      },
    };

    const transfer = [
      data.step.buffer,
      data.loss.buffer,
      data.lr.buffer,
      data.grad_norm.buffer,
    ].filter(
      (buffer): buffer is ArrayBuffer =>
        buffer instanceof ArrayBuffer,
    );

    self.postMessage(message, { transfer });
  } catch (error) {
    self.postMessage({
      type: 'error',
      runId,
      message:
        error instanceof Error
          ? error.message
          : 'Could not load this run.',
    } satisfies RunDataMessage);
  }
};