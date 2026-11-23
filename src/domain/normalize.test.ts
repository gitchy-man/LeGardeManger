import { describe, expect, it } from 'vitest';
import { cleanLabel, productKey } from './normalize';

describe('productKey', () => {
  it.each([
    ['Lait', 'lait'],
    ['  lait ', 'lait'],
    ['LAIT', 'lait'],
    ['Pâtes', 'pates'],
    ['pates', 'pates'],
    ['Pâtes  complètes', 'pates completes'],
    ['Œufs', 'oeufs'],
    ['oeufs', 'oeufs'],
    ['Coca-Cola', 'coca cola'],
    ['coca cola', 'coca cola'],
    ["Pomme d'api", 'pomme d api'],
    ['Pomme d’api', 'pomme d api'],
    ['Lait.', 'lait'],
    ['Yaourts 0%', 'yaourts 0'],
  ])('%j → %j', (input, expected) => {
    expect(productKey(input)).toBe(expected);
  });

  it('renvoie une chaîne vide sans lettre ni chiffre', () => {
    expect(productKey('  ...  ')).toBe('');
  });

  it('ne fusionne pas le singulier et le pluriel (ce sera la fusion manuelle)', () => {
    expect(productKey('yaourt')).not.toBe(productKey('yaourts'));
  });
});

describe('cleanLabel', () => {
  it('nettoie les espaces et met une majuscule', () => {
    expect(cleanLabel('  pâtes   complètes ')).toBe('Pâtes complètes');
  });

  it('unifie les apostrophes', () => {
    expect(cleanLabel('huile d’olive')).toBe("Huile d'olive");
  });

  it('garde le reste de la casse saisie', () => {
    expect(cleanLabel('coca-Cola')).toBe('Coca-Cola');
  });
});
