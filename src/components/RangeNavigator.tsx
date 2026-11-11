import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedRunData } from '../data/normalize';
import {
  aggregateMetric,
  type StepRange,
  type MetricFrame,
} from '../data/chart';
import { formatCount } from '../lib/runView';

interface RangeNavigatorProps {
  data: NormalizedRunData;
  full: StepRange;
  range: StepRange;
  onChange: (range: StepRange) => void;
  prepared?: MetricFrame;
}

export default function RangeNavigator({
  data,
  full,
  range,
  onChange,
  prepared,
}: RangeNavigatorProps) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragLayout, setDragLayout] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const element = overviewRef.current;
    if (!element) return;
    const measure = () => setTrackWidth(Math.floor(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const finish = () => setDragLayout(null);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    };
  }, []);

  const frame = useMemo(
    () =>
      prepared ?? aggregateMetric(
        data,
        'loss',
        full,
        120,
      ),
    [data, full, prepared],
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

  // Keep the real overview selection narrow. Give close handles separate
  // native control rows rather than widening the represented data interval.
  const needsSeparateRows = trackWidth * selectionWidth / 100 < 52;
  const separated = dragLayout ?? needsSeparateRows;

  return (
    <div
      className={`range-navigator${separated ? ' range-separated' : ''}`}
      role="group"
      aria-label="Visible step range"
    >
      <div className="range-overview" ref={overviewRef}>
        <svg
          viewBox="0 0 1000 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={path} fill="none" stroke="#087fb0" strokeWidth="1" />
        </svg>
        <div
          className="range-selection"
          style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }}
        />
      </div>

      <div className="range-controls">
        {(['start', 'end'] as const).map((boundary) => (
          <div key={boundary} className={`range-control range-control-${boundary}`}>
            <div className="range-control-caption">
              <label htmlFor={`range-${boundary}`}>
                {boundary === 'start' ? 'Start step' : 'End step'}
              </label>
              <output aria-hidden="true">{formatCount(range[boundary])}</output>
            </div>
            <input
              id={`range-${boundary}`}
              className={`range-${boundary}`}
              type="range"
              min={full.start}
              max={full.end}
              step="1"
              value={range[boundary]}
              onPointerDown={() => setDragLayout(separated)}
              onPointerUp={() => setDragLayout(null)}
              onPointerCancel={() => setDragLayout(null)}
              onBlur={() => setDragLayout(null)}
              onChange={(event) => {
                const value = Number(event.target.value);
                onChange(boundary === 'start'
                  ? { start: Math.min(value, range.end - 1), end: range.end }
                  : { start: range.start, end: Math.max(value, range.start + 1) });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
