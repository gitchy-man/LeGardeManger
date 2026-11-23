import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetween,
  frequency,
  productStats,
  relativeDay,
  sessionTitle,
} from './history';

// Dates en heure locale, pour que les tests ne dépendent pas du fuseau horaire.
const at = (month: number, day: number, hour = 12, minute = 0, year = 2026) =>
  new Date(year, month - 1, day, hour, minute).getTime();
const now = at(11, 23, 10); // lundi 23 novembre 2026, 10 h

describe('productStats', () => {
  it('compte les achats et calcule la fréquence moyenne', () => {
    const stats = productStats([
      { productKey: 'lait', at: at(11, 1) },
      { productKey: 'lait', at: at(11, 11) },
      { productKey: 'lait', at: at(11, 21) },
      { productKey: 'sel', at: at(10, 1) },
    ]);
    expect(stats).toEqual([
      { productKey: 'lait', count: 3, firstAt: at(11, 1), lastAt: at(11, 21), averageIntervalDays: 10 },
      { productKey: 'sel', count: 1, firstAt: at(10, 1), lastAt: at(10, 1), averageIntervalDays: null },
    ]);
  });

  it('ne dépend pas de l’ordre des achats', () => {
    const [stats] = productStats([
      { productKey: 'lait', at: at(11, 21) },
      { productKey: 'lait', at: at(11, 1) },
    ]);
    expect(stats).toMatchObject({ firstAt: at(11, 1), lastAt: at(11, 21), averageIntervalDays: 20 });
  });

  it('trie du plus récent au plus ancien', () => {
    const stats = productStats([
      { productKey: 'a', at: at(11, 1) },
      { productKey: 'b', at: at(11, 20) },
      { productKey: 'c', at: at(11, 10) },
    ]);
    expect(stats.map((s) => s.productKey)).toEqual(['b', 'c', 'a']);
  });
});

describe('calendarDaysBetween', () => {
  it('compte en jours du calendrier, pas en tranches de 24 h', () => {
    expect(calendarDaysBetween(at(11, 22, 23, 30), at(11, 23, 0, 30))).toBe(1);
    expect(calendarDaysBetween(at(11, 23, 0, 5), at(11, 23, 23, 55))).toBe(0);
  });

  it('traverse le changement d’heure', () => {
    expect(calendarDaysBetween(at(10, 24), at(10, 26))).toBe(2);
  });
});

describe('relativeDay', () => {
  it.each([
    [at(11, 23, 8), 'aujourd’hui'],
    [at(11, 22, 23), 'hier'],
    [at(11, 20), 'il y a 3 jours'],
    [at(11, 17), 'il y a 6 jours'],
    [at(11, 16), 'le 16 novembre'],
    [at(11, 1), 'le 1er novembre'],
    [at(12, 24, 12, 0, 2025), 'le 24 décembre 2025'],
  ])('%s → %s', (date, expected) => {
    expect(relativeDay(date, now)).toBe(expected);
  });
});

describe('sessionTitle', () => {
  it.each([
    [at(11, 23, 8, 5), 'Aujourd’hui à 08:05'],
    [at(11, 22, 18, 42), 'Hier à 18:42'],
    [at(11, 14, 18, 42), 'Samedi 14 novembre à 18:42'],
    [at(11, 1, 9, 0), 'Dimanche 1er novembre à 09:00'],
    [at(12, 31, 18, 0, 2025), 'Mercredi 31 décembre 2025 à 18:00'],
  ])('%s → %s', (date, expected) => {
    expect(sessionTitle(date, now)).toBe(expected);
  });
});

describe('frequency', () => {
  it.each([
    [1, 'tous les jours environ'],
    [2, 'tous les ~2 jours'],
    [9.4, 'tous les ~9 jours'],
    [13.9, 'tous les ~14 jours'],
    [21, 'toutes les ~3 semaines'],
    [65, 'tous les ~2 mois'],
  ])('%f jours → %s', (days, expected) => {
    expect(frequency(days)).toBe(expected);
  });
});
