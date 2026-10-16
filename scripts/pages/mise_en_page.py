"""Moteur de mise en page « naturelle » des pages du carnet.

Entrée : une description de page (src/content/pages/<id>.json). Sortie : les traits à cuire
(px de la page de référence 850 × 960, y vers le bas), les boîtes des mots, le texte réel de la
page (accessibilité) et les zones réservées aux éléments vivants (écrin).

Les dix règles de design-system/docs/references-carnets.md § 5, avec la contrainte de lisibilité
du projet (hauteur d'x ≥ 1,8 % de la largeur de page, lue à 3 m sur la TV et sur un téléphone) :

 1. marges asymétriques, droite mangée (reliure respectée : l'ombre du pli mange 5 à 8 %) ;
 2. interligne ≈ celui de la main (2,9 à 3,6 hauteurs d'x), ± 6 % ; il se resserre sur les
    dernières lignes quand la page est pleine (jamais la taille sous 1,8 %) ;
 3. lignes jamais horizontales : biais de page ± 0,5°, pente de ligne ± 0,35° (bornée à
    ± 1,5°), ligne de base en marche aléatoire (≤ 0,15 hauteur d'x) ;
 4. marge gauche qui flotte (± 0,8 % L, bornée), alinéa de 3 à 7 % sur un paragraphe sur trois ;
 5. titres au fer, décalés ou centrés de travers, 1,3 à 1,4 × le corps, soulignés à la main ;
 6. filet court centré ou rien entre les parties ;
 7. ingrédients dans le texte (mains anciennes) ou en colonne / deux colonnes à barre tremblée /
    accolade (mains modernes) — jamais de puces ;
 8. préparation en paragraphe continu, note finale soulignée ;
 9. pages pleines ou blanc libre en bas, jamais centrées verticalement ;
10. ajouts tardifs d'une autre encre ou d'une autre main posés dans l'espace libre (interligne,
    marge, fin de ligne) sans décaler le texte, ratures (trait simple, correction au-dessus, ‸).

Le dernier mot d'une ligne se tasse (espace − 35 %, largeur − 8 % au plus) plutôt que de passer
à la ligne ; aucune césure dans un mot.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field

import numpy as np

import ecriture as ECR
import gestes as TR

W, H = 850.0, 960.0
# Hauteurs d'x par rôle (fraction de la largeur de page). Plancher : 1,8 % (14 px à l'écran au cran
# « loin », page de 786 px). Le corps suit le jeton gc-x-body du cran loin (15 / 786 = 1,91 %).
ROLES = {
    "corps": 0.0190,
    "mot": 0.0194,
    "titre": 0.0190 * 1.36,
    "signature": 0.0190 * 1.32,
    "annotation": 0.0184,
    "legende": 0.0188,
    "correction": 0.0181,
}
XH_MIN = 0.0181 * W
# Espace entre les mots × celle de la main : un peu plus aérée que nature (lecture à 3 m, sur téléphone).
ESPACE = 1.12

PONCT = re.compile(r"^[!?:;»)\].,…]+$")
UNITES = {"g", "kg", "cl", "ml", "l", "dl", "min", "h", "mm", "cm", "%", "°C", "°", "°C)", "g,", "g.", "min.", "min,"}


def _norm(s: str) -> str:
    """Normalisation caractère par caractère (même longueur) : minuscules, sans accents."""
    out = []
    for c in s:
        if c in "’‘":
            out.append("'")
            continue
        if c in "\u202f\u00a0":
            out.append(" ")
            continue
        d = [x for x in unicodedata.normalize("NFKD", c) if not unicodedata.combining(x)]
        out.append((d[0] if d else c).lower())
    return "".join(out)


# =============================================================================================
# Balisage : ~~150 g~~>{120 g}  ·  ~~oups~~  ·  __souligné__  ·  ^{inséré}
# =============================================================================================
_BAL = re.compile(r"~~(.+?)~~(?:>(\{[^}]*\}|[^\s~_^]+(?:\s+[^\s~_^]+)?))?|__(.+?)__|\^\{([^}]*)\}")


def analyser(texte: str):
    """→ (texte brut écrit, segments marqués). Un segment : dict(debut, fin, genre, correction)."""
    brut, marques, pos = [], [], 0
    n = 0
    for m in _BAL.finditer(texte):
        brut.append(texte[pos:m.start()])
        n += len(texte[pos:m.start()])
        if m.group(1) is not None:
            barre = m.group(1)
            corr = m.group(2)
            if corr:
                if corr.startswith("{"):
                    corr = corr[1:-1]
                else:  # autant de mots que le texte raturé (nombre + unité = un mot)
                    nb = len(re.findall(r"\d+\s*(?:g|kg|cl|ml|min|h)\b|\S+", barre))
                    corr = " ".join(corr.split()[:nb])
            marques.append(dict(debut=n, fin=n + len(barre), genre="rature", correction=corr))
            brut.append(barre)
            n += len(barre)
        elif m.group(3) is not None:
            marques.append(dict(debut=n, fin=n + len(m.group(3)), genre="souligne"))
            brut.append(m.group(3))
            n += len(m.group(3))
        else:
            marques.append(dict(debut=n, fin=n, genre="insertion", correction=m.group(4)))
        pos = m.end()
    brut.append(texte[pos:])
    return "".join(brut), marques


def _spans(brut: str, lignes) -> list:
    """Position (début, fin) dans `brut` de chaque mot écrit par N2 (ordre de lecture)."""
    plat = [m for l in lignes for m in l]
    nb = _norm(brut)
    out, cur = [], 0
    for m in plat:
        t = _norm(m.texte).strip()
        while cur < len(nb) and nb[cur] in " \n":
            cur += 1
        i = nb.find(t, cur) if t else -1
        if i < 0 or i - cur > 3:
            i = cur
            j = cur
            while j < len(nb) and nb[j] not in " \n":
                j += 1
            out.append((i, j))
            cur = j
        else:
            out.append((i, i + len(t)))
            cur = i + len(t)
    return out


# =============================================================================================
# Objets posés
# =============================================================================================
@dataclass
class Trace:
    pts: np.ndarray  # (n, 5) x, y, pression, vitesse, encre — px de page
    diam: float  # largeur du trait à pression 1 (px de page) : largeur = diam × (0,42 + 0,78 p)
    encre: dict  # id, outil, charge, clair


@dataclass
class MotPose:
    texte: str
    base: tuple  # (x0, y0, x1, y1) ligne de base, px de page
    xh: float
    boite: tuple  # (x0, y0, x1, y1)
    bloc: str
    ligne: int


@dataclass
class Ligne:
    y0: float  # ligne de base au départ
    x0: float  # départ
    x1: float  # fin disponible
    theta: float  # pente (rad, + = descend vers la droite)
    xh: float
    noeuds: np.ndarray = field(default_factory=lambda: np.zeros(3))
    pas: float = 30.0
    n: int = 0
    mots: list = field(default_factory=list)

    def y(self, x: float) -> float:
        k = (x - self.x0) / self.pas
        marche = float(np.interp(k, np.arange(len(self.noeuds)), self.noeuds))
        return self.y0 + math.tan(self.theta) * (x - self.x0) + marche


def _haut_requis(marques, spans) -> set:
    """Mots qui portent une correction ou une insertion au-dessus d'eux."""
    out = set()
    for mq in marques:
        if not mq.get("correction"):
            continue
        for i, (a, e) in enumerate(spans):
            if mq["genre"] == "insertion":
                if a < mq["debut"] and (i + 1 == len(spans) or spans[i + 1][0] >= mq["debut"]):
                    out.add(i)
            elif a < mq["fin"] and e > mq["debut"]:
                out.add(i)
    return out


