import {
  hasDataIssues,
  type RunOverview,
} from '../data/overview';

interface QualityBadgesProps {
  overview?: RunOverview;
  failed: boolean;
}

export default function QualityBadges({
  overview,
  failed,
}: QualityBadgesProps) {
  if (!overview) {
    return (
      <span className="muted">
        {failed ? 'Unavailable' : 'Checking…'}
      </span>
    );
  }

  const quality = overview.quality;

  const invalidCount = Object.values(
    quality.sourceInvalidValues,
  ).reduce((total, count) => total + count, 0);

  if (!hasDataIssues(overview)) {
    return <span className="muted">Clean</span>;
  }

  return (
    <div className="quality-flags">
      {invalidCount > 0 && (
        <span className="quality-danger">
          Non-finite {invalidCount}
        </span>
      )}

      {quality.duplicatesRemoved > 0 && (
        <span className="quality-purple">
          Dupes {quality.duplicatesRemoved}
        </span>
      )}

      {quality.wasReordered && (
        <span className="quality-warning">
          Unsorted
        </span>
      )}

      {quality.gapCount > 0 && (
        <span className="quality-warning">
          Gaps {quality.gapCount}
        </span>
      )}
    </div>
  );
}