import { describe, expect, it } from 'vitest';
import { renderApp } from './app';

describe('renderApp', () => {
  it("affiche le titre et la version de l'appli", () => {
    const root = document.createElement('div');
    renderApp(root, '1.2.3');
    expect(root.querySelector('h1')?.textContent).toBe('Le Garde-Manger');
    expect(root.textContent).toContain('Version 1.2.3');
  });
});
