# Soup Run Monitor

[Live demo](https://nogaibaysymbat.github.io/training-monitor/) · [Two-page engineering note](output/pdf/engineering-note.pdf) · [Performance evidence](PERFORMANCE.md) · [AI disclosure](AI_USAGE.md)

A frontend take-home project for inspecting training metrics without hiding problems in the underlying data. Built with **React, TypeScript and Vite**, with custom SVG charts and Web Workers.

The application contains **20 reproducible synthetic runs**, including a run with **1,000,000 records and a single outlier spike**. All data is generated locally; no external training dataset or API is used. Run statuses describe a fixed snapshot, not a live training connection. This is a read-only monitor, with no real billing or stop-run action.

## What to try

- Search runs by name or ID, filter Running or Issues, and sort by ID, point count or latest loss.
- Open a run to inspect `loss`, `grad_norm` and `lr`, summary cards and data-quality notices.
- Use zoom presets, the range navigator, hover inspection and linear/log scale controls.
- Open [run-07](https://nogaibaysymbat.github.io/training-monitor/#/runs/run-07), select **Inspect peak**, and compare the full range with narrower windows. The loss spike is **250 at step 500,000**.
- Open **run-03** for NaN and infinities, **run-08** for a true zero, and **run-09** for divergence.

Loading, empty, error, retry and unknown-run states are implemented. The list uses Previous/Next pagination; on narrow screens, its table can be scrolled horizontally.

## Run locally

Requirements: **Node.js 24** and **npm 11**. Browser tests and performance profiling also require **Google Chrome** installed on the machine.

```sh
git clone https://github.com/NogaibaySymbat/training-monitor.git
cd training-monitor
npm ci
npm run dev
```

Production build and preview:

```sh
npm run build
npm run preview
```

Open Vite's printed URL. The million-point run is at `/#/runs/run-07`. No API keys, environment variables or backend service are required.

## Verify

```sh
npm run lint
npm test -- --reporter=verbose
npm run build
npm run test:e2e
```

Build the app before running browser tests. Playwright starts a local production preview on port **4186** and uses the installed Chrome browser. CI runs the same checks with Chrome on Ubuntu 24.04; deployment proceeds only when they pass.

Verified results: **66 unit tests and 16 browser tests passed**, including four automated axe accessibility audits at 1280px and 320px. Saved output is available in [unit logs](evidence/agent-tests.txt), [browser logs](evidence/agent-browser-tests.txt) and the [browser JSON report](evidence/browser-results.json). See [GitHub Actions](https://github.com/NogaibaySymbat/training-monitor/actions) for CI results.

Coverage includes normalization, sampling, summary and axis values, hover inspection, zoom presets, keyboard controls, mouse/touch range selection, pagination, worker failures, retry, late responses, locale/time-zone consistency and empty/all-invalid inputs. Fault injection is part of the test harness, not an application setting.

## Data policy

All runs come from [the generator](src/data/generate.ts), with seeds 1000 through 1019. Curves, statuses, dates, corruption positions and spike height are implementation choices for this exercise, not real observations.

- Sort complete records by step. Last original duplicate wins, including an invalid latest duplicate.
- Preserve NaN and both infinities; exclude them from finite extrema and break the line. Missing-step intervals also break the line. True zero remains zero.
- Each bucket keeps first, minimum, maximum and last finite original records in step order. This is sampling, not smoothing or averaging. A maximum inside the viewport is retained as its bucket's maximum. It is not injected into windows that exclude it.
- Summary cards use the full normalized series. Hover reads the nearest original record. The Points card counts source records; chart metadata counts retained records in the visible window. Display numbers are rounded; titles expose full JavaScript numeric values.
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

“Clean” means no listed record-quality issues were detected. It does not mean a run is improving or should continue.

## Controls

| Control | Action |
| --- | --- |
| `/` on the run list | Focus search |
| Tab / Shift + Tab | Move between links and controls |
| Left / Right on a focused chart | Inspect the previous / next record |
| Shift + Left / Right | Move ten records |
| `+` / `-` | Zoom in / out |
| `P` | Inspect that metric's peak |
| `0` | Reset to the full range |

Both range handles support native keyboard input. Run IDs are ordinary links with browser Back/Forward support. Unavailable latest loss values sort last.

When the two range handles are close, they move into separate Start/End rows with 44px pointer targets. The overview still shows the exact selected interval. Mouse dragging, touch dragging at 390/320px and touch cancellation have browser regression coverage; the same regression fails against the original compiled baseline ([preserved output](evidence/range-regression-before.txt)).

## Review materials

| Material | Location |
| --- | --- |
| Two-page note: decisions, test limits, verdict and reflection | [Engineering note](output/pdf/engineering-note.pdf) |
| Text version of the note | [REPORT.md](REPORT.md) |
| Profiling method and before/after measurements | [PERFORMANCE.md](PERFORMANCE.md) |
| AI assistance, accepted suggestions and verification | [AI_USAGE.md](AI_USAGE.md) |
| Test output and accessibility reports | [evidence/](evidence/) |
| Desktop/mobile screenshots | [evidence/screenshots/](evidence/screenshots/) |
| Controlled baseline, intermediate and final traces | [evidence/performance/](evidence/performance/) |
| Original baseline for reproducing the comparison | [Compiled build](evidence/baseline-build.tar.gz) · [Extracted source](evidence/baseline-source/) |

Failed and intermediate results are preserved. These include an extension-contaminated manual profile, the cache-only attempt that did not improve startup, the [Raw-handle regression on the original baseline](evidence/range-regression-before.txt) and the [initial CI pointer-test failure](evidence/range-ci-failure.txt). Their causes and corrections are described in [AI_USAGE.md](AI_USAGE.md).

## Performance results

The controlled comparison uses production builds, a clean headless Chrome browser, a 1280 × 900 viewport, **4× CPU slowdown** and three fresh-browser repeats per version. Values below are medians:

| Measurement | Before | Final |
| --- | ---: | ---: |
| All three chart paths ready, including two animation frames | 529.5 ms | 434.6 ms |
| First 100k zoom click response | 69.0 ms | 75.0 ms |
| Return to the previously viewed full range | 66.8 ms | 16.4 ms |
| Hover response proxy | 23.8 ms | 27.9 ms |
| Renderer RSS after garbage collection | 195.06 MiB | 195.72 MiB |

The chart-readiness measurement is not LCP. The hover proxy includes observing the correct tooltip and the next animation frame; it is not physical display latency. Startup and repeated zoom improved, while cold zoom, median hover and memory results regressed slightly. All repeats and intermediate results are retained.

See [PERFORMANCE.md](PERFORMANCE.md) for measurement definitions, memory categories, baseline replay instructions and limitations. The final raw results and Chrome-importable traces are in [evidence/performance/range-fix](evidence/performance/range-fix/).

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

This writes Chrome-importable traces and raw repeat values into `evidence/performance/review`. Choose a new output label instead of `review` for subsequent recordings to preserve previous evidence.

## Deployment

Relative Vite assets and hash routes support a GitHub Pages project subpath. The workflow on `codex/training-monitor` checks lint, unit tests, build and browser tests before deploying dist. The deployed app has no runtime API keys or external data dependencies.

## Scope and remaining limitations

- This submission is a static, read-only demonstration. It does not implement a live freshness protocol, billing or control of real training jobs.
- Uncached viewport sampling still runs on the main thread. Moving those queries into a worker or a tested range index is the first performance follow-up.
- Sampling preserves bucket extrema and line breaks, not every fluctuation or the exact position of every invalid value at compressed scales. Automated tests cover finite fixtures and exposed presets, not every possible dataset, zoom width or browser rasterization.
- The cache assumes immutable snapshots. Future live updates must create new data identities or explicitly invalidate cached frames.
- Returning to the list resets its search, filter and sort state. Mobile tests use Chrome emulation; manual screen-reader and physical-device testing remain follow-ups. Automated axe checks do not establish full accessibility coverage.

**Release verdict: SHIP the scoped read-only demo.** The [engineering note](output/pdf/engineering-note.pdf) explains the evidence and what must change before treating it as a monitor for a paid live run.
