import { productKey } from './normalize';

export interface Suggestible {
  key: string;
  label: string;
}

export interface Suggestion<P extends Suggestible> {
  product: P;
  /** Le produit est déjà dans la liste en cours. */
  inList: boolean;
}

/**
 * Propose des produits connus pendant la saisie, du plus au moins pertinent :
 * 1. même produit (« lait » pour « Lait ») ;
 * 2. un mot du produit commence par la saisie (« comp » → « Pâtes complètes ») ;
 * 3. la saisie (3 lettres ou plus) apparaît dans le produit ;
 * 4. faute de frappe probable (« laitt » → « Lait »).
 * Les produits déjà dans la liste sont proposés aussi, marqués `inList`,
 * pour qu'une faute de frappe ne crée pas un doublon.
 */
export function suggestProducts<P extends Suggestible>(
  query: string,
  products: Iterable<P>,
  keysInList: ReadonlySet<string>,
  limit = 6,
): Suggestion<P>[] {
  const q = productKey(query);
  if (!q) return [];

  const ranked: { product: P; rank: number }[] = [];
  for (const product of products) {
    const rank = rankMatch(q, product.key);
    if (rank !== null) ranked.push({ product, rank });
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || a.product.label.localeCompare(b.product.label, 'fr'))
    .slice(0, limit)
    .map(({ product }) => ({ product, inList: keysInList.has(product.key) }));
}

function rankMatch(q: string, key: string): number | null {
  if (key === q) return 0;
  if (key.startsWith(q) || key.split(' ').some((word) => word.startsWith(q))) return 1;
  // Avec 1 ou 2 lettres, chercher à l'intérieur des mots ramène trop de bruit.
  if (q.length >= 3 && key.includes(q)) return 2;
  if (q.length >= 4) {
    const maxDistance = q.length >= 8 ? 2 : 1;
    // On compare aussi au début du produit, pour une saisie encore incomplète.
    const start = key.slice(0, q.length);
    if (
      editDistance(q, key) <= maxDistance ||
      (key.length > q.length && editDistance(q, start) <= maxDistance)
    ) {
      return 3;
    }
  }
  return null;
}

/** Distance de Levenshtein : nombre minimal de lettres à ajouter, retirer ou changer. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}
