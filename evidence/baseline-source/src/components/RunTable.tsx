import type { RunDefinition } from '../types';
import type { RunOverview } from '../data/overview';

import {
  formatCount,
  formatLoss,
  statusLabels,
} from '../lib/runView';

import LossSparkline from './LossSparkline';
import QualityBadges from './QualityBadges';

interface RunTableProps {
  runs: readonly RunDefinition[];
  overviews: Record<string, RunOverview>;
  loading: boolean;
  failed: boolean;
}

interface NumericValueProps {
  value: number | null | undefined;
  loaded: boolean;
  failed: boolean;
}

function NumericValue({
  value,
  loaded,
  failed,
}: NumericValueProps) {
  if (!loaded) {
    return failed ? (
      <span className="muted">Unavailable</span>
    ) : (
      <span
        className="number-skeleton"
        aria-label="Loading value"
      />
    );
  }

  return (
    <span
      className="metric-number"
      title={
        value == null
          ? 'No finite value available'
          : String(value)
      }
    >
      {formatLoss(value ?? null)}
    </span>
  );
}

export default function RunTable({
  runs,
  overviews,
  loading,
  failed,
}: RunTableProps) {
  return (
    <div
      className="runs-table-scroll"
      role="region"
      aria-label="Training runs table"
      tabIndex={0}
    >
      <table
        className="runs-table"
        aria-busy={loading}
      >
        <caption className="sr-only">
          Training runs. Loss is the latest raw loss.
          Best and peak are finite extrema after
          normalization. Points are source records.
          Open a run ID to inspect its charts.
        </caption>

        <colgroup>
          <col className="column-run" />
          <col className="column-status" />
          <col className="column-loss" />
          <col className="column-best" />
          <col className="column-peak" />
          <col className="column-data" />
          <col className="column-points" />
        </colgroup>

        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Status</th>
            <th scope="col">Loss</th>
            <th scope="col">Best loss</th>
            <th scope="col">Peak loss</th>
            <th scope="col">Data health</th>
            <th
              scope="col"
              className="align-right"
            >
              Points
            </th>
          </tr>
        </thead>

        <tbody>
          {runs.map((run) => {
            const overview = overviews[run.id];
            const loaded = overview !== undefined;

            return (
              <tr key={run.id}>
                <th scope="row">
                  <a
                    className="run-select"
                    href={
                      `#/runs/${encodeURIComponent(run.id)}`
                    }
                    aria-label={
                      `Open ${run.id}, ${run.name}`
                    }
                  >
                    <span
                      className={
                        `run-dot run-dot-${run.status}`
                      }
                      aria-hidden="true"
                    />

                    <span className="run-identity">
                      <strong>{run.id}</strong>
                      <small>{run.name}</small>
                    </span>
                  </a>
                </th>

                <td>
                  <span
                    className={
                      `run-status run-status-${run.status}`
                    }
                  >
                    {statusLabels[run.status]}
                  </span>
                </td>

                <td>
                  <div className="loss-cell">
                    {overview ? (
                      <LossSparkline
                        overview={overview}
                      />
                    ) : (
                      <span
                        className="metric-skeleton"
                        aria-label={
                          failed
                            ? 'Preview unavailable'
                            : 'Loading preview'
                        }
                      />
                    )}

                    <NumericValue
                      value={overview?.latestLoss}
                      loaded={loaded}
                      failed={failed}
                    />
                  </div>
                </td>

                <td>
                  <NumericValue
                    value={overview?.bestLoss}
                    loaded={loaded}
                    failed={failed}
                  />
                </td>

                <td>
                  <NumericValue
                    value={overview?.peakLoss}
                    loaded={loaded}
                    failed={failed}
                  />
                </td>

                <td>
                  <QualityBadges
                    overview={overview}
                    failed={failed}
                  />
                </td>

                <td
                  className="points-cell"
                  title="Source records before duplicate resolution"
                >
                  {formatCount(run.pointCount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}