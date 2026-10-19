/** Vignettes du carnet : leur boîte entière est libre d'encre, de liens et de photos.
 * Les gestes restent dans cette boîte, même la lettre qui s'envole et les traces de pattes. */
export type RectSecret = [number, number, number, number];

/** Place le compagnon sur la table visible, dans le repère de l'écran (pas celui de la page).
 * Un zoom qui remplit tout l'écran ne laisse volontairement aucune place sur le texte. */
export function placerCompagnon(ecran: RectSecret, livre: RectSecret, bougie?: RectSecret): RectSecret | null {
  const [ex, ey, ew, eh] = ecran, [bx, by, bw, bh] = livre;
  const libre = (a: RectSecret, b: RectSecret) => a[0] + a[2] <= b[0] || a[0] >= b[0] + b[2] || a[1] + a[3] <= b[1] || a[1] >= b[1] + b[3];
  const secteurs: RectSecret[] = [
    [Math.max(ex + 12, bx + bw + 9), ey + 45, ex + ew - 12 - Math.max(ex + 12, bx + bw + 9), eh - 70],
    [ex + 12, ey + 45, Math.min(ex + ew - 12, bx - 9) - ex - 12, eh - 70],
    [ex + 16, Math.max(ey + 12, by + bh + 9), ew - 32, ey + eh - 12 - Math.max(ey + 12, by + bh + 9)],
    [ex + 16, ey + 12, ew - 32, Math.min(ey + eh - 12, by - 9) - ey - 12],
  ];
  let meilleur: { rect: RectSecret; score: number } | null = null;
  secteurs.forEach(([x, y, w, h], n) => {
    const s = Math.min(1, w / 190, h / 180);
    if (s < 0.35) return;
    const rw = 190 * s, rh = 180 * s;
    const rx = n < 2 ? x + (w - rw) / 2 : Math.min(x + w - rw, Math.max(x, bx + bw * .75 - rw / 2));
    const ry = n < 2 ? Math.min(y + h - rh, Math.max(y, by + bh - rh - 40)) : y + (h - rh) / 2;
    const rect: RectSecret = [rx, ry, rw, rh];
    if (!libre(rect, livre) || (bougie && !libre(rect, bougie))) return;
    const score = s - n * .035;
    if (!meilleur || score > meilleur.score) meilleur = { rect, score };
  });
  return meilleur ? (meilleur as { rect: RectSecret; score: number }).rect : null;
}
export const SECRETS = [
  { id: 'chien-cle', titre: 'Le gardien des secrets', mot: 'La clé des petits bonheurs', chien: 'jack-russell' },
  { id: 'chien-etoile', titre: 'Une étoile à rapporter', mot: 'Encore une fois ?', chien: 'jack-russell-joue' },
  { id: 'chien-dodo', titre: 'Un rêve de goûter', mot: 'Chut… il rêve de biscuits.', chien: 'jack-russell-dort' },
  { id: 'chien-pattes', titre: 'Sur la piste des miettes', mot: 'Élémentaire, mon cher Jack !', chien: 'jack-russell-assis' },
  { id: 'lettre', titre: 'Le courrier de Terrible Cécile', mot: 'Terrible Cécile… même les lettres s’envolent !' },
  { id: 'poche', titre: 'La poche sans fond', mot: 'Une pincée de merveilleux.' },
  { id: 'constellation', titre: 'La carte des étoiles', mot: 'Les étoiles ont leur recette.' },
  { id: 'plume', titre: 'La plume de Douce Cécile', mot: 'Douce Cécile, un mot tendre à chaque page.' },
  { id: 'porte', titre: 'La cachette de la Fée du logis', mot: 'Fée du logis : une maison pleine de magie.' },
  { id: 'livre', titre: 'Le grimoire de Cordon bleu', mot: 'Cordon bleu : le secret est dans le carnet.' },
  { id: 'trente', titre: 'Trente tours de magie', mot: '30 ans, et toute la magie devant soi.' },
  { id: 'piste', titre: 'Une piste invisible', mot: 'Suivez les miettes…' },
] as const;
export type SecretId = typeof SECRETS[number]['id'];

export function graineSecret(texte: string): number {
  let n = 2166136261;
  for (const c of texte) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

/** Les chiens accompagnent chaque double page, les surprises varient à droite. */
export function numeroSecret(page: string, cote: 'gauche' | 'droite'): number {
  const n = graineSecret(page);
  return cote === 'gauche' ? n % 4 : 4 + n % (SECRETS.length - 4);
}

export function zoneLibreSecret(alpha: Uint8ClampedArray, largeur: number, hauteur: number, zones: RectSecret[]): RectSecret | null {
  if (largeur < 1 || hauteur < 1 || alpha.length !== largeur * hauteur * 4) return null;
  const pas = largeur + 1;
  const cumul = new Uint32Array(pas * (hauteur + 1));
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
    const i = (y + 1) * pas + x + 1;
    cumul[i] = Number(alpha[(y * largeur + x) * 4 + 3] > 8) + cumul[i - 1] + cumul[i - pas] - cumul[i - pas - 1];
  }
  const candidats: RectSecret[] = [];
  // Le pied de page d'abord ; aucun trajet ne passe au-dessus d'une recette.
  for (const [w, h] of [[0.39, 0.22], [0.36, 0.20], [0.33, 0.18], [0.30, 0.17], [0.27, 0.16]]) {
    for (const y of [0.755, 0.715, 0.065, 0.11, 0.52, 0.34]) {
      for (const x of [0.055, 0.945 - w, (1 - w) / 2, 0.15, 0.85 - w]) candidats.push([x, y, w, h]);
    }
    // Les espaces entre une dédicace et une photo ne tombent pas toujours sur ces marges.
    // Descendre la grille privilégie toujours le bas de la page, à taille égale.
    for (let y = 0.97 - h; y >= 0.035; y -= 0.025) {
      for (let x = 0.035; x + w <= 0.97; x += 0.025) candidats.push([x, y, w, h]);
    }
  }
  for (const r of candidats) {
    const [x, y, w, h] = r;
    const m = 0.012;
    if (x < m || y < m || x + w > 1 - m || y + h > 1 - m) continue;
    if (zones.some(([zx, zy, zw, zh]) => x + w + m > zx && x - m < zx + zw && y + h + m > zy && y - m < zy + zh)) continue;
    const a = Math.max(0, Math.floor((x - m) * largeur)), b = Math.min(largeur, Math.ceil((x + w + m) * largeur));
    const c = Math.max(0, Math.floor((y - m) * hauteur)), d = Math.min(hauteur, Math.ceil((y + h + m) * hauteur));
    if (cumul[d * pas + b] - cumul[d * pas + a] - cumul[c * pas + b] + cumul[c * pas + a] === 0) return r;
  }
  return null;
}
