import { describe, expect, it } from 'vitest';
import { productKey } from './normalize';
import { editDistance, suggestProducts } from './suggest';

const products = ['Lait', 'Lardons', 'Pâtes complètes', 'Pâtes', 'Chocolat noir', 'Salade'].map(
  (label) => ({ key: productKey(label), label }),
);
const none = new Set<string>();
const labels = (query: string, inList = none) =>
  suggestProducts(query, products, inList).map((s) => s.product.label);

describe('suggestProducts', () => {
  it('ne propose rien pour une saisie vide', () => {
    expect(labels('  ')).toEqual([]);
  });

  it('propose les produits qui commencent par la saisie', () => {
    expect(labels('la')).toEqual(['Lait', 'Lardons']);
  });

  it('ignore les accents et la casse', () => {
    expect(labels('PATE')).toEqual(['Pâtes', 'Pâtes complètes']);
  });

  it("met le produit identique en premier", () => {
    expect(labels('pâtes')[0]).toBe('Pâtes');
  });

  it("trouve un mot au milieu du nom", () => {
    expect(labels('comp')).toEqual(['Pâtes complètes']);
  });

  it('trouve la saisie à l’intérieur d’un mot, après les débuts de mot', () => {
    expect(labels('ola')).toEqual(['Chocolat noir']);
  });

  it('rattrape une faute de frappe', () => {
    expect(labels('laitt')).toEqual(['Lait']);
    expect(labels('slade')).toEqual(['Salade']);
    expect(labels('chocolta noir')).toEqual(['Chocolat noir']);
  });

  it('ne rapproche pas des mots courts trop différents', () => {
    expect(labels('riz')).toEqual([]);
  });

  it('signale les produits déjà dans la liste', () => {
    const result = suggestProducts('lait', products, new Set(['lait']));
    expect(result[0]).toMatchObject({ product: { label: 'Lait' }, inList: true });
  });

  it('limite le nombre de propositions', () => {
    expect(suggestProducts('pat', products, none, 1)).toHaveLength(1);
  });
});

describe('editDistance', () => {
  it.each([
    ['lait', 'lait', 0],
    ['lait', 'laitt', 1],
    ['lait', 'lail', 1],
    ['salade', 'slade', 1],
    ['', 'abc', 3],
  ])('%s / %s = %i', (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });
});
