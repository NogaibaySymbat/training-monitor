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
| All three charts ready (ms) | 529.5 | 468.2 |
| Longest load main-thread task (ms) | 153.8 | 54.2 |
| First 100k click response (ms) | 69.0 | 85.9 |
| Return to All click response (ms) | 66.8 | 18.3 |
| Hover response proxy, median (ms) | 23.8 | 29.7 |
| Hover response proxy, maximum (ms) | 53.0 | 35.0 |
| Retained V8 used heap (MiB) | 4.16 | 4.37 |
| Renderer RSS after GC (MiB) | 195.06 | 195.41 |

Initial frames now prepare in the worker, alongside generation, normalization and statistics. Original typed-array buffers transfer to the UI. A four-frame-per-metric LRU cache avoids repeat sampling; a WeakMap ties it to immutable snapshot identity. Startup main-thread blocking and repeated zoom improved, but first uncached 100k zoom and median hover regressed. The maximum observed hover proxy fell. Retained heap increased slightly. These results are reported, not averaged away. The cache-only intermediate had a 539 ms median readiness versus the 529.5 ms baseline and is retained under evidence/performance/after.

## Checks and their output

66 unit tests in four files and 13 Playwright browser tests passed locally. Tests cover deterministic data, sorting, last-record duplicate policy, invalid/zero preservation, missing intervals, extrema, sampling bounds, cache eviction and snapshot isolation, worker-prepared frame equivalence, resize fallback, real DOM summaries/axes/hover, every exposed zoom preset, keyboard and range controls, filter/sort/pagination, unknown IDs and responsive layout. Four axe audits at 1280 and 320 px detected no violations. Raw output, reports, screenshots and Chrome-importable traces are in evidence.

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
