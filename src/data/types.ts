/**
 * Couche d'accès aux données. Toute l'appli passe par cette interface :
 * en version A elle est implémentée avec IndexedDB (données sur l'appareil),
 * en version B on la remplacera par une implémentation en ligne.
 */

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
