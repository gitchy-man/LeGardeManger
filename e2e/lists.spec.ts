import { expect, test, type Page } from '@playwright/test';

// Chaque test démarre avec un navigateur vierge : premier lancement de l'appli.

const items = (page: Page) => page.getByRole('list', { name: 'Articles' }).getByRole('listitem');
const nameInput = (page: Page) => page.getByRole('textbox', { name: 'Article' });
const noteInput = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true });

async function openCourses(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: /Courses/ }).click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
}

async function add(page: Page, name: string, note = '') {
  await nameInput(page).fill(name);
  if (note) await noteInput(page).fill(note);
  await nameInput(page).press('Enter');
}

test('au premier lancement, une liste « Courses » vide est prête', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Courses\s*vide/ })).toBeVisible();
});

test('les articles ajoutés restent après rechargement, avec leur note', async ({ page }) => {
  await openCourses(page);
  await add(page, 'lait', 'demi-écrémé');
  await add(page, 'pâtes');
  await expect(page.getByRole('status')).toHaveText('Pâtes ajouté.');
  await expect(nameInput(page)).toBeFocused();
  await expect(nameInput(page)).toHaveValue('');

  await page.reload();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0)).toContainText('Lait');
  await expect(items(page).nth(0)).toContainText('demi-écrémé');
  await expect(items(page).nth(1)).toContainText('Pâtes');

  await page.getByRole('link', { name: 'Retour aux listes' }).click();
  await expect(page.getByRole('link', { name: /Courses\s*2 articles/ })).toBeVisible();
});

test('une variante du même nom ne crée pas de doublon', async ({ page }) => {
  await openCourses(page);
  await add(page, 'Lait');
  await add(page, '  LAIT ');
  await expect(page.getByRole('status')).toHaveText('Lait est déjà dans la liste.');
  await expect(items(page)).toHaveCount(1);
});

test('une faute de frappe propose le produit existant', async ({ page }) => {
  await openCourses(page);
  await add(page, 'Chocolat noir');
  await nameInput(page).fill('chocolta');
  const suggestions = page.getByRole('list', { name: 'Suggestions' });
  await expect(suggestions).toContainText('Chocolat noir');
  await expect(suggestions).toContainText('déjà dans la liste');
});

test('un produit déjà acheté est proposé dans une autre liste', async ({ page }) => {
  await openCourses(page);
  await add(page, 'Pâtes complètes');

  await page.getByRole('link', { name: 'Retour aux listes' }).click();
  await page.getByRole('textbox', { name: 'Nom de la nouvelle liste' }).fill('Apéro');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('heading', { name: 'Apéro' })).toBeVisible();

  await nameInput(page).fill('comp');
  await page.getByRole('list', { name: 'Suggestions' }).getByRole('button', { name: 'Pâtes complètes' }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('Pâtes complètes');
});

test('modifier la note puis retirer un article', async ({ page }) => {
  await openCourses(page);
  await add(page, 'Beurre');
  await page.getByRole('button', { name: 'Modifier la note de Beurre' }).click();
  const edit = page.getByRole('textbox', { name: 'Note pour Beurre' });
  await expect(edit).toBeFocused();
  await edit.fill('doux');
  await edit.press('Enter');
  await expect(items(page).first()).toContainText('doux');

  await page.reload();
  await expect(items(page).first()).toContainText('doux');

  await page.getByRole('button', { name: 'Retirer Beurre' }).click();
  await expect(items(page)).toHaveCount(0);
  await expect(page.getByText('Rien ne manque pour l’instant.')).toBeVisible();
});

test('renommer puis supprimer une liste', async ({ page }) => {
  await openCourses(page);
  await add(page, 'Sel');

  page.once('dialog', (dialog) => dialog.accept('Courses semaine'));
  await page.getByRole('button', { name: 'Renommer la liste' }).click();
  await expect(page.getByRole('heading', { name: 'Courses semaine' })).toBeVisible();

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toBe('Supprimer la liste « Courses semaine » et son article ?');
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Supprimer la liste' }).click();
  await expect(page.getByRole('heading', { name: 'Mes listes' })).toBeVisible();
  await expect(page.getByText('Aucune liste pour l’instant.')).toBeVisible();
});
