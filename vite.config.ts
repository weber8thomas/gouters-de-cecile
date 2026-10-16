import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Les SVG du design system sont des fichiers autonomes (exportables) importés comme texte,
// pour être insérés en ligne et partager le même viewBox que le masque vidéo.
const svgRaw = (): Plugin => ({
  name: 'svg-raw',
  enforce: 'pre',
  load(id) {
    if (!id.endsWith('.svg')) return null;
    return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
  },
});

export default defineConfig({
  base: './',
  plugins: [svgRaw(), react({ jsxRuntime: 'classic' })],
  build: { outDir: 'dist/site', assetsInlineLimit: 0 },
  server: { host: true },
});
