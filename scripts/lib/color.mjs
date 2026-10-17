// Outils couleur : résolution des alias de tokens et contraste WCAG 2.
export function parseColor(str) {
  const s = str.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  throw new Error(`couleur non lue : ${str}`);
}

export function resolveColor(byName, name, depth = 0) {
  const v = byName[name];
  if (v == null) throw new Error(`token inconnu : ${name}`);
  if (depth > 16) throw new Error(`alias trop profond : ${name}`);
  const m = /^\{(.+)\}$/.exec(v);
  return m ? resolveColor(byName, m[1], depth + 1) : v;
}

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function luminance(color) {
  const { r, g, b } = typeof color === 'string' ? parseColor(color) : color;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
