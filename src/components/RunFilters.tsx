import { useEffect, useRef } from 'react';
import type {
  RunFilter,
  RunSort,
} from '../lib/runView';

interface RunFiltersProps {
  filter: RunFilter;
  query: string;
  sort: RunSort;
  ready: boolean;
  onFilterChange: (value: RunFilter) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: RunSort) => void;
}

const filters: {
  value: RunFilter;
  label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'issues', label: 'Issues' },
];

export default function RunFilters({
  filter,
  query,
  sort,
  ready,
  onFilterChange,
  onQueryChange,
  onSortChange,
}: RunFiltersProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      ) {
        return;
      }

      event.preventDefault();
      searchRef.current?.focus();
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, []);

  return (
    <div className="runs-toolbar">
      <div
        className="run-filters"
        role="group"
        aria-label="Filter runs"
      >
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className="run-filter"
            aria-pressed={filter === item.value}
            disabled={
              item.value === 'issues' && !ready
            }
            onClick={() =>
              onFilterChange(item.value)
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="runs-search-sort">
        <label className="runs-search">
          <span className="sr-only">
            Search runs by name or ID
          </span>

          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="10.5"
              cy="10.5"
              r="6.5"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M16 16L21 21"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>

          <input
            ref={searchRef}
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) =>
              onQueryChange(event.target.value)
            }
          />
        </label>

        <label className="runs-sort">
          <span className="sr-only">
            Sort runs
          </span>

          <select
            value={sort}
            onChange={(event) =>
              onSortChange(
                event.target.value as RunSort,
              )
            }
          >
            <option value="points">Points</option>
            <option value="id">Run ID</option>
            <option value="loss" disabled={!ready}>
              Loss
            </option>
          </select>
        </label>
      </div>
    </div>
  );
}