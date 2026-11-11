import { useMemo } from 'react';
import type { NormalizedRunData } from '../data/normalize';
import {
  aggregateMetric,
  type StepRange,
} from '../data/chart';

interface RangeNavigatorProps {
  data: NormalizedRunData;
  full: StepRange;
  range: StepRange;
  onChange: (range: StepRange) => void;
}

export default function RangeNavigator({
  data,
  full,
  range,
  onChange,
}: RangeNavigatorProps) {
  const frame = useMemo(
    () =>
      aggregateMetric(
        data,
        'loss',
        full,
        120,
      ),
    [data, full],
  );

  const span = Math.max(1, full.end - full.start);
  const min = frame.min ?? 0;
  const max = frame.max ?? 1;
  const valueSpan = Math.max(
    Number.EPSILON,
    max - min,
  );

  const path = frame.points
    .map((point, index) => {
      const startsSegment =
        index === 0 ||
        frame.points[index - 1].segment !==
          point.segment;

      const x =
        ((point.step - full.start) / span) * 1000;

      const y =
        34 -
        ((point.value - min) / valueSpan) * 28;

      return (
        `${startsSegment ? 'M' : 'L'} ` +
        `${x.toFixed(2)} ${y.toFixed(2)}`
      );
    })
    .join(' ');

  const selectionLeft =
    ((range.start - full.start) / span) * 100;

  const selectionWidth =
    ((range.end - range.start) / span) * 100;

  return (
    <div
      className="range-navigator"
      role="group"
      aria-label="Visible step range"
    >
      <svg
        viewBox="0 0 1000 40"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={path}
          fill="none"
          stroke="#087fb0"
          strokeWidth="1"
        />
      </svg>

      <div
        className="range-selection"
        style={{
          left: `${selectionLeft}%`,
          width: `${selectionWidth}%`,
        }}
      />

      <label className="sr-only" htmlFor="range-start">
        Start step
      </label>

      <input
        id="range-start"
        className="range-start"
        type="range"
        min={full.start}
        max={full.end}
        step="1"
        value={range.start}
        onChange={(event) =>
          onChange({
            start: Math.min(
              Number(event.target.value),
              range.end - 1,
            ),
            end: range.end,
          })
        }
      />

      <label className="sr-only" htmlFor="range-end">
        End step
      </label>

      <input
        id="range-end"
        className="range-end"
        type="range"
        min={full.start}
        max={full.end}
        step="1"
        value={range.end}
        onChange={(event) =>
          onChange({
            start: range.start,
            end: Math.max(
              Number(event.target.value),
              range.start + 1,
            ),
          })
        }
      />
    </div>
  );
}