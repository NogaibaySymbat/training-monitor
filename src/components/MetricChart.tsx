import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { MetricKey } from '../types';
import type { NormalizedRunData } from '../data/normalize';

import {
  formatChartNumber,
  makeAxis,
  plotBucketCount,
  type MetricStats,
  type StepRange,
} from '../data/chart';

import { formatCount } from '../lib/runView';
import { getCachedMetricFrame } from '../data/chartCache';

interface MetricChartProps {
  data: NormalizedRunData;
  metric: MetricKey;
  stats: MetricStats;
  range: StepRange;
  raw: boolean;
  cursorIndex: number | null;
  height?: number;
  onInspect: (step: number) => void;
  onClearCursor: () => void;
  onMoveCursor: (direction: number) => void;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onPeak: (step: number) => void;
}

const LEFT = 66;
const RIGHT = 20;
const TOP = 22;
const BOTTOM = 62;

const COLORS: Record<MetricKey, string> = {
  loss: '#087fb0',
  grad_norm: '#a16b13',
  lr: '#7952c7',
};

function valueRatio(
  value: number,
  min: number,
  max: number,
  log: boolean,
): number {
  if (log) {
    return (
      (Math.log10(value) - Math.log10(min)) /
      (Math.log10(max) - Math.log10(min))
    );
  }

  return (value - min) / (max - min);
}

