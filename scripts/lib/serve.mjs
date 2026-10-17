// Petit serveur statique (évite les restrictions de file://).
//
//   serve()                      → la racine du dépôt (bancs d'essai harness/*, bundles dist/ds-*)
//   serve(dossier, { site })     → un site construit (vite build : dist/site ou un dossier temporaire)
//   serveSite(dossier, options)  → raccourci du mode « site »
//
// Règles communes :
//   - types MIME connus (images, polices, vidéo mp4/webm, audio…), « cache-control: no-store » ;
//   - Range (RFC 9110) : « Accept-Ranges: bytes » partout ; un seul intervalle → 206 + Content-Range
//     (bytes=a-b, bytes=a-, bytes=-n) ; intervalle impossible → 416 ; plusieurs intervalles → 200
//     complet (permis : le serveur peut ignorer Range) ; HEAD → en-têtes seuls ;
//   - /_blob/<id> : comme dans l'artifact, un asset téléversé (design-system/assets.lock.json : sha → id) ;
//   - jamais hors de la racine (../ refusé) ; dossier → index.html.
// Mode site : `base` monte le site sous un préfixe (GitHub Pages : « /gouters-de-cecile/ ») ; une
// requête hors du préfixe ou introuvable → 404 (404.html du site s'il existe).
// Journal : srv.journal reçoit { methode, chemin, statut, range, octets, type } pour chaque requête
// (les vérifications y comptent les 206 et les 404).
//
// En ligne de commande :
//   node scripts/lib/serve.mjs [dossier] [--port 8080] [--base /gouters-de-cecile/] [--host 0.0.0.0]
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.map': 'application/json',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.vtt': 'text/vtt; charset=utf-8',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.weba': 'audio/webm',
};
export const typeDe = (fichier) => TYPES[extname(fichier).toLowerCase()] ?? 'application/octet-stream';

/**
 * Intervalle demandé par un en-tête Range pour un fichier de `taille` octets.
 * → null (pas de Range, ou plusieurs intervalles, ou unité inconnue : réponse complète),
 *   { start, end } (bornes incluses), ou 'impossible' (416).
 */
export function intervalle(range, taille) {
  if (!range) return null;
  const m = /^\s*bytes\s*=\s*(.+)$/i.exec(range);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 1) return null;
  const r = /^(\d*)\s*-\s*(\d*)$/.exec(parts[0]);
  if (!r || (r[1] === '' && r[2] === '')) return 'impossible';
  let start;
  let end;
  if (r[1] === '') {
    const n = Number(r[2]);
    if (n === 0) return 'impossible';
    start = Math.max(0, taille - n);
    end = taille - 1;
  } else {
    start = Number(r[1]);
    end = r[2] === '' ? taille - 1 : Math.min(Number(r[2]), taille - 1);
  }
  if (start >= taille || end < start) return 'impossible';
  return { start, end };
}

/** Fichier d'un asset téléversé /_blob/<id> (racine du dépôt), null sinon. */
async function fichierBlob(root, id) {
  const lock = JSON.parse(await readFile(join(root, 'design-system/assets.lock.json'), 'utf8'));
  const assets = JSON.parse(await readFile(join(root, 'design-system/assets.json'), 'utf8'));
  const sha = Object.keys(lock).find((k) => lock[k] === id);
  const a = Object.values(assets).find((x) => x.sha === sha);
  return a ? join(root, 'design-system', a.file) : null;
}

/**
 * @param {string} [root] dossier servi (défaut : la racine du dépôt)
 * @param {{ site?: boolean, base?: string, port?: number, host?: string, journal?: boolean }} [options]
 */
