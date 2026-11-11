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

The candidate initially ran build, lint and 53 unit tests and supplied screenshots and traces. During final completion, the assistant ran 66 unit tests, 16 browser tests, four axe checks, three-repeat controlled before/after profiles, and inspected desktop/mobile screenshots in a working copy.

A subsequent interaction review found overlapping Raw range handles. The assistant separated close handles into labelled native controls and added mouse/touch/cancellation tests, including 320px touch input. The regression fails on the original compiled baseline and passes on the fixed version. The expected failure output is preserved in evidence/range-regression-before.txt. Final performance repeats after this fix are in evidence/performance/range-fix; earlier optimized results remain available.

The first CI run of the new desktop drag test failed: its trace shows a mouse action at y=954 outside the 900px viewport after only Start had been scrolled into view. The test now scrolls each individual control into view before reading its pointer coordinates; the application behavior and assertions were retained. The failed output is preserved in evidence/range-ci-failure.txt and [the original GitHub run](https://github.com/NogaibaySymbat/training-monitor/actions/runs/43055045976).

An initial trace was dominated by Chrome extensions. It was retained, followed by a clean trace. Cache-only changes improved repeated zoom but did not improve initial readiness. That intermediate result was retained; initial frame preparation then moved into the worker. Final cold-zoom and hover-median regressions are reported. No benchmark numbers were invented.

The standalone QA folder initially used an incompatible Vitest version and its test runner failed to start. Matching the project's Vitest 5.1.0 resolved that tooling error. Project check logs and earlier candidate terminal output are retained in evidence.

## Candidate review

The candidate should read the source and report before the live discussion. Assistant verification does not establish that the candidate has independently reviewed or can explain every line. The reflection in the note describes observed project results and should be reviewed by the candidate before submission.

The initial GitHub Actions run was cancelled while installing browser dependencies. The workflow was changed to use Chrome already installed on the pinned Ubuntu 24.04 runner image, keeping browser tests as a deployment gate. The original run remains visible on GitHub.
