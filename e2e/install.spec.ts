import { expect, test } from '@playwright/test';

test("la page s'affiche avec le titre", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Le Garde-Manger' })).toBeVisible();
});

test('le manifest permet une installation', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest.name).toBe('Le Garde-Manger');
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
  expect((await request.get('apple-touch-icon-180x180.png')).ok()).toBe(true);
});

test("l'appli s'ouvre hors ligne une fois chargée", async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Le Garde-Manger' })).toBeVisible();
});
