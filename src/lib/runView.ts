import type { RunStatus } from '../types';

export type RunFilter =
  | 'all'
  | 'running'
  | 'issues';

export type RunSort =
  | 'id'
  | 'points'
  | 'loss';

export const statusLabels: Record<RunStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

const countFormatter = new Intl.NumberFormat('en-US');

const lossFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
});

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function formatLoss(
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Unavailable';
  }

  if (value !== 0 && Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }

  return lossFormatter.format(value);
}