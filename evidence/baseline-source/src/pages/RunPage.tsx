import { useMemo, useState } from 'react';
import type { RunDefinition } from '../types';
import { RUNS } from '../data/generate';

import {
  fitRange,
  lowerBound,
  nearestIndex,
  upperBound,
  type StepRange,
} from '../data/chart';

import { useRunData } from '../hooks/useRunData';

import {
  formatCount,
  formatLoss,
  statusLabels,
} from '../lib/runView';

import MetricChart from '../components/MetricChart';
import RangeNavigator from '../components/RangeNavigator';
import '../styles/run.css';

interface RunPageProps {
  runId: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function rawValue(value: number | null): string {
  return value === null ? 'Unavailable' : String(value);
}

export default function RunPage({ runId }: RunPageProps) {
  const run = RUNS.find(
    (candidate) => candidate.id === runId,
  );

  if (!run) {
    return (
      <main className="run-page">
        <a href="#/runs" className="run-back">
          Back to runs
        </a>

        <h1>Run not found</h1>
        <p>This run ID does not exist in the demo.</p>
      </main>
    );
  }

  return <RunDetail key={run.id} run={run} />;
}

function RunDetail({ run }: { run: RunDefinition }) {
  const { payload, error, retry } = useRunData(run.id);

  const [range, setRange] = useState<StepRange | null>(null);
  const [preset, setPreset] = useState('all');
  const [cursorIndex, setCursorIndex] =
    useState<number | null>(null);

  const firstStep = payload?.data.step[0] ?? 0;

  const lastStep = payload
    ? payload.data.step[payload.data.step.length - 1]
    : 1;

  const fullRange = useMemo(
    () => ({
      start: firstStep,
      end: lastStep,
    }),
    [firstStep, lastStep],
  );

  const visibleRange = range ?? fullRange;

  function changeRange(next: StepRange) {
    setRange(next);
    setPreset('custom');
    setCursorIndex(null);
  }

  function inspect(step: number) {
    if (payload) {
      setCursorIndex(
        nearestIndex(payload.data.step, step),
      );
    }
  }

  function moveCursor(direction: number) {
    if (!payload) {
      return;
    }

    const first = lowerBound(
      payload.data.step,
      visibleRange.start,
    );

    const last =
      upperBound(
        payload.data.step,
        visibleRange.end,
      ) - 1;

    if (last < first) {
      return;
    }

    setCursorIndex((previous) => {
      if (previous === null) {
        return direction < 0 ? last : first;
      }

      return Math.max(
        first,
        Math.min(last, previous + direction),
      );
    });
  }

  function zoom(factor: number) {
    if (!payload) {
      return;
    }

    const center =
      cursorIndex !== null
        ? payload.data.step[cursorIndex]
        : (visibleRange.start + visibleRange.end) / 2;

    setRange(
      fitRange(
        fullRange,
        (visibleRange.end - visibleRange.start) * factor,
        center,
      ),
    );

    setPreset('custom');
  }

  function resetZoom() {
    setRange(null);
    setPreset('all');
    setCursorIndex(null);
  }

  function selectPreset(
    name: string,
    span: number | null,
  ) {
    if (span === null) {
      resetZoom();
      return;
    }

    const center =
      payload && cursorIndex !== null
        ? payload.data.step[cursorIndex]
        : (visibleRange.start + visibleRange.end) / 2;

    setRange(
      fitRange(fullRange, span, center),
    );

    setPreset(name);
    setCursorIndex(null);
  }

  function jumpToPeak(step: number) {
    if (!payload) {
      return;
    }

    setRange(
      fitRange(
        fullRange,
        visibleRange.end - visibleRange.start,
        step,
      ),
    );

    setCursorIndex(
      nearestIndex(payload.data.step, step),
    );

    setPreset('custom');
  }

  function reload() {
    setRange(null);
    setPreset('all');
    setCursorIndex(null);
    retry();
  }

  const notices: {
    text: string;
    tone: string;
  }[] = [];

  if (payload) {
    const quality = payload.data.quality;

    for (const metric of ['loss', 'grad_norm', 'lr'] as const) {
      const count = quality.sourceInvalidValues[metric];

      if (count > 0) {
        notices.push({
          text:
            formatCount(count) +
            ' non-finite values in ' +
            metric,
          tone: 'danger',
        });
      }
    }

    if (quality.duplicatesRemoved > 0) {
      notices.push({
        text:
          formatCount(quality.duplicatesRemoved) +
          ' duplicate records removed',
        tone: 'warning',
      });
    }

    if (quality.gapCount > 0) {
      notices.push({
        text:
          formatCount(quality.gapCount) +
          ' missing-step ranges',
        tone: 'warning',
      });
    }

    if (quality.wasReordered) {
      notices.push({
        text: 'Step order corrected',
        tone: 'neutral',
      });
    }
  }

  const chartProps = payload
    ? {
        data: payload.data,
        range: visibleRange,
        raw: preset === 'raw',
        cursorIndex,
        onInspect: inspect,
        onClearCursor: () => setCursorIndex(null),
        onMoveCursor: moveCursor,
        onZoom: zoom,
        onReset: resetZoom,
        onPeak: jumpToPeak,
      }
    : null;

  const peakStep =
    payload?.stats.loss.maxStep ?? null;

  const updatedAt = dateFormatter.format(
    new Date(run.updatedAt),
  );

  return (
    <main className="run-page">
      <nav
        className="run-topbar"
        aria-label="Run navigation"
      >
        

        <a href="#/runs" className="run-back">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14 6L8 12L14 18"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          All runs
        </a>
      </nav>

      <header className="run-header">
        <div>
          <div className="run-title-row">
            <h1>{run.id}</h1>

            <span
              className={
                'detail-status detail-status-' +
                run.status
              }
            >
              {statusLabels[run.status]}
            </span>
          </div>

          <p className="run-snapshot">
            {run.name} · Synthetic data
          </p>
        </div>

        <p className="run-header-meta">
          Snapshot · {updatedAt} UTC
        </p>
      </header>

      {error ? (
        <section
          className="run-load-error"
          role="alert"
        >
          <h2>Couldn’t load this run</h2>
          <p>{error}</p>

          <button
            type="button"
            className="detail-button"
            onClick={reload}
          >
            Try again
          </button>
        </section>
      ) : !payload || !chartProps ? (
        <section
          className="run-loading"
          role="status"
          aria-label="Loading run data"
        >
          <p>
            Preparing {formatCount(run.pointCount)} records…
          </p>

          <div className="run-loading-block" />
          <div className="run-loading-block short" />
          <div className="run-loading-block short" />
        </section>
      ) : (
        <>
          <section
            className="run-statistics"
            aria-label="Run summary"
          >
            <article>
              <h2>Latest loss</h2>

              <strong
                title={rawValue(payload.stats.loss.latest)}
                aria-label={
                  'Latest loss: ' +
                  rawValue(payload.stats.loss.latest)
                }
              >
                {formatLoss(payload.stats.loss.latest)}
              </strong>

              <small>
                At step {formatCount(lastStep)}
              </small>
            </article>

            <article>
              <h2>Best loss</h2>

              <strong
                title={rawValue(payload.stats.loss.min)}
                aria-label={
                  'Best loss: ' +
                  rawValue(payload.stats.loss.min)
                }
              >
                {formatLoss(payload.stats.loss.min)}
              </strong>

              <small>Lowest finite loss</small>
            </article>

            <article>
              <h2>Peak loss</h2>

              <strong
                title={rawValue(payload.stats.loss.max)}
                aria-label={
                  'Peak loss: ' +
                  rawValue(payload.stats.loss.max)
                }
              >
                {formatLoss(payload.stats.loss.max)}
              </strong>

              <small>
                {peakStep === null
                  ? 'No finite value'
                  : 'At step ' + formatCount(peakStep)}
              </small>
            </article>

            <article>
              <h2>Points</h2>

              <strong>
                {formatCount(
                  payload.data.quality.sourcePointCount,
                )}
              </strong>

              <small>Source records</small>
            </article>
          </section>

          {notices.length > 0 && (
            <section
              className="run-data-notices"
              aria-label="Source data quality"
            >
              <span className="run-notices-label">
                Data quality
              </span>

              <div className="run-notice-list">
                {notices.map((notice) => (
                  <span
                    key={notice.text}
                    className={
                      'run-data-notice notice-' +
                      notice.tone
                    }
                  >
                    {notice.text}
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="run-zoom">
            <div
              className="run-zoom-controls"
              role="group"
              aria-label="Visible step window"
            >
              {[
                {
                  label: 'All',
                  value: 'all',
                  span: null,
                },
                {
                  label: '100k',
                  value: '100k',
                  span: 100_000,
                },
                {
                  label: '10k',
                  value: '10k',
                  span: 10_000,
                },
                {
                  label: 'Raw',
                  value: 'raw',
                  span: 1000,
                },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={preset === item.value}
                  disabled={
                    item.span !== null &&
                    item.value !== 'raw' &&
                    fullRange.end - fullRange.start <
                      item.span
                  }
                  onClick={() =>
                    selectPreset(
                      item.value,
                      item.span,
                    )
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>

            {peakStep !== null && (
              <button
                type="button"
                className="run-inspect-button"
                onClick={() =>
                  jumpToPeak(peakStep)
                }
              >
                Inspect peak
              </button>
            )}
          </div>

          <MetricChart
            {...chartProps}
            metric="loss"
            stats={payload.stats.loss}
            height={340}
          />

          <RangeNavigator
            data={payload.data}
            full={fullRange}
            range={visibleRange}
            onChange={changeRange}
          />

          <MetricChart
            {...chartProps}
            metric="grad_norm"
            stats={payload.stats.grad_norm}
            height={230}
          />

          <MetricChart
            {...chartProps}
            metric="lr"
            stats={payload.stats.lr}
            height={230}
          />

          <p className="run-keyboard-note">
            Focus a chart: arrows inspect records,
            Shift + arrows move ten records,
            + / − zoom, P selects its peak,
            0 resets the range.
          </p>
        </>
      )}
    </main>
  );
}