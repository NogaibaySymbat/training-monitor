# AI assistance disclosure

AI assistance was used for architecture, synthetic data generation, normalization and sampling, React components, CSS, tests, profiling analysis, performance changes, and documentation. The light interface follows the candidate's supplied visual references. Reference spend figures and training values were not treated as real data.

## Suggestions accepted

- Deterministic synthetic fixtures with disclosed generation rules.
- Keep invalid values and resolve duplicate steps before sampling.
- Retain first/minimum/maximum/last original records per bucket and preserve segment breaks.
- Transfer raw typed-array buffers from a worker and inspect nearest original records on hover.
- Use explicit UTC and numeric formatting, native links and controls, keyboard support, error/retry/empty/loading states.
- Bound the cache and key it by snapshot identity rather than just run ID.
- After profiling, prepare initial chart frames in the worker and reuse number formatters.

## Verification and corrections

The candidate initially ran build, lint and 53 unit tests and supplied screenshots and traces. During final completion, the assistant ran 66 unit tests, 13 browser tests, four axe checks, three-repeat controlled before/after profiles, and inspected desktop/mobile screenshots in a working copy.

An initial trace was dominated by Chrome extensions. It was retained, followed by a clean trace. Cache-only changes improved repeated zoom but did not improve initial readiness. That intermediate result was retained; initial frame preparation then moved into the worker. Final cold-zoom and hover-median regressions are reported. No benchmark numbers were invented.

The standalone QA folder initially used an incompatible Vitest version and its test runner failed to start. Matching the project's Vitest 5.1.0 resolved that tooling error. Project check logs and earlier candidate terminal output are retained in evidence.

## Candidate review

The candidate should read the source and report before the live discussion. Assistant verification does not establish that the candidate has independently reviewed or can explain every line. The reflection in the note describes observed project results and should be reviewed by the candidate before submission.
