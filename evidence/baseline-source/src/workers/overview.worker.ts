import {
  generateRunData,
  RUNS,
} from '../data/generate';

import {
  summarizeRun,
  type OverviewWorkerMessage,
} from '../data/overview';

self.onmessage = () => {
  try {
    for (const run of RUNS) {
      const overview = summarizeRun(
        generateRunData(run),
      );

      self.postMessage({
        type: 'row',
        overview,
      } satisfies OverviewWorkerMessage);
    }

    self.postMessage({
      type: 'done',
    } satisfies OverviewWorkerMessage);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Could not prepare the run metrics.',
    } satisfies OverviewWorkerMessage);
  }
};