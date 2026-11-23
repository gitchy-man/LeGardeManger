import 'fake-indexeddb/auto';
import { openDB } from 'idb';
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

describe('courses', () => {
  let listId: string;
  const checkedOf = async () =>
    (await store.getItems(listId)).filter((i) => i.checkedAt !== undefined).map((i) => i.productKey);

  beforeEach(async () => {
    listId = (await store.getLists())[0].id;
    for (const name of ['Lait', 'Pâtes', 'Café', 'Sel']) await store.addItem(listId, name);
  });

  it('coche et décoche un article', async () => {
    await store.setItemChecked(`${listId}|lait`, true);
    await store.setItemChecked(`${listId}|cafe`, true);
    expect((await checkedOf()).sort()).toEqual(['cafe', 'lait']);

    await store.setItemChecked(`${listId}|cafe`, false);
    expect(await checkedOf()).toEqual(['lait']);
  });

  it('« Courses terminées » sort les cochés vers l’historique et garde les autres', async () => {
    await store.setItemChecked(`${listId}|lait`, true);
    await store.setItemChecked(`${listId}|pates`, true);
    await store.setItemNote(`${listId}|lait`, 'x2');

    const session = await store.finishShopping(listId);
    expect(session).toMatchObject({ listId, listName: 'Courses', count: 2 });

    const remaining = (await store.getItems(listId)).map((i) => i.productKey).sort();
    expect(remaining).toEqual(['cafe', 'sel']);

    const purchases = await store.getPurchases(session!.id);
    expect(purchases.map((p) => [p.productKey, p.note]).sort()).toEqual([
      ['lait', 'x2'],
      ['pates', ''],
    ]);
    expect(purchases.every((p) => p.at === session!.finishedAt)).toBe(true);
    expect(await store.getSessions()).toEqual([session]);
  });

  it('ne crée pas de séance si rien n’est coché', async () => {
    expect(await store.finishShopping(listId)).toBeNull();
    expect(await store.getSessions()).toEqual([]);
    expect(await store.getItems(listId)).toHaveLength(4);
  });

  it('ne valide que la liste concernée', async () => {
    const other = await store.createList('Autre');
    await store.addItem(other.id, 'Lait');
    await store.setItemChecked(`${other.id}|lait`, true);
    await store.setItemChecked(`${listId}|sel`, true);

    await store.finishShopping(listId);
    expect(await store.getItems(other.id)).toHaveLength(1);
    expect((await store.getItems(other.id))[0].checkedAt).toBeDefined();
  });

  it('annuler remet les articles cochés dans la liste et efface la séance', async () => {
    await store.setItemChecked(`${listId}|lait`, true);
    await store.setItemNote(`${listId}|lait`, 'x2');
    const session = await store.finishShopping(listId);

    await store.undoSession(session!.id);
    const lait = (await store.getItems(listId)).find((i) => i.productKey === 'lait');
    expect(lait).toMatchObject({ note: 'x2' });
    expect(lait?.checkedAt).toBeDefined();
    expect(await store.getSessions()).toEqual([]);
    expect(await store.getPurchases(session!.id)).toEqual([]);
  });

  it('annuler ne remplace pas un article rajouté entre-temps', async () => {
    await store.setItemChecked(`${listId}|lait`, true);
    const session = await store.finishShopping(listId);
    await store.addItem(listId, 'lait', 'nouvelle note');

    await store.undoSession(session!.id);
    const lait = (await store.getItems(listId)).filter((i) => i.productKey === 'lait');
    expect(lait).toHaveLength(1);
    expect(lait[0]).toMatchObject({ note: 'nouvelle note' });
    expect(lait[0].checkedAt).toBeUndefined();
  });

  it('rassemble l’historique de toutes les listes', async () => {
    const other = await store.createList('Autre');
    await store.addItem(other.id, 'Lait');
    await store.setItemChecked(`${other.id}|lait`, true);
    await store.setItemChecked(`${listId}|lait`, true);
    await store.setItemChecked(`${listId}|sel`, true);
    await store.finishShopping(listId);
    await store.finishShopping(other.id);

    const all = await store.getAllPurchases();
    expect(all.map((p) => p.productKey).sort()).toEqual(['lait', 'lait', 'sel']);
    expect(await store.getSessions()).toHaveLength(2);
  });

  it('l’historique survit à la suppression de la liste', async () => {
    await store.setItemChecked(`${listId}|lait`, true);
    const session = await store.finishShopping(listId);
    await store.deleteList(listId);

    expect(await store.getSessions()).toHaveLength(1);
    expect(await store.getPurchases(session!.id)).toHaveLength(1);
  });
});

describe('mise à niveau des données existantes', () => {
  it('garde les listes et articles créés avec la version 1', async () => {
    const dbName = `test-${++dbCount}`;
    const v1 = await openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore('lists', { keyPath: 'id' });
        db.createObjectStore('products', { keyPath: 'key' });
        db.createObjectStore('items', { keyPath: 'id' }).createIndex('byList', 'listId');
        db.createObjectStore('meta');
      },
    });
    await v1.put('lists', { id: 'L1', name: 'Courses', createdAt: 1 });
    await v1.put('products', { key: 'lait', label: 'Lait', createdAt: 1 });
    await v1.put('items', { id: 'L1|lait', listId: 'L1', productKey: 'lait', note: 'x2', addedAt: 1 });
    await v1.put('meta', true, 'initialized');
    v1.close();

    const upgraded = await openFresh(dbName);
    expect(await upgraded.getLists()).toHaveLength(1);
    const [lait] = await upgraded.getItems('L1');
    expect(lait).toMatchObject({ productKey: 'lait', note: 'x2' });
    expect(lait.checkedAt).toBeUndefined();

    await upgraded.setItemChecked('L1|lait', true);
    expect(await upgraded.finishShopping('L1')).toMatchObject({ count: 1 });
    upgraded.close();
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
