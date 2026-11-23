import { expect, test, type Page } from '@playwright/test';

// L'horloge du navigateur est simulée pour faire des courses à des dates connues.
const day = (d: number, hour = 18) => new Date(2026, 10, d, hour, 30); // novembre 2026

async function shop(page: Page, list: string, names: string[], when: Date) {
  await page.clock.setSystemTime(when);
  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(list) }).click();
  const input = page.getByRole('textbox', { name: 'Article' });
  for (const name of names) {
    await input.fill(name);
    await input.press('Enter');
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  await page.getByRole('button', { name: /Courses terminées/ }).click();
  await expect(page.getByRole('status')).toContainText('validé');
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: day(1) });
});

test('historique vide au départ', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Historique' }).click();
  await expect(page.getByText('Aucun achat pour l’instant.')).toBeVisible();
});

test('les séances, de la plus récente à la plus ancienne, toutes listes confondues', async ({ page }) => {
  await shop(page, 'Courses', ['Lait', 'Pâtes'], day(10));
  await page.getByRole('link', { name: 'Retour aux listes' }).click();
  await page.getByRole('textbox', { name: 'Nom de la nouvelle liste' }).fill('Apéro');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('heading', { name: 'Apéro' })).toBeVisible();
  await shop(page, 'Apéro', ['Chips'], day(22));

  await page.clock.setSystemTime(day(23, 10));
  await page.goto('/#/historique');
  const sessions = page.getByRole('list', { name: 'Séances' }).getByRole('listitem').filter({ has: page.getByRole('heading') });
  await expect(sessions).toHaveCount(2);
  await expect(sessions.nth(0)).toContainText('Hier à 18:30');
  await expect(sessions.nth(0)).toContainText('Apéro');
  await expect(sessions.nth(0)).toContainText('Chips');
  await expect(sessions.nth(1)).toContainText('Mardi 10 novembre à 18:30');
  await expect(sessions.nth(1)).toContainText('Courses');
  await expect(sessions.nth(1).getByRole('list', { name: 'Achats' })).toHaveText(/Lait.*Pâtes/s);
});

test('les produits : nombre d’achats, dernier achat et fréquence', async ({ page }) => {
  await shop(page, 'Courses', ['Lait', 'Sel'], day(1));
  await shop(page, 'Courses', ['Lait'], day(11));
  await shop(page, 'Courses', ['Lait'], day(21));

  await page.clock.setSystemTime(day(23, 10));
  await page.goto('/#/historique');
  await page.getByRole('link', { name: 'Produits' }).click();

  const products = page.getByRole('list', { name: 'Produits achetés' }).getByRole('listitem');
  await expect(products).toHaveCount(2);
  await expect(products.nth(0)).toContainText('Lait');
  await expect(products.nth(0)).toContainText('Acheté 3 fois · tous les ~10 jours');
  await expect(products.nth(0)).toContainText('il y a 2 jours');
  await expect(products.nth(1)).toContainText('Sel');
  await expect(products.nth(1)).toContainText('Acheté 1 fois');
  await expect(products.nth(1)).toContainText('le 1er novembre');

  await products.nth(0).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Lait' })).toBeVisible();
  await expect(page.getByText('Acheté 3 fois, la dernière fois il y a 2 jours.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Dates d’achat' }).getByRole('listitem')).toHaveText([
    /Samedi 21 novembre à 18:30/,
    /Mercredi 11 novembre à 18:30/,
    /Dimanche 1er novembre à 18:30/,
  ]);
});

test('une variante du nom compte pour le même produit', async ({ page }) => {
  await shop(page, 'Courses', ['Pâtes'], day(1));
  await page.clock.setSystemTime(day(5));
  await page.goto('/');
  await page.getByRole('link', { name: /Courses/ }).click();
  await page.getByRole('textbox', { name: 'Article' }).fill('PATES ');
  await page.getByRole('textbox', { name: 'Article' }).press('Enter');
  await page.getByRole('checkbox', { name: 'Pâtes' }).check();
  await page.getByRole('button', { name: /Courses terminées/ }).click();

  await page.goto('/#/historique/produits');
  const products = page.getByRole('list', { name: 'Produits achetés' }).getByRole('listitem');
  await expect(products).toHaveCount(1);
  await expect(products.first()).toContainText('Acheté 2 fois');
});

test('une séance annulée disparaît de l’historique', async ({ page }) => {
  await shop(page, 'Courses', ['Lait'], day(1));
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.goto('/#/historique');
  await expect(page.getByText('Aucun achat pour l’instant.')).toBeVisible();
});
