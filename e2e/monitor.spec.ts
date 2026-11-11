import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { RUNS, generateRunData } from '../src/data/generate';
import { normalizeRunData } from '../src/data/normalize';
import { getMetricStats } from '../src/data/chart';

async function openRun(page: Page, id = 'run-07') {
  await page.goto(`./#/runs/${id}`);
  await expect(page.locator('.metric-plot > svg')).toHaveCount(3);
}

async function audit(page: Page, name: string) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await mkdir('evidence/accessibility', { recursive: true });
  await writeFile(`evidence/accessibility/${name}.json`, JSON.stringify(report, null, 2));
  expect(report.violations).toEqual([]);
}

async function fault(page: Page, mode: 'retry' | 'timeout' | 'race' | 'mismatch' | 'empty' | 'invalid') {
  await page.addInitScript(({ mode }) => {
    const NativeWorker = window.Worker;
    let attempts = 0;
    function payload(runId: string, peak: number, empty = false, invalid = false) {
      const values = empty ? [] : invalid ? [NaN, Infinity, -Infinity] : [peak, peak, peak];
      const count = values.length;
      const stat = (value: number, bad = false) => ({
        latest: empty || bad ? null : value, min: empty || bad ? null : value,
        max: empty || bad ? null : value, maxStep: empty || bad ? null : 0,
        finiteCount: bad ? 0 : count, invalidCount: bad ? count : 0, nonPositiveCount: 0,
      });
      return {
        data: {
          runId, expectedStepInterval: 1,
          step: Float64Array.from({ length: count }, (_, index) => index),
          loss: Float64Array.from(values), lr: new Float64Array(count).fill(0.001),
          grad_norm: new Float64Array(count).fill(1),
          quality: {
            sourcePointCount: count, duplicatesRemoved: 0, gapCount: 0, wasReordered: false,
            sourceInvalidValues: { loss: invalid ? count : 0, lr: 0, grad_norm: 0 },
            retainedInvalidValues: { loss: invalid ? count : 0, lr: 0, grad_norm: 0 },
          },
        },
        stats: { loss: stat(peak, invalid), lr: stat(0.001), grad_norm: stat(1) },
      };
    }
    window.Worker = new Proxy(NativeWorker, {
      construct(Target, args) {
        const isRun = String(args[0]).includes('run.worker');
        if (isRun && mode === 'retry' && attempts++ === 0) {
          throw new Error('Injected worker startup failure');
        }
        const worker = Reflect.construct(Target, args) as Worker;
        if (!isRun || mode === 'retry') return worker;
        worker.postMessage = (message: unknown) => {
          const { runId } = message as { runId: string };
          document.documentElement.dataset.requestedRun = runId;
          if (mode === 'timeout') return;
          if (mode === 'mismatch') {
            setTimeout(() => {
              worker.onmessage?.(new MessageEvent('message', {
                data: { type: 'ready', runId: 'run-07', payload: payload('run-07', 777) },
              }));
              document.documentElement.dataset.wrongResponse = 'sent';
            }, 20);
          }
          setTimeout(() => {
            worker.onmessage?.(new MessageEvent('message', {
              data: {
                type: 'ready', runId,
                payload: payload(runId, runId === 'run-07' ? 777 : 0.25, mode === 'empty', mode === 'invalid'),
              },
            }));
            if (runId === 'run-07') document.documentElement.dataset.lateResponse = 'sent';
          }, mode === 'race' && runId === 'run-07' ? 400 : mode === 'mismatch' ? 200 : 20);
        };
        return worker;
      },
    });
  }, { mode });
}

test('list filters, sort, empty state, keyboard search and pagination', async ({ page }) => {
  await page.goto('./#/runs');
  await expect(page.getByRole('button', { name: 'Issues', exact: true })).toBeEnabled();
  const first = await page.locator('tbody th').first().innerText();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('tbody th').first()).not.toHaveText(first);
  await page.getByRole('button', { name: 'Running', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.locator('tbody .run-status-running')).toHaveCount(5);
  const extraPanelHeight = await page.evaluate(() => {
    const panel = document.querySelector('.runs-table-scroll')!.getBoundingClientRect();
    const last = document.querySelector('tbody tr:last-child')!.getBoundingClientRect();
    return panel.bottom - last.bottom;
  });
  expect(extraPanelHeight).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'Issues', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Sort runs').selectOption('points');
  await expect(page.locator('tbody th').first()).toContainText('run-07');
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('searchbox').fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'No runs found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('real million-point peak survives every exposed zoom preset and keyboard navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openRun(page);
  await expect(page.getByRole('region', { name: 'Run summary' }).getByLabel('Peak loss: 250')).toBeVisible();
  for (const preset of ['100k', '10k', 'Raw', 'All']) {
    await page.getByRole('button', { name: preset, exact: true }).click();
    const loss = page.locator('.metric-chart').first();
    await expect(loss.locator('svg')).toHaveAttribute('aria-label', /maximum 250/);
    await expect(loss.locator('.chart-peak-label')).toContainText('500,000');
    await expect(loss.locator('path')).not.toHaveAttribute('d', /NaN|Infinity/);
  }
  const plot = page.locator('.metric-plot').first();
  await plot.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.chart-tooltip').first()).toContainText('Step 0');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.chart-tooltip').first()).toContainText('Step 10');
  await page.keyboard.press('p');
  await expect(page.locator('.chart-tooltip').first()).toContainText('Step 500,000');
  await expect(page.locator('.chart-tooltip strong').first()).toHaveAttribute('title', '250');
  await page.keyboard.press('+');
  await page.keyboard.press('0');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('End step', { exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('End step', { exact: true })).toHaveValue('999998');
  expect(errors).toEqual([]);
});

test('summary numbers match original generated values and invalid hover stays NaN', async ({ page }) => {
  await openRun(page, 'run-03');
  const run = RUNS.find((entry) => entry.id === 'run-03')!;
  const stats = getMetricStats(normalizeRunData(generateRunData(run)), 'loss');
  for (const [label, value] of [['Latest', stats.latest], ['Best', stats.min], ['Peak', stats.max]] as const) {
    await expect(page.getByLabel(`${label} loss: ${String(value)}`, { exact: true })).toHaveAttribute('title', String(value));
  }
  const svg = page.locator('.metric-plot > svg').first();
  const box = (await svg.boundingBox())!;
  const viewWidth = await svg.evaluate((node) => node.viewBox.baseVal.width);
  const x = 66 + 1125 / 4499 * (viewWidth - 86);
  await page.mouse.move(box.x + x / viewWidth * box.width, box.y + 80);
  await expect(page.locator('.chart-tooltip strong').first()).toHaveAttribute('title', 'NaN');
  await expect(page.locator('.chart-invalid-note').first()).toContainText('3 non-finite');
  await expect(svg.locator('path')).not.toHaveAttribute('d', /NaN|Infinity/);
  expect((await svg.locator('path').getAttribute('d'))!.match(/M /g)!.length).toBeGreaterThanOrEqual(4);
});

test('zero loss disables log scale and remains inspectable', async ({ page }) => {
  await openRun(page, 'run-08');
  const loss = page.locator('.metric-chart').first();
  await expect(loss.getByRole('button', { name: 'Log', exact: true })).toBeDisabled();
  await expect(loss.locator('.chart-warning')).toContainText('zero or negative');
  await expect(page.getByLabel('Best loss: 0', { exact: true })).toBeVisible();
  await expect(page.locator('.metric-chart').nth(1).getByRole('button', { name: 'Log', exact: true })).toBeEnabled();
});

test('duplicate resolution and gaps are disclosed on the real run', async ({ page }) => {
  await openRun(page, 'run-04');
  await expect(page.getByText('23 duplicate records removed', { exact: true })).toBeVisible();
  await expect(page.getByText('23 missing-step ranges', { exact: true })).toBeVisible();
});

test('worker startup failure is visible and retry recovers', async ({ page }) => {
  await fault(page, 'retry');
  await page.goto('./#/runs/run-01');
  await expect(page.getByRole('alert')).toContainText('Injected worker startup failure');
  await expect(page.locator('.metric-plot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.metric-plot')).toHaveCount(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a non-responding worker times out instead of loading forever', async ({ page }) => {
  await page.clock.install();
  await fault(page, 'timeout');
  await page.goto('./#/runs/run-01');
  await expect(page.getByRole('status')).toContainText('Preparing 4,000');
  await page.clock.fastForward(16_000);
  await expect(page.getByRole('alert')).toContainText('timed out after 15 seconds');
  await expect(page.locator('.metric-plot')).toHaveCount(0);
});

test('late responses from the previous run cannot replace the current charts', async ({ page }) => {
  await fault(page, 'race');
  await page.goto('./#/runs/run-07');
  await expect(page.locator('html')).toHaveAttribute('data-requested-run', 'run-07');
  await page.evaluate(() => { location.hash = '#/runs/run-01'; });
  await expect(page.getByLabel('Peak loss: 0.25', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-late-response', 'sent');
  await expect(page.getByRole('heading', { name: 'run-01', exact: true })).toBeVisible();
  await expect(page.getByLabel('Peak loss: 0.25', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Peak loss: 777', { exact: true })).toHaveCount(0);
});

test('a response with the wrong run ID is ignored', async ({ page }) => {
  await fault(page, 'mismatch');
  await page.goto('./#/runs/run-01');
  await expect(page.locator('html')).toHaveAttribute('data-wrong-response', 'sent');
  await expect(page.getByLabel('Peak loss: 777', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Peak loss: 0.25', { exact: true })).toBeVisible();
});

test('empty and entirely non-finite datasets have explicit states', async ({ browser }) => {
  for (const mode of ['empty', 'invalid'] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await fault(page, mode);
    await page.goto('./#/runs/run-01');
    if (mode === 'empty') {
      await expect(page.getByRole('heading', { name: 'No records in this run' })).toBeVisible();
      await expect(page.locator('.metric-plot')).toHaveCount(0);
    } else {
      await expect(page.locator('.metric-plot')).toHaveCount(3);
      await expect(page.locator('.chart-empty-label').first()).toHaveText('No finite values in this window');
      await expect(page.getByLabel('Latest loss: Unavailable', { exact: true })).toBeVisible();
    }
    await context.close();
  }
});

test('timestamps and numbers stay explicit across locale and timezone', async ({ browser }) => {
  const values = [];
  for (const config of [
    { locale: 'en-US', timezoneId: 'America/Los_Angeles' },
    { locale: 'de-DE', timezoneId: 'Asia/Almaty' },
  ]) {
    const context = await browser.newContext(config);
    const page = await context.newPage();
    await openRun(page, 'run-01');
    values.push({ date: await page.locator('.run-header-meta').innerText(), latest: await page.locator('.run-statistics strong').first().innerText() });
    await expect(page.locator('.run-header-meta')).toContainText('UTC');
    await expect(page.locator('.run-header-meta')).toContainText('no live updates');
    await context.close();
  }
  expect(values[0]).toEqual(values[1]);
});

test('desktop and 320px layouts fit, paginate, and pass automated accessibility checks', async ({ page }) => {
  await mkdir('evidence/screenshots', { recursive: true });
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/runs');
    await expect(page.getByRole('button', { name: 'Issues', exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.locator('.runs-footer').evaluate((node) => node.getBoundingClientRect().bottom <= innerHeight + 1)).toBe(true);
    await page.screenshot({ path: `evidence/screenshots/runs-${width}.png`, fullPage: true });
    await audit(page, `runs-${width}`);
    await openRun(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const wraps = await page.locator('.run-statistics article:last-child strong').evaluate((node) => node.getBoundingClientRect().height > parseFloat(getComputedStyle(node).lineHeight) + 1);
    expect(wraps).toBe(false);
    await page.screenshot({ path: `evidence/screenshots/run-07-${width}.png`, fullPage: true });
    await audit(page, `run-07-${width}`);
  }
});

test('unknown run has a useful recovery link', async ({ page }) => {
  await page.goto('./#/runs/unknown-run');
  await expect(page.getByRole('heading', { name: 'Run not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to runs' }).click();
  await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible();
});