export default function MetricChart(props: MetricChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const initialWidth = element.getBoundingClientRect().width;

    if (initialWidth > 0) {
      setWidth(Math.max(240, Math.floor(initialWidth)));
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;

      if (nextWidth && nextWidth > 0) {
        setWidth(Math.max(240, Math.floor(nextWidth)));
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="metric-container" ref={containerRef} style={{ minWidth: 0 }}>
      {width === null ? (
        <section
          className="metric-chart"
          aria-busy="true"
          style={{ minHeight: (props.height ?? 220) + 115 }}
        >
          <h2>{props.metric === 'loss' ? 'Loss' : props.metric}</h2>
          <p className="metric-meta" role="status">Preparing chart…</p>
        </section>
      ) : (
        <MeasuredMetricChart {...props} width={width} />
      )}
    </div>
  );
}

function MeasuredMetricChart({
  data,
  metric,
  stats,
  range,
  raw,
  cursorIndex,
  height = 220,
  width,
  onInspect,
  onClearCursor,
  onMoveCursor,
  onZoom,
  onReset,
  onPeak,
}: MetricChartProps & { width: number }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const [log, setLog] = useState(false);
  const rangeStart = range.start;
  const rangeEnd = range.end;

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [range.start, range.end]);

  const frame = useMemo(
    () =>
      getCachedMetricFrame(
        data,
        metric,
        { start: rangeStart, end: rangeEnd },
        plotBucketCount(width),
        raw,
      ),
    [data, metric, rangeStart, rangeEnd, width, raw],
  );

  const axis = useMemo(
    () => makeAxis(frame.min, frame.max, log),
    [frame, log],
  );

  const plotWidth = Math.max(
    1,
    width - LEFT - RIGHT,
  );

  const plotHeight = Math.max(
    1,
    height - TOP - BOTTOM,
  );

  const geometry = useMemo(() => {
    function x(step: number) {
      const span = frame.range.end - frame.range.start;

      return span === 0
        ? LEFT + plotWidth / 2
        : LEFT +
            ((step - frame.range.start) / span) *
              plotWidth;
    }

    function y(value: number) {
      return (
        TOP +
        (1 -
          valueRatio(
            value,
            axis.min,
            axis.max,
            log,
          )) *
          plotHeight
      );
    }

    const path = frame.points
      .map((point, index) => {
        const startsSegment =
          index === 0 ||
          frame.points[index - 1].segment !==
            point.segment;

        return (
          `${startsSegment ? 'M' : 'L'} ` +
          `${x(point.step).toFixed(2)} ` +
          `${y(point.value).toFixed(2)}`
        );
      })
      .join(' ');

    const isolated = frame.points.filter(
      (point, index) =>
        (index === 0 ||
          frame.points[index - 1].segment !==
            point.segment) &&
        (index === frame.points.length - 1 ||
          frame.points[index + 1].segment !==
            point.segment),
    );

    return {
      path,
      isolated: isolated.map((point) => ({
        step: point.step,
        x: x(point.step),
        y: y(point.value),
      })),
      peak:
        frame.max !== null &&
        frame.maxStep !== null
          ? {
              x: x(frame.maxStep),
              y: y(frame.max),
            }
          : null,
    };
  }, [
    frame,
    axis,
    log,
    plotWidth,
    plotHeight,
  ]);

  function getX(step: number) {
    const span = range.end - range.start;

    return span === 0
      ? LEFT + plotWidth / 2
      : LEFT +
          ((step - range.start) / span) *
            plotWidth;
  }

  function getY(value: number) {
    return (
      TOP +
      (1 -
        valueRatio(
          value,
          axis.min,
          axis.max,
          log,
        )) *
        plotHeight
    );
  }

  const cursorStep =
    cursorIndex === null
      ? null
      : data.step[cursorIndex];

  const cursorValue =
    cursorIndex === null
      ? null
      : data[metric][cursorIndex];

  const cursorInside =
    cursorStep !== null &&
    cursorStep >= range.start &&
    cursorStep <= range.end;

  const canLog =
    stats.finiteCount > 0 &&
    stats.nonPositiveCount === 0;

  const xTickCount = plotWidth < 500 ? 3 : 5;
  const xTicks = Array.from(
    new Set(
      Array.from(
        { length: xTickCount },
        (_, index) =>
          Math.round(
            range.start +
              ((range.end - range.start) * index) /
                (xTickCount - 1),
          ),
      ),
    ),
  );

  const title =
    metric === 'loss' ? 'Loss' : metric;

  function clearCursor() {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    onClearCursor();
  }

  return (
    <section className="metric-chart">
      <div className="metric-heading">
        <h2>{title}</h2>

        <div
          className="chart-scale"
          role="group"
          aria-label={`${title} scale`}
        >
          <button
            type="button"
            aria-pressed={!log}
            onClick={() => setLog(false)}
          >
            Linear
          </button>

          <button
            type="button"
            aria-pressed={log}
            disabled={!canLog}
            title={
              canLog
                ? 'Use a logarithmic scale'
                : 'Log scale requires positive finite values'
            }
            onClick={() => setLog(true)}
          >
            Log
          </button>
        </div>
      </div>

      <p className="metric-meta">
        {formatCount(frame.visibleCount)} retained records
        {' · '}
        {formatCount(frame.points.length)} finite plot samples
        {' · '}
        {frame.mode === 'raw' ? 'Raw' : 'Min/max sampling'}
      </p>

      {!canLog && stats.nonPositiveCount > 0 && (
        <p className="chart-warning">
          Log unavailable: {stats.nonPositiveCount}
          {' '}zero or negative values in the full series.
          Linear scale keeps them visible.
        </p>
      )}

      <div
        ref={plotRef}
        className="metric-plot"
        tabIndex={0}
        role="group"
        aria-label={`${title} interactive chart`}
        aria-describedby={`${metric}-keyboard-help`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }

          if (
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowRight'
          ) {
            event.preventDefault();

            const direction =
              event.key === 'ArrowLeft' ? -1 : 1;

            onMoveCursor(
              direction * (event.shiftKey ? 10 : 1),
            );
          } else if (
            event.key === '+' ||
            event.key === '='
          ) {
            event.preventDefault();
            onZoom(0.5);
          } else if (event.key === '-') {
            event.preventDefault();
            onZoom(2);
          } else if (event.key === '0') {
            event.preventDefault();
            onReset();
          } else if (
            event.key.toLowerCase() === 'p' &&
            stats.maxStep !== null
          ) {
            event.preventDefault();
            onPeak(stats.maxStep);
          }
        }}
      >
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={
            `${title}. Visible minimum ` +
            `${formatChartNumber(frame.min)}, maximum ` +
            `${formatChartNumber(frame.max)}. ` +
            `${frame.invalidCount} non-finite records. ` +
            `${frame.gapCount} missing-step ranges.`
          }
          onPointerDown={() =>
            plotRef.current?.focus()
          }
          onPointerMove={(event) => {
            const bounds =
              event.currentTarget.getBoundingClientRect();

            const localX =
              ((event.clientX - bounds.left) /
                bounds.width) *
              width;

            const fraction = Math.max(
              0,
              Math.min(
                1,
                (localX - LEFT) / plotWidth,
              ),
            );

            const step =
              range.start +
              fraction * (range.end - range.start);

            if (animationRef.current !== null) {
              cancelAnimationFrame(
                animationRef.current,
              );
            }

            animationRef.current =
              requestAnimationFrame(() => {
                animationRef.current = null;
                onInspect(step);
              });
          }}
          onPointerLeave={clearCursor}
        >
          {axis.ticks.map((tick) => {
            const y = getY(tick);

            return (
              <g key={tick}>
                <line
                  x1={LEFT}
                  x2={width - RIGHT}
                  y1={y}
                  y2={y}
                  stroke="#e8edf4"
                />

                <text
                  x={LEFT - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="chart-axis-label"
                >
                  {formatChartNumber(tick)}
                </text>
              </g>
            );
          })}

          {xTicks.map((tick) => (
            <text
              key={tick}
              x={getX(tick)}
              y={height - BOTTOM + 22}
              textAnchor={tick === range.end ? 'end' : 'middle'}
              className="chart-axis-label"
            >
              {formatCount(tick)}
            </text>
          ))}

          <path
            d={geometry.path}
            fill="none"
            stroke={COLORS[metric]}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {geometry.isolated.map((point) => (
            <circle
              key={point.step}
              cx={point.x}
              cy={point.y}
              r="2"
              fill={COLORS[metric]}
            />
          ))}

          {geometry.peak && (
            <circle
              cx={geometry.peak.x}
              cy={geometry.peak.y}
              r="3.5"
              fill={COLORS[metric]}
            />
          )}

          {!cursorInside && geometry.peak && (
            <text
              x={Math.max(
                LEFT + 6,
                Math.min(
                  width - 240,
                  geometry.peak.x + 10,
                ),
              )}
              y={geometry.peak.y < TOP + 26 ? TOP - 6 : geometry.peak.y - 10}
              className="chart-peak-label"
            >
              Max {formatChartNumber(frame.max)}
              {' · '}
              step {formatCount(frame.maxStep!)}
            </text>
          )}

          {cursorInside && cursorStep !== null && (
            <line
              x1={getX(cursorStep)}
              x2={getX(cursorStep)}
              y1={TOP}
              y2={height - BOTTOM}
              stroke="#8c9aaf"
              strokeDasharray="4 4"
            />
          )}

          {cursorInside &&
            cursorStep !== null &&
            cursorValue !== null &&
            Number.isFinite(cursorValue) && (
              <circle
                cx={getX(cursorStep)}
                cy={getY(cursorValue)}
                r="4"
                fill={COLORS[metric]}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            )}

          <line
            x1={LEFT}
            x2={width - RIGHT}
            y1={height - 20}
            y2={height - 20}
            stroke="#edf1f6"
            strokeWidth="5"
          />

          {frame.events.map((event, index) => (
            <line
              key={`${event.kind}-${index}`}
              x1={getX(event.step)}
              x2={getX(event.step)}
              y1={height - 24}
              y2={height - 16}
              stroke={
                event.kind === 'invalid'
                  ? '#bf354b'
                  : '#ae7417'
              }
              strokeWidth="3"
            >
              <title>
                {event.count}
                {' '}
                {event.kind === 'invalid'
                  ? 'non-finite records'
                  : 'missing-step ranges'}
                {' '}in this sampled bucket
              </title>
            </line>
          ))}

          {frame.points.length === 0 && (
            <text
              x={LEFT + plotWidth / 2}
              y={TOP + plotHeight / 2}
              textAnchor="middle"
              className="chart-empty-label"
            >
              No finite values in this window
            </text>
          )}
        </svg>

        {cursorInside && cursorStep !== null && (
          <div
            className="chart-tooltip"
            style={{
              left: Math.max(
                LEFT,
                Math.min(
                  width - 210,
                  getX(cursorStep) + 12,
                ),
              ),
            }}
          >
            <span>
              Step {formatCount(cursorStep)}
            </span>
            <strong
              title={cursorValue === null ? 'Unavailable' : String(cursorValue)}
              aria-label={`${metric}: ${cursorValue === null ? 'Unavailable' : String(cursorValue)}`}
            >
              {metric}: {formatChartNumber(cursorValue)}
            </strong>
            <small>Nearest original record</small>
          </div>
        )}
      </div>

      <div className="chart-bottom">
        <p>
          {frame.invalidCount > 0 && (
            <span className="chart-invalid-note">
              {frame.invalidCount} non-finite values
              {' · '}
            </span>
          )}

          {frame.gapCount > 0 && (
            <span className="chart-gap-note">
              {frame.gapCount} missing-step ranges
              {' · '}
            </span>
          )}

          Step {formatCount(range.start)}
          {' – '}
          {formatCount(range.end)}
        </p>

        <output aria-live="polite">
          {cursorInside && cursorStep !== null
            ? `${formatCount(cursorStep)} · ${formatChartNumber(cursorValue)}`
            : 'Hover to inspect raw values'}
        </output>
      </div>

      <p
        className="sr-only"
        id={`${metric}-keyboard-help`}
      >
        Arrow keys move one record. Shift and arrow
        keys move ten records. Plus and minus zoom.
        Zero resets zoom. P jumps to the metric peak.
      </p>
    </section>
  );
}
