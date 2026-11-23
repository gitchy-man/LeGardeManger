import { registerSW } from 'virtual:pwa-register';
import { openIdbStore } from './data/idb-store';
import { startApp } from './ui/app';
import './style.css';

// Met l'appli à jour automatiquement quand une nouvelle version est publiée.
registerSW({ immediate: true });

// Demande au navigateur de ne pas effacer les données en cas de manque de place.
void navigator.storage?.persist?.();

const store = await openIdbStore();
startApp(document.querySelector<HTMLElement>('#app')!, store, __APP_VERSION__);
