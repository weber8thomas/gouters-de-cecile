// Accès aux tokens depuis les générateurs Node : les SVG exportés portent des couleurs
// littérales, toujours tirées de design-system/tokens.json (une seule source).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveColor } from './color.mjs';

const file = join(dirname(fileURLToPath(import.meta.url)), '../../design-system/tokens.json');
export const tokens = JSON.parse(readFileSync(file, 'utf8'));
const first = tokens.color.themes[0].id;
const byName = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, typeof t.value === 'string' ? t.value : t.value[first]]));

// c('gc-ink') → '#3a2216' ; c('gc-sage-500', 0.5) → 'rgba(141, 162, 133, 0.5)'
export function c(name, alpha) {
  const v = resolveColor(byName, name.startsWith('gc-') ? name : `gc-${name}`);
  if (alpha == null || !v.startsWith('#')) return v;
  const h = v.replace('#', '');
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${alpha})`;
}
export const colorNames = Object.keys(byName);
