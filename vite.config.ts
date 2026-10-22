import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { BAKED_LOCAL, DOSSIER_PUBLIE, ROOT, tousLesFichiers } from './scripts/lib/prive.mjs';

// Version LOCALE (npm run build:local, GC_LOCAL=1) : les vraies photos et vidéos de prive/baked (jamais publiées)
// se superposent aux placeholders, et le site va dans dist/local. Sans GC_LOCAL=1, rien de prive/ n'entre dans le build.
const LOCAL = process.env.GC_LOCAL === '1';

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

// Contenu local : src/content/videos.json et photos-cecile.json sont complétés par ceux de prive/baked (cuits par
// scripts/medias-local.mjs), et les médias cuits sont copiés dans dist/local/prive-baked/. Un invité ou un emplacement
// sans média local garde son placeholder. Les images sont adressées par gen-entry (GC_LOCAL=1) sous « local/… ».
const lireJson = (f: string, defaut: unknown) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : defaut);
const contenuLocal = (): Plugin => ({
  name: 'gc-contenu-local',
  enforce: 'pre',
  resolveId(source) {
    const m = /(^|\/)content\/(videos|photos-cecile)\.json$/.exec(source);
    return m ? `\0gc-local:${m[2]}` : null;
  },
  load(id) {
    if (id === '\0gc-local:videos') {
      const base = lireJson(join(ROOT, 'src/content/videos.json'), {}) as Record<string, unknown>;
      const local = lireJson(join(BAKED_LOCAL, 'videos.json'), {}) as Record<string, unknown>;
      return `export default ${JSON.stringify({ ...base, ...local })};`;
    }
    if (id === '\0gc-local:photos-cecile') {
      // Par emplacement (cecile-N) : l'entrée locale remplace celle du placeholder ; les autres restent.
      const n = (e: { id: string }) => Number(e.id.replace(/\D/g, ''));
      const base = lireJson(join(ROOT, 'src/content/photos-cecile.json'), []) as { id: string }[];
      const local = lireJson(join(BAKED_LOCAL, 'photos-cecile.json'), []) as { id: string }[];
      const parId = new Map([...base, ...local].map((e) => [e.id, e]));
      return `export default ${JSON.stringify([...parId.values()].sort((a, b) => n(a) - n(b)))};`;
    }
    return null;
  },
  generateBundle() {
    for (const sous of ['videos', 'photos']) {
      for (const f of tousLesFichiers(join(BAKED_LOCAL, sous))) {
        this.emitFile({ type: 'asset', fileName: `${DOSSIER_PUBLIE}/${relative(BAKED_LOCAL, f).split('\\').join('/')}`, source: readFileSync(f) });
      }
    }
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
  plugins: [svgRaw(), react({ jsxRuntime: 'classic' }), version(), ...(LOCAL ? [contenuLocal()] : [])],
  build: { outDir: LOCAL ? 'dist/local' : 'dist/site', assetsInlineLimit: 0 },
  server: { host: true },
});
