import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { planImport, type BackupData, type ImportReport } from '../domain/backup';
import { cleanLabel, productKey } from '../domain/normalize';
import {
  InvalidNameError,
  itemId,
  type AddItemResult,
  type Item,
  type Product,
  type Purchase,
  type Session,
  type ShoppingList,
  type Store,
} from './types';

interface Schema extends DBSchema {
  lists: { key: string; value: ShoppingList };
  products: { key: string; value: Product };
  items: { key: string; value: Item; indexes: { byList: string } };
  meta: { key: string; value: unknown };
  sessions: { key: string; value: Session };
  purchases: {
    key: string;
    value: Purchase;
    indexes: { bySession: string; byProduct: string };
  };
}

export interface IdbStoreOptions {
  dbName?: string;
  now?: () => number;
  newId?: () => string;
}

const DEFAULT_LIST_NAME = 'Courses';
const STORES = ['lists', 'products', 'items', 'sessions', 'purchases'] as const;

export async function openIdbStore(options: IdbStoreOptions = {}): Promise<IdbStore> {
  const db = await openDB<Schema>(options.dbName ?? 'garde-manger', 2, {
    // Chaque version ajoute ce qui manque, sans toucher aux données existantes.
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('lists', { keyPath: 'id' });
        db.createObjectStore('products', { keyPath: 'key' });
        db.createObjectStore('items', { keyPath: 'id' }).createIndex('byList', 'listId');
        db.createObjectStore('meta');
      }
      if (oldVersion < 2) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        const purchases = db.createObjectStore('purchases', { keyPath: 'id' });
        purchases.createIndex('bySession', 'sessionId');
        purchases.createIndex('byProduct', 'productKey');
      }
    },
  });
  const store = new IdbStore(db, options.now ?? Date.now, options.newId ?? (() => crypto.randomUUID()));
  await store.initialize();
  return store;
}

export class IdbStore implements Store {
  private listeners = new Set<() => void>();

  constructor(
    private readonly db: IDBPDatabase<Schema>,
    private readonly now: () => number,
    private readonly newId: () => string,
  ) {}

  /** Au tout premier lancement, crée une liste « Courses » pour démarrer tout de suite. */
  async initialize(): Promise<void> {
    if (await this.db.get('meta', 'initialized')) return;
    const tx = this.db.transaction(['lists', 'meta'], 'readwrite');
    await tx.objectStore('lists').put(this.makeList(DEFAULT_LIST_NAME));
    await tx.objectStore('meta').put(true, 'initialized');
    await tx.done;
  }

  async getLists(): Promise<ShoppingList[]> {
    const lists = await this.db.getAll('lists');
    return lists.sort((a, b) => a.createdAt - b.createdAt);
  }

  getList(id: string): Promise<ShoppingList | undefined> {
    return this.db.get('lists', id);
  }

  async createList(name: string): Promise<ShoppingList> {
    const list = this.makeList(requireName(name));
    await this.db.put('lists', list);
    this.notify();
    return list;
  }

  async renameList(id: string, name: string): Promise<void> {
    const tx = this.db.transaction('lists', 'readwrite');
    const list = await tx.store.get(id);
    if (list) await tx.store.put({ ...list, name: requireName(name) });
    await tx.done;
    this.notify();
  }

  async deleteList(id: string): Promise<void> {
    const tx = this.db.transaction(['lists', 'items'], 'readwrite');
    const items = tx.objectStore('items');
    for (const key of await items.index('byList').getAllKeys(id)) await items.delete(key);
    await tx.objectStore('lists').delete(id);
    await tx.done;
    this.notify();
  }

  getProducts(): Promise<Product[]> {
    return this.db.getAll('products');
  }

  getItems(listId: string): Promise<Item[]> {
    return this.db.getAllFromIndex('items', 'byList', listId);
  }

  async addItem(listId: string, rawName: string, note = ''): Promise<AddItemResult> {
    const key = productKey(rawName);
    if (!key) throw new InvalidNameError();

    const tx = this.db.transaction(['products', 'items'], 'readwrite');
    const products = tx.objectStore('products');
    const items = tx.objectStore('items');

    let product = await products.get(key);
    if (!product) {
      product = { key, label: cleanLabel(rawName), createdAt: this.now() };
      await products.put(product);
    }

    const id = itemId(listId, key);
    const existing = await items.get(id);
    if (existing) {
      await tx.done;
      return { status: 'exists', item: existing, product };
    }

    const item: Item = { id, listId, productKey: key, note: note.trim(), addedAt: this.now() };
    await items.put(item);
    await tx.done;
    this.notify();
    return { status: 'added', item, product };
  }

  async setItemNote(id: string, note: string): Promise<void> {
    const tx = this.db.transaction('items', 'readwrite');
    const item = await tx.store.get(id);
    if (item) await tx.store.put({ ...item, note: note.trim() });
    await tx.done;
    this.notify();
  }

