import { html, type TemplateResult } from 'lit-html';
import type { BackupData, ImportReport } from '../domain/backup';

export function countOf(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

/** « 2 listes, 3 articles, 1 séance » */
export function contentSummary(data: Pick<BackupData, 'lists' | 'items' | 'sessions'>): string {
  return [
    countOf(data.lists.length, 'liste'),
    countOf(data.items.length, 'article'),
    countOf(data.sessions.length, 'séance'),
  ].join(', ');
}

export function importMessage(report: ImportReport): string {
  const parts = [
    report.lists ? countOf(report.lists, 'liste') : '',
    report.items ? countOf(report.items, 'article') : '',
    report.sessions ? countOf(report.sessions, 'séance') : '',
  ].filter(Boolean);
  return parts.length
    ? `Import terminé. Ajouté : ${parts.join(', ')}.`
    : 'Rien à ajouter : ces données sont déjà là.';
}

export interface BackupViewProps {
  data: BackupData;
  message: string;
  onExport: () => void;
  onImport: (input: HTMLInputElement) => void;
}

export function backupView({ data, message, onExport, onImport }: BackupViewProps): TemplateResult {
  return html`<main class="shell">
    <header class="bar">
      <a class="back" href="#/" aria-label="Retour aux listes">‹</a>
      <h1>Sauvegarde</h1>
    </header>

    <p class="summary">
      Vos données restent sur ce téléphone. Exportez-les dans un fichier pour les mettre à l’abri
      ou les copier sur un autre téléphone.
    </p>
    <p class="muted">Sur ce téléphone : ${contentSummary(data)}.</p>

    <div class="actions">
      <button class="primary big" @click=${onExport}>Exporter mes données</button>
      <label class="file-button big">
        Importer une sauvegarde
        <input
          type="file"
          accept=".json,application/json"
          class="visually-hidden"
          @change=${(e: Event) => onImport(e.target as HTMLInputElement)}
        />
      </label>
      <p class="muted">L’import ajoute ce qui manque, sans rien supprimer ni écraser.</p>
    </div>

    <p class="message" role="status">${message}</p>
  </main>`;
}
