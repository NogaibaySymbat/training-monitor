import { useEffect, useState } from 'react';
import type {
  OverviewWorkerMessage,
  RunOverview,
} from '../data/overview';

export function useRunOverviews() {
  const [overviews, setOverviews] = useState<
    Record<string, RunOverview>
  >({});

  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let worker: Worker | null = null;

    function fail(message: string) {
      if (!active) {
        return;
      }

      worker?.terminate();
      setError(message);
      setComplete(true);
    }

    try {
      worker = new Worker(
        new URL(
          '../workers/overview.worker.ts',
          import.meta.url,
        ),
        { type: 'module' },
      );

      worker.onmessage = (
        event: MessageEvent<OverviewWorkerMessage>,
      ) => {
        if (!active) {
          return;
        }

        const result = event.data;

        if (result.type === 'row') {
          const overview = result.overview;

          setOverviews((previous) => ({
            ...previous,
            [overview.runId]: overview,
          }));

          return;
        }

        if (result.type === 'error') {
          fail(result.message);
          return;
        }

        setComplete(true);
        worker?.terminate();
      };

      worker.onerror = (event) => {
        fail(
          event.message ||
            'The data worker could not start.',
        );
      };

      worker.onmessageerror = () => {
        fail('The worker returned an unreadable message.');
      };

      worker.postMessage({ type: 'load' });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'The data worker could not start.';

      queueMicrotask(() => fail(message));
    }

    return () => {
      active = false;
      worker?.terminate();
    };
  }, [attempt]);

  function retry() {
    setOverviews({});
    setComplete(false);
    setError(null);
    setAttempt((previous) => previous + 1);
  }

  return {
    overviews,
    error,
    retry,
    ready: complete && error === null,
    loading: !complete && error === null,
    loadedCount: Object.keys(overviews).length,
  };
}