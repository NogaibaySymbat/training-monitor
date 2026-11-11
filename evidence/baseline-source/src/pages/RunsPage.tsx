import {
  useState,
  type CSSProperties,
} from 'react';

import { RUNS } from '../data/generate';
import { hasDataIssues } from '../data/overview';
import { useRunOverviews } from '../hooks/useRunOverviews';
import { useTablePageSize } from '../hooks/useTablePageSize';

import type {
  RunFilter,
  RunSort,
} from '../lib/runView';

import RunFilters from '../components/RunFilters';
import RunTable from '../components/RunTable';
import '../styles/runs.css';

export default function RunsPage() {
  const {
    overviews,
    error,
    retry,
    ready,
    loading,
    loadedCount,
  } = useRunOverviews();

  const {
    viewportRef,
    pageSize,
    rowHeight,
  } = useTablePageSize();

  const [query, setQuery] = useState('');
  const [filter, setFilter] =
    useState<RunFilter>('all');
  const [sort, setSort] =
    useState<RunSort>('id');
  const [page, setPage] = useState(1);

  const searchTerm = query.trim().toLowerCase();

  const visibleRuns = RUNS.filter((run) => {
    const matchesSearch =
      `${run.id} ${run.name}`
        .toLowerCase()
        .includes(searchTerm);

    if (!matchesSearch) {
      return false;
    }

    if (filter === 'running') {
      return run.status === 'running';
    }

    if (filter === 'issues') {
      const overview = overviews[run.id];

      return overview
        ? hasDataIssues(overview)
        : false;
    }

    return true;
  }).sort((left, right) => {
    if (sort === 'points') {
      return (
        right.pointCount - left.pointCount ||
        left.id.localeCompare(right.id)
      );
    }

    if (sort === 'loss') {
      const leftLoss =
        overviews[left.id]?.latestLoss ?? null;

      const rightLoss =
        overviews[right.id]?.latestLoss ?? null;

      if (leftLoss === null && rightLoss !== null) {
        return 1;
      }

      if (leftLoss !== null && rightLoss === null) {
        return -1;
      }

      return (
        (rightLoss ?? 0) - (leftLoss ?? 0) ||
        left.id.localeCompare(right.id)
      );
    }

    return left.id.localeCompare(right.id);
  });

  const pageCount = Math.max(
    1,
    Math.ceil(visibleRuns.length / pageSize),
  );

  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * pageSize;

  const pageRuns = visibleRuns.slice(
    startIndex,
    startIndex + pageSize,
  );

  const viewportStyle: CSSProperties & {
    '--page-row-height': string;
  } = {
    '--page-row-height': `${rowHeight}px`,
  };

  function clearFilters() {
    setQuery('');
    setFilter('all');
    setPage(1);
  }

  function handleRetry() {
    setFilter('all');
    setSort('id');
    setPage(1);
    retry();
  }

  return (
    <main className="runs-page">
      <header className="runs-header">
        <div>
          <h1 className="runs-title">Runs</h1>

          <p className="runs-subtitle">
            Training metrics and data quality
          </p>
        </div>

        
      </header>

      <RunFilters
        filter={filter}
        query={query}
        sort={sort}
        ready={ready}
        onFilterChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        onSortChange={(value) => {
          setSort(value);
          setPage(1);
        }}
      />

      {error && (
        <section
          className="runs-error"
          role="alert"
        >
          <div>
            <strong>
              Couldn’t prepare all run metrics
            </strong>
            <p>{error}</p>
          </div>

          <button
            type="button"
            className="plain-button"
            onClick={handleRetry}
          >
            Try again
          </button>
        </section>
      )}

      <div
        ref={viewportRef}
        className="runs-table-viewport"
        style={viewportStyle}
      >
        {visibleRuns.length === 0 ? (
          <section className="runs-empty">
            <h2>No runs found</h2>

            <p>
              Try another search or clear your filters.
            </p>

            <button
              type="button"
              className="plain-button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </section>
        ) : (
          <RunTable
            runs={pageRuns}
            overviews={overviews}
            loading={loading}
            failed={error !== null}
          />
        )}
      </div>

      <footer className="runs-footer">
        <div className="runs-footer-info">
          <span aria-live="polite">
            {visibleRuns.length === 0
              ? 'No matching runs'
              : `Showing ${startIndex + 1}–${
                  startIndex + pageRuns.length
                } of ${visibleRuns.length}`}
          </span>

          <span
            className="footer-separator"
            aria-hidden="true"
          />

          <span role="status">
            {loading
              ? `Preparing metrics ${loadedCount}/${RUNS.length}`
              : error
                ? 'Metrics incomplete'
                : 'Synthetic data'}
          </span>
        </div>

        <div className="runs-footer-actions">
          <nav
            className="runs-pagination"
            aria-label="Run list pages"
          >
            <button
              type="button"
              className="runs-page-button"
              disabled={currentPage <= 1}
              onClick={() =>
                setPage(currentPage - 1)
              }
            >
              Previous
            </button>

            <span className="runs-page-counter">
              {currentPage} / {pageCount}
            </span>

            <button
              type="button"
              className="runs-page-button runs-next-button"
              disabled={currentPage >= pageCount}
              onClick={() =>
                setPage(currentPage + 1)
              }
            >
              Next
            </button>
          </nav>

          <details
            className="runs-guide"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false;
              }
            }}
          >
            <summary>Data guide</summary>

            <div className="runs-guide-content">
              <h2>Reading the table</h2>

              <p>
                <strong>Loss</strong> is the raw
                value at the latest normalized step.
                An invalid latest value is unavailable.
              </p>

              <p>
                <strong>Best / Peak</strong> are
                finite extrema after sorting and
                duplicate resolution.
              </p>

              <p>
                <strong>Points</strong> counts
                source records.
              </p>

              <p>
                <strong>Clean</strong> means no
                listed record issues were found.
                It does not mean the run is improving.
              </p>
            </div>
          </details>
        </div>
      </footer>
    </main>
  );
}