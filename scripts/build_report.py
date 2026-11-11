"""Generate the two-page submission note. Requires reportlab and pypdf."""
import json
import statistics
from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent

def load(label):
    return json.loads((ROOT / f'evidence/performance/{label}/results.json').read_text())

before = load('before')
after = load('range-fix')

def med(doc, field):
    return statistics.median(run[field] for run in doc['results'])

def task(doc):
    return statistics.median(run['load']['longestTaskMs'] for run in doc['results'])

def click(doc, index):
    return statistics.median(run['interaction']['clickResponseMs'][index] for run in doc['results'])

def hover(doc):
    return [value for run in doc['results'] for value in run['hoverMs']]

def heap(doc):
    return statistics.median(run['memoryAfterGC']['usedSize'] for run in doc['results']) / 1048576

rows = [
    ('All three charts ready (ms)', med(before, 'chartsReadyMs'), med(after, 'chartsReadyMs'), 1),
    ('Longest load task >=50 ms (ms)', task(before), task(after), 1),
    ('First 100k click response (ms)', click(before, 0), click(after, 0), 1),
    ('Return to All click response (ms)', click(before, 3), click(after, 3), 1),
    ('Hover response proxy, median (ms)', statistics.median(hover(before)), statistics.median(hover(after)), 1),
    ('Hover response proxy, maximum (ms)', max(hover(before)), max(hover(after)), 1),
    ('Retained V8 used heap (MiB)', heap(before), heap(after), 2),
    ('Renderer RSS after GC (MiB)', med(before, 'rendererRssKiB') / 1024, med(after, 'rendererRssKiB') / 1024, 2),
]

table_md = '| Metric | Before | Optimized |\n| --- | ---: | ---: |\n' + '\n'.join(
    f'| {name} | {old:.{digits}f} | {new:.{digits}f} |' for name, old, new, digits in rows
)

sections1 = [
    ('Scope and provenance', '20 generated training runs; no external training logs, billing data or real stop controls. Seeds 1000-1019 reproduce every record. run-07 has 1,000,000 source points and one loss spike of 250 at step 500,000. The generator deliberately includes NaN, both infinities, conflicting duplicates, unsorted records, gaps, zero loss and divergence. Curves, statuses and dates are implementation choices, not measured training results.'),
    ('What makes the chart trustworthy', 'Complete records are sorted by step. The last original duplicate wins, even when invalid. Invalid metrics remain invalid and break the line; missing-step ranges also break it. Each bucket retains its first, minimum, maximum and last finite original record, in order, with segment identity. The spike is its bucket maximum and is retained whenever its step is inside the viewport; it is not shown in unrelated windows. No smoothing, zero substitution or averaging is applied. Cards use full-series normalized values; hover reads the nearest original record. Rounded displays expose full numbers in titles.'),
]
method = (
    f"Apple M2 Pro, {after['results'][0]['browserVersion']} Chrome, production builds, headless, "
    '1280 x 900, CPU slowdown 4x, no extensions or network throttling. Three fresh-browser repeats per version; table uses medians except the stated maximum. Ready means three non-empty SVG paths committed plus two animation frames, including below-fold charts; it is not LCP. Click response comes from trace EventTiming. Hover measures a correct-step tooltip observed plus the next animation frame, a paint-boundary proxy rather than display latency. Memory is sampled after forced GC; RSS differs from Chrome Task Manager footprint.'
)
outcome = (
    'Initial frames now prepare in the worker alongside generation, normalization and statistics; original buffers transfer to the UI. A four-frame-per-metric LRU cache uses immutable snapshot identity. The final version includes the Raw handle fix. Startup and repeated zoom improved, but cold 100k zoom and median hover regressed. Heap increased slightly. Zero in the task row means no task reached 50 ms in the median repeat. All repeats remain available, including cache-only results (539 ms readiness) under after and the prior worker version under optimized.'
)
sections2 = [
    ('Checks and their output', '66 unit tests in four files and 16 Playwright browser tests passed locally. Coverage includes deterministic data, duplicate policy, invalid/zero preservation, gaps, extrema, sampling bounds, cache eviction and snapshot isolation, worker-frame equivalence, resize fallback, DOM summaries/axes/hover, zoom presets, keyboard, filtering and pagination. Raw handles use separate labelled rows when close; mouse, touch at 390/320 px and cancellation are tested. The new regression fails on the original baseline; its output is retained. Four axe audits at 1280/320 px found no violations. Logs, screenshots and traces are in evidence.'),
    ('Silent failures checked', 'Race: a deliberately late response from the previous run still fires after termination and cannot replace the current charts; a mismatched run ID is ignored. Failures: startup error is visible, retry recovers, a non-responding worker times out after 15 seconds, and empty/all-invalid inputs have explicit states. Freshness: fixed snapshot time and no-live-updates disclosure prevent Running from implying a live connection. Locale/time zone: en-US and UTC remain identical in Los Angeles and Almaty browser contexts. Log zero: a real zero remains inspectable and disables log scale. Divergence is retained without smoothing.'),
    ('What the tests do not catch', 'Finite fixtures and presets are not exhaustive proof of all data distributions, zoom widths or rasterization. Sampling preserves extrema, not every fluctuation or every invalid position in a compressed bucket; the event strip aggregates counts. Axe does not replace screen-reader, low-vision or real-device testing. Profiles are three local headless repeats, not population statistics or a low-end phone benchmark. Fault injection tests frontend isolation, not an actual streaming server, billing system or network freshness protocol. Cached snapshots must be immutable; future in-place updates would violate that contract.'),
    ('Verdict: SHIP the scoped read-only demo', 'The displayed synthetic values, corruption disclosures and interactions have reproducible evidence. First follow-up: move uncached viewport queries into the worker or use a tested range index, because first 100k zoom still blocks the main thread. A paid live-run service additionally needs a real data source and freshness/connection contract; this demo does not claim those capabilities.'),
    ('Reflection and AI use', 'The most surprising finding was that an apparently slow million-point chart was initially dominated by browser extensions. Clean profiling changed the diagnosis. The cache-only attempt improved repeated navigation but not startup, prompting worker-side initial frames. What still concerns me is the uncached viewport scan and the temptation to treat local checks as production certainty. AI assisted code, tests, profiling and this note; the candidate supplied the design direction and initial checks, and should review the final source and explanation. Details: AI_USAGE.md.'),
]

