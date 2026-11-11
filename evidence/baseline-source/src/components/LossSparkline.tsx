import type { RunOverview } from '../data/overview';
import { formatLoss } from '../lib/runView';

interface LossSparklineProps {
  overview: RunOverview;
}

export default function LossSparkline({
  overview,
}: LossSparklineProps) {
  const {
    preview,
    bestLoss,
    peakLoss,
    stepStart,
    stepEnd,
  } = overview;

  if (
    preview.length === 0 ||
    bestLoss === null ||
    peakLoss === null ||
    stepStart === null ||
    stepEnd === null
  ) {
    return (
      <span
        className="sparkline-empty"
        aria-hidden="true"
      >
        —
      </span>
    );
  }

  const width = 70;
  const height = 26;
  const padding = 2;

  const minimum = bestLoss;
  const maximum = peakLoss;
  const start = stepStart;
  const end = stepEnd;

  const stepRange = end - start;
  const valueRange = maximum - minimum;

  function getX(step: number): number {
    if (stepRange === 0) {
      return width / 2;
    }

    return (
      padding +
      ((step - start) / stepRange) *
        (width - padding * 2)
    );
  }

  function getY(value: number): number {
    if (valueRange === 0) {
      return height / 2;
    }

    return (
      padding +
      (1 - (value - minimum) / valueRange) *
        (height - padding * 2)
    );
  }

  const path = preview
    .map((point, index) => {
      const startsSegment =
        index === 0 ||
        preview[index - 1].segment !==
          point.segment;

      const command = startsSegment ? 'M' : 'L';

      return (
        `${command} ` +
        `${getX(point.step).toFixed(2)} ` +
        `${getY(point.value).toFixed(2)}`
      );
    })
    .join(' ');

  const isolatedPoints = preview.filter(
    (point, index) => {
      const hasPrevious =
        index > 0 &&
        preview[index - 1].segment ===
          point.segment;

      const hasNext =
        index < preview.length - 1 &&
        preview[index + 1].segment ===
          point.segment;

      return !hasPrevious && !hasNext;
    },
  );

  const firstValue = preview[0].value;
  const lastValue =
    preview[preview.length - 1].value;

  const rising = lastValue > firstValue;

  const description =
    `Loss preview. Minimum ${formatLoss(minimum)}, ` +
    `maximum ${formatLoss(maximum)}. ` +
    'Non-finite values and missing-step gaps are not joined.';

  return (
    <svg
      className={
        rising
          ? 'loss-sparkline loss-sparkline-rising'
          : 'loss-sparkline'
      }
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={description}
    >
      <title>{description}</title>

      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {isolatedPoints.map((point) => (
        <circle
          key={point.step}
          cx={getX(point.step)}
          cy={getY(point.value)}
          r="0.9"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}