import { test, expect, type Locator, type Page } from '@playwright/test';

async function rawWindow(page: Page) {
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await page.getByLabel('Start step', { exact: true }).scrollIntoViewIfNeeded();
  return {
    start: Number(await page.getByLabel('Start step', { exact: true }).inputValue()),
    end: Number(await page.getByLabel('End step', { exact: true }).inputValue()),
  };
}

async function thumbCenter(input: Locator) {
  return input.evaluate((node) => {
    const control = node as HTMLInputElement;
    const bounds = control.getBoundingClientRect();
    const fraction = (Number(control.value) - Number(control.min)) /
      (Number(control.max) - Number(control.min));
    return {
      x: bounds.x + 22 + fraction * (bounds.width - 44),
      y: bounds.y + bounds.height / 2,
    };
  });
}

test('Raw start and end handles can be dragged independently with the mouse', async ({ page }) => {
  await page.goto('./#/runs/run-07');
  await expect(page.locator('.metric-plot')).toHaveCount(3);
  const start = page.getByLabel('Start step', { exact: true });
  const end = page.getByLabel('End step', { exact: true });
  let original = await rawWindow(page);
  let point = await thumbCenter(start);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x - 60, point.y, { steps: 8 });
  await page.mouse.up();
  expect(Number(await start.inputValue())).toBeLessThan(original.start);
  await expect(end).toHaveValue(String(original.end));

  original = await rawWindow(page);
  point = await thumbCenter(end);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y, { steps: 8 });
  await page.mouse.up();
  await expect(start).toHaveValue(String(original.start));
  expect(Number(await end.inputValue())).toBeGreaterThan(original.end);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await start.scrollIntoViewIfNeeded();
  point = await thumbCenter(start);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y, { steps: 8 });
  await page.mouse.up();
  expect(Number(await start.inputValue())).toBeGreaterThan(0);
  await expect(end).toHaveValue('999999');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await page.locator('.range-navigator').screenshot({ path: 'evidence/screenshots/raw-range-desktop.png' });
});

test('narrow Raw controls remain independent under touch and recover after cancellation', async ({ browser }) => {
  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      const session = await context.newCDPSession(page);
      await page.goto('./#/runs/run-07');
      await expect(page.locator('.metric-plot')).toHaveCount(3);
      const start = page.getByLabel('Start step', { exact: true });
      const end = page.getByLabel('End step', { exact: true });
      async function drag(input: Locator, delta: number, cancel = false) {
        await input.scrollIntoViewIfNeeded();
        const point = await thumbCenter(input);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        for (let step = 1; step <= 6; step += 1) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: [{ x: point.x + delta * step / 6, y: point.y }],
          });
          await page.waitForTimeout(25);
        }
        await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      }

      let original = await rawWindow(page);
      await drag(start, -35);
      expect(Number(await start.inputValue())).toBeLessThan(original.start);
      await expect(end).toHaveValue(String(original.end));
      original = await rawWindow(page);
      await drag(end, 35);
      await expect(start).toHaveValue(String(original.start));
      expect(Number(await end.inputValue())).toBeGreaterThan(original.end);

      await rawWindow(page);
      await drag(start, -25, true);
      await page.getByRole('button', { name: 'All', exact: true }).tap();
      await expect(page.locator('.range-navigator')).not.toHaveClass(/range-separated/);
      await expect(start).toHaveValue('0');
      await expect(end).toHaveValue('999999');
      await rawWindow(page);
      await page.locator('.range-navigator').screenshot({ path: `evidence/screenshots/raw-range-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await context.close();
    }
  }
});
