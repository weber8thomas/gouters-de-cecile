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

// Version du site (date de build) : écrite dans version.json et compilée dans l'application, qui se
// recharge d'elle-même quand une version plus récente est en ligne (GitHub Pages garde la page 10 min).
const VERSION = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const version = (): Plugin => ({
  name: 'gc-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) + '\n' });
  },
});

export default defineConfig({
  base: './',
  define: { __GC_VERSION__: JSON.stringify(VERSION) },
  plugins: [svgRaw(), react({ jsxRuntime: 'classic' }), version()],
  build: { outDir: 'dist/site', assetsInlineLimit: 0 },
  server: { host: true },
});
