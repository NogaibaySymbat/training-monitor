# Engineering note - Soup Run Monitor

11 November 2026

## Scope and provenance

20 generated training runs; no external training logs, billing data or real stop controls. Seeds 1000-1019 reproduce every record. run-07 has 1,000,000 source points and one loss spike of 250 at step 500,000. The generator deliberately includes NaN, both infinities, conflicting duplicates, unsorted records, gaps, zero loss and divergence. Curves, statuses and dates are implementation choices, not measured training results.

## What makes the chart trustworthy

Complete records are sorted by step. The last original duplicate wins, even when invalid. Invalid metrics remain invalid and break the line; missing-step ranges also break it. Each bucket retains its first, minimum, maximum and last finite original record, in order, with segment identity. The spike is its bucket maximum and is retained whenever its step is inside the viewport; it is not shown in unrelated windows. No smoothing, zero substitution or averaging is applied. Cards use full-series normalized values; hover reads the nearest original record. Rounded displays expose full numbers in titles.

## Performance

Apple M2 Pro, 157.0.8103.50 Chrome, production builds, headless, 1280 x 900, CPU slowdown 4x, no extensions or network throttling. Three fresh-browser repeats per version; table uses medians except the stated maximum. Ready means three non-empty SVG paths committed plus two animation frames, including below-fold charts; it is not LCP. Click response comes from trace EventTiming. Hover measures a correct-step tooltip observed plus the next animation frame, a paint-boundary proxy rather than display latency. Memory is sampled after forced GC; RSS differs from Chrome Task Manager footprint.

| Metric | Before | Optimized |
| --- | ---: | ---: |
| All three charts ready (ms) | 529.5 | 434.6 |
| Longest load task >=50 ms (ms) | 153.8 | 0.0 |
| First 100k click response (ms) | 69.0 | 75.0 |
| Return to All click response (ms) | 66.8 | 16.4 |
| Hover response proxy, median (ms) | 23.8 | 27.9 |
| Hover response proxy, maximum (ms) | 53.0 | 51.6 |
| Retained V8 used heap (MiB) | 4.16 | 4.39 |
| Renderer RSS after GC (MiB) | 195.06 | 195.72 |

Initial frames now prepare in the worker alongside generation, normalization and statistics; original buffers transfer to the UI. A four-frame-per-metric LRU cache uses immutable snapshot identity. The final version includes the Raw handle fix. Startup and repeated zoom improved, but cold 100k zoom and median hover regressed. Heap increased slightly. Zero in the task row means no task reached 50 ms in the median repeat. All repeats remain available, including cache-only results (539 ms readiness) under after and the prior worker version under optimized.

## Checks and their output

66 unit tests in four files and 16 Playwright browser tests passed locally. Coverage includes deterministic data, duplicate policy, invalid/zero preservation, gaps, extrema, sampling bounds, cache eviction and snapshot isolation, worker-frame equivalence, resize fallback, DOM summaries/axes/hover, zoom presets, keyboard, filtering and pagination. Raw handles use separate labelled rows when close; mouse, touch at 390/320 px and cancellation are tested. The new regression fails on the original baseline; its output is retained. Four axe audits at 1280/320 px found no violations. Logs, screenshots and traces are in evidence.

## Silent failures checked

Race: a deliberately late response from the previous run still fires after termination and cannot replace the current charts; a mismatched run ID is ignored. Failures: startup error is visible, retry recovers, a non-responding worker times out after 15 seconds, and empty/all-invalid inputs have explicit states. Freshness: fixed snapshot time and no-live-updates disclosure prevent Running from implying a live connection. Locale/time zone: en-US and UTC remain identical in Los Angeles and Almaty browser contexts. Log zero: a real zero remains inspectable and disables log scale. Divergence is retained without smoothing.

## What the tests do not catch

Finite fixtures and presets are not exhaustive proof of all data distributions, zoom widths or rasterization. Sampling preserves extrema, not every fluctuation or every invalid position in a compressed bucket; the event strip aggregates counts. Axe does not replace screen-reader, low-vision or real-device testing. Profiles are three local headless repeats, not population statistics or a low-end phone benchmark. Fault injection tests frontend isolation, not an actual streaming server, billing system or network freshness protocol. Cached snapshots must be immutable; future in-place updates would violate that contract.

## Verdict: SHIP the scoped read-only demo

The displayed synthetic values, corruption disclosures and interactions have reproducible evidence. First follow-up: move uncached viewport queries into the worker or use a tested range index, because first 100k zoom still blocks the main thread. A paid live-run service additionally needs a real data source and freshness/connection contract; this demo does not claim those capabilities.

## Reflection and AI use

The most surprising finding was that an apparently slow million-point chart was initially dominated by browser extensions. Clean profiling changed the diagnosis. The cache-only attempt improved repeated navigation but not startup, prompting worker-side initial frames. What still concerns me is the uncached viewport scan and the temptation to treat local checks as production certainty. AI assisted code, tests, profiling and this note; the candidate supplied the design direction and initial checks, and should review the final source and explanation. Details: AI_USAGE.md.

Repository: https://github.com/NogaibaySymbat/training-monitor

Demo: https://nogaibaysymbat.github.io/training-monitor/