def _insecable(prec, cur) -> bool:
    if prec is None:
        return False
    t = cur.texte.strip()
    p = prec.texte.strip()
    if PONCT.match(t) or t.startswith("°") or t in ("»",):
        return True
    if p in ("«", "(") or p.endswith("("):
        return True
    if re.search(r"[\d½¼¾⅓⅔]$", p) and (t.rstrip(",.;:)") in UNITES or t.startswith("°")):
        return True
    if p in ("c.", "th.", "c", "1/2") and len(t) <= 3:
        return True
    return False


# =============================================================================================
# Le moteur
# =============================================================================================
_BLOCS: dict = {}  # écritures déjà demandées (et vérifiées) dans ce processus
class Mise:
    def __init__(self, desc: dict, serrage: tuple | None = None, global_pas: float = 1.0, sonde: bool = False):
        self.desc = desc
        self.id = desc["id"]
        self.cote = desc.get("cote", "droite")
        self.graine = int(desc.get("graine", 1))
        self.rng = np.random.default_rng(self.graine)
        r = self.rng
        self.main = desc.get("main", "soignee")
        self.encre = desc.get("encre")
        self.serrage = serrage  # (n_lignes_total, n_dernieres, facteur)
        self.global_pas = global_pas
        m = desc.get("marges", {})
        if self.cote == "gauche":  # extérieur à gauche, reliure à droite
            self.ml = W * m.get("gauche", r.uniform(0.052, 0.066))
            self.xr = W * (1 - m.get("droite", r.uniform(0.058, 0.066)))
        else:
            self.ml = W * m.get("gauche", r.uniform(0.078, 0.092))
            self.xr = W * (1 - m.get("droite", r.uniform(0.022, 0.032)))
        self.haut = H * m.get("haut", r.uniform(0.062, 0.08))
        self.bas = 1e9 if sonde else H * (1 - m.get("bas", 0.035))
        self.biais = float(np.clip(r.normal(desc.get("biais", 0.0), 0.22), -0.5, 0.5))
        self.sigma_pente = float(desc.get("sigma_pente", r.uniform(0.22, 0.4)))
        # zones réservées : éléments vivants + folio imprimé du livre (bas, côté extérieur)
        self.reserves = []
        self.vivants = {}
        for v in desc.get("vivants", []):
            x, y, w, h = v["rect"]
            rect = (x * W, y * H, (x + w) * W, (y + h) * H)
            self.vivants[v["nom"]] = rect
            self.reserves.append(rect)
        if self.cote == "gauche":
            self.reserves.append((0.035 * W, 0.905 * H, 0.16 * W, H))
        else:
            self.reserves.append((0.84 * W, 0.905 * H, 0.965 * W, H))
        self.traces: list[Trace] = []
        self.mots: list[MotPose] = []
        self.marques_boites = []  # boîtes des tracés (soulignés, barres…)
        self.texte: list[str] = []
        self.lignes: list[Ligne] = []
        self.base = None  # ligne de base de la dernière ligne posée
        self.pas_prec = None
        self.marge_derive = 0.0
        self.pente_prec = 0.0
        self.deborde: list[str] = []
        self.non_places: list[str] = []
        self.douteux: list[str] = []
        self.blocs_lignes: dict[str, list[Ligne]] = {}
        self._bloc_cache: dict = {}

    # ---- écriture (N2) --------------------------------------------------------------------
    def ecrire(self, texte, main, graine, encre=None, outil=None):
        cle = (texte, main, graine, encre, outil)
        if cle not in self._bloc_cache:
            if cle not in _BLOCS:
                _BLOCS[cle] = ECR.ecrire_bloc(texte, main, graine, encre=encre, outil=outil)
            b = _BLOCS[cle]
            self._bloc_cache[cle] = b
            self.douteux += b.douteux
        return self._bloc_cache[cle]

    def xh_de(self, role: str, main: str) -> float:
        taille = ECR.main_info(main)["taille"]
        return max(XH_MIN, ROLES[role] * W * taille)

    # ---- lignes -----------------------------------------------------------------------------
    def _pente(self, sigma=None, propre=None) -> float:
        s = self.sigma_pente if sigma is None else sigma
        p = 0.45 * self.pente_prec + 0.55 * self.rng.normal(0, s)
        self.pente_prec = p
        base = self.biais if propre is None else propre
        return math.radians(float(np.clip(base + p, -1.5, 1.5)))

    def _facteur_pas(self, n: int) -> float:
        f = self.global_pas
        if self.serrage:
            total, dernieres, fac = self.serrage
            debut = total - dernieres
            if n >= debut:
                k = (n - debut + 1) / max(dernieres, 1)
                f *= 1 - (1 - fac) * k
        return f

    def plage(self, y: float, xh: float, x0: float, x1: float):
        """Restreint [x0, x1] pour une ligne de base y en évitant les zones réservées."""
        haut, bas = y - 2.2 * xh, y + 1.0 * xh
        for (rx0, ry0, rx1, ry1) in self.reserves:
            if bas < ry0 or haut > ry1:
                continue
            if rx0 <= x0 + 0.5 * (x1 - x0) and rx1 > x0:  # réserve à gauche ou au centre
                if rx1 - x0 < 0.6 * (x1 - x0) and rx0 <= x0 + 1:
                    x0 = max(x0, rx1 + 0.4 * xh)
                else:
                    x1 = min(x1, rx0 - 0.4 * xh)
            elif rx0 < x1:
                x1 = min(x1, rx0 - 0.4 * xh)
        return x0, x1

    def nouvelle_ligne(self, xh: float, interligne: float, *, x0=None, x1=None, sauter=0.0, pente=None,
                       sigma=None, derive=True, premier_haut=1.55) -> Ligne | None:
        n = len(self.lignes)
        pas = interligne * xh
        if self.base is None:
            y = self.haut + premier_haut * xh
        else:
            moy = 0.5 * (pas + (self.pas_prec or pas))
            y = self.base + moy * (1 + sauter) * self._facteur_pas(n) * float(np.clip(self.rng.normal(1, 0.035), 0.93, 1.07))
        if y > self.bas:
            return None
        if derive:
            self.marge_derive = float(np.clip(0.55 * self.marge_derive + self.rng.normal(0.004, 0.006) * W, 0, 0.03 * W))
        gx = (self.ml if x0 is None else x0) + (self.marge_derive if derive and x0 is None else 0)
        dx = self.xr if x1 is None else x1
        gx, dx = self.plage(y, xh, gx, dx)
        theta = self._pente(sigma, pente)
        pas_m = 2.0 * xh
        k = int((dx - gx) / pas_m) + 3
        marche = np.cumsum(self.rng.normal(0, 0.035 * xh, k))
        marche = np.clip(marche - marche.mean(), -0.15 * xh, 0.15 * xh)
        L = Ligne(y0=y, x0=gx, x1=dx, theta=theta, xh=xh, noeuds=marche, pas=pas_m, n=n)
        self.lignes.append(L)
        self.base = y
        self.pas_prec = pas
        return L

    # ---- pose d'un mot ------------------------------------------------------------------------
    def poser(self, ligne: Ligne, mot: ECR.Mot, x: float, xh: float, encre: dict, ep: float, bloc: str,
              ech_x: float = 1.0, rot_extra: float = 0.0, dy: float = 0.0):
        r = self.rng
        ang = ligne.theta + math.radians(r.normal(0, 0.28) + rot_extra)
        y = ligne.y(x) + dy + r.normal(0, 0.025) * xh
        ca, sa = math.cos(ang), math.sin(ang)
        tous = []
        for T in mot.traits:
            P = T.copy()
            lx = P[:, 0] * xh * ech_x
            ly = P[:, 1] * xh
            P[:, 0] = x + lx * ca - ly * sa
            P[:, 1] = y + lx * sa + ly * ca
            self.traces.append(Trace(P, ep * xh, encre))
            tous.append(P[:, :2])
        w = mot.largeur * xh * ech_x
        b = (x, y, x + w * ca, y + w * sa)
        if tous:
            A = np.vstack(tous)
            boite = (float(A[:, 0].min()), float(A[:, 1].min()), float(A[:, 0].max()), float(A[:, 1].max()))
        else:
            boite = (x, y - xh, x + w, y)
        mp = MotPose(mot.texte, b, xh, boite, bloc, ligne.n)
        self.mots.append(mp)
        ligne.mots.append(mp)
        return mp, w * ca

    # ---- couler un texte ------------------------------------------------------------------------
    def couler(self, mots: list, xh: float, interligne: float, encre: dict, ep: float, bloc: str, *,
               espace: float, x0=None, x1=None, alinea=0.0, premiere=None, x_premiere=None, pente=None,
               sigma=None, derive=True, sauter=0.0, premier_haut=1.55, haut_requis=(), retrait_suite=0.0):
        """Pose une suite de mots ; renvoie les MotPose dans l'ordre (None pour un mot non posé)."""
        r = self.rng
        groupes = []
        for i, m in enumerate(mots):
            if groupes and _insecable(mots[i - 1], m):
                groupes[-1].append(i)
            else:
                groupes.append([i])
        poses = [None] * len(mots)
        ligne = premiere
        x = x_premiere if premiere is not None else None
        lignes = []
        g = 0
        def prevoir(g0, dispo):
            """Groupes qui tiendront sur la prochaine ligne (pour réserver la place d'une correction)."""
            xx, gg = 0.0, g0
            while gg < len(groupes):
                w = sum((mots[i].espace_avant if k else espace) * xh + mots[i].largeur * xh for k, i in enumerate(groupes[gg]))
                if gg > g0 and xx + w > dispo * 1.03:
                    break
                xx += w
                gg += 1
            return gg

        while g < len(groupes):
            if ligne is None:
                extra = 0.0
                if haut_requis:
                    gx = (self.ml if x0 is None else x0) + (alinea * W if not lignes else retrait_suite * W)
                    fin = prevoir(g, (self.xr if x1 is None else x1) - gx)
                    if any(i in haut_requis for gr in groupes[g:fin] for i in gr):
                        extra = 1.3 / interligne
                ligne = self.nouvelle_ligne(xh, interligne, x0=(None if x0 is None and not (lignes and retrait_suite) else
                                                                (x0 if x0 is not None else self.ml) + (retrait_suite * W if lignes else 0.0)),
                                            x1=x1, sauter=(sauter if not lignes else 0.0) + extra,
                                            pente=pente, sigma=sigma, derive=derive, premier_haut=premier_haut + extra * interligne)
                if ligne is None:
                    self.deborde.append(bloc)
                    return poses, lignes
                lignes.append(ligne)
                x = ligne.x0 + (alinea * W if len(lignes) == 1 and premiere is None else 0.0)
                debut_ligne = True
            else:
                debut_ligne = x is None or not ligne.mots
                if x is None:
                    x = ligne.x0
                if premiere is not None and ligne is premiere and premiere not in lignes:
                    lignes.append(ligne)
            grp = groupes[g]
            larg = []
            for k, i in enumerate(grp):
                m = mots[i]
                e = 0.0 if (debut_ligne and k == 0) else max(0.0, m.espace_avant if k else ESPACE * espace * float(np.clip(r.normal(1, 0.13), 0.8, 1.35)))
                if k and m.espace_avant > 0.6 * espace:
                    e = espace * float(np.clip(r.normal(1, 0.1), 0.8, 1.3))
                if e > 0 and i > 0:
                    # l'encre qui dépasse (queue d'un « s », attaque d'une majuscule) ne doit pas
                    # coller les mots : l'espace se mesure d'encre à encre
                    deb = 0.85 * (getattr(mots[i - 1], "debord_d", 0.0) + getattr(m, "debord_g", 0.0))
                    e = max(e, (0.5 if e >= 0.45 * espace else 0.08) * espace + deb) if deb > 0 else e
                larg.append((e * xh, m.largeur * xh))
            total = sum(a + b for a, b in larg)
            depasse = x + total - ligne.x1
            ech_x, ech_esp = 1.0, 1.0
            if depasse > 0 and not debut_ligne:
                mot_l = sum(b for _, b in larg)
                esp_l = sum(a for a, _ in larg)
                # tassement : on serre l'approche et on étroitise un peu les derniers mots
                dernier = g == len(groupes) - 1
                if depasse <= (0.5 * esp_l + 0.12 * mot_l if dernier else 0.35 * esp_l + 0.08 * mot_l):
                    serre_max = 0.5 if dernier else 0.35
                    ech_esp = (1 - serre_max) if depasse > serre_max * esp_l else 1 - depasse / max(esp_l, 1e-6)
                    reste = depasse - (1 - ech_esp) * esp_l
                    ech_x = 1 - max(0.0, reste) / max(mot_l, 1e-6)
                else:
                    ligne = None
                    continue
            for k, i in enumerate(grp):
                e, _ = larg[k]
                x += e * ech_esp
                mp, adv = self.poser(ligne, mots[i], x, xh, encre, ep, bloc, ech_x=ech_x)
                poses[i] = mp
                x += adv
            g += 1
        if ligne is not None and ligne not in lignes:
            lignes.append(ligne)
        self._fin_x = x
        self._fin_ligne = ligne
        return poses, lignes

    # ---- marques faites main --------------------------------------------------------------------
    def tracer(self, chemins: list, xh: float, encre: dict, ep: float, graine: int, main: str):
        """Encre (modèle de N2) puis pose des tracés (chemins en px de page)."""
        if not chemins:
            return
        echelle = [np.column_stack([c[:, 0] / xh, c[:, 1] / xh, c[:, 2], c[:, 3]]) for c in chemins]
        encres = ECR.encrer_traits(echelle, encre["id"], encre.get("outil"), graine, main)
        for T in encres:
            P = np.asarray(T, float).copy()
            P[:, 0] *= xh
            P[:, 1] *= xh
            self.traces.append(Trace(P, ep * xh, encre))
            self.marques_boites.append((P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max()))

    # ---- blocs ---------------------------------------------------------------------------------
    def _style_bloc(self, b: dict, role: str):
        main = b.get("main", self.main)
        enc_id = b.get("encre", self.encre)
        outil = b.get("outil", self.desc.get("outil") if enc_id == self.encre else None)
        info = ECR.main_info(main)
        xh = self.xh_de(b.get("role", role), main)
        return main, enc_id, outil, info, xh

    def bloc_texte(self, b: dict, role: str, idx: int, **kw):
        """Bloc de texte balisé (paragraphe, note, mot…) : écrit, coule, marque."""
        main, enc_id, outil, info, xh = self._style_bloc(b, role)
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        brut, marques = analyser(b["texte"])
        bloc = self.ecrire(brut, main, graine, enc_id, outil)
        mots = [m for l in bloc.lignes for m in l]
        encre = dict(bloc.encre)
        interligne = float(b.get("interligne", bloc.interligne))
        spans = _spans(brut, bloc.lignes)
        poses, lignes = self.couler(mots, xh, interligne, encre, bloc.epaisseur, b.get("id", f"b{idx}"),
                                    espace=info["espace"], haut_requis=_haut_requis(marques, spans), **kw)
        self.blocs_lignes[b.get("id", f"b{idx}")] = lignes
        self._marquer(b, brut, marques, poses, spans, xh, encre, bloc, main, graine)
        self.texte.append(self._texte_lisible(brut, marques))
        return poses, lignes, xh, encre, bloc

    def _texte_lisible(self, brut, marques):
        s = brut
        for mq in sorted(marques, key=lambda m: -m["debut"]):
            if mq["genre"] == "rature":
                s = s[: mq["debut"]] + (mq.get("correction") or "") + s[mq["fin"]:]
            elif mq["genre"] == "insertion":
                s = s[: mq["debut"]] + mq["correction"] + " " + s[mq["debut"]:]
        return re.sub(r"\s+", " ", s.replace("\n", " ")).strip()

    def _marquer(self, b, brut, marques, poses, spans, xh, encre, bloc, main, graine):
        r = self.rng
        corr_cfg = b.get("correction", {})
        for k, mq in enumerate(marques):
            if mq["genre"] == "insertion":
                # ajout écrit au-dessus, ‸ sous la ligne juste après le mot qui précède
                ins_cfg = b.get("insertion", corr_cfg)
                avant = [i for i, (a, e) in enumerate(spans) if a < mq["debut"] and poses[i] is not None]
                if not avant:
                    continue
                cible = poses[avant[-1]]
                pt = (cible.base[2] + 0.25 * xh, cible.base[3])
                self._ecrire_dessus(mq["correction"].strip(), (pt[0] - 0.5 * xh, pt[1]), cible, xh, ins_cfg, main, encre,
                                    graine + 101 + k, chevron=True, x_chevron=pt[0])
                continue
            dedans = [poses[i] for i, (a, e) in enumerate(spans) if a < mq["fin"] and e > mq["debut"] and poses[i] is not None]
            if not dedans:
                continue
            for ligne_n in sorted({p.ligne for p in dedans}):
                part = [p for p in dedans if p.ligne == ligne_n]
                xa, ya = part[0].base[0], part[0].base[1]
                xb, yb = part[-1].base[2], part[-1].base[3]
                if mq["genre"] == "souligne":
                    ch = TR.souligne(xa, ya, xb, yb, r, xh, double=b.get("souligne_double", False))
                    enc = encre if not b.get("souligne_encre") else ECR.nuances(b["souligne_encre"])
                    self.tracer(ch, xh, enc, bloc.epaisseur * 0.95, graine + 50 + k, main)
                else:  # rature
                    c_main = corr_cfg.get("main", main)
                    c_enc = ECR.nuances(corr_cfg["encre"]) if corr_cfg.get("encre") else encre
                    c_ep = ECR.main_info(c_main)["epaisseur"]
                    ch = TR.rature(xa, ya, xb, yb, r, xh)
                    self.tracer(ch, xh, c_enc, c_ep, graine + 70 + k, c_main)
            if mq["genre"] == "rature" and mq.get("correction"):
                cible = dedans[0]
                x0, y0 = cible.base[0], cible.base[1]
                self._ecrire_dessus(mq["correction"], (x0 + r.uniform(-0.1, 0.35) * xh, y0), cible, xh, corr_cfg, main,
                                    encre, graine + 90 + k, chevron=r.random() < 0.25)

    def _ecrire_dessus(self, texte, pt, cible: MotPose, xh_ligne, cfg, main, encre, graine, chevron=False, x_chevron=None):
        r = self.rng
        c_main = cfg.get("main", main)
        c_enc_id = cfg.get("encre", encre["id"])
        bloc = self.ecrire(texte, c_main, graine, c_enc_id, cfg.get("outil"))
        enc = dict(bloc.encre)
        xh = self.xh_de("correction", c_main)
        x0, y0, x1, y1 = cible.base
        ang = math.atan2(y1 - y0, x1 - x0)
        up = np.array([math.sin(ang), -math.cos(ang)])
        hauteur = float(cfg.get("hauteur", 1.5)) * xh_ligne
        base = np.array(pt) + up * hauteur
        L = Ligne(y0=float(base[1]), x0=float(base[0]), x1=W, theta=ang + math.radians(r.normal(-1.2, 0.8)), xh=xh,
                  noeuds=np.zeros(3), pas=2 * xh, n=cible.ligne)
        x = L.x0
        for k, m in enumerate([m for l in bloc.lignes for m in l]):
            if k:
                x += max(m.espace_avant, 0.35) * xh
            _, adv = self.poser(L, m, x, xh, enc, bloc.epaisseur, "correction")
            x += adv
        if chevron:
            cx = (pt[0] - 0.05 * xh_ligne) if x_chevron is None else x_chevron
            cy = cible.base[1] + 0.12 * xh_ligne
            self.tracer(TR.chevron(cx, cy, r, xh_ligne), xh_ligne, enc, bloc.epaisseur * 0.9, graine + 3, c_main)

    # ---- types de blocs --------------------------------------------------------------------------
    def titre(self, b, idx):
        main, enc_id, outil, info, xh = self._style_bloc(b, "titre")
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        brut, marques = analyser(b["texte"])
        bloc = self.ecrire(brut, main, graine, enc_id, outil)
        mots = [m for l in bloc.lignes for m in l]
        espace = info["espace"]
        largeur = sum(m.largeur * xh for m in mots) + espace * xh * (len(mots) - 1)
        r = self.rng
        pos = b.get("position", "fer")
        dispo = self.xr - self.ml
        if pos == "centre":
            x = self.ml + (dispo - largeur) / 2 - r.uniform(0.03, 0.09) * W
        elif pos == "decale":
            x = max(self.ml, W * r.uniform(0.2, 0.28) - (0.0 if self.cote == "gauche" else -0.02 * W))
        else:
            x = self.ml + r.uniform(0.0, 0.012) * W
        x = float(np.clip(x, self.ml, max(self.ml, self.xr - largeur)))
        sauter = float(b.get("avant", 0.0))
        poses, lignes = self.couler(mots, xh, float(b.get("interligne", bloc.interligne * 0.92)), dict(bloc.encre),
                                    bloc.epaisseur, b.get("id", "titre"), espace=espace, x0=x, derive=False,
                                    sauter=sauter, premier_haut=b.get("premier_haut", 1.7))
        self.blocs_lignes[b.get("id", "titre")] = lignes
        spans = _spans(brut, bloc.lignes)
        self._marquer(b, brut, marques, poses, spans, xh, dict(bloc.encre), bloc, main, graine)
        sl = b.get("souligne", "aucun")
        ok = [p for p in poses if p is not None]
        if sl != "aucun" and ok:
            enc = ECR.nuances(b["souligne_encre"]) if b.get("souligne_encre") else dict(bloc.encre)
            if sl == "mot-a-mot":
                for k, p in enumerate(ok):
                    if PONCT.match(p.texte.strip()):
                        continue
                    self.tracer(TR.souligne(*p.base, r, xh, dy=0.5), xh, enc, bloc.epaisseur * 0.9, graine + 10 + k, main)
            else:
                for n_l in sorted({p.ligne for p in ok}):
                    part = [p for p in ok if p.ligne == n_l and not PONCT.match(p.texte.strip())]
                    if not part:
                        continue
                    a, z = part[0].base, part[-1].base
                    self.tracer(TR.souligne(a[0], a[1], z[2], z[3], r, xh, double=(sl == "double"), dy=0.55),
                                xh, enc, bloc.epaisseur * 0.9, graine + 10, main)
        self.texte.append(self._texte_lisible(brut, marques))
        return lignes

    def ingredients(self, b, idx):
        disp = b.get("disposition", "texte")
        items = b["lignes"]
        if disp == "texte":
            intro = b.get("intro", "")
            texte = (intro + " " if intro else "") + ", ".join(items) + b.get("fin", ".")
            return self.bloc_texte(dict(b, texte=texte), "corps", idx, alinea=b.get("alinea", 0.0),
                                   sauter=float(b.get("avant", 0.0)))[1]
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        r = self.rng
        bid = b.get("id", f"b{idx}")
        if b.get("intro"):
            self.bloc_texte(dict(b, texte=b["intro"], id=bid + "-intro"), "corps", idx + 50, sauter=float(b.get("avant", 0.0)))
            b = dict(b, avant=0.0)
        if disp == "colonne":
            colonnes = [items]
        else:
            n = (len(items) + 1) // 2
            colonnes = [items[:n], items[n:]]
        # une écriture par colonne (l'encre et ses trempées suivent l'ordre d'écriture)
        blocs, brut_cols, marques_cols = [], [], []
        for c, col in enumerate(colonnes):
            brut, marques = analyser("\n".join(col))
            brut_cols.append(brut)
            marques_cols.append(marques)
            blocs.append(self.ecrire(brut, main, graine + 13 * c, enc_id, outil))
        encre = dict(blocs[0].encre)
        interligne = float(b.get("interligne", blocs[0].interligne))
        x_g = self.ml + r.uniform(0.0, 0.02) * W
        if disp == "colonne":
            bornes = [(x_g, self.xr)]
        else:
            larg_g = max(sum(m.largeur * xh for m in l) + info["espace"] * xh * (len(l) - 1) for l in blocs[0].lignes)
            x_barre = x_g + larg_g + r.uniform(0.022, 0.032) * W
            x_d = x_barre + r.uniform(0.032, 0.045) * W
            bornes = [(x_g, x_barre - 0.02 * W), (x_d, self.xr)]
        y_depart = self.base
        pas_prec = self.pas_prec
        toutes = []
        fin_y = []
        for c, bloc in enumerate(blocs):
            self.base, self.pas_prec = y_depart, pas_prec
            if c == 1 and self.base is not None:
                self.base += r.normal(0.12, 0.08) * interligne * xh  # pas d'alignement strict entre colonnes
            poses_col, lignes_col = [], []
            spans = _spans(brut_cols[c], bloc.lignes)
            requis = _haut_requis(marques_cols[c], spans)
            n0 = 0
            for k, l in enumerate(bloc.lignes):
                req = {i - n0 for i in requis if n0 <= i < n0 + len(l)}
                p, ls = self.couler(l, xh, interligne, encre, bloc.epaisseur, bid, espace=info["espace"],
                                    x0=bornes[c][0] + r.uniform(-0.004, 0.01) * W, x1=bornes[c][1], derive=False,
                                    sauter=float(b.get("avant", 0.0)) if (k == 0 and c == 0) else 0.0,
                                    haut_requis=req, retrait_suite=0.03)
                n0 += len(l)
                poses_col += p
                lignes_col += ls
            self._marquer(b, brut_cols[c], marques_cols[c], poses_col, spans, xh, encre, bloc, main, graine + c)
            toutes += lignes_col
            fin_y.append(self.base)
            self.texte.append(self._texte_lisible(brut_cols[c], marques_cols[c]).replace("\n", ", "))
        self.base = max(fin_y)
        if disp == "deux-colonnes" and toutes:
            y0 = toutes[0].y0 - 1.25 * xh
            y1 = self.base + 0.55 * xh
            self.tracer(TR.barre(x_barre, y0, y1, r, xh), xh, encre, blocs[0].epaisseur * 0.95, graine + 77, main)
        self.blocs_lignes[bid] = toutes
        return toutes

    def filet(self, b, idx):
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        r = self.rng
        enc = ECR.nuances(enc_id or "bic", outil)
        pas = info["interligne"] * xh
        y = (self.base or self.haut) + pas * float(b.get("hauteur", 0.62))
        if y > self.bas:
            return
        xc = self.ml + (self.xr - self.ml) * float(b.get("centre", r.uniform(0.42, 0.5)))
        lg = W * float(b.get("longueur", r.uniform(0.18, 0.3)))
        self.tracer(TR.filet(xc, y, lg, r, xh), xh, enc, info["epaisseur"], self.graine + idx * 5, main)
        self.base = y - pas * 0.25
        self.pas_prec = pas

    def mot(self, b, idx):
        r = self.rng
        retrait = float(b.get("retrait", r.uniform(0.12, 0.22)))
        pente = float(b.get("pente", r.uniform(-2.0, 1.0)))
        return self.bloc_texte(b, "mot", idx, x0=self.ml + retrait * W * 0.55, alinea=retrait * 0.45,
                               pente=pente, sigma=0.35, sauter=float(b.get("avant", 0.6)))[1]

    def signature(self, b, idx):
        main, enc_id, outil, info, xh = self._style_bloc(b, "signature")
        r = self.rng
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        bloc = self.ecrire(b["texte"], main, graine, enc_id, outil)
        mots = [m for l in bloc.lignes for m in l]
        larg = sum(m.largeur * xh for m in mots) + info["espace"] * xh * (len(mots) - 1)
        xpos = float(b.get("x", r.uniform(0.56, 0.68))) * W
        xpos = min(xpos, self.xr - larg - 0.02 * W)
        pente = float(b.get("pente", r.uniform(-5.5, -3.0)))
        poses, lignes = self.couler(mots, xh, float(b.get("interligne", bloc.interligne * 0.85)), dict(bloc.encre),
                                    bloc.epaisseur * 1.05, b.get("id", "signature"), espace=info["espace"], x0=xpos,
                                    pente=pente, sigma=0.1, derive=False, sauter=float(b.get("avant", 0.0)))
        self.blocs_lignes[b.get("id", "signature")] = lignes
        self.texte.append(b["texte"])
        return lignes

    def espace(self, b, idx):
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        if self.base is not None:
            self.base += float(b.get("lignes", 1)) * info["interligne"] * xh

    # ---- annotations : posées après coup, dans l'espace libre ----------------------------------
    def _libre(self, boite, marge):
        x0, y0, x1, y1 = boite
        if x0 < 0.02 * W or x1 > 0.985 * W or y0 < 0.02 * H or y1 > 0.975 * H:
            return False
        for (a0, b0, a1, b1) in [m.boite for m in self.mots] + self.marques_boites + self.reserves:
            if x0 - marge < a1 and x1 + marge > a0 and y0 - marge < b1 and y1 + marge > b0:
                return False
        return True

    def annotation(self, b, idx):
        """Ajout tardif (autre main, autre encre) : premier emplacement libre parmi `places`."""
        main, enc_id, outil, info, xh = self._style_bloc(b, b.get("role", "annotation"))
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        r = self.rng
        brut, marques = analyser(b["texte"])
        bloc = self.ecrire(brut, main, graine, enc_id, outil)
        mots = [m for l in bloc.lignes for m in l]
        encre = dict(bloc.encre)
        larg = sum(m.largeur * xh for m in mots) + info["espace"] * xh * (len(mots) - 1)
        pente = float(b.get("pente", r.uniform(-3.5, -1.5)))
        candidats = []
        for pl in b.get("places", []):
            if "x" in pl:
                candidats.append((pl["x"] * W, pl["y"] * H))
            elif "apres" in pl:
                ls = self.blocs_lignes.get(pl["apres"]) or []
                if ls and ls[-1].mots:
                    der = ls[-1].mots[-1]
                    candidats.append((der.base[2] + pl.get("dx", 1.2) * xh, der.base[3] + pl.get("dy", 0.0) * xh))
            elif "sous" in pl:
                ls = self.blocs_lignes.get(pl["sous"]) or []
                if ls:
                    L = ls[-1]
                    candidats.append((L.x0 + pl.get("dx", 0.0) * W, L.y0 + pl.get("dy", 1.5) * L.xh * 2))
                elif pl["sous"] in self.vivants:
                    rx0, ry0, rx1, ry1 = self.vivants[pl["sous"]]
                    candidats.append((rx0 + pl.get("dx", 0.0) * W, ry1 + pl.get("dy", 0.04) * H))
            elif "au_dessus" in pl:
                ls = self.blocs_lignes.get(pl["au_dessus"]) or []
                if ls:
                    L = ls[0]
                    candidats.append((L.x0 + pl.get("dx", 0.0) * W, L.y0 - pl.get("dy", 1.6) * L.xh * 2))
        choisi = None
        for (cx, cy) in candidats:
            for decal in (0.0, -0.6, 0.6, -1.2, 1.2):
                y = cy + decal * xh
                ang = math.radians(pente)
                x1 = cx + larg * math.cos(ang)
                y1 = y + larg * math.sin(ang)
                boite = (min(cx, x1) - 0.1 * xh, min(y, y1) - 1.9 * xh, max(cx, x1) + 0.2 * xh, max(y, y1) + 0.9 * xh)
                if self._libre(boite, 0.25 * xh):
                    choisi = (cx, y)
                    break
            if choisi:
                break
        if choisi is None:
            self.non_places.append(b.get("id", f"annotation-{idx}"))
            if not candidats:
                return
            choisi = candidats[0]
        L = Ligne(y0=choisi[1], x0=choisi[0], x1=W, theta=math.radians(pente), xh=xh,
                  noeuds=np.clip(np.cumsum(r.normal(0, 0.03 * xh, int(larg / (2 * xh)) + 3)), -0.12 * xh, 0.12 * xh),
                  pas=2 * xh, n=-1)
        x = L.x0
        poses = []
        for k, m in enumerate(mots):
            if k:
                x += (m.espace_avant if m.espace_avant > 0 else info["espace"]) * xh
            mp, adv = self.poser(L, m, x, xh, encre, bloc.epaisseur, b.get("id", "annotation"))
            poses.append(mp)
            x += adv
        spans = _spans(brut, bloc.lignes)
        self._marquer(b, brut, marques, poses, spans, xh, encre, bloc, main, graine)
        if b.get("fleche"):
            f = b["fleche"]
            depart = np.array(f.get("depart", [poses[0].base[0] - 0.4 * xh, poses[0].base[1] - 0.4 * xh]))
            if "vers_bloc" in f:
                ls = self.blocs_lignes.get(f["vers_bloc"]) or []
                cands = [m for l in ls for m in l.mots]
                cible = None
                if f.get("mot"):
                    cible = next((m for m in cands if m.texte.startswith(f["mot"])), None)
                if cible is None and ls:
                    cible = ls[min(f.get("ligne", 0), len(ls) - 1)].mots[-1]
                if cible is not None:
                    cx = (cible.boite[0] + cible.boite[2]) / 2
                    arrivee = np.array([cx, cible.boite[3] + 0.35 * xh])
                else:
                    arrivee = depart + [-3 * xh, 2 * xh]
            else:
                arrivee = np.array([f["x"] * W, f["y"] * H])
            self.tracer(TR.fleche(depart, arrivee, r, xh, f.get("courbure", 0.15)), xh, encre, bloc.epaisseur, graine + 9, main)
        self.texte.append(f"({self._texte_lisible(brut, marques)})")

    # ---- page entière ------------------------------------------------------------------------
    def composer(self):
        differe = []
        for i, b in enumerate(self.desc.get("blocs", [])):
            t = b["type"]
            if t in ("annotation", "legende"):
                differe.append((i, b))
                continue
            if t == "titre":
                self.titre(b, i)
            elif t == "ingredients":
                self.ingredients(b, i)
            elif t in ("paragraphe", "note", "suite"):
                alinea = b.get("alinea")
                if alinea is None:
                    alinea = self.rng.uniform(0.03, 0.06) if self.rng.random() < 0.3 else 0.0
                self.bloc_texte(b, "corps", i, alinea=float(alinea), sauter=float(b.get("avant", 0.0)))
                if b.get("souligne"):
                    pass
            elif t == "filet":
                self.filet(b, i)
            elif t == "mot":
                self.mot(b, i)
            elif t == "signature":
                self.signature(b, i)
            elif t == "espace":
                self.espace(b, i)
            else:
                raise ValueError(f"{self.id} : type de bloc inconnu « {t} »")
        for i, b in differe:
            self.annotation(dict(b, role=b.get("role", "legende" if b["type"] == "legende" else "annotation")), i)
        return self


def mettre_en_page(desc: dict) -> Mise:
    """Compose la page ; si elle déborde, resserre l'interligne des dernières lignes (jusqu'à −28 %),
    puis légèrement toute la page (−6 %). Au-delà : la page est signalée (`deborde`), on ne réduit
    jamais l'écriture : la recette continue page suivante."""
    m = Mise(desc).composer()
    if not m.deborde:
        return m
    n = len(Mise(desc, sonde=True).composer().lignes)
    essais = [(5, 0.85, 1.0), (6, 0.78, 1.0), (7, 0.72, 1.0), (8, 0.72, 0.97), (9, 0.72, 0.94)]
    for dernieres, fac, glob in essais:
        m2 = Mise(desc, serrage=(n, dernieres, fac), global_pas=glob).composer()
        if not m2.deborde:
            m2.serre = (dernieres, fac, glob)
            return m2
        m = m2
    return m
