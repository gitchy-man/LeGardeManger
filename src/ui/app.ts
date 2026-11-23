import { html, nothing, render, type TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { suggestProducts, type Suggestion } from '../domain/suggest';
import {
  InvalidNameError,
  type Item,
  type Product,
  type Purchase,
  type Session,
  type ShoppingList,
  type Store,
} from '../data/types';
import {
  InvalidBackupError,
  makeBackup,
  parseBackup,
  type BackupData,
} from '../domain/backup';
import { backupView, contentSummary, importMessage } from './backup-view';
import { historyView, productView, type HistoryTab } from './history-view';

type Route =
  | { name: 'lists' }
  | { name: 'backup' }
  | { name: 'list'; id: string }
  | { name: 'history'; tab: HistoryTab }
  | { name: 'product'; key: string };

function parseRoute(hash: string): Route {
  let match = /^#\/liste\/([^/]+)$/.exec(hash);
  if (match) return { name: 'list', id: decodeURIComponent(match[1]) };
  match = /^#\/historique\/produit\/([^/]+)$/.exec(hash);
  if (match) return { name: 'product', key: decodeURIComponent(match[1]) };
  if (hash === '#/historique/produits') return { name: 'history', tab: 'products' };
  if (hash === '#/historique') return { name: 'history', tab: 'sessions' };
  if (hash === '#/sauvegarde') return { name: 'backup' };
  return { name: 'lists' };
}

function isHistoryRoute(route: Route): boolean {
  return route.name === 'history' || route.name === 'product';
}

export function listHref(id: string): string {
  return `#/liste/${encodeURIComponent(id)}`;
}

interface State {
  route: Route;
  loaded: boolean;
  lists: ShoppingList[];
  counts: Map<string, number>;
  products: Map<string, Product>;
  list: ShoppingList | undefined;
  items: Item[];
  query: string;
  note: string;
  message: string;
  editingNoteOf: string | null;
  /** Dernière séance validée, pour pouvoir l'annuler. */
  lastSession: Session | null;
  sessions: Session[];
  purchases: Purchase[];
  /** Données prêtes à exporter (écran Sauvegarde). */
  backupData: BackupData | undefined;
}

/** Date locale au format AAAA-MM-JJ, pour le nom du fichier. */
function localDate(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function articles(n: number): string {
  return `${n} article${n > 1 ? 's' : ''}`;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

export function startApp(root: HTMLElement, store: Store, version: string): () => void {
  const state: State = {
    route: parseRoute(location.hash),
    loaded: false,
    lists: [],
    counts: new Map(),
    products: new Map(),
    list: undefined,
    items: [],
    query: '',
    note: '',
    message: '',
    editingNoteOf: null,
    lastSession: null,
    sessions: [],
    purchases: [],
    backupData: undefined,
  };

  let loadSeq = 0;
  async function load(): Promise<void> {
    const seq = ++loadSeq;
    const [lists, products] = await Promise.all([store.getLists(), store.getProducts()]);
    const counts = new Map<string, number>();
    await Promise.all(
      lists.map(async (l) => counts.set(l.id, (await store.getItems(l.id)).length)),
    );
    const route = state.route;
    const list = route.name === 'list' ? lists.find((l) => l.id === route.id) : undefined;
    const items = list ? await store.getItems(list.id) : [];
    const [sessions, purchases] = isHistoryRoute(route)
      ? await Promise.all([store.getSessions(), store.getAllPurchases()])
      : [[], []];
    // Préparées à l'avance : le partage doit partir tout de suite après le toucher (iPhone).
    const backupData = route.name === 'backup' ? await store.exportData() : undefined;
    if (seq !== loadSeq) return; // un chargement plus récent a pris le relais
    Object.assign(state, {
      loaded: true,
      lists,
      counts,
      products: new Map(products.map((p) => [p.key, p])),
      list,
      items,
      sessions,
      purchases,
      backupData,
    });
    draw();
  }

  function draw(): void {
    render(view(), root);
  }

  function labelOf(item: Item): string {
    return state.products.get(item.productKey)?.label ?? item.productKey;
  }

  function say(message: string): void {
    state.message = message;
  }

  // ---------- Actions ----------

  async function createList(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem('name') as HTMLInputElement;
    try {
      const list = await store.createList(input.value);
      form.reset();
      location.hash = listHref(list.id);
    } catch (error) {
      if (!(error instanceof InvalidNameError)) throw error;
      input.focus();
    }
  }

  async function renameList(list: ShoppingList): Promise<void> {
    const name = prompt('Nouveau nom de la liste', list.name);
    if (name === null) return;
    try {
      await store.renameList(list.id, name);
    } catch (error) {
      if (!(error instanceof InvalidNameError)) throw error;
      alert(error.message);
    }
  }

  async function deleteList(list: ShoppingList): Promise<void> {
    const count = state.items.length;
    const detail = count === 0 ? '' : count === 1 ? ' et son article' : ` et ses ${count} articles`;
    if (!confirm(`Supprimer la liste « ${list.name} »${detail} ?`)) return;
    await store.deleteList(list.id);
    location.hash = '#/';
  }

  async function addItem(name: string, note: string): Promise<void> {
    const list = state.list;
    if (!list) return;
    // On vide les champs tout de suite : l'article suivant peut être tapé
    // pendant l'enregistrement sans être effacé ensuite.
    state.query = '';
    state.note = '';
    draw();
    try {
      const result = await store.addItem(list.id, name, note);
      say(
        result.status === 'added'
          ? `${result.product.label} ajouté.`
          : `${result.product.label} est déjà dans la liste.`,
      );
    } catch (error) {
      if (!(error instanceof InvalidNameError)) throw error;
      say('Tapez le nom d’un article.');
    }
    draw();
    root.querySelector<HTMLInputElement>('#item-name')?.focus();
  }

  function onAddSubmit(event: SubmitEvent): void {
    event.preventDefault();
    void addItem(state.query, state.note);
  }

  function pickSuggestion(suggestion: Suggestion<Product>): void {
    if (suggestion.inList) {
      say(`${suggestion.product.label} est déjà dans la liste.`);
      state.query = '';
      draw();
      return;
    }
    void addItem(suggestion.product.label, state.note);
  }

  async function saveNote(item: Item, value: string): Promise<void> {
    state.editingNoteOf = null;
    if (value.trim() !== item.note) await store.setItemNote(item.id, value);
    else draw();
  }

  async function removeItem(item: Item): Promise<void> {
    await store.removeItem(item.id);
    say(`${labelOf(item)} retiré.`);
  }

  async function finishShopping(list: ShoppingList): Promise<void> {
    const session = await store.finishShopping(list.id);
    if (!session) return;
    state.lastSession = session;
    say(`${articles(session.count)} ${session.count > 1 ? 'validés' : 'validé'}.`);
    draw();
  }

  async function undoLastSession(): Promise<void> {
    const session = state.lastSession;
    if (!session) return;
    state.lastSession = null;
    say('Validation annulée.');
    await store.undoSession(session.id);
  }

  function exportData(): void {
    const data = state.backupData;
    if (!data) return;
    const now = Date.now();
    const file = new File(
      [JSON.stringify(makeBackup(data, version, now), null, 2)],
      `garde-manger-${localDate(now)}.json`,
      { type: 'application/json' },
    );
    const done = () => {
      say('Sauvegarde exportée.');
      draw();
    };
    // Sur téléphone, le partage permet « Enregistrer dans Fichiers », Drive, mail…
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).then(done, (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        download(file);
        done();
      });
    } else {
      download(file);
      done();
    }
  }

  async function importData(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Remise à zéro : on peut reprendre le même fichier ensuite.
    input.value = '';
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const when = backup.exportedAt
        ? ` du ${new Date(backup.exportedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : '';
      if (!confirm(`Importer la sauvegarde${when} (${contentSummary(backup)}) ?\nRien ne sera supprimé ni écrasé.`)) {
        say('Import annulé.');
        draw();
        return;
      }
      say(importMessage(await store.importData(backup)));
    } catch (error) {
      if (!(error instanceof InvalidBackupError)) throw error;
      say(error.message);
    }
    draw();
  }

  // ---------- Vues ----------

  function view(): TemplateResult {
    if (!state.loaded) return html``;
    const route = state.route;
    const historyData = () => ({
      sessions: state.sessions,
      purchases: state.purchases,
      products: state.products,
      lists: state.lists,
      now: Date.now(),
    });
    switch (route.name) {
      case 'list':
        return state.list ? listView(state.list) : notFoundView();
      case 'history':
        return historyView(historyData(), route.tab);
      case 'product':
        return productView(historyData(), route.key);
      case 'backup':
        return state.backupData
          ? backupView({
              data: state.backupData,
              message: state.message,
              onExport: exportData,
              onImport: (input) => void importData(input),
            })
          : html``;
      case 'lists':
        return listsView();
    }
  }

  function listsView(): TemplateResult {
    return html`
      <main class="shell">
        <header class="bar">
          <h1>Mes listes</h1>
          <a class="header-link" href="#/historique">Historique</a>
        </header>
        ${state.lists.length
          ? html`<ul class="lists">
              ${state.lists.map((list) => {
                const n = state.counts.get(list.id) ?? 0;
                return html`<li>
                  <a href=${listHref(list.id)}>
                    <span class="name">${list.name}</span>
                    <span class="count">${n ? articles(n) : 'vide'}</span>
                  </a>
                </li>`;
              })}
            </ul>`
          : html`<p class="empty">Aucune liste pour l’instant.</p>`}
        <form class="row" @submit=${createList} autocomplete="off">
          <input name="name" placeholder="Nouvelle liste" aria-label="Nom de la nouvelle liste" enterkeyhint="done" />
          <button class="primary">Créer</button>
        </form>
        <footer class="version">
          <a class="header-link" href="#/sauvegarde">Sauvegarde</a>
          <span>Version ${version}</span>
        </footer>
      </main>
    `;
  }

  function notFoundView(): TemplateResult {
    return html`
      <main class="shell">
        <header class="bar"><a class="back" href="#/" aria-label="Retour aux listes">‹</a><h1>Liste introuvable</h1></header>
        <p class="empty">Cette liste n’existe plus.</p>
      </main>
    `;
  }

  function listView(list: ShoppingList): TemplateResult {
    const keysInList = new Set(state.items.map((i) => i.productKey));
    const suggestions = suggestProducts(state.query, state.products.values(), keysInList);
    // Un article coché reste à sa place (barré) : rien ne bouge sous le doigt.
    const items = [...state.items].sort((a, b) => collator.compare(labelOf(a), labelOf(b)));
    const checkedCount = items.filter((i) => i.checkedAt !== undefined).length;

    return html`
      <main class="shell">
        <header class="bar">
          <a class="back" href="#/" aria-label="Retour aux listes">‹</a>
          <h1>${list.name}</h1>
          <button class="icon" @click=${() => renameList(list)} aria-label="Renommer la liste" title="Renommer">✎</button>
          <button class="icon" @click=${() => deleteList(list)} aria-label="Supprimer la liste" title="Supprimer">🗑</button>
        </header>

        <form class="add" @submit=${onAddSubmit} autocomplete="off">
          <div class="row">
            <input
              id="item-name"
              aria-label="Article"
              placeholder="Il me manque…"
              enterkeyhint="done"
              autocapitalize="sentences"
              .value=${live(state.query)}
              @input=${(e: InputEvent) => {
                state.query = (e.target as HTMLInputElement).value;
                state.message = '';
                draw();
              }}
            />
            <button class="primary">Ajouter</button>
          </div>
          <input
            id="item-note"
            class="note-input"
            aria-label="Note"
            placeholder="Note (facultatif) : x2, bio…"
            enterkeyhint="done"
            .value=${live(state.note)}
            @input=${(e: InputEvent) => (state.note = (e.target as HTMLInputElement).value)}
          />
        </form>

        ${suggestions.length
          ? html`<ul class="suggestions" aria-label="Suggestions">
              ${suggestions.map(
                (s) => html`<li>
                  <button type="button" @click=${() => pickSuggestion(s)}>
                    ${s.product.label}
                    ${s.inList ? html`<small>déjà dans la liste</small>` : nothing}
                  </button>
                </li>`,
              )}
            </ul>`
          : nothing}

        <div class="message">
          <span role="status">${state.message}</span>
          ${state.lastSession
            ? html`<button class="link" @click=${undoLastSession}>Annuler</button>`
            : nothing}
        </div>

        ${items.length
          ? html`<ul class="items" aria-label="Articles">
              ${repeat(items, (item) => item.id, (item) => itemView(item))}
            </ul>`
          : html`<p class="empty">Rien ne manque pour l’instant.</p>`}

        ${checkedCount
          ? html`<div class="finish">
              <button class="primary big" @click=${() => finishShopping(list)}>
                Courses terminées (${checkedCount})
              </button>
            </div>`
          : nothing}
      </main>
    `;
  }

  function itemView(item: Item): TemplateResult {
    const label = labelOf(item);
    const editing = state.editingNoteOf === item.id;
    const checked = item.checkedAt !== undefined;
    const checkbox = html`<input
      type="checkbox"
      class="check"
      aria-label=${label}
      .checked=${live(checked)}
      @change=${(e: Event) => store.setItemChecked(item.id, (e.target as HTMLInputElement).checked)}
    />`;
    const text = html`<span class="label">${label}</span>
      ${!editing && item.note ? html`<span class="note">${item.note}</span>` : nothing}`;

    return html`<li class=${checked ? 'item checked' : 'item'}>
      ${editing
        ? html`${checkbox}<div class="text">${text}${noteEditor(item, label)}</div>`
        : // Toute la ligne est cliquable pour cocher : plus facile avec le panier à la main.
          html`<label class="text-wrap">${checkbox}<span class="text">${text}</span></label>`}
      <button
        class="icon"
        aria-label=${`Modifier la note de ${label}`}
        title="Note"
        @click=${() => {
          state.editingNoteOf = item.id;
          draw();
          root.querySelector<HTMLInputElement>('.note-edit')?.focus();
        }}
      >✎</button>
      <button class="icon" aria-label=${`Retirer ${label}`} title="Retirer" @click=${() => removeItem(item)}>✕</button>
    </li>`;
  }

  function noteEditor(item: Item, label: string): TemplateResult {
    return html`<input
      class="note-edit"
      aria-label=${`Note pour ${label}`}
      .value=${item.note}
      enterkeyhint="done"
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          state.editingNoteOf = null;
          draw();
        }
      }}
      @blur=${(e: FocusEvent) => saveNote(item, (e.target as HTMLInputElement).value)}
    />`;
  }

  // ---------- Branchements ----------

  const onHashChange = () => {
    state.route = parseRoute(location.hash);
    state.query = '';
    state.note = '';
    state.message = '';
    state.editingNoteOf = null;
    state.lastSession = null;
    void load();
  };
  window.addEventListener('hashchange', onHashChange);
  const unsubscribe = store.subscribe(() => void load());
  void load();

  return () => {
    window.removeEventListener('hashchange', onHashChange);
    unsubscribe();
  };
}
