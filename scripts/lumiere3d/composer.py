"""Calques de l'éclairage tracé, tirés des rendus de scripts/lumiere3d/scene.py.

Pour chaque état (table vide, et chaque cran de distance livre fermé ou ouvert), la lumière de chaque
source par px de scène (rendu Cycles divisé par la couleur propre des surfaces) est teintée, pondérée,
additionnée, puis posée sur le site sous forme de calques ordinaires (sans mélange CSS) :

  - <etat>.webp : un calque RGBA qui, posé sur ce que le site dessine (papier, toile, bois de couleur
    moyenne B), donne exactement B × lumière : il assombrit, teinte, et éclaircit le bois près de la
    bougie. Lumières au plus fort (bougie et feu vifs) ;
  - <etat>-bougie.webp, <etat>-feu.webp : des voiles noirs, l'écart entre la flamme vive et la flamme
    basse de chaque source ; le site règle leur opacité sur la flamme (Bougie.tsx : éclat) et sur le feu
    (src/lib/feu.ts : intensité). Un voile noir multiplie : l'encre garde son contraste relatif.

Les calques sont en demi-définition (1 px pour 2 px de scène) et débordent de MARGE px de scène autour de
l'écran ; src/components/Lumiere/tracee.json donne leur boîte et, au-delà, la couleur de leur bord.

  tools/ecriture/.venv/bin/python scripts/lumiere3d/composer.py <rendus> [--apercu <capture.png> <etat> <sortie.png>]
  python3 scripts/lumiere3d/composer.py --retoucher-cuisson [--seulement moyenne-ouvert]
"""
from __future__ import annotations

import json
import os
import sys
import zipfile
import hashlib

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEST = os.path.join(ROOT, 'design-system/baked/lumiere')
GEO = os.path.join(ROOT, 'src/components/Lumiere/tracee.json')
MARGE, ECHELLE = 400, 2
SCENE_W, SCENE_H = 1920, 1080

# Couleur de chaque source (multiplie celle du rendu, exact : le transport de la lumière est linéaire) et
# poids, en unités normalisées : 1 = l'éclairement médian du feu sur les pages (cran loin), et pour la
# bougie son éclairement au coin de la page gauche le plus proche d'elle (95e centile).
RENDU = {'bougie': (1.0, 0.62, 0.30), 'feu': (1.0, 0.5, 0.22), 'ambiance': (0.42, 0.52, 0.85)}
COULEUR = {'bougie': (1.0, 0.78, 0.45), 'feu': (1.0, 0.56, 0.30), 'ambiance': (0.55, 0.60, 0.75)}
POIDS = {'bougie': 0.9, 'feu': 0.42, 'ambiance': 0.12}
BAS = {'bougie': 0.5, 'feu': 0.6}          # flamme basse : part de la source au plus bas
BLANC_BOUGIE = 0.3                          # balance des blancs sur la bougie : en partie seulement, elle reste orangée
BLANC = 0.6                                 # balance des blancs sur le feu (0 : aucune, 1 : complète)
VIGNETTE = 0.22                             # assombrissement optique aux coins de l'écran
LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)
SOURCES = os.path.join(os.path.dirname(__file__), 'calques-cycles-v1.zip')
LIVRES = {'proche': (252, 40, 708, 1000), 'moyenne': (280, 60, 680, 960), 'loin': (331, 96, 629, 888)}
PAPIER = np.array((0.822, 0.701, 0.477), np.float32)
TOILE = np.array((0.181, 0.267, 0.170), np.float32)


def enc(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def dec(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lire(rendus: str, etat: str):
    """La lumière de chaque source par px : sa luminance (rendu ÷ couleur propre), dans sa couleur. On ne
    garde pas la couleur divisée par pixel : sur le bois sombre (bleu ≈ 0), le moindre reflet blanc la
    fausse."""
    d = os.path.join(rendus, etat)
    L = {g: np.load(os.path.join(d, f'{g}.npy')).astype(np.float32) for g in ('bougie', 'feu', 'ambiance', 'albedo')}
    alb = np.maximum(L.pop('albedo'), 1e-4)
    out = {}
    for g, v in L.items():
        y = (v / alb / np.array(RENDU[g], np.float32)) @ LUM
        c = np.array(COULEUR[g], np.float32)
        out[g] = y[..., None] * (c / (c @ LUM))
    return out, alb


def normes(rendus: str):
    """Unités : éclairements de référence mesurés sur le livre ouvert du cran loin."""
    L, _ = lire(rendus, 'loin-ouvert')
    k = 1 / ECHELLE
    py0, py1 = int((MARGE + 96) * k), int((MARGE + 984) * k)
    gx0, gx1, dx1 = int((MARGE + 331) * k), int((MARGE + 960) * k), int((MARGE + 1589) * k)
    pages = np.concatenate([L['feu'][py0:py1, gx0:gx1].reshape(-1, 3), L['feu'][py0:py1, gx1:dx1].reshape(-1, 3)])
    feu = np.median(pages, axis=0)
    yb = L['bougie'][py0:py1, gx0:gx1] @ LUM
    amb = np.median(L['ambiance'][py0:py1, gx0:dx1].reshape(-1, 3), axis=0)
    return {'bougie': float(np.percentile(yb, 95)), 'feu': float(feu @ LUM), 'ambiance': float(amb @ LUM)}, feu / (feu @ LUM)


def vignette(h: int, w: int):
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32) * ECHELLE
    u = (xs - MARGE - SCENE_W / 2) / (SCENE_W / 2)
    v = (ys - MARGE - SCENE_H / 2) / (SCENE_H / 2)
    r2 = (u * u + v * v) / 2
    return (1 - VIGNETTE * np.clip(r2, 0, 2.5) ** 1.5)[..., None]


def lumiere(L, N, wb, mult):
    """La pièce (feu et pénombre), la balance des blancs faite sur le feu."""
    R = sum(POIDS[g] * mult.get(g, 1.0) / N[g] * L[g] for g in L if g != 'bougie')
    return R / wb


def plafond(B):
    """Le plus clair que la lumière puisse rendre une surface : son dessin, exactement, pour le papier (un
    calque qui éclaircit le papier délave l'encre posée dessus), bien plus pour le sombre (bois, toile)."""
    lb = enc(B) @ LUM
    return (1 + 10 * np.maximum(0.8 - lb, 0) ** 2)[..., None]


def tonal(R, B):
    """Épaule douce, canal par canal, vers le plafond : la flaque de la bougie arrive au papier tel qu'il est
    dessiné, en gardant sa couleur tant qu'elle peut (le bleu s'éteint d'abord), sans jamais éclaircir le
    papier ; les dégradés restent lisibles au lieu d'être écrêtés."""
    P = plafond(B)
    k = 0.6 * P
    return np.where(R <= k, R, k + (P - k) * (1 - np.exp(-(R - k) / (P - k))))


def eclairage(L, N, wb, mult, B, vg):
    """La pièce (balance des blancs sur le feu) et la bougie, orangée (balance en partie seulement) : une
    flaque chaude sur la table et le coin de la page près d'elle, qui décroît vers le pli ; sa part vacille
    (voile -bougie)."""
    bougie = POIDS['bougie'] * mult.get('bougie', 1.0) / N['bougie'] * L['bougie'] / wb ** (BLANC_BOUGIE / BLANC)
    return tonal((lumiere(L, N, wb, mult) + bougie) * vg, B)


def calque(T, B):
    """RGBA (sRVB) qui, posé sur B, donne T : (1 − a) B + a C = T."""
    Ts, Bs = enc(T), np.maximum(enc(B), 1e-4)
    a1 = np.where(Ts < Bs, 1 - Ts / Bs, 0)
    a2 = np.where(Ts > Bs, (Ts - Bs) / np.maximum(1 - Bs, 1e-4), 0)
    a = np.clip(np.max(np.maximum(a1, a2), axis=-1), 0, 1)[..., None]
    C = np.where(a > 1e-4, (Ts - (1 - a) * Bs) / np.maximum(a, 1e-4), 0)
    return np.concatenate([np.clip(C, 0, 1), a], axis=-1)


def voile(T_haut, T_bas, B):
    """Voile noir : (1 − a) × haut = bas, sur la luminance sRVB."""
    yh = enc(T_haut) @ LUM
    yb = enc(T_bas) @ LUM
    a = np.clip(1 - yb / np.maximum(yh, 1e-4), 0, 1)
    z = np.zeros_like(a)
    return np.stack([z, z, z, a], axis=-1)


def octets(x):
    # sans tramage : un pas d'opacité de 1/255 ne se voit pas sous ces voiles, et le bruit triplerait le poids
    return np.clip(np.round(x * 255), 0, 255).astype(np.uint8)


def etat(rendus: str, nom: str, N, wb):
    L, B = lire(rendus, nom)
    vg = vignette(*B.shape[:2])
    T = lambda m: B * eclairage(L, N, wb, m, B, vg)
    haut = T({})
    return retoucher({
        '': calque(haut, B),
        'bougie': voile(haut, T({'bougie': BAS['bougie']}), B),
        'feu': voile(haut, T({'feu': BAS['feu']}), B),
    }, nom)


def retoucher(calques, nom):
    """Transport Cycles sur le vrai livre, sans dessiner une deuxième arête de carton.

    Combined / DiffCol contient le biseau spéculaire du modèle simplifié. Ce biseau n'est pas une
    lumière réutilisable sur une autre texture : il doublait les chants déjà cuits dans la couverture.
    Sur les 28 px de repli, on prolonge donc l'éclairement diffus de la surface voisine. Les ombres
    portées sur le bois restent intactes. La contribution bougie reste celle de Cycles (-bougie),
    simplement plus présente sur le papier, avec un plafond à l'albédo pour garder l'encre sombre.
    """
    if nom == 'vide':
        return calques
    cran, pose = nom.split('-')
    bx, by, w, h = LIVRES[cran]
    if pose == 'ouvert':
        x0, x1, y0, y1 = bx, 960 + w, by, by + h
        B = PAPIER
    elif pose == 'couverture':
        x0, x1, y0, y1 = 960 - w / 2, 960 + w / 2 + 28, by - 12, by + h + 26
        B = TOILE
    else:
        x0, x1, y0, y1 = 960 - w / 2 - 28, 960 + w / 2, by - 12, by + h + 26
        B = TOILE
    fond = calques[''].copy()
    bougie = calques['bougie'].copy()
    feu = calques['feu'].copy()
    yy, xx = np.mgrid[:fond.shape[0], :fond.shape[1]]
    sx, sy = xx * ECHELLE - MARGE, yy * ECHELLE - MARGE
    surface = (sx >= x0) & (sx <= x1) & (sy >= y0) & (sy <= y1)
    Bs = enc(B)
    haut = (1 - fond[..., 3:]) * Bs + fond[..., :3] * fond[..., 3:]
    # -bougie est l'écart réellement tracé entre une source à 100 % et à 50 %. En doubler la
    # contribution élargit sa lumière sur la page, sans inventer un halo ni agrandir la flamme.
    apport = 1 - (1 - bougie[..., 3:]) ** 2.2
    eclaire = np.minimum(Bs, haut * (1 + 1.45 * apport))
    fond[surface] = calque(dec(eclaire), np.broadcast_to(B, fond.shape[:2] + (3,)))[surface]
    bougie[surface, 3] = np.minimum(0.3, bougie[surface, 3] * 1.22)
    if pose == 'ouvert':
        # Le carton visible et le dessus des pages ne sont pas le même matériau. On transporte
        # l'illumination, pas les couleurs RGBA du papier, jusqu'au bord du carton.
        anneau = (sx >= x0 - 28) & (sx <= x1 + 28) & (sy >= y0 - 12) & (sy <= y1 + 26) & ~surface
        ix = np.clip(xx, int((x0 + MARGE + 8) / ECHELLE), int((x1 + MARGE - 8) / ECHELLE))
        iy = np.clip(yy, int((y0 + MARGE + 8) / ECHELLE), int((y1 + MARGE - 8) / ECHELLE))
        voisin = fond[iy, ix]
        Tp = (1 - voisin[..., 3:]) * enc(PAPIER) + voisin[..., :3] * voisin[..., 3:]
        transport = np.minimum(1, dec(Tp) / PAPIER)
        bord = calque(TOILE * transport, np.broadcast_to(TOILE, transport.shape))
        fond[anneau] = bord[anneau]
        bougie[anneau] = bougie[iy, ix][anneau]
        feu[anneau] = feu[iy, ix][anneau]
    else:
        # Le biseau fermé est aussi dessiné dans l'image de couverture : son transport doit venir
        # du plat voisin, et non d'un reflet du petit modèle 3D.
        bord = surface & ((sx < x0 + 14) | (sx > x1 - 14) | (sy < y0 + 14) | (sy > y1 - 14))
        ix = np.clip(xx, int((x0 + MARGE + 16) / ECHELLE), int((x1 + MARGE - 16) / ECHELLE))
        iy = np.clip(yy, int((y0 + MARGE + 16) / ECHELLE), int((y1 + MARGE - 16) / ECHELLE))
        for c in (fond, bougie, feu):
            c[bord] = c[iy, ix][bord]
    return {'': fond, 'bougie': bougie, 'feu': feu}


def retoucher_cuisson(seulement=None):
    """Reproductible sans les 332 Mo de passes EXR : toujours relire les originaux, jamais la sortie.

    L'archive contient les trente calques Cycles v1 suivis avant cette correction. Relancer cette
    commande est idempotent. Les prochains rendus passent par la même fonction retoucher().
    """
    import io
    geo = json.load(open(GEO))
    with zipfile.ZipFile(SOURCES) as sources:
        empreintes = json.loads(sources.read('manifest.json'))
        for f, attendu in empreintes.items():
            if hashlib.sha256(sources.read(f)).hexdigest() != attendu:
                raise ValueError(f'calque source altéré : {f}')
        noms = sorted(n[:-5] for n in sources.namelist() if n.endswith('.webp') and not n.endswith(('-bougie.webp', '-feu.webp')))
        if seulement:
            noms = [n for n in noms if n in seulement]
        for nom in noms:
            cs = {}
            for suffixe in ('', 'bougie', 'feu'):
                f = f'{nom}-{suffixe}.webp' if suffixe else f'{nom}.webp'
                cs[suffixe] = np.asarray(Image.open(io.BytesIO(sources.read(f))).convert('RGBA'), np.float32) / 255
            for suffixe, c in retoucher(cs, nom).items():
                f = f'{nom}-{suffixe}.webp' if suffixe else f'{nom}.webp'
                Image.fromarray(octets(c), 'RGBA').save(os.path.join(DEST, f), 'WEBP', quality=90, method=4)
            print(nom, flush=True)
    geo['revision'] = 'diffus-cartons-bougie-v2'
    with open(GEO, 'w') as f:
        json.dump(geo, f, indent=1)


def main():
    args = sys.argv[1:]
    if '--retoucher-cuisson' in args:
        seulement = args[args.index('--seulement') + 1].split(',') if '--seulement' in args else None
        retoucher_cuisson(seulement)
        return
    rendus = args[0]
    N, chroma = normes(rendus)
    wb = chroma ** BLANC
    if '--apercu' in args:
        i = args.index('--apercu')
        capture, nom, sortie = args[i + 1:i + 4]
        apercu(etat(rendus, nom, N, wb), capture, sortie)
        return
    os.makedirs(DEST, exist_ok=True)
    geo = {'marge': MARGE, 'echelle': ECHELLE, 'bords': {}, 'revision': 'diffus-cartons-bougie-v2'}
    etats = sorted(d for d in os.listdir(rendus) if os.path.isfile(os.path.join(rendus, d, 'feu.npy')))
    for nom in etats:
        for suffixe, c in etat(rendus, nom, N, wb).items():
            im = Image.fromarray(octets(c), 'RGBA')
            f = f'{nom}-{suffixe}' if suffixe else nom
            im.save(os.path.join(DEST, f'{f}.webp'), 'WEBP', quality=90, method=6)
            if not suffixe:
                bord = np.concatenate([c[:4].reshape(-1, 4), c[-4:].reshape(-1, 4), c[:, :4].reshape(-1, 4), c[:, -4:].reshape(-1, 4)])
                geo['bords'][nom] = [round(float(v), 3) for v in bord.mean(0)]
                geo['w'], geo['h'] = c.shape[1] * ECHELLE, c.shape[0] * ECHELLE
        print(nom, flush=True)
    with open(GEO, 'w') as f:
        json.dump(geo, f, indent=1)


def apercu(calques, capture: str, sortie: str, o_bougie: float = 0.1, o_feu: float = 0.5):
    """Composition comme le navigateur (mélange normal en sRVB) sur une capture TV à nu ; la bougie
    (cire et flamme) reste dessus."""
    base = np.asarray(Image.open(capture).convert('RGB'), dtype=np.float32) / 255

    def poser(img, c, o=1.0):
        im = Image.fromarray(octets(c), 'RGBA')
        im = im.resize((im.width * ECHELLE, im.height * ECHELLE), Image.BILINEAR)
        c = np.asarray(im, dtype=np.float32)[MARGE:MARGE + SCENE_H, MARGE:MARGE + SCENE_W] / 255
        a = c[..., 3:] * o
        return img * (1 - a) + c[..., :3] * a

    img = poser(base, calques[''])
    img = poser(img, calques['bougie'], o_bougie)
    img = poser(img, calques['feu'], o_feu)
    geo = json.load(open(os.path.join(ROOT, 'src/components/Bougie/geometrie.json')))
    for nom in ('cire', 'flamme'):
        f = os.path.join(ROOT, f'design-system/baked/bougie/{nom}.webp')
        if nom not in geo or not os.path.exists(f):
            continue  # flamme en WebGL (Bougie.tsx) : pas d'image cuite
        g = geo[nom]
        im = Image.open(f).convert('RGBA')
        im = im.resize((round(g['w']), round(g['h'])), Image.BILINEAR)
        m = np.zeros((SCENE_H, SCENE_W), np.float32)
        x, y = round(g['x']), round(g['y'])
        a = np.asarray(im, dtype=np.float32)[..., 3] / 255
        x0, y0 = max(0, x), max(0, y)
        m[y0:y + a.shape[0], x0:x + a.shape[1]] = a[y0 - y:, x0 - x:][:SCENE_H - y0, :SCENE_W - x0]
        img = img * (1 - m[..., None]) + base * m[..., None]
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(sortie)


if __name__ == '__main__':
    main()
