// Outils communs de la mesure de coût GPU / CPU (verification/perf/). Voir mesurer.mjs pour la commande.
//
// - lancerChrome : un VRAI Chrome (avec GPU), profil temporaire, fenêtre visible, anti-ralentissement des fenêtres
//   cachées. On s'y branche par CDP via playwright-core (déjà dans node_modules ; pas de Chromium Playwright requis).
// - cpuProcessus : SystemInfo.getProcessInfo (temps CPU cumulé, haute résolution, par processus ET par type :
//   browser / gpu / renderer) : plus fiable que `ps`, qui ne donne que la moyenne depuis le démarrage du processus.
// - SONDE : script injecté avant l'app (addInitScript). Il enveloppe requestAnimationFrame (qui l'a demandé, combien de
//   fois par seconde, combien de ms de JS), HTMLCanvasElement.getContext et les appels de dessin WebGL (par canvas),
//   et expose des interrupteurs (window.__gc) pour couper UN suspect à la fois.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'package.json'));
export const { chromium } = require('playwright-core');

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function cheminChrome() {
  if (process.env.GC_CHROME) return process.env.GC_CHROME;
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

/** Lance Chrome (GPU activé) et renvoie { browser, proc, fermer, dir }. */
export async function lancerChrome({ largeur = 1366, hauteur = 1024, port = 19000 + Math.floor(Math.random() * 900) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gc-perf-chrome-'));
  const args = [
    `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    // une fenêtre cachée par une autre ne doit pas être ralentie : on veut les vraies cadences
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion,Translate',
    `--window-size=${largeur},${hauteur + 120}`, '--window-position=40,40',
    ...(process.env.GC_CHROME_ARGS ? process.env.GC_CHROME_ARGS.split(' ') : []),
    'about:blank',
  ];
  const proc = spawn(cheminChrome(), args, { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 60 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await dormir(500); }
  }
  if (!browser) { proc.kill(); throw new Error('Chrome ne répond pas sur le port ' + port); }
  const fermer = async () => {
    try { await browser.close(); } catch { /* déjà fermé */ }
    proc.kill('SIGKILL');
    await dormir(300);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignoré */ }
  };
  return { browser, proc, fermer, dir };
}

/** Page à la taille de contenu voulue (la fenêtre a des barres : on corrige l'écart). */
export async function pagePrete(browser, largeur, hauteur) {
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const cdp = await ctx.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
  const [iw, ih] = await page.evaluate(() => [innerWidth, innerHeight]);
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 40, top: 40, width: bounds.width + (largeur - iw), height: bounds.height + (hauteur - ih) } });
  await dormir(400);
  return page;
}

/** Temps CPU cumulé (s) par processus du Chrome piloté : Map id → { type, cpu }. */
export async function cpuProcessus(sessionBrowser) {
  const { processInfo } = await sessionBrowser.send('SystemInfo.getProcessInfo');
  const out = new Map();
  for (const p of processInfo) out.set(p.id, { type: p.type, cpu: p.cpuTime });
  return out;
}

/** Utilisation GPU du système (%), lue dans ioreg (sans sudo) ; null si indisponible. Globale à la machine. */
export function utilisationGpuSysteme() {
  try {
    const s = execFileSync('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { encoding: 'utf8', timeout: 3000 });
    const m = /"Device Utilization %"\s*=\s*(\d+)/.exec(s);
    const r = /"Renderer Utilization %"\s*=\s*(\d+)/.exec(s);
    return m ? { device: Number(m[1]), renderer: r ? Number(r[1]) : null } : null;
  } catch { return null; }
}

/** Charge moyenne de la machine (`top -l 1`). */
export function etatMachine() {
  try {
    const s = execFileSync('top', ['-l', '1', '-n', '0'], { encoding: 'utf8', timeout: 8000 });
    const load = /Load Avg: ([\d., ]+)/.exec(s)?.[1];
    const cpu = /CPU usage: (.*)/.exec(s)?.[1];
    return { load, cpu };
  } catch { return {}; }
}

/**
 * Sonde injectée avant l'app. Lecture : window.__gc.instantane() ; remise à zéro : window.__gc.zero().
 * Interrupteurs : window.__gc.bloquerRaf = Set de clés « ligne:colonne » de rAF à ignorer ;
 * window.__gc.bloquerGl = Set d'identifiants de canvas (ordre de création, à partir de 1) dont les dessins sont ignorés.
 */
export const SONDE = `(() => {
  if (window.__gc) return;
  const g = window.__gc = { raf: {}, gl: {}, bloquerRaf: new Set(), bloquerGl: new Set(), canvas: [], total: { rappels: 0, ms: 0 }, t0: performance.now() };
  const clef = () => {
    const l = (new Error().stack || '').split('\\n');
    for (let i = 1; i < l.length; i++) {
      if (l[i].includes('__gcwrap') || l[i].includes('<anonymous>')) continue;
      const m = /(?:at\\s+)?([\\w$.<>]*)\\s*\\(?(https?:[^\\s)]+):(\\d+):(\\d+)\\)?$/.exec(l[i].trim());
      if (m) return m[3] + ':' + m[4] + ' ' + (m[1] || '');
      return l[i].trim();
    }
    return '?';
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function __gcwrap(cb) {
    const k = clef();
    const kk = k.split(' ')[0];
    if (g.bloquerRaf.has(kk)) return 1e9 + Math.floor(Math.random() * 1e6);
    const e = g.raf[kk] || (g.raf[kk] = { n: 0, ms: 0, nom: k.split(' ').slice(1).join(' ') });
    return raf((t) => { const a = performance.now(); try { cb(t); } finally { const d = performance.now() - a; e.n++; e.ms += d; g.total.rappels++; g.total.ms += d; } });
  };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...r) {
    const c = gc.call(this, type, ...r);
    if (c && !this.__gcid) {
      this.__gcid = g.canvas.length + 1;
      g.canvas.push(this);
      g.gl[this.__gcid] = { type, dessins: 0, pixels: 0 };
    }
    return c;
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const nom of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const f = C.prototype[nom]; if (!f) continue;
      C.prototype[nom] = function (...a) {
        const id = this.canvas && this.canvas.__gcid;
        if (id && g.bloquerGl.has(id)) return;
        if (id) { const s = g.gl[id]; s.dessins++; s.pixels += this.drawingBufferWidth * this.drawingBufferHeight; }
        return f.apply(this, a);
      };
    }
  }
  g.videos = new Set();
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { if (this.tagName === 'VIDEO') g.videos.add(this); return play.apply(this, a); };
  g.zero = () => { g.raf = {}; for (const k in g.gl) { g.gl[k].dessins = 0; g.gl[k].pixels = 0; } g.total = { rappels: 0, ms: 0 }; g.t0 = performance.now(); };
  const chemin = (el) => { const p = []; for (let e = el; e && e.nodeType === 1 && p.length < 6; e = e.parentElement) p.push(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')); return p.join(' < '); };
  g.instantane = () => ({
    duree: (performance.now() - g.t0) / 1000,
    raf: g.raf, total: g.total,
    videos: [...g.videos].map((v) => ({ src: (v.currentSrc || v.src || '').split('/').pop(), paused: v.paused, loop: v.loop, w: v.videoWidth, h: v.videoHeight, t: +v.currentTime.toFixed(2), attachee: v.isConnected })),
    canvas: g.canvas.map((c, i) => {
      const r = c.getBoundingClientRect();
      return { id: i + 1, w: c.width, h: c.height, css: [Math.round(r.width), Math.round(r.height)], visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight, connecte: c.isConnected, chemin: chemin(c), ...g.gl[i + 1] };
    }),
  });
})();`;

/** Correspondance « ligne:colonne du bundle » → « src/fichier.ts:ligne » via la carte de sources du bundle non minifié. */
export function chargerCarte(dossierBundle) {
  const { TraceMap, originalPositionFor } = require('@jridgewell/trace-mapping');
  const assets = join(dossierBundle, 'assets');
  const map = readdirSync(assets).find((f) => f.endsWith('.js.map'));
  if (!map) return () => null;
  const tm = new TraceMap(JSON.parse(readFileSync(join(assets, map), 'utf8')));
  return (clef) => {
    const [l, c] = clef.split(':').map(Number);
    if (!(l > 0)) return null;
    const o = originalPositionFor(tm, { line: l, column: c - 1 });
    return o.source ? `${o.source.replace(/^(\.\.\/)+/, '')}:${o.line}` : null;
  };
}

/**
 * Processus étrangers lourds (python / ffmpeg / torch…) : d'autres agents calculent parfois sur la même machine
 * (profondeur torch MPS, encodages) et prennent le GPU. Deuxième échantillon de `top` (le premier est cumulé).
 */
export function processusLourds(seuil = 15) {
  try {
    const s = execFileSync('top', ['-l', '2', '-s', '1', '-n', '25', '-o', 'cpu', '-stats', 'pid,command,cpu'], { encoding: 'utf8', timeout: 15000 });
    const bloc = s.split(/^PID\s+COMMAND\s+%CPU/m).pop() ?? '';
    const out = [];
    for (const l of bloc.split('\n')) {
      const m = /^\s*(\d+)\s+(.+?)\s+([\d.]+)\s*$/.exec(l);
      if (m && Number(m[3]) >= seuil && /python|ffmpeg|torch|ffprobe|Python/i.test(m[2])) out.push({ pid: +m[1], cmd: m[2].trim(), cpu: +m[3] });
    }
    return out;
  } catch { return []; }
}

/** Attend que plus aucun python/ffmpeg lourd ne tourne (3 contrôles calmes d'affilée). Renvoie le temps attendu (s). */
export async function attendreCalme({ maxS = 900, log = console.log } = {}) {
  const t0 = Date.now();
  let calmes = 0;
  while (calmes < 3) {
    const l = processusLourds();
    if (l.length) { calmes = 0; log(`  … attente : ${l.map((p) => `${p.cmd} ${p.cpu}%`).join(', ')}`); } else calmes++;
    if ((Date.now() - t0) / 1000 > maxS) { log('  ! machine jamais calme : mesure possiblement faussée'); break; }
    if (calmes < 3) await dormir(l.length ? 10000 : 1000);
  }
  return Math.round((Date.now() - t0) / 1000);
}
