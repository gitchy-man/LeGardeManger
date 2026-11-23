/**
 * Sauvegarde dans un fichier JSON : export, relecture et fusion à l'import.
 * Logique pure, réutilisable par toute implémentation de `Store` (version B comprise).
 */
import {
  itemId,
  type Item,
  type Product,
  type Purchase,
  type Session,
  type ShoppingList,
} from '../data/types';
import { cleanLabel, productKey } from './normalize';

const APPLICATION = 'le-garde-manger';
/** À incrémenter si le contenu du fichier change ; les anciens fichiers doivent rester lisibles. */
export const BACKUP_FORMAT = 1;

export interface BackupData {
  lists: ShoppingList[];
  products: Product[];
  items: Item[];
  sessions: Session[];
  purchases: Purchase[];
}

export interface Backup extends BackupData {
  application: typeof APPLICATION;
  format: number;
  appVersion: string;
  exportedAt: number;
}

/** Ce qu'un import a ajouté. */
export interface ImportReport {
  lists: number;
  items: number;
  sessions: number;
}

export class InvalidBackupError extends Error {}

export function makeBackup(data: BackupData, appVersion: string, now: number): Backup {
  return { application: APPLICATION, format: BACKUP_FORMAT, appVersion, exportedAt: now, ...data };
}

// ---------- Relecture ----------

type Raw = Record<string, unknown>;

function fail(detail: string): never {
  throw new InvalidBackupError(`Ce fichier de sauvegarde est abîmé (${detail}).`);
}

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(record: Raw, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== 'string') fail(`${where} : « ${field} » manquant`);
  return value;
}

function num(record: Raw, field: string, where: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where} : « ${field} » manquant`);
  return value;
}

function records<T>(backup: Raw, field: keyof BackupData, read: (r: Raw, where: string) => T): T[] {
  const value = backup[field];
  if (!Array.isArray(value)) fail(`« ${field} » manquant`);
  return value.map((record, i) => {
    const where = `${field} n°${i + 1}`;
    if (!isObject(record)) fail(where);
    return read(record, where);
  });
}

const notOurs = 'Ce fichier n’est pas une sauvegarde du Garde-Manger.';

/** Lit un fichier de sauvegarde ; ne garde que les champs connus. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidBackupError(notOurs);
  }
  if (!isObject(raw) || raw.application !== APPLICATION || typeof raw.format !== 'number') {
    throw new InvalidBackupError(notOurs);
  }
  if (raw.format > BACKUP_FORMAT) {
    throw new InvalidBackupError(
      'Cette sauvegarde vient d’une version plus récente : mettez l’appli à jour puis recommencez.',
    );
  }

  return {
    application: APPLICATION,
    format: raw.format,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    lists: records(raw, 'lists', (r, w) => ({
      id: str(r, 'id', w),
      name: str(r, 'name', w),
      createdAt: num(r, 'createdAt', w),
    })),
    products: records(raw, 'products', (r, w) => ({
      key: str(r, 'key', w),
      label: str(r, 'label', w),
      createdAt: num(r, 'createdAt', w),
    })),
    items: records(raw, 'items', (r, w) => {
      const item: Item = {
        id: str(r, 'id', w),
        listId: str(r, 'listId', w),
        productKey: str(r, 'productKey', w),
        note: str(r, 'note', w),
        addedAt: num(r, 'addedAt', w),
      };
      if (r.checkedAt !== undefined) item.checkedAt = num(r, 'checkedAt', w);
      return item;
    }),
    sessions: records(raw, 'sessions', (r, w) => ({
      id: str(r, 'id', w),
      listId: str(r, 'listId', w),
      listName: str(r, 'listName', w),
      finishedAt: num(r, 'finishedAt', w),
      count: num(r, 'count', w),
    })),
    purchases: records(raw, 'purchases', (r, w) => ({
      id: str(r, 'id', w),
      sessionId: str(r, 'sessionId', w),
      listId: str(r, 'listId', w),
      productKey: str(r, 'productKey', w),
      note: str(r, 'note', w),
      at: num(r, 'at', w),
      addedAt: num(r, 'addedAt', w),
    })),
  };
}

// ---------- Fusion ----------

/**
 * Calcule ce qu'un import ajoute aux données existantes, sans rien écraser ni supprimer :
 * - un produit déjà connu garde son nom ;
 * - une liste est reconnue par son id, sinon par son nom normalisé (la liste « Courses »
 *   de deux téléphones n'en fait qu'une) ;
 * - articles, séances et achats sont rattachés à la liste retenue et ignorés s'ils existent déjà.
 */
export function planImport(
  existing: BackupData,
  incoming: BackupData,
): { add: BackupData; report: ImportReport } {
  const add: BackupData = { lists: [], products: [], items: [], sessions: [], purchases: [] };

  // Liste importée → liste retenue.
  const listIds = new Map<string, string>();
  const knownListIds = new Set(existing.lists.map((l) => l.id));
  const listsByName = new Map(existing.lists.map((l) => [productKey(l.name), l.id]));
  for (const list of incoming.lists) {
    const target = knownListIds.has(list.id) ? list.id : listsByName.get(productKey(list.name));
    if (target !== undefined) {
      listIds.set(list.id, target);
      continue;
    }
    add.lists.push(list);
    knownListIds.add(list.id);
    listsByName.set(productKey(list.name), list.id);
    listIds.set(list.id, list.id);
  }
  const listOf = (id: string) => listIds.get(id) ?? id;

  const knownProducts = new Set(existing.products.map((p) => p.key));
  const incomingProducts = new Map(incoming.products.map((p) => [p.key, p]));
  const needProduct = (key: string) => {
    if (knownProducts.has(key)) return;
    knownProducts.add(key);
    add.products.push(incomingProducts.get(key) ?? { key, label: cleanLabel(key), createdAt: 0 });
  };
  for (const product of incoming.products) needProduct(product.key);

  const knownItems = new Set(existing.items.map((i) => i.id));
  for (const item of incoming.items) {
    const listId = listOf(item.listId);
    const id = itemId(listId, item.productKey);
    if (knownItems.has(id)) continue;
    knownItems.add(id);
    needProduct(item.productKey);
    add.items.push({ ...item, id, listId });
  }

  const knownSessions = new Set(existing.sessions.map((s) => s.id));
  for (const session of incoming.sessions) {
    if (knownSessions.has(session.id)) continue;
    knownSessions.add(session.id);
    add.sessions.push({ ...session, listId: listOf(session.listId) });
  }

  const knownPurchases = new Set(existing.purchases.map((p) => p.id));
  for (const purchase of incoming.purchases) {
    if (knownPurchases.has(purchase.id)) continue;
    knownPurchases.add(purchase.id);
    needProduct(purchase.productKey);
    add.purchases.push({ ...purchase, listId: listOf(purchase.listId) });
  }

  return {
    add,
    report: { lists: add.lists.length, items: add.items.length, sessions: add.sessions.length },
  };
}
