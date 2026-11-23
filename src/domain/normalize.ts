/**
 * Nom affiché d'un produit : espaces nettoyés, apostrophes unifiées,
 * première lettre en majuscule. « pâtes  complètes » → « Pâtes complètes ».
 */
export function cleanLabel(raw: string): string {
  const s = raw
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.charAt(0).toLocaleUpperCase('fr') + s.slice(1) : '';
}

/**
 * Clé qui identifie un produit. Deux saisies qui ne diffèrent que par la casse,
 * les accents, la ponctuation ou les espaces donnent la même clé :
 * « Pâtes », « pates », « PÂTES. » → « pates » ; « Œufs » → « oeufs ».
 * Renvoie une chaîne vide si la saisie ne contient ni lettre ni chiffre.
 */
export function productKey(raw: string): string {
  return raw
    .toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
