import { registerSW } from 'virtual:pwa-register';
import { renderApp } from './app';
import './style.css';

renderApp(document.querySelector<HTMLElement>('#app')!, __APP_VERSION__);

// Met l'appli à jour automatiquement quand une nouvelle version est publiée.
registerSW({ immediate: true });