  async removeItem(id: string): Promise<void> {
    await this.db.delete('items', id);
    this.notify();
  }

  async setItemChecked(id: string, checked: boolean): Promise<void> {
    const tx = this.db.transaction('items', 'readwrite');
    const item = await tx.store.get(id);
    if (item && checked !== (item.checkedAt !== undefined)) {
      const { checkedAt: _previous, ...unchecked } = item;
      await tx.store.put(checked ? { ...unchecked, checkedAt: this.now() } : unchecked);
    }
    await tx.done;
    this.notify();
  }

  async finishShopping(listId: string): Promise<Session | null> {
    const tx = this.db.transaction(['lists', 'items', 'sessions', 'purchases'], 'readwrite');
    const items = tx.objectStore('items');
    const checked = (await items.index('byList').getAll(listId)).filter(
      (item) => item.checkedAt !== undefined,
    );
    if (checked.length === 0) {
      await tx.done;
      return null;
    }

    const list = await tx.objectStore('lists').get(listId);
    const finishedAt = this.now();
    const session: Session = {
      id: this.newId(),
      listId,
      listName: list?.name ?? '',
      finishedAt,
      count: checked.length,
    };
    await tx.objectStore('sessions').put(session);
    const purchases = tx.objectStore('purchases');
    for (const item of checked) {
      await purchases.put({
        id: `${session.id}|${item.productKey}`,
        sessionId: session.id,
        listId,
        productKey: item.productKey,
        note: item.note,
        at: finishedAt,
        addedAt: item.addedAt,
      });
      await items.delete(item.id);
    }
    await tx.done;
    this.notify();
    return session;
  }

  async undoSession(sessionId: string): Promise<void> {
    const tx = this.db.transaction(['lists', 'items', 'sessions', 'purchases'], 'readwrite');
    const sessions = tx.objectStore('sessions');
    const session = await sessions.get(sessionId);
    if (session) {
      const listStillExists = (await tx.objectStore('lists').get(session.listId)) !== undefined;
      const items = tx.objectStore('items');
      const purchases = tx.objectStore('purchases');
      for (const purchase of await purchases.index('bySession').getAll(sessionId)) {
        const id = itemId(session.listId, purchase.productKey);
        // Si l'article a été rajouté entre-temps, on garde la version actuelle.
        if (listStillExists && !(await items.get(id))) {
          await items.put({
            id,
            listId: session.listId,
            productKey: purchase.productKey,
            note: purchase.note,
            addedAt: purchase.addedAt,
            checkedAt: purchase.at,
          });
        }
        await purchases.delete(purchase.id);
      }
      await sessions.delete(sessionId);
    }
    await tx.done;
    this.notify();
  }

  async getSessions(): Promise<Session[]> {
    const sessions = await this.db.getAll('sessions');
    return sessions.sort((a, b) => b.finishedAt - a.finishedAt);
  }

  getPurchases(sessionId: string): Promise<Purchase[]> {
    return this.db.getAllFromIndex('purchases', 'bySession', sessionId);
  }

  getAllPurchases(): Promise<Purchase[]> {
    return this.db.getAll('purchases');
  }

  async exportData(): Promise<BackupData> {
    const tx = this.db.transaction(STORES, 'readonly');
    const [lists, products, items, sessions, purchases] = await Promise.all([
      tx.objectStore('lists').getAll(),
      tx.objectStore('products').getAll(),
      tx.objectStore('items').getAll(),
      tx.objectStore('sessions').getAll(),
      tx.objectStore('purchases').getAll(),
    ]);
    await tx.done;
    return { lists, products, items, sessions, purchases };
  }

  async importData(data: BackupData): Promise<ImportReport> {
    // Lecture et écriture dans la même transaction : rien ne peut changer entre les deux.
    const tx = this.db.transaction(STORES, 'readwrite');
    const [lists, products, items, sessions, purchases] = await Promise.all([
      tx.objectStore('lists').getAll(),
      tx.objectStore('products').getAll(),
      tx.objectStore('items').getAll(),
      tx.objectStore('sessions').getAll(),
      tx.objectStore('purchases').getAll(),
    ]);
    const { add, report } = planImport({ lists, products, items, sessions, purchases }, data);
    await Promise.all([
      ...add.lists.map((r) => tx.objectStore('lists').put(r)),
      ...add.products.map((r) => tx.objectStore('products').put(r)),
      ...add.items.map((r) => tx.objectStore('items').put(r)),
      ...add.sessions.map((r) => tx.objectStore('sessions').put(r)),
      ...add.purchases.map((r) => tx.objectStore('purchases').put(r)),
    ]);
    await tx.done;
    this.notify();
    return report;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.db.close();
  }

  private makeList(name: string): ShoppingList {
    return { id: this.newId(), name, createdAt: this.now() };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function requireName(name: string): string {
  const clean = cleanLabel(name);
  if (!productKey(clean)) throw new InvalidNameError();
  return clean;
}
