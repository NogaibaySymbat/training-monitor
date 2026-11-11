# Soup Run Monitor

[Live demo](https://nogaibaysymbat.github.io/training-monitor/) · [Repository](https://github.com/NogaibaySymbat/training-monitor)

A read-only frontend for inspecting 20 reproducible synthetic training runs. Includes corrupted records, missing steps, a genuine zero, divergence, and a one-million-point run with a single spike. There is no connection to a real training job or billing service.

## Run locally

Use Node.js 24 and npm 11.

```sh
npm ci
npm run dev
```

Production build and preview:

```sh
npm run build
npm run preview
```

Open Vite's printed URL. The million-point run is at `/#/runs/run-07`.

## Verify

```sh
npm run lint
npm test -- --reporter=verbose
npm run build
npm run test:e2e
```

Browser checks use installed Google Chrome locally; CI uses Chrome preinstalled on Ubuntu 24.04. Fault injection exists only in the browser test harness. Recorded local result: **66 unit tests and 14 browser tests**, including four axe checks with no detected accessibility violations.

## Data policy

All runs come from [the generator](src/data/generate.ts), with seeds 1000 through 1019. Curves, statuses, dates, corruption positions and spike height are implementation choices for this exercise, not real observations.

- Sort complete records by step. Last original duplicate wins, including an invalid latest duplicate.
- Preserve NaN and both infinities; exclude them from finite extrema and break the line. Missing-step intervals also break the line. True zero remains zero.
- Each bucket keeps first, minimum, maximum and last finite original records in step order. This is sampling, not smoothing or averaging. A maximum inside the viewport is retained as its bucket's maximum. It is not injected into windows that exclude it.
- Summary cards use the full normalized series. Hover reads the nearest original record. Display numbers are rounded; titles expose full JavaScript numeric values.
- Numbers explicitly use en-US and timestamps explicitly use UTC. Running describes a static snapshot, not a live connection.
- Disable log scale when any finite value in the full metric is zero or negative. Never substitute an epsilon.
- A worker prepares arrays, statistics and initial frames. Typed-array buffers transfer to the UI for precise inspection. A four-frame LRU cache per metric uses a WeakMap keyed by immutable snapshots. New data must use a new object.

## Fixture map

| Run | Deliberate case |
| --- | --- |
| run-03 | NaN, positive Infinity and negative Infinity in loss |
| run-04 | Conflicting duplicates: 23 removed records and 23 resulting missing-step ranges |
| run-05 | Unsorted records, with all metrics shuffled together |
| run-06 | Two missing-step intervals |
| run-07 | 1,000,000 source records; loss 250 at step 500,000 |
| run-08 | A real zero loss |
| run-09 | Divergence in the last part of the run |

## Controls

Search by name/ID; filter Running or Issues; sort by ID, source point count, or descending latest loss. Unavailable latest values sort last. The table fits a page of rows with Next/Previous. On small screens its region scrolls horizontally.

Focus a chart: arrows inspect records; Shift + arrows move ten; `+`/`-` zoom; `P` selects its peak; `0` resets. Both range handles accept keyboard input. `/` focuses search. Run IDs are ordinary links with browser Back/Forward support.

## Submission evidence

- [Engineering note, exactly two pages](output/pdf/engineering-note.pdf)
- [Readable report](REPORT.md)
- [Performance methodology and limitations](PERFORMANCE.md)
- [AI assistance disclosure](AI_USAGE.md)
- [Unit output](evidence/agent-tests.txt), [browser output](evidence/agent-browser-tests.txt)
- [Accessibility reports](evidence/accessibility/) and [screenshots](evidence/screenshots/)
- [Controlled before/intermediate/optimized measurements](evidence/performance/)
- [Original baseline source](evidence/baseline-source/) and [compiled baseline](evidence/baseline-build.tar.gz)

Original manual traces remain in evidence. The extension-contaminated trace is retained but not used to claim an optimization. The intermediate cache-only measurements are retained too: they did not improve initial readiness. Final measurements include regressions.

## Reproduce profiling

The harness requires Google Chrome. Every repeat uses a new headless browser, 1280 x 900, CPU slowdown 4x, no extensions and no network throttling.

```sh
npm run build -- --sourcemap
npm run preview -- --host 127.0.0.1 --port 4186 --strictPort
```

In another terminal:

```sh
npm run profile -- review http://127.0.0.1:4186 3
```

This writes Chrome-importable traces and raw repeat values into `evidence/performance/review`, preserving the supplied before/optimized results. PERFORMANCE.md explains baseline replay and metric definitions.

## Deployment

Relative Vite assets and hash routes support a GitHub Pages project subpath. The workflow on `codex/training-monitor` checks lint, unit tests, build and browser tests before deploying dist. The deployed app has no runtime API keys or external data dependencies.
