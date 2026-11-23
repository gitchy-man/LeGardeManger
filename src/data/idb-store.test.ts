import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openIdbStore, type IdbStore } from './idb-store';
import { InvalidNameError } from './types';

let store: IdbStore;
let dbCount = 0;
let clock = 1000;
let ids = 0;

async function openFresh(dbName = `test-${++dbCount}`) {
  return openIdbStore({ dbName, now: () => clock++, newId: () => `id-${++ids}` });
}

beforeEach(async () => {
  store = await openFresh();
});

afterEach(() => {
  store.close();
});

describe('premier lancement', () => {
  it('crée une liste « Courses »', async () => {
    const lists = await store.getLists();
    expect(lists.map((l) => l.name)).toEqual(['Courses']);
  });

  it('ne la recrée pas au lancement suivant, même si on l’a supprimée', async () => {
    const dbName = `test-${++dbCount}`;
    const first = await openFresh(dbName);
    const [courses] = await first.getLists();
    await first.deleteList(courses.id);
    first.close();

    const second = await openFresh(dbName);
    expect(await second.getLists()).toEqual([]);
    second.close();
  });
});

describe('listes', () => {
  it('crée, renomme et supprime une liste', async () => {
    const list = await store.createList('  bricolage ');
    expect(list.name).toBe('Bricolage');

    await store.renameList(list.id, 'Brico');
    expect((await store.getList(list.id))?.name).toBe('Brico');

    await store.deleteList(list.id);
    expect(await store.getList(list.id)).toBeUndefined();
  });

  it('refuse un nom vide', async () => {
    await expect(store.createList('   ')).rejects.toBeInstanceOf(InvalidNameError);
  });

  it('supprime les articles de la liste supprimée, mais garde les produits', async () => {
    const list = await store.createList('Apéro');
    await store.addItem(list.id, 'Chips');
    await store.deleteList(list.id);

    expect(await store.getItems(list.id)).toEqual([]);
    expect((await store.getProducts()).map((p) => p.label)).toEqual(['Chips']);
  });
});

describe('articles', () => {
  let listId: string;
  beforeEach(async () => {
    listId = (await store.getLists())[0].id;
  });

  it('ajoute un article avec une note', async () => {
    const result = await store.addItem(listId, 'lait', 'demi-écrémé ');
    expect(result.status).toBe('added');
    expect(result.product.label).toBe('Lait');

    const [item] = await store.getItems(listId);
    expect(item).toMatchObject({ productKey: 'lait', note: 'demi-écrémé' });
  });

  it('ne crée pas de doublon pour une variante du même nom', async () => {
    await store.addItem(listId, 'Lait');
    const again = await store.addItem(listId, '  LAIT ');

    expect(again.status).toBe('exists');
    expect(await store.getItems(listId)).toHaveLength(1);
    expect(await store.getProducts()).toHaveLength(1);
  });

  it('garde le premier nom saisi pour le produit', async () => {
    await store.addItem(listId, 'Pâtes');
    const other = await store.createList('Autre');
    const result = await store.addItem(other.id, 'pates');
    expect(result.product.label).toBe('Pâtes');
  });

  it('partage le même produit entre deux listes', async () => {
    const other = await store.createList('Autre');
    await store.addItem(listId, 'Café');
    await store.addItem(other.id, 'cafe');

    expect(await store.getProducts()).toHaveLength(1);
    expect(await store.getItems(other.id)).toHaveLength(1);
  });

  it('refuse un nom sans lettre ni chiffre', async () => {
    await expect(store.addItem(listId, ' ... ')).rejects.toBeInstanceOf(InvalidNameError);
  });

  it('modifie la note puis retire l’article, le produit reste connu', async () => {
    const { item } = await store.addItem(listId, 'Beurre');
    await store.setItemNote(item.id, 'doux');
    expect((await store.getItems(listId))[0].note).toBe('doux');

    await store.removeItem(item.id);
    expect(await store.getItems(listId)).toEqual([]);
    expect((await store.getProducts()).map((p) => p.key)).toEqual(['beurre']);
  });
});

describe('abonnement', () => {
  it('prévient à chaque modification, pas après le désabonnement', async () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const list = await store.createList('Test');
    await store.addItem(list.id, 'Sel');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await store.addItem(list.id, 'Poivre');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ne prévient pas quand rien ne change', async () => {
    const list = await store.createList('Test');
    await store.addItem(list.id, 'Sel');
    const listener = vi.fn();
    store.subscribe(listener);
    await store.addItem(list.id, 'sel');
    expect(listener).not.toHaveBeenCalled();
  });
});
