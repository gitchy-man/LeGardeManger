import { expect, test, type Page } from '@playwright/test';

const items = (page: Page) => page.getByRole('list', { name: 'Articles' }).getByRole('listitem');
const box = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true });
const finishButton = (page: Page) => page.getByRole('button', { name: /Courses terminées/ });

async function openCoursesWith(page: Page, names: string[]) {
  await page.goto('/');
  await page.getByRole('link', { name: /Courses/ }).click();
  const input = page.getByRole('textbox', { name: 'Article' });
  for (const name of names) {
    await input.fill(name);
    await input.press('Enter');
  }
  await expect(items(page)).toHaveCount(names.length);
}

test('cocher et décocher, sans que les articles changent de place, et ça survit au rechargement', async ({ page }) => {
  await openCoursesWith(page, ['Lait', 'Pâtes', 'Café', 'Sel']);
  await expect(finishButton(page)).toHaveCount(0);

  // Coches rapides enchaînées : chaque coche doit tomber sur le bon article.
  await box(page, 'Lait').check();
  await box(page, 'Pâtes').check();
  // Toucher le nom suffit à cocher.
  await page.getByText('Café', { exact: true }).click();
  await expect(finishButton(page)).toHaveText('Courses terminées (3)');
  await expect(items(page)).toHaveText([/Café/, /Lait/, /Pâtes/, /Sel/]);

  await box(page, 'Café').uncheck();
  await expect(finishButton(page)).toHaveText('Courses terminées (2)');

  await page.reload();
  await expect(box(page, 'Lait')).toBeChecked();
  await expect(box(page, 'Pâtes')).toBeChecked();
  await expect(box(page, 'Café')).not.toBeChecked();
  await expect(box(page, 'Sel')).not.toBeChecked();
});

test('« Courses terminées » retire les articles cochés et garde les autres', async ({ page }) => {
  await openCoursesWith(page, ['Lait', 'Pâtes', 'Café', 'Sel']);
  await box(page, 'Lait').check();
  await box(page, 'Pâtes').check();

  await finishButton(page).click();
  await expect(page.getByRole('status')).toHaveText('2 articles validés.');
  await expect(finishButton(page)).toHaveCount(0);
  await expect(items(page)).toHaveText([/Café/, /Sel/]);

  await page.reload();
  await expect(items(page)).toHaveText([/Café/, /Sel/]);

  await page.getByRole('link', { name: 'Retour aux listes' }).click();
  await expect(page.getByRole('link', { name: /Courses\s*2 articles/ })).toBeVisible();
});

test('« Annuler » remet les articles validés, toujours cochés', async ({ page }) => {
  await openCoursesWith(page, ['Lait', 'Sel']);
  await box(page, 'Lait').check();
  await finishButton(page).click();
  await expect(items(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('status')).toHaveText('Validation annulée.');
  await expect(box(page, 'Lait')).toBeChecked();
  await expect(finishButton(page)).toHaveText('Courses terminées (1)');
  await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
});

test('tout cocher puis valider vide la liste', async ({ page }) => {
  await openCoursesWith(page, ['Lait']);
  await box(page, 'Lait').check();
  await finishButton(page).click();
  await expect(page.getByRole('status')).toHaveText('1 article validé.');
  await expect(page.getByText('Rien ne manque pour l’instant.')).toBeVisible();
});

test('un produit validé est toujours proposé à la saisie suivante', async ({ page }) => {
  await openCoursesWith(page, ['Lait']);
  await box(page, 'Lait').check();
  await finishButton(page).click();

  await page.getByRole('textbox', { name: 'Article' }).fill('lai');
  await page.getByRole('list', { name: 'Suggestions' }).getByRole('button', { name: 'Lait' }).click();
  await expect(items(page)).toHaveText([/Lait/]);
  await expect(box(page, 'Lait')).not.toBeChecked();
});
