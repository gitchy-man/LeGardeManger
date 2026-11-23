/**
 * Couche d'accès aux données. Toute l'appli passe par cette interface :
 * en version A elle est implémentée avec IndexedDB (données sur l'appareil),
 * en version B on la remplacera par une implémentation en ligne.
 */

import type { BackupData, ImportReport } from '../domain/backup';

export interface ShoppingList {
  id: string;
  name: string;
  createdAt: number;
}

/** Un produit est identifié par son nom normalisé (voir `productKey`). */
export interface Product {
  key: string;
  label: string;
  createdAt: number;
}

/** Un article dans une liste. Un produit n'apparaît qu'une fois par liste. */
export interface Item {
  id: string;
  listId: string;
  productKey: string;
  note: string;
  addedAt: number;
  /** Date de la coche ; absent si l'article n'est pas coché. */
  checkedAt?: number;
}

/** Une séance de courses validée avec « Courses terminées ». */
export interface Session {
  id: string;
  listId: string;
  /** Nom de la liste au moment de la validation (la liste peut être renommée ou supprimée). */
  listName: string;
  finishedAt: number;
  count: number;
}

/** Un produit acheté lors d'une séance : une ligne de l'historique. */
export interface Purchase {
  id: string;
  sessionId: string;
  listId: string;
  productKey: string;
  note: string;
  at: number;
  /** Date d'ajout de l'article à la liste, pour pouvoir le remettre en cas d'annulation. */
  addedAt: number;
}

export interface AddItemResult {
  status: 'added' | 'exists';
  item: Item;
  product: Product;
}

export interface Store {
  getLists(): Promise<ShoppingList[]>;
  getList(id: string): Promise<ShoppingList | undefined>;
  createList(name: string): Promise<ShoppingList>;
  renameList(id: string, name: string): Promise<void>;
  /** Supprime la liste et ses articles. Les produits restent connus. */
  deleteList(id: string): Promise<void>;

  getProducts(): Promise<Product[]>;

  getItems(listId: string): Promise<Item[]>;
  /** Ajoute un article ; réutilise le produit si son nom normalisé existe déjà. */
  addItem(listId: string, rawName: string, note?: string): Promise<AddItemResult>;
  setItemNote(itemId: string, note: string): Promise<void>;
  removeItem(itemId: string): Promise<void>;
  setItemChecked(itemId: string, checked: boolean): Promise<void>;

  /**
   * « Courses terminées » : les articles cochés de la liste partent dans l'historique
   * (une séance) et sortent de la liste ; les autres restent. Renvoie `null` si rien n'est coché.
   */
  finishShopping(listId: string): Promise<Session | null>;
  /** Annule une séance : ses articles reviennent dans la liste, cochés, et l'historique est effacé. */
  undoSession(sessionId: string): Promise<void>;
  getSessions(): Promise<Session[]>;
  getPurchases(sessionId: string): Promise<Purchase[]>;
  /** Tout l'historique, toutes listes confondues. */
  getAllPurchases(): Promise<Purchase[]>;

  /** Toutes les données, pour la sauvegarde dans un fichier. */
  exportData(): Promise<BackupData>;
  /** Ajoute les données d'une sauvegarde sans rien écraser ni supprimer (voir `planImport`). */
  importData(data: BackupData): Promise<ImportReport>;

  /** Prévient quand les données changent. Renvoie la fonction de désabonnement. */
  subscribe(listener: () => void): () => void;
}

export class InvalidNameError extends Error {
  constructor() {
    super('Le nom doit contenir au moins une lettre ou un chiffre.');
  }
}

export function itemId(listId: string, productKey: string): string {
  return `${listId}|${productKey}`;
}
