import { describe, expect, it } from 'vitest';
import type { Item, Product, Purchase, Session, ShoppingList } from '../data/types';
import {
  InvalidBackupError,
  makeBackup,
  parseBackup,
  planImport,
  type BackupData,
} from './backup';

const empty = (): BackupData => ({ lists: [], products: [], items: [], sessions: [], purchases: [] });

const list = (id: string, name: string): ShoppingList => ({ id, name, createdAt: 1 });
const product = (key: string, label: string): Product => ({ key, label, createdAt: 1 });
const item = (listId: string, productKey: string, extra: Partial<Item> = {}): Item => ({
  id: `${listId}|${productKey}`,
  listId,
  productKey,
  note: '',
  addedAt: 2,
  ...extra,
});
const session = (id: string, listId: string): Session => ({
  id,
  listId,
  listName: 'Courses',
  finishedAt: 10,
  count: 1,
});
const purchase = (sessionId: string, listId: string, productKey: string): Purchase => ({
  id: `${sessionId}|${productKey}`,
  sessionId,
  listId,
  productKey,
  note: '',
  at: 10,
  addedAt: 2,
});

/** Un téléphone avec une liste « Courses », du lait coché et une séance passée (sel). */
function phone(listId = 'L1'): BackupData {
  return {
    lists: [list(listId, 'Courses')],
    products: [product('lait', 'Lait'), product('sel', 'Sel')],
    items: [item(listId, 'lait', { note: 'x2', checkedAt: 5 })],
    sessions: [session(`S-${listId}`, listId)],
    purchases: [purchase(`S-${listId}`, listId, 'sel')],
  };
}

describe('fichier de sauvegarde', () => {
  it('se relit à l’identique', () => {
    const backup = makeBackup(phone(), '0.4.0', 1234);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed).toEqual(backup);
    expect(parsed).toMatchObject({ application: 'le-garde-manger', format: 1, appVersion: '0.4.0', exportedAt: 1234 });
  });

  it('ignore les champs inconnus', () => {
    const backup = makeBackup(phone(), '0.4.0', 1234);
    const text = JSON.stringify({ ...backup, lists: [{ ...backup.lists[0], couleur: 'rouge' }] });
    expect(parseBackup(text).lists[0]).toEqual(list('L1', 'Courses'));
  });

  it('refuse un fichier qui n’est pas du JSON', () => {
    expect(() => parseBackup('pas du json')).toThrow(InvalidBackupError);
  });

  it('refuse le fichier d’une autre application', () => {
    expect(() => parseBackup(JSON.stringify({ format: 1, lists: [] }))).toThrow(/Garde-Manger/);
  });

  it('refuse un format plus récent et demande de mettre l’appli à jour', () => {
    const backup = { ...makeBackup(empty(), '9.0.0', 1), format: 2 };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/mettez l’appli à jour/i);
  });

  it('refuse un article incomplet', () => {
    const backup = makeBackup(phone(), '0.4.0', 1);
    const { productKey: _, ...broken } = backup.items[0];
    expect(() => parseBackup(JSON.stringify({ ...backup, items: [broken] }))).toThrow(InvalidBackupError);
  });

  it('garde la date de coche seulement si elle existe', () => {
    const data = phone();
    data.items.push(item('L1', 'sel'));
    const parsed = parseBackup(JSON.stringify(makeBackup(data, '0.4.0', 1)));
    expect(parsed.items[0].checkedAt).toBe(5);
    expect('checkedAt' in parsed.items[1]).toBe(false);
  });
});

describe('import (fusion sans rien écraser)', () => {
  it('dans une appli vide, tout est ajouté', () => {
    const { add, report } = planImport(empty(), phone());
    expect(add).toEqual(phone());
    expect(report).toEqual({ lists: 1, items: 1, sessions: 1 });
  });

  it('importer deux fois le même fichier n’ajoute rien', () => {
    const { add, report } = planImport(phone(), phone());
    expect(add).toEqual(empty());
    expect(report).toEqual({ lists: 0, items: 0, sessions: 0 });
  });

  it('une liste du même nom est réunie avec la liste existante', () => {
    const existing = { ...empty(), lists: [list('A', 'Courses')], products: [product('pain', 'Pain')], items: [item('A', 'pain')] };
    const incoming = phone('B');
    incoming.lists[0].name = 'courses';

    const { add, report } = planImport(existing, incoming);
    expect(add.lists).toEqual([]);
    expect(add.items).toEqual([item('A', 'lait', { note: 'x2', checkedAt: 5 })]);
    expect(add.sessions).toEqual([{ ...session('S-B', 'B'), listId: 'A' }]);
    expect(add.purchases).toEqual([{ ...purchase('S-B', 'B', 'sel'), listId: 'A' }]);
    expect(report).toEqual({ lists: 0, items: 1, sessions: 1 });
  });

  it('un article déjà présent n’est pas écrasé, un produit connu garde son nom', () => {
    const existing = { ...empty(), lists: [list('L1', 'Courses')], products: [product('lait', 'Lait demi-écrémé')], items: [item('L1', 'lait', { note: 'bio' })] };
    const { add } = planImport(existing, phone());
    expect(add.items).toEqual([]);
    expect(add.products).toEqual([product('sel', 'Sel')]);
  });

  it('un produit absent du fichier est recréé depuis sa clé', () => {
    const incoming = { ...phone(), products: [] };
    const { add } = planImport(empty(), incoming);
    expect(add.products.map((p) => p.key).sort()).toEqual(['lait', 'sel']);
    expect(add.products.find((p) => p.key === 'lait')?.label).toBe('Lait');
  });

  it('les articles d’une liste importée en double dans le fichier ne sont ajoutés qu’une fois', () => {
    const incoming = phone('B');
    incoming.lists.push(list('C', 'COURSES'));
    incoming.items.push(item('C', 'lait'));
    const { add, report } = planImport(empty(), incoming);
    expect(add.lists).toEqual([list('B', 'Courses')]);
    expect(add.items).toEqual([item('B', 'lait', { note: 'x2', checkedAt: 5 })]);
    expect(report.lists).toBe(1);
  });
});
