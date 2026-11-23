const DAY = 24 * 60 * 60 * 1000;

export interface ProductStats {
  productKey: string;
  count: number;
  firstAt: number;
  lastAt: number;
  /** Nombre moyen de jours entre deux achats ; `null` s'il n'y a qu'un achat. */
  averageIntervalDays: number | null;
}

/** Statistiques par produit, du plus récemment acheté au plus ancien. */
export function productStats(purchases: Iterable<{ productKey: string; at: number }>): ProductStats[] {
  const byProduct = new Map<string, { count: number; firstAt: number; lastAt: number }>();
  for (const { productKey, at } of purchases) {
    const s = byProduct.get(productKey);
    if (!s) byProduct.set(productKey, { count: 1, firstAt: at, lastAt: at });
    else {
      s.count++;
      s.firstAt = Math.min(s.firstAt, at);
      s.lastAt = Math.max(s.lastAt, at);
    }
  }
  return [...byProduct]
    .map(([productKey, s]) => ({
      productKey,
      ...s,
      averageIntervalDays: s.count > 1 ? (s.lastAt - s.firstAt) / DAY / (s.count - 1) : null,
    }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

/** Nombre de jours calendaires entre deux instants (heure locale) : hier à 23 h → aujourd'hui à 1 h = 1. */
export function calendarDaysBetween(from: number, to: number): number {
  const start = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  return Math.round((start(to) - start(from)) / DAY);
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('fr') + s.slice(1);

function dayMonth(at: number, now: number, weekday: boolean): string {
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: weekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  })
    .formatToParts(at)
    // En français, le premier jour du mois s'écrit « 1er ».
    .map((part) => (part.type === 'day' && part.value === '1' ? '1er' : part.value))
    .join('');
}

/** « aujourd’hui », « hier », « il y a 3 jours », « le 2 novembre ». */
export function relativeDay(at: number, now: number): string {
  const days = calendarDaysBetween(at, now);
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return `le ${dayMonth(at, now, false)}`;
}

/** Titre d'une séance : « Aujourd’hui à 18:42 », « Hier à 9:05 », « Samedi 16 novembre à 18:42 ». */
export function sessionTitle(at: number, now: number): string {
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(at);
  const days = calendarDaysBetween(at, now);
  const day = days <= 0 ? 'aujourd’hui' : days === 1 ? 'hier' : dayMonth(at, now, true);
  return `${capitalize(day)} à ${time}`;
}

/** « tous les jours environ », « tous les ~9 jours », « toutes les ~3 semaines », « tous les ~2 mois ». */
export function frequency(days: number): string {
  if (days < 1.5) return 'tous les jours environ';
  if (days < 14) return `tous les ~${Math.round(days)} jours`;
  if (days < 60) return `toutes les ~${Math.round(days / 7)} semaines`;
  return `tous les ~${Math.round(days / 30)} mois`;
}

export function times(n: number): string {
  return n === 1 ? '1 fois' : `${n} fois`;
}
