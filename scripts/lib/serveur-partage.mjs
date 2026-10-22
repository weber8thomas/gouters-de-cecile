// Serveur statique de dist/partage qui imite Cloudflare Pages : fichiers tels quels (pas de réécriture de chemin),
// en-têtes de _headers, 404.html pour un fichier inconnu (pas de repli sur index.html).
//
//   npm run preview:partage            http://localhost:4173
//   import { servirPartage } from './lib/serveur-partage.mjs'
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, typeDe } from './serve.mjs';

/** _headers → [{ motif: RegExp, entetes: {nom: valeur} }] (format Cloudflare : « /chemin » puis lignes indentées). */
export function lireEntetes(texte) {
  const regles = [];
  for (const ligne of texte.split('\n')) {
    if (!ligne.trim() || ligne.trim().startsWith('#')) continue;
    if (!/^\s/.test(ligne)) {
      const motif = new RegExp(`^${ligne.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      regles.push({ motif, entetes: {} });
    } else {
      const i = ligne.indexOf(':');
      regles.at(-1).entetes[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
    }
  }
  return regles;
}

export async function servirPartage(dossier = join(ROOT, 'dist/partage'), { port = 0, host = '127.0.0.1' } = {}) {
  const racine = resolve(dossier);
  const regles = existsSync(join(racine, '_headers')) ? lireEntetes(readFileSync(join(racine, '_headers'), 'utf8')) : [];
  const journal = [];
  const server = createServer((req, res) => {
    let chemin = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const entetes = {};
    for (const r of regles) if (r.motif.test(chemin)) Object.assign(entetes, r.entetes);
    let fichier = join(racine, normalize(chemin === '/' ? '/index.html' : chemin));
    let statut = 200;
    if (!fichier.startsWith(racine + sep) || !existsSync(fichier) || !statSync(fichier).isFile() || ['_headers'].includes(chemin.slice(1))) {
      fichier = join(racine, '404.html');
      statut = 404;
    }
    const corps = readFileSync(fichier);
    res.writeHead(statut, { 'Content-Type': typeDe(fichier), 'Content-Length': corps.length, ...entetes });
    res.end(req.method === 'HEAD' ? undefined : corps);
    journal.push({ chemin, statut });
  });
  await new Promise((ok) => server.listen(port, host, ok));
  const { port: p } = server.address();
  return { url: `http://${host}:${p}`, journal, close: () => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const s = await servirPartage(join(ROOT, 'dist/partage'), { port: Number(process.env.PORT ?? 4173), host: process.argv.includes('--host') ? '0.0.0.0' : '127.0.0.1' });
  console.log(`dist/partage → ${s.url}/  (Ctrl+C pour arrêter)`);
}
