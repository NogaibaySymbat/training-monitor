# Performance evidence

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

## Raw results and traces

- `evidence/performance/before/results.json`: all three controlled baseline repeats.
- `evidence/performance/after/results.json`: all three intermediate cache-only repeats, including regressions.
- `evidence/performance/optimized/results.json`: all three prior worker-optimization repeats.
- `evidence/performance/range-fix/results.json`: all three final repeats, including the Raw control fix.
- Each directory contains load and interaction `.json.gz` traces for every repeat. Import into Chrome DevTools Performance.
- Original candidate traces remain at the top of evidence. The extension-contaminated trace is excluded from optimization comparisons, not deleted. Candidate Task Manager memory was 108 MB, active JavaScript 5,203 KB; this is a separate manual measurement, not substituted for the controlled RSS comparison.

## Definitions and limitations

The action sequence is 100k, 10k, Inspect peak, All, 100k, All, then twelve spaced pointer moves. Every version uses the same sequence. The first call includes cold/JIT effects; returning to All tests previously visited data. The first launch is visibly slower in both groups; every repeat is retained. No statistical significance is claimed.

`Runtime.getHeapUsage` provides V8 usage and separate backing storage before and after explicit collection. Typed-array storage after GC is approximately 30.76 MiB in both versions and is not represented by the small V8 used-heap number alone. The renderer PID comes from the trace; `ps` provides its RSS after collection. RSS, JavaScript heap, backing storage and Chrome Task Manager footprint must not be summed or treated as interchangeable.

The hover probe requires the expected original step to appear in the tooltip, then observes the next animation-frame boundary. It includes frame scheduling and probe overhead, not only handler time. It does not establish physical screen presentation latency. Original manual interaction traces are a separate, less controlled observation.

CPU throttling, screenshots and profiler instrumentation affect results. Desktop Chrome at 4x is not equivalent to a particular mobile device. The 320px checks verify layout/accessibility, not phone CPU performance.

## Reproduce

Use Node 24, npm 11, and installed Google Chrome. The final application needs no server API.

```sh
npm ci
npm run build -- --sourcemap
npm run preview -- --host 127.0.0.1 --port 4186 --strictPort
```

In another terminal:

```sh
npm run profile -- review http://127.0.0.1:4186 3
```

To replay the actual original compiled baseline, extract `evidence/baseline-build.tar.gz` into a separate temporary directory and serve that directory with Vite preview using `--outDir` and a different port. Run the same profile script against that origin with a fresh output label. The archive includes its source maps; extracted first-party source is also retained in `evidence/baseline-source` for inspection. Never replace final source files to run the baseline.

Profile labels are output directory names. Choose a new label for subsequent runs to preserve existing evidence.
