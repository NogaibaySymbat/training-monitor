import { useEffect, useState } from 'react';
import type {
  RunDataMessage,
  RunPayload,
} from '../data/chart';

export function useRunData(runId: string) {
  const [payload, setPayload] =
    useState<RunPayload | null>(null);

  const [error, setError] =
    useState<string | null>(null);

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
    }

    try {
      worker = new Worker(
        new URL(
          '../workers/run.worker.ts',
          import.meta.url,
        ),
        { type: 'module' },
      );

      worker.onmessage = (
        event: MessageEvent<RunDataMessage>,
      ) => {
        if (
          !active ||
          event.data.runId !== runId
        ) {
          return;
        }

        const result = event.data;

        if (result.type === 'error') {
          fail(result.message);
          return;
        }

        setPayload(result.payload);
        worker?.terminate();
      };

      worker.onerror = (event) => {
        fail(
          event.message ||
            'The run worker could not start.',
        );
      };

      worker.onmessageerror = () => {
        fail('The worker response could not be read.');
      };

      worker.postMessage({ runId });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Could not start loading this run.';

      queueMicrotask(() => fail(message));
    }

    return () => {
      active = false;
      worker?.terminate();
    };
  }, [runId, attempt]);

  function retry() {
    setPayload(null);
    setError(null);
    setAttempt((previous) => previous + 1);
  }

  return {
    payload,
    error,
    retry,
    loading: payload === null && error === null,
  };
}