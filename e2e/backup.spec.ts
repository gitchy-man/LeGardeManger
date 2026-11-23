import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Dans le navigateur de test, on force le téléchargement plutôt que le partage natif.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
});

const items = (page: Page) => page.getByRole('list', { name: 'Articles' }).getByRole('listitem');

async function openBackup(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sauvegarde' }).click();
  await expect(page.getByRole('heading', { name: 'Sauvegarde' })).toBeVisible();
}

async function importFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel('Importer une sauvegarde').setInputFiles(file);
}

test('exporter, puis importer sur un autre téléphone, redonne la liste et l’historique', async ({ page, browser }) => {
  // Premier téléphone : Lait et Sel à acheter, Pâtes déjà achetées.
  await page.goto('/');
  await page.getByRole('link', { name: /Courses/ }).click();
  const input = page.getByRole('textbox', { name: 'Article' });
  for (const name of ['Lait', 'Sel', 'Pâtes']) {
    await input.fill(name);
    await input.press('Enter');
  }
  await page.getByRole('checkbox', { name: 'Pâtes' }).check();
  await page.getByRole('button', { name: /Courses terminées/ }).click();
  await expect(page.getByRole('status')).toHaveText('1 article validé.');

  await openBackup(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^garde-manger-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ application: 'le-garde-manger', format: 1 });

  // Deuxième téléphone, vide.
  const other = await browser.newContext(test.info().project.use);
  const phone = await other.newPage();
  await openBackup(phone);
  phone.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Rien ne sera supprimé');
    void dialog.accept();
  });
  await importFile(phone, file);
  await expect(phone.getByRole('status')).toHaveText('Import terminé. Ajouté : 2 articles, 1 séance.');

  await phone.goto('/');
  await expect(phone.getByRole('link', { name: /Courses/ })).toHaveCount(1);
  await phone.getByRole('link', { name: /Courses/ }).click();
  await expect(items(phone)).toHaveText([/Lait/, /Sel/]);
  await phone.goto('/#/historique');
  await expect(phone.getByRole('list', { name: 'Séances' })).toContainText('Pâtes');

  // Réimporter le même fichier n'ajoute rien.
  await openBackup(phone);
  phone.once('dialog', (dialog) => void dialog.accept());
  await importFile(phone, file);
  await expect(phone.getByRole('status')).toHaveText('Rien à ajouter : ces données sont déjà là.');
  await other.close();
});

test('un fichier qui n’est pas une sauvegarde est refusé', async ({ page }) => {
  await openBackup(page);
  await importFile(page, { name: 'photo.json', mimeType: 'application/json', buffer: Buffer.from('{"bonjour": 1}') });
  await expect(page.getByRole('status')).toHaveText('Ce fichier n’est pas une sauvegarde du Garde-Manger.');
});

test('annuler la confirmation n’importe rien', async ({ page }) => {
  await openBackup(page);
  const backup = {
    application: 'le-garde-manger', format: 1, appVersion: 'test', exportedAt: 0,
    lists: [{ id: 'X', name: 'Brico', createdAt: 0 }], products: [], items: [], sessions: [], purchases: [],
  };
  page.once('dialog', (dialog) => void dialog.dismiss());
  await importFile(page, { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole('status')).toHaveText('Import annulé.');
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Brico/ })).toHaveCount(0);
});
