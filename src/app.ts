export function renderApp(root: HTMLElement, version: string): void {
  root.innerHTML = `
    <main class="shell">
      <h1>Le Garde-Manger</h1>
      <p>Bientôt : vos listes de courses.</p>
      <p class="version">Version ${version}</p>
    </main>
  `;
}