report = '# Engineering note - Soup Run Monitor\n\n11 November 2026\n\n'
for title, body in sections1:
    report += f'## {title}\n\n{body}\n\n'
report += f'## Performance\n\n{method}\n\n{table_md}\n\n{outcome}\n\n'
for title, body in sections2:
    report += f'## {title}\n\n{body}\n\n'
report += 'Repository: https://github.com/NogaibaySymbat/training-monitor\n\nDemo: https://nogaibaysymbat.github.io/training-monitor/\n'
(ROOT / 'REPORT.md').write_text(report)

performance = f'''# Performance evidence

{method}

{table_md}

{outcome}

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
'''
(ROOT / 'PERFORMANCE.md').write_text(performance)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyNote', fontName='Helvetica', fontSize=10, leading=13.3, textColor=colors.HexColor('#243247'), spaceAfter=7))
styles.add(ParagraphStyle(name='HeadingNote', fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=colors.HexColor('#182131'), spaceBefore=7, spaceAfter=4))
styles.add(ParagraphStyle(name='SmallNote', fontName='Helvetica', fontSize=8.8, leading=11.7, textColor=colors.HexColor('#46556c'), spaceAfter=6))
styles.add(ParagraphStyle(name='TitleNote', fontName='Helvetica-Bold', fontSize=21, leading=25, textColor=colors.HexColor('#182131'), spaceAfter=5))

def paragraph(text, style='BodyNote'):
    return Paragraph(escape(text), styles[style])

story = [paragraph('Soup Run Monitor', 'TitleNote'), paragraph('Engineering note | 11 November 2026 | Symbat', 'SmallNote')]
for title, body in sections1:
    story += [paragraph(title, 'HeadingNote'), paragraph(body)]
story += [paragraph('Performance - before and optimized', 'HeadingNote'), paragraph(method, 'SmallNote')]
cells = [['Metric', 'Before', 'Optimized']] + [[name, f'{old:.{digits}f}', f'{new:.{digits}f}'] for name, old, new, digits in rows]
table = Table(cells, colWidths=[319, 83, 83], hAlign='LEFT')
table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
    ('FONTSIZE', (0, 0), (-1, -1), 8.8),
    ('LEADING', (0, 0), (-1, -1), 10),
    ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#243247')),
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eaf0f6')),
    ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
    ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#dce3ed')),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story += [table, Spacer(1, 9), paragraph(outcome, 'SmallNote'), PageBreak()]
story += [paragraph('Checks, limits and release decision', 'TitleNote')]
for title, body in sections2:
    story += [paragraph(title, 'HeadingNote'), paragraph(body)]
story += [Spacer(1, 5), paragraph('Repository: github.com/NogaibaySymbat/training-monitor', 'SmallNote'), paragraph('Demo: nogaibaysymbat.github.io/training-monitor/', 'SmallNote')]

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#dce3ed'))
    canvas.line(42, 34, A4[0] - 42, 34)
    canvas.setFillColor(colors.HexColor('#526178'))
    canvas.setFont('Helvetica', 8)
    canvas.drawString(42, 21, 'Synthetic data | evidence and AI disclosure included')
    canvas.drawRightString(A4[0] - 42, 21, f'{doc.page} / 2')

pdf = ROOT / 'output/pdf/engineering-note.pdf'
pdf.parent.mkdir(parents=True, exist_ok=True)
SimpleDocTemplate(str(pdf), pagesize=A4, leftMargin=42, rightMargin=42, topMargin=35, bottomMargin=46, title='Soup Run Monitor - Engineering Note', author='Symbat').build(story, onFirstPage=footer, onLaterPages=footer)
reader = PdfReader(pdf)
assert len(reader.pages) == 2, f'Expected two pages, got {len(reader.pages)}'
print(f'Created {pdf}: {len(reader.pages)} pages')
