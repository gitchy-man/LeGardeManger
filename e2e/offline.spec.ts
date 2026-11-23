import { expect, test } from '@playwright/test';

test('en mode avion : ajouter, cocher, valider, consulter l’historique', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();

  await page.getByRole('link', { name: /Courses/ }).click();
  const input = page.getByRole('textbox', { name: 'Article' });
  for (const name of ['Lait', 'Sel']) {
    await input.fill(name);
    await input.press('Enter');
  }
  await page.getByRole('checkbox', { name: 'Lait', exact: true }).check();
  await page.getByRole('button', { name: /Courses terminées/ }).click();
  await expect(page.getByRole('status')).toHaveText('1 article validé.');

  // Rechargement toujours hors ligne, directement sur la liste.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Articles' }).getByRole('listitem')).toHaveText([/Sel/]);

  await page.goto('/#/historique');
  await expect(page.getByRole('list', { name: 'Séances' })).toContainText('Lait');
});
