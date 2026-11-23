import { html, nothing, type TemplateResult } from 'lit-html';
import {
  frequency,
  productStats,
  relativeDay,
  sessionTitle,
  times,
} from '../domain/history';
import type { Product, Purchase, Session, ShoppingList } from '../data/types';

export type HistoryTab = 'sessions' | 'products';

export interface HistoryData {
  sessions: Session[];
  purchases: Purchase[];
  products: Map<string, Product>;
  lists: ShoppingList[];
  now: number;
}

export function productHref(key: string): string {
  return `#/historique/produit/${encodeURIComponent(key)}`;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function labelOf(data: HistoryData, key: string): string {
  return data.products.get(key)?.label ?? key;
}

/** Nom actuel de la liste si elle existe encore, sinon celui du moment de la séance. */
function listNameOf(data: HistoryData, listId: string, fallback: string): string {
  return data.lists.find((l) => l.id === listId)?.name ?? fallback;
}

function header(title: string, back: string): TemplateResult {
  return html`<header class="bar">
    <a class="back" href=${back} aria-label="Retour">‹</a>
    <h1>${title}</h1>
  </header>`;
}

function tabs(active: HistoryTab): TemplateResult {
  const tab = (id: HistoryTab, href: string, label: string) =>
    html`<a href=${href} class=${active === id ? 'tab active' : 'tab'} aria-current=${active === id ? 'page' : nothing}>${label}</a>`;
  return html`<nav class="tabs" aria-label="Vues de l’historique">
    ${tab('sessions', '#/historique', 'Séances')} ${tab('products', '#/historique/produits', 'Produits')}
  </nav>`;
}

const emptyHistory = html`<p class="empty">
  Aucun achat pour l’instant. Cochez des articles puis appuyez sur « Courses terminées ».
</p>`;

export function historyView(data: HistoryData, tab: HistoryTab): TemplateResult {
  return html`<main class="shell">
    ${header('Historique', '#/')} ${tabs(tab)}
    ${data.sessions.length === 0
      ? emptyHistory
      : tab === 'sessions'
        ? sessionsView(data)
        : productsView(data)}
  </main>`;
}

function sessionsView(data: HistoryData): TemplateResult {
  const bySession = new Map<string, Purchase[]>();
  for (const p of data.purchases) {
    const group = bySession.get(p.sessionId) ?? [];
    group.push(p);
    bySession.set(p.sessionId, group);
  }

  return html`<ul class="sessions" aria-label="Séances">
    ${data.sessions.map((session) => {
      const purchases = (bySession.get(session.id) ?? []).sort((a, b) =>
        collator.compare(labelOf(data, a.productKey), labelOf(data, b.productKey)),
      );
      return html`<li class="session">
        <div class="session-head">
          <h2>${sessionTitle(session.finishedAt, data.now)}</h2>
          <span class="muted">${listNameOf(data, session.listId, session.listName)}</span>
        </div>
        <ul class="chips" aria-label="Achats">
          ${purchases.map(
            (p) => html`<li>
              <a href=${productHref(p.productKey)}>${labelOf(data, p.productKey)}</a>${p.note
                ? html` <span class="muted">(${p.note})</span>`
                : nothing}
            </li>`,
          )}
        </ul>
      </li>`;
    })}
  </ul>`;
}

function productsView(data: HistoryData): TemplateResult {
  const stats = productStats(data.purchases);
  return html`<ul class="lists" aria-label="Produits achetés">
    ${stats.map(
      (s) => html`<li>
        <a href=${productHref(s.productKey)}>
          <span class="stack">
            <span class="name">${labelOf(data, s.productKey)}</span>
            <span class="muted">
              Acheté ${times(s.count)}${s.averageIntervalDays !== null
                ? html` · ${frequency(s.averageIntervalDays)}`
                : nothing}
            </span>
          </span>
          <span class="count">${relativeDay(s.lastAt, data.now)}</span>
        </a>
      </li>`,
    )}
  </ul>`;
}

export function productView(data: HistoryData, key: string): TemplateResult {
  const purchases = data.purchases
    .filter((p) => p.productKey === key)
    .sort((a, b) => b.at - a.at);
  const [stats] = productStats(purchases);
  const sessionsById = new Map(data.sessions.map((s) => [s.id, s]));

  return html`<main class="shell">
    ${header(labelOf(data, key), '#/historique/produits')}
    ${stats
      ? html`<p class="summary">
            Acheté ${times(stats.count)}, la dernière fois ${relativeDay(stats.lastAt, data.now)}.
            ${stats.averageIntervalDays !== null
              ? html`<br />En moyenne ${frequency(stats.averageIntervalDays)}.`
              : nothing}
          </p>
          <ul class="purchases" aria-label="Dates d’achat">
            ${purchases.map((p) => {
              const session = sessionsById.get(p.sessionId);
              return html`<li>
                <span>${sessionTitle(p.at, data.now)}</span>
                <span class="muted">
                  ${listNameOf(data, p.listId, session?.listName ?? '')}${p.note ? ` · ${p.note}` : ''}
                </span>
              </li>`;
            })}
          </ul>`
      : html`<p class="empty">Ce produit n’a encore jamais été acheté.</p>`}
  </main>`;
}
