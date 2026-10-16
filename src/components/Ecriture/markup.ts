// Balisage des textes écrits à la main (CONTRACT § 9) :
//   ~~150 g~~>120 g   rature dessinée, correction écrite au-dessus (en rouge)
//   ~~un mot~~        rature sans correction
//   ~~beurre~~>{huile d'olive}   correction de plusieurs mots : entre accolades
//   __mot__           souligné à la main (plusieurs mots possibles : __à ne pas oublier__)
//
// Étendue de la correction sans accolades : autant de mots que le texte raturé (séparés par
// des espaces ordinaires ; « 120 g » passé par frTypo est un seul mot grâce à l'insécable),
// sans la ponctuation finale, qui reste dans le texte.

export type Segment =
  | { kind: 'texte'; text: string }
  | { kind: 'souligne'; text: string }
  | { kind: 'rature'; text: string; correction?: string };

const TOKEN = /~~(.+?)~~|__(.+?)__/g;
const TRAILING = /[\s  ]*[.,;:!?…)»]+$/;

/** Lit la correction qui suit « ~~…~~> » ; renvoie le texte et la longueur consommée. */
function readCorrection(rest: string, words: number): { correction: string; used: number } | null {
  if (rest.startsWith('{')) {
    const end = rest.indexOf('}');
    if (end > 1) return { correction: rest.slice(1, end).trim(), used: end + 1 };
    return null;
  }
  // n mots séparés par des espaces ordinaires (l'insécable ne coupe pas)
  const re = /^[^ \n]+/;
  let used = 0;
  const parts: string[] = [];
  for (let i = 0; i < words; i++) {
    if (i > 0) {
      const sp = /^ +/.exec(rest.slice(used));
      if (!sp) break;
      used += sp[0].length;
    }
    const m = re.exec(rest.slice(used));
    if (!m) break;
    parts.push(m[0]);
    used += m[0].length;
  }
  if (!parts.length) return null;
  let correction = parts.join(' ');
  const punct = TRAILING.exec(correction);
  if (punct && punct[0].length < correction.length) {
    correction = correction.slice(0, -punct[0].length);
    used -= punct[0].length;
  }
  return { correction, used };
}

/** Découpe un texte balisé en segments typés (texte, souligné, rature + correction). */
export function parseMarkup(s: string): Segment[] {
  const out: Segment[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === 'texte') last.text += text;
    else out.push({ kind: 'texte', text });
  };
  let i = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(s); m; m = TOKEN.exec(s)) {
    pushText(s.slice(i, m.index));
    i = m.index + m[0].length;
    if (m[1] !== undefined) {
      const text = m[1].trim();
      let correction: string | undefined;
      if (s[i] === '>') {
        const words = text.split(/ +/).filter(Boolean).length || 1;
        const c = readCorrection(s.slice(i + 1), words);
        if (c) {
          correction = c.correction;
          i += 1 + c.used;
        }
      }
      out.push(correction ? { kind: 'rature', text, correction } : { kind: 'rature', text });
    } else {
      out.push({ kind: 'souligne', text: m[2] });
    }
    TOKEN.lastIndex = i;
  }
  pushText(s.slice(i));
  return out;
}

/** Texte sans balisage (lecture, mesure, aria-label) : la correction remplace le texte raturé. */
export function plainText(s: string): string {
  return parseMarkup(s)
    .map((seg) => (seg.kind === 'rature' ? seg.correction ?? '' : seg.text))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}
