import { useEffect, useState } from 'react';
import type {
  RunDataMessage,
  RunPayload,
} from '../data/chart';
import { plotBucketCount } from '../data/chart';
import { primeMetricFrameCache } from '../data/chartCache';

export function useRunData(runId: string) {
  const [payload, setPayload] =
    useState<RunPayload | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let worker: Worker | null = null;
    const timeout = window.setTimeout(() => {
      fail('Preparing this run timed out after 15 seconds. Please try again.');
    }, 15_000);

    function fail(message: string) {
      if (!active) {
        return;
      }

      active = false;
      window.clearTimeout(timeout);
      worker?.terminate();
      setPayload(null);
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

        active = false;
        window.clearTimeout(timeout);
        if (result.payload.prepared) {
          primeMetricFrameCache(result.payload.data, result.payload.prepared);
        }
        setError(null);
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

      const container = document.querySelector<HTMLElement>('.run-page');
      const style = container ? getComputedStyle(container) : null;
      const width = container && style
        ? container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        : document.documentElement.clientWidth;
      worker.postMessage({ runId, bucketCount: plotBucketCount(Math.max(240, Math.floor(width))) });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Could not start loading this run.';

      queueMicrotask(() => fail(message));
    }

    return () => {
      active = false;
      window.clearTimeout(timeout);
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