export async function serve(root = ROOT, { site = false, base = '/', port = 0, host = '127.0.0.1', journal = true } = {}) {
  const racine = resolve(root);
  const prefixe = `/${String(base).replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
  const registre = [];
  const noter = (e) => { if (journal) registre.push({ t: Date.now(), ...e }); };

  const server = createServer(async (req, res) => {
    const methode = req.method ?? 'GET';
    let chemin = '';
    const echec = async (statut, texte) => {
      const page404 = site && statut === 404 ? join(racine, '404.html') : null;
      let corps = texte;
      let type = 'text/plain; charset=utf-8';
      if (page404) {
        try { corps = await readFile(page404); type = TYPES['.html']; } catch { /* pas de 404.html */ }
      }
      res.writeHead(statut, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(methode === 'HEAD' ? undefined : corps);
      noter({ methode, chemin, statut, range: req.headers.range ?? null, octets: 0, type: null });
    };
    try {
      if (methode !== 'GET' && methode !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' });
        res.end();
        noter({ methode, chemin: req.url, statut: 405, range: null, octets: 0, type: null });
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      } catch {
        return echec(400, 'requête invalide');
      }
      chemin = pathname;
      if (prefixe !== '/') {
        if (pathname === prefixe.slice(0, -1)) { // « /base » → « /base/ »
          res.writeHead(301, { location: prefixe });
          res.end();
          noter({ methode, chemin, statut: 301, range: null, octets: 0, type: null });
          return;
        }
        if (!pathname.startsWith(prefixe)) return echec(404, 'hors du site');
        pathname = '/' + pathname.slice(prefixe.length);
      }
      const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      let file = join(racine, rel);
      if (file !== racine && !file.startsWith(racine + sep)) return echec(403, 'interdit');
      const blob = /^\/_blob\/([^/]+)$/.exec(rel.split(sep).join('/'));
      if (blob) {
        const f = await fichierBlob(racine, blob[1]).catch(() => null);
        if (!f) return echec(404, 'blob inconnu');
        file = f;
      }
      let st = await stat(file).catch(() => null);
      if (st?.isDirectory()) {
        file = join(file, 'index.html');
        st = await stat(file).catch(() => null);
      }
      if (!st || !st.isFile()) return echec(404, 'introuvable');

      const type = typeDe(file);
      const taille = st.size;
      const entetes = {
        'content-type': type,
        'cache-control': 'no-store',
        'accept-ranges': 'bytes',
        'last-modified': st.mtime.toUTCString(),
      };
      const iv = intervalle(req.headers.range, taille);
      if (iv === 'impossible') {
        res.writeHead(416, { ...entetes, 'content-range': `bytes */${taille}`, 'content-length': 0 });
        res.end();
        noter({ methode, chemin, statut: 416, range: req.headers.range, octets: 0, type });
        return;
      }
      const statut = iv ? 206 : 200;
      const start = iv ? iv.start : 0;
      const end = iv ? iv.end : taille - 1;
      const longueur = taille === 0 ? 0 : end - start + 1;
      if (iv) entetes['content-range'] = `bytes ${start}-${end}/${taille}`;
      entetes['content-length'] = longueur;
      res.writeHead(statut, entetes);
      noter({ methode, chemin, statut, range: req.headers.range ?? null, octets: methode === 'HEAD' ? 0 : longueur, type });
      if (methode === 'HEAD' || longueur === 0) { res.end(); return; }
      const flux = createReadStream(file, { start, end });
      flux.on('error', () => res.destroy());
      res.on('close', () => flux.destroy()); // le navigateur coupe souvent une vidéo en cours de route
      flux.pipe(res);
    } catch {
      if (!res.headersSent) await echec(404, 'introuvable');
      else res.destroy();
    }
  });
  await new Promise((r) => server.listen(port, host, r));
  const { port: p } = server.address();
  const hote = host === '0.0.0.0' ? '127.0.0.1' : host;
  const url = `http://${hote}:${p}${prefixe === '/' ? '' : prefixe.slice(0, -1)}`;
  return {
    url,
    port: p,
    root: racine,
    base: prefixe,
    journal: registre,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}

/** Un site construit (dist/site par défaut), mêmes règles, avec 404.html s'il existe. */
export const serveSite = (dossier = join(ROOT, 'dist/site'), options = {}) => serve(dossier, { site: true, ...options });

// ---- Ligne de commande -------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const valeurs = new Set(['--port', '--base', '--host'].flatMap((k) => { const i = args.indexOf(k); return i >= 0 ? [i, i + 1] : []; }));
  const dossier = args.find((a, i) => !a.startsWith('--') && !valeurs.has(i));
  const srv = await serve(dossier ? resolve(dossier) : ROOT, {
    site: !!dossier,
    base: opt('base', '/'),
    port: Number(opt('port', 0)),
    host: opt('host', '127.0.0.1'),
    journal: false,
  });
  console.log(`${dossier ? 'site' : 'dépôt'} ${srv.root} → ${srv.url}/  (Ctrl+C pour arrêter)`);
}
