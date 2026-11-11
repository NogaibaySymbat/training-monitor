import {
  useEffect,
  useSyncExternalStore,
} from 'react';

import RunsPage from './pages/RunsPage';
import RunPage from './pages/RunPage';
import './index.css';

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);

  return () => {
    window.removeEventListener(
      'hashchange',
      callback,
    );
  };
}

function getSnapshot() {
  return window.location.hash;
}

function getServerSnapshot() {
  return '';
}

function readRunId(hash: string): string | null {
  const match = /^#\/runs\/([^/]+)$/.exec(hash);

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return 'invalid-run-id';
  }
}

export default function App() {
  const hash = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const runId = readRunId(hash);

  useEffect(() => {
    document.title = runId
      ? `${runId} · Soup Run Monitor`
      : 'Runs · Soup Run Monitor';

    window.scrollTo(0, 0);
  }, [runId]);

  return runId ? (
    <RunPage key={runId} runId={runId} />
  ) : (
    <RunsPage />
  );
}