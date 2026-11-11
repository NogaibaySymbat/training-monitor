import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const [label = 'after', origin = 'http://127.0.0.1:4186', count = '3'] = process.argv.slice(2);
const directory = path.resolve('evidence/performance', label);
await mkdir(directory, { recursive: true });

async function startTrace(session) {
  await session.send('Tracing.start', {
    categories: 'toplevel,devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,loading,latencyInfo,disabled-by-default-devtools.screenshot,disabled-by-default-v8.cpu_profiler',
    transferMode: 'ReturnAsStream',
    options: 'sampling-frequency=1000',
  });
}

async function stopTrace(session, filename) {
  const completed = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.end');
  const { stream } = await completed;
  const parts = [];
  while (true) {
    const result = await session.send('IO.read', { handle: stream });
    parts.push(Buffer.from(result.data, result.base64Encoded ? 'base64' : 'utf8'));
    if (result.eof) break;
  }
  await session.send('IO.close', { handle: stream });
  const trace = JSON.parse(Buffer.concat(parts).toString());
  trace.metadata = {
    ...trace.metadata,
    source: 'CDP automated production-build profile',
    cpuThrottling: 4,
    startTime: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
  };
  await writeFile(path.join(directory, filename), gzipSync(JSON.stringify(trace)));
  return trace.traceEvents;
}

function summary(events) {
  const main = new Set(events.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  const tasks = events.filter((e) => e.name === 'RunTask' && main.has(`${e.pid}:${e.tid}`) && e.dur >= 50000);
  const clickMs = events.filter((e) => e.name === 'EventTiming' && e.ph === 'b' && e.args?.data?.type === 'click').map((e) => e.args.data.duration);
  return {
    longTaskCount: tasks.length,
    longestTaskMs: Math.max(0, ...tasks.map((e) => e.dur / 1000)),
    clickResponseMs: clickMs,
    extensionEventCount: events.filter((e) => JSON.stringify(e.args ?? {}).includes('chrome-extension://')).length,
    rendererPid: events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')?.pid ?? null,
  };
}

const results = [];
for (let iteration = 1; iteration <= Number(count); iteration += 1) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'UTC' });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__profile = { chartsReadyMs: null, hoverMs: [], lcpMs: null };
      new PerformanceObserver((entries) => {
        const list = entries.getEntries();
        window.__profile.lcpMs = list[list.length - 1]?.startTime ?? null;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      const observer = new MutationObserver(() => {
        const paths = document.querySelectorAll('.metric-plot > svg > path[d]');
        if (paths.length === 3 && Array.from(paths).every((node) => node.getAttribute('d'))) {
          observer.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            window.__profile.chartsReadyMs = performance.now();
            performance.mark('profile:three-charts-ready');
          }));
        }
      });
      observer.observe(document, { childList: true, subtree: true, attributes: true });
      let latestMove = 0;
      document.addEventListener('pointermove', (event) => {
        const svg = event.target instanceof Element ? event.target.closest('.metric-plot > svg') : null;
        if (!svg || svg !== document.querySelector('.metric-plot > svg')) return;
        const token = ++latestMove;
        const bounds = svg.getBoundingClientRect();
        const width = svg.viewBox.baseVal.width;
        const local = (event.clientX - bounds.left) / bounds.width * width;
        const step = Math.round(Math.max(0, Math.min(1, (local - 66) / (width - 86))) * 999999);
        const started = event.timeStamp;
        let attempts = 0;
        function inspect() {
          if (token !== latestMove || ++attempts > 60) return;
          const text = document.querySelector('.metric-chart .chart-tooltip > span')?.textContent ?? '';
          const actual = Number(text.replace(/[^0-9]/g, ''));
          if (text && actual === step) {
            requestAnimationFrame(() => {
              if (token === latestMove) window.__profile.hoverMs.push(performance.now() - started);
            });
          } else requestAnimationFrame(inspect);
        }
        requestAnimationFrame(inspect);
      }, true);
    });

    await startTrace(session);
    await page.goto(`${origin}/#/runs/run-07`);
    await page.waitForFunction(() => window.__profile.chartsReadyMs !== null);
    await page.waitForTimeout(200);
    const loadEvents = await stopTrace(session, `load-${iteration}.json.gz`);
    const load = summary(loadEvents);
    await startTrace(session);
    const actions = ['100k', '10k', 'Inspect peak', 'All', '100k', 'All'];
    for (const name of actions) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(200);
    }
    const svg = page.locator('.metric-plot > svg').first();
    const bounds = await svg.boundingBox();
    for (let index = 1; index <= 12; index += 1) {
      await page.mouse.move(bounds.x + 80 + (bounds.width - 120) * index / 13, bounds.y + 80);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(200);
    const interactionEvents = await stopTrace(session, `interactions-${iteration}.json.gz`);
    const interaction = summary(interactionEvents);
    const browserMetrics = await page.evaluate(() => ({
      ...window.__profile,
      fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    }));
    await page.mouse.move(0, 0);
    const memoryBeforeGC = await session.send('Runtime.getHeapUsage');
    await session.send('HeapProfiler.collectGarbage');
    const memoryAfterGC = await session.send('Runtime.getHeapUsage');
    let rendererRssKiB = null;
    try {
      rendererRssKiB = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(load.rendererPid ?? interaction.rendererPid)], { encoding: 'utf8' }).trim());
    } catch {
      rendererRssKiB = null;
    }
    if (iteration === 1) await page.screenshot({ path: path.join(directory, 'run-07.png'), fullPage: true });
    const result = {
      iteration, browserVersion: browser.version(),
      cpuThrottle: 4, viewport: { width: 1280, height: 900 },
      actions, ...browserMetrics, load, interaction,
      memoryBeforeGC, memoryAfterGC, rendererRssKiB,
    };
    results.push(result);
    await writeFile(path.join(directory, 'results.json'), JSON.stringify({
      label, origin, platform: os.platform(), arch: os.arch(),
      cpuModel: os.cpus()[0]?.model,
      chartsReadyDefinition: 'All three non-empty SVG paths committed, followed by two animation frames; includes below-fold charts.',
      hoverDefinition: 'Pointer timestamp to correct original step tooltip observed, followed by one animation frame. A paint-boundary proxy, not display hardware latency.',
      memoryDefinition: 'CDP V8 heap and backing storage, plus renderer RSS from ps after forced GC; RSS is not Chrome Task Manager memory footprint.',
      results,
    }, null, 2));
    console.log(JSON.stringify({ label, iteration, readyMs: result.chartsReadyMs, loadTaskMs: load.longestTaskMs, clicks: interaction.clickResponseMs, hoverSamples: result.hoverMs.length, rendererRssKiB }));
  } finally {
    await browser.close();
  }
}
