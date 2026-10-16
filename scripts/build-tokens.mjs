// Compile design-system/tokens.json en design-system/tokens.css, avec la même
// structure que le CSS généré par la page Design System (« tokens.css as compiled »),
// puis vérifie les paires de contraste déclarées ci-dessous.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { contrast, resolveColor } from './lib/color.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ds = join(root, 'design-system');
const tokens = JSON.parse(readFileSync(join(ds, 'tokens.json'), 'utf8'));
const TITLE = tokens.name;

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const seen = new Set();
const errors = [];
function checkName(n) {
  if (!NAME.test(n)) errors.push(`nom invalide : ${n}`);
  if (seen.has(n)) errors.push(`nom en double : ${n}`);
  seen.add(n);
}

const themes = tokens.color.themes;
const first = themes[0].id;
const val = (t, theme) => (typeof t.value === 'string' ? t.value : t.value[theme] ?? t.value[first]);
const cssValue = (v) => (/^\{.+\}$/.test(v) ? `var(--${v.slice(1, -1)})` : v);

const lines = [`/* ${TITLE} — generated from tokens.json */`];

// Couleurs et ombres, par thème
const colorDecl = (theme) => [
  ...tokens.color.tokens.map((t) => { checkName(t.name); return `  --${t.name}: ${cssValue(val(t, theme))};`; }),
  ...(tokens.shadow?.tokens ?? []).map((t) => { if (theme === first) checkName(t.name); return `  --${t.name}: ${val(t, theme)};`; }),
];
lines.push(`:root, [data-theme="${first}"] {`, ...colorDecl(first), '}');
for (const th of themes.slice(1)) lines.push(`[data-theme="${th.id}"] {`, ...colorDecl(th.id), '}');

// Autres familles (espacements, rayons, familles libres) + polices
const SKIP = new Set(['name', 'version', 'color', 'type', 'shadow', 'meta']);
const rootDecl = [];
for (const [key, fam] of Object.entries(tokens)) {
  if (SKIP.has(key) || !fam || !Array.isArray(fam.tokens)) continue;
  for (const t of fam.tokens) { checkName(t.name); rootDecl.push(`  --${t.name}: ${t.value};`); }
}
for (const [key, stack] of Object.entries(tokens.type.families)) rootDecl.push(`  --font-${key}: ${stack};`);
lines.push(':root {', ...rootDecl, '}');

// Une classe par style typographique
const px = (v) => (typeof v === 'number' ? `${v}px` : v);
const styleNames = new Set();
for (const g of tokens.type.groups) {
  for (const s of g.styles) {
    if (!NAME.test(s.name) || styleNames.has(s.name)) errors.push(`style invalide ou en double : ${s.name}`);
    styleNames.add(s.name);
    const decl = [`font-family: var(--font-${s.family ?? g.family})`, `font-size: ${px(s.fontSize)}`];
    if (s.lineHeight != null) decl.push(`line-height: ${s.lineHeight}`);
    if (s.fontWeight != null) decl.push(`font-weight: ${s.fontWeight}`);
    if (s.fontStyle) decl.push(`font-style: ${s.fontStyle}`);
    if (s.letterSpacing != null) decl.push(`letter-spacing: ${px(s.letterSpacing)}`);
    lines.push(`.${s.name} { ${decl.join('; ')}; }`);
  }
}

// @font-face
for (const f of tokens.type.fonts) {
  const file = f.file.includes('/') ? f.file : `fonts/${f.file}`;
  lines.push(`@font-face { font-family: "${f.family}"; src: url("${file}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style ?? 'normal'}; font-display: block; }`);
}

writeFileSync(join(ds, 'tokens.css'), lines.join('\n') + '\n');

// Paires de contraste promises dans les notes d'usage (thème carnet)
const byName = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, val(t, first)]));
const hex = (n) => resolveColor(byName, n);
const PAIRS = [
  // [texte, fond, minimum]
  ['gc-ink', 'gc-paper', 7], ['gc-ink', 'gc-paper-lace', 7], ['gc-ink', 'gc-linen', 7], ['gc-ink', 'gc-paper-edge', 7],
  ['gc-chocolate', 'gc-paper', 7], ['gc-chocolate', 'gc-paper-lace', 7],
  ['gc-ink-night', 'gc-paper', 7], ['gc-ink-night', 'gc-paper-lace', 7],
  ['gc-ink-title', 'gc-paper', 4.5], ['gc-ink-title', 'gc-linen', 4.5],
  ['gc-terracotta-700', 'gc-paper', 4.5], ['gc-pink-700', 'gc-paper', 4.5], ['gc-sage-700', 'gc-paper', 4.5],
  ['gc-paper', 'gc-wood-2', 3], ['gc-paper', 'gc-wood-3', 3], ['gc-ink', 'gc-linen-shade', 4.5],
];
const report = PAIRS.map(([fg, bg, min]) => {
  const r = contrast(hex(fg), hex(bg));
  if (r < min) errors.push(`contraste ${fg} sur ${bg} = ${r.toFixed(2)} < ${min}`);
  return `${fg.padEnd(18)} sur ${bg.padEnd(16)} ${r.toFixed(2)}:1 (min ${min})`;
});
if (process.argv.includes('--report')) console.log(report.join('\n'));

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`tokens.css : ${tokens.color.tokens.length} couleurs, ${styleNames.size} styles, ${tokens.type.fonts.length} polices`);
