import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Génère les icônes PNG (Android, iPhone, favicon) à partir du logo SVG : npm run icons
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/logo.svg'],
});
