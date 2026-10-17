"""Adaptateur UNIQUE vers l'écriture générée trait par trait (tools/ecriture, agent N2).

Tout ce que la cuisson des pages sait de l'outil d'écriture passe par ici : le jour où le format
de N2 change, seule cette fonction bouge.

    from ecriture import ecrire_bloc, encrer_traits, main_info
    bloc = ecrire_bloc("3 œufs\n120 g de sucre", main="soignee", graine=12, encre="bic")
    for ligne in bloc.lignes:          # une ligne par « \n » du texte
        for mot in ligne:              # mot.traits : [(n, 5)] x, y, pression, vitesse, encre
            ...                        # repère du MOT : ligne de base y = 0, départ x ≈ 0, unité = hauteur d'x

Ce que l'on demande à N2 : `ecrire(texte, style, graine, largeur_max=None, encre, outil)` (API
documentée dans tools/ecriture/README.md). On n'utilise PAS sa mise en page (césure, pente des
lignes) : chaque mot est remis dans son propre repère (on défait la rotation et la translation
de sa ligne de base), et le moteur de mise en page des pages le replace. On garde de N2 : le tracé,
la pression, la vitesse, l'encre de chaque point, la taille et la pente propres de chaque mot, et
l'espace qu'il a laissé avant chaque mot (espace normale, fine ou nulle).

Repli : si les points n'ont pas de 5e valeur (encre), on la dérive de la pression et de la vitesse.

Mots importants (CONTRACT § 13, lot E ; `importants.py`) : nombres, unités, noms, ingrédients.
  - `ecrire_bloc` les fait écrire sans aucune tolérance : chaque jeton relu (même « g », « C »,
    un chiffre seul), aucun jeton manqué, test de la lettre (ou du chiffre) en moins à toute longueur,
    puis relecture du GROUPE tel qu'il est posé (« 180 g », « 4 °C », « 40 min », « 1 c. à s. »)
    contre ses variantes (chiffres voisins, sosies 0 → o/c/C, unité absente ou déformée g → q/9/y).
    Un mot douteux est réécrit seul (8 graines), puis le bloc entier (3 graines).
  - `Mot.important` est vrai pour ces mots ; leurs traits n'ont jamais de saut de bille (l'encre
    est posée par tools/ecriture/encre.py avec le drapeau `important` de chaque mot).
  - `relire_rendu(encre_rgba, mots_places)` relit l'ENCRE RENDUE (après encre et papier) des mots
    importants posés sur la page : la cuisson échoue s'il en reste un douteux.
"""
from __future__ import annotations

import hashlib
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parents[2]
OUTIL = RACINE / "tools" / "ecriture"
if str(OUTIL) not in sys.path:
    sys.path.append(str(OUTIL))
_ICI = Path(__file__).resolve().parent
if str(_ICI) not in sys.path:
    sys.path.insert(0, str(_ICI))

import importants as IMP  # noqa: E402  (bibliothèque standard seulement)

# Mains du contrat (src/content/types.ts, HandId) → mains de N2 (tools/ecriture/styles.py)
MAINS_N2 = {
    "mamie": "mamie", "ecole": "ecole", "soignee": "soignee", "pressee": "pressee", "cecile": "cecile",
    "feutre": "ado",  # Shantell Sans → ronde, grosse, aérée
    "capitales": "papa",  # Patrick Hand SC → script droit à lettres détachées (N2 : capitales illisibles)
    "ado": "ado", "papa": "papa",
}


def _hex(c: str) -> np.ndarray:
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], float)


@dataclass
class Mot:
    texte: str
    traits: list  # [np.ndarray (n, 5)] repère du mot, unité hauteur d'x
    largeur: float  # longueur de la ligne de base du mot (hauteurs d'x)
    espace_avant: float  # espace laissée par N2 avant ce mot (hauteurs d'x), 0 pour le 1er de la ligne
    hauteur_x: float = 1.0  # taille propre du mot (déjà appliquée aux traits)
    debord_g: float = 0.0  # encre à gauche du départ de la ligne de base (hauteurs d'x, ≥ 0)
    debord_d: float = 0.0  # encre au-delà de la fin de la ligne de base (hauteurs d'x, ≥ 0)
    important: bool = False  # mot important (importants.py) : relu sans tolérance, aucun saut de bille


@dataclass
class Bloc:
    lignes: list  # [[Mot]]
    main: str  # main du contrat
    style: str  # main de N2
    interligne: float  # interligne de la main (hauteurs d'x)
    taille: float  # taille conseillée relative
    epaisseur: float  # épaisseur du trait à pression 1 (hauteurs d'x)
    encre: dict = field(default_factory=dict)  # id, outil, charge, clair
    pente: float = 0.0  # tangente de la pente des lettres (pleins)
    douteux: list = field(default_factory=list)  # mots mal relus (lu = false, chiffres lus autrement)
    graine: int = 0  # graine effectivement retenue
    douteux_idx: list = field(default_factory=list)  # (ligne, mot) des mots douteux
    remplaces: list = field(default_factory=list)  # mots réécrits seuls (graine du mot)


_EMPREINTE: str | None = None


def version_outil() -> str:
    """Empreinte de l'outil d'écriture (version du tracé + sources) : invalide le cache des pages."""
    global _EMPREINTE
    if _EMPREINTE is None:
        h = hashlib.sha256()
        for f in sorted(OUTIL.glob("*.py")):
            h.update(f.name.encode())
            h.update(f.read_bytes())
        _EMPREINTE = h.hexdigest()[:16]
    return _EMPREINTE


def _mod():
    import ecrire as E  # noqa: WPS433  (chargé à la demande : NumPy, réseau)
    return E


def main_info(main: str) -> dict:
    """Réglages de la main (N2) : interligne, taille, épaisseur, espace."""
    from styles import STYLES
    st = STYLES[MAINS_N2.get(main, main)]
    return dict(style=st.nom, interligne=st.interligne, taille=st.taille, epaisseur=st.epaisseur,
                espace=st.espace, cisaillement=st.cisaillement)


def _repli_encre(T: np.ndarray) -> np.ndarray:
    """Points sans encre : densité dérivée de la pression et de la vitesse."""
    p = T[:, 2] if T.shape[1] > 2 else np.full(len(T), 0.7)
    v = T[:, 3] if T.shape[1] > 3 else np.ones(len(T))
    e = np.clip(0.62 + 0.3 * p - 0.22 * np.clip(v - 1, 0, 1.5) + 0.12 * np.clip(1 - v, 0, 1), 0, 1)
    out = np.zeros((len(T), 5))
    out[:, : min(4, T.shape[1])] = T[:, :4]
    if T.shape[1] < 3:
        out[:, 2] = 0.7
    if T.shape[1] < 4:
        out[:, 3] = 1.0
    out[:, 4] = e
    return out


def _au_repere_du_mot(m: dict):
    """Défait la pose du mot sur sa ligne (rotation + translation de sa ligne de base)."""
    (x0, y0), (x1, y1) = m["ligne_de_base"]
    x0, y0, x1, y1 = float(x0), float(y0), float(x1), float(y1)
    ang = math.atan2(y1 - y0, x1 - x0)
    ca, sa = math.cos(-ang), math.sin(-ang)
    traits = []
    for t in m["traits"]:
        T = np.asarray(t, float)
        if T.ndim != 2 or len(T) == 0:
            continue
        if T.shape[1] < 5:
            T = _repli_encre(T)
        X, Y = T[:, 0] - x0, T[:, 1] - y0
        T = T.copy()
        T[:, 0] = X * ca - Y * sa
        T[:, 1] = X * sa + Y * ca
        traits.append(T)
    return traits, math.hypot(x1 - x0, y1 - y0), (x0, y0, x1, y1)


def _redresser(traits: list) -> list:
    """Recale la ligne de base d'un mot sur le bas de ses lettres (N2 ne redresse qu'à 75 % les mots
    écrits en pente : un long mot pouvait finir 0,5 hauteur d'x trop bas). Ajustement robuste d'une
    droite sur le point le plus bas de chaque tranche de 0,4 hauteur d'x, jambages exclus."""
    if not traits:
        return traits
    A = np.vstack([t[:, :2] for t in traits])
    x0, x1 = float(A[:, 0].min()), float(A[:, 0].max())
    corps = A[A[:, 1] > -0.75]
    if len(corps) < 6:
        return traits
    if x1 - x0 < 1.6:  # mot court : décalage vertical seulement
        bas = float(np.percentile(corps[:, 1], 92))
        if bas > 0.55:  # jambage (« g », « j »…) : on ne touche à rien
            return traits
        dy = float(np.clip(bas - 0.03, -0.3, 0.3))
        return [np.column_stack([t[:, 0], t[:, 1] - dy, t[:, 2:]]) for t in traits]
    bords = np.arange(x0, x1 + 0.4, 0.4)
    xs, ys = [], []
    for a, b in zip(bords[:-1], bords[1:]):
        m = (corps[:, 0] >= a) & (corps[:, 0] < b)
        if m.sum() >= 2:
            xs.append((a + b) / 2)
            ys.append(float(corps[m, 1].max()))
    if len(xs) < 4:
        return traits
    xs, ys = np.array(xs), np.array(ys)
    med = float(np.median(ys))
    ok = ys < med + 0.4
    for _ in range(2):
        if ok.sum() < 3:
            return traits
        k, c = np.polyfit(xs[ok], ys[ok], 1)
        res = ys - (k * xs + c)
        ok = res < 0.3
    k = float(np.clip(k, -0.1, 0.1))
    xm = (x0 + x1) / 2
    ym = k * xm + c
    ang = -math.atan(k)
    ca, sa = math.cos(ang), math.sin(ang)
    out = []
    dy = float(np.clip(ym - 0.03, -0.35, 0.35))
    for t in traits:
        X, Y = t[:, 0] - xm, t[:, 1] - ym
        T = t.copy()
        T[:, 0] = xm + X * ca - Y * sa
        T[:, 1] = ym + X * sa + Y * ca - ym + (ym - dy)
        out.append(T)
    return out


_LECTEUR = None
SOSIES = {"0": "ocuC", "1": "l", "4": "y", "5": "s", "6": "b", "7": "t", "9": "g"}


def _lecteur():
    global _LECTEUR
    if _LECTEUR is None:
        import lecteur
        _LECTEUR = lecteur.Lecteur() if lecteur.disponible() else False
    return _LECTEUR


def _chiffres_douteux(mot: Mot) -> str | None:
    """Les chiffres ne sont pas relus par N2 (« 180 » sorti « 100 », « 120 » sorti « 170 ») :
    on relit le mot avec le relecteur de N2 (TrOCR) en comparant le nombre voulu à toutes ses
    variantes à un chiffre près, et aux lettres qui lui ressemblent (« 300g » sorti « 3ccg » : 0 → c,
    o, u ; 1 → l ; 4 → y ; 5 → s ; 6 → b ; 7 → t ; 9 → g). Renvoie la lecture préférée si ce n'est
    pas le nombre voulu. (Gardé pour compatibilité : les mots importants passent désormais par
    `_verifier_groupe`, plus strict.)"""
    w = mot.texte
    if not any(c.isdigit() for c in w):
        return None
    L = _lecteur()
    if not L:
        return None
    try:
        import lecteur as LM
        alts = {w[:i] + d + w[i + 1:] for i, c in enumerate(w) if c.isdigit() for d in "0123456789" if d != c}
        alts |= {w[:i] + d + w[i + 1:] for i, c in enumerate(w) if c in SOSIES for d in SOSIES[c]}
        # deux chiffres semblables qui tournent mal ensemble (« 00 » → « cc »)
        alts |= {w.replace(c * 2, d * 2) for c in "01" if c * 2 in w for d in SOSIES[c]}
        alts = [w] + sorted(alts)
        img = L._image([[T[:, :2] for T in mot.traits]])
        h = L.enc.run(None, {"pixel_values": img[None]})[0]
        seqs = [L._jetons(t) + [2] for t in alts]
        n = max(len(q) for q in seqs)
        inp = np.ones((len(seqs), n), np.int64)
        for i, q in enumerate(seqs):
            inp[i, :len(q)] = [2] + q[:-1]
        lg = L.dec.run(["logits"], {"input_ids": inp, "encoder_hidden_states": np.repeat(h, len(seqs), axis=0)})[0]
        notes = []
        for i, q in enumerate(seqs):
            r = lg[i, :len(q)]
            notes.append(float((r[np.arange(len(q)), q] - LM._lse(r)).sum()))
        k = int(np.argmax(notes))
        return alts[k] if k and notes[k] - notes[0] > 0.3 else None
    except Exception:
        return None


# =============================================================================================
# Relecture stricte des mots importants, dans leur groupe (« 180 g », « 4 °C », « 40 min »)
# =============================================================================================
# Le lecteur (TrOCR) a un modèle de langue qui « corrige » : un « 0 » ouvert en « C » se lit encore
# « 40 min » parce que « 40 min » est plus probable que « 4C min ». On mesure donc, pour chaque
# variante fausse v du groupe (chiffre voisin, sosie, lettre ou chiffre en moins, unité absente ou
# déformée), l'écart e = log P(groupe) − log P(v) sur l'écriture, et on exige
#     e ≥ min(MARGE_ABS, e_police − DELTA_REF)
# où e_police est le même écart sur le groupe écrit dans une police propre (Kalam) : un groupe bien
# écrit se distingue de ses variantes presque aussi nettement que la police (au moins de MARGE_ABS
# nats) ; quand même la police ne les sépare pas (le lecteur ne connaît pas « ° »), on suit la police.
# Quand la police elle-même sépare mal (e_police petit : « 250g » / « 2509 », le lecteur voit un 9
# dans tout g collé à des chiffres), l'écart toléré grandit doucement jusqu'à DELTA_MAX.
MARGE_ABS = 3.0
DELTA_REF = 1.0
DELTA_MAX = 3.0
# Un jeton qui contient une lettre est « lu » si son écart au premier choix du lecteur ne dépasse pas
# celui de la police d de plus de TOLERANCE_JETON + d/2 nats (1,2 nat quand la police est nette, comme
# N2). Les jetons de chiffres seuls ne sont pas jugés ainsi (le lecteur découpe « 2509 » en « 2 509 » :
# un écart sur « ▁250 » ne dit rien) : leurs fautes sont les variantes (chiffre voisin, sosie, oubli).
TOLERANCE_JETON = 1.2
PX_XH = 20  # hauteur d'x dans l'image relue (comme lecteur._image)
# Lectures équivalentes d'un signe que le lecteur, appris sur de l'anglais, ne connaît pas : le degré
# dessiné peut se lire « ° », « o », « 0 », « " », « ' » ou rien ; les accents sont ignorés (comme N2,
# qui écrit la lettre de base et dessine l'accent).
EQUIV_DEGRE = ("o", "0", '"', "'", "")


def _groupes(textes: list[str], drapeaux: list[bool]) -> list[list[int]]:
    """Groupes de lecture d'une ligne : un nombre et son unité (« 180 g », « 4 °C », « 40 min »,
    « th. 6 », « 1 c. à s. ») se relisent ensemble ; tout autre mot important se relit seul."""
    out: list[list[int]] = []
    i, n = 0, len(textes)
    while i < n:
        if not drapeaux[i]:
            i += 1
            continue
        g = [i]
        j = i + 1
        while j < n:
            prec, cur = textes[g[-1]], textes[j]
            if drapeaux[j] and IMP.est_nombre(prec) and (IMP.est_unite(cur) or cur.startswith("°")):
                g.append(j)
            elif drapeaux[j] and IMP.est_unite(prec) and IMP.norm(prec).startswith("th") and IMP.est_nombre(cur):
                g.append(j)
            elif drapeaux[j] and IMP.norm(prec) in ("c.", "c") and IMP.est_unite(cur):
                g.append(j)
            elif (not drapeaux[j] and IMP.norm(cur) == "a" and j + 1 < n and drapeaux[j + 1]
                  and IMP.norm(prec) in ("c.", "c") and IMP.est_unite(textes[j + 1])):
                g += [j, j + 1]  # « c. à s. »
                j += 1
            else:
                break
            j += 1
        out.append(g)
        i = j
    return out


def variantes_groupe(textes: list[str], importants: list[bool] | None = None) -> list[tuple[str, int]]:
    """Lectures voisines (fausses) d'un groupe : chaque mot important remplacé par ses variantes
    strictes (lettre ou chiffre en moins, chiffre voisin, sosie : `lecteur.variantes`), unité
    absente (« 180 g » → « 180 »). → [(texte, mot fautif)]. (Le degré lu « o », « 0 » ou pas lu du
    tout n'est pas une faute : voir EQUIV_DEGRE.)"""
    import lecteur as LM
    out: dict[str, int] = {}
    cible = " ".join(textes)

    def ajouter(k, w):
        v = " ".join(textes[:k] + ([w] if w else []) + textes[k + 1:])
        if v.strip() and "".join(v.split()).lower() != "".join(cible.split()).lower():
            out.setdefault(v, k)

    for k, t in enumerate(textes):
        if not (importants[k] if importants is not None else IMP.important(t)):
            continue
        for v in LM.variantes(t, strict=True):
            ajouter(k, v)
        if k and IMP.est_unite(t):
            ajouter(k, "")  # l'unité ne se lit pas
    return sorted(out.items())


def _vers_trocr(gris: np.ndarray) -> np.ndarray:
    """Image en niveaux de gris (fond blanc 255, encre sombre) → entrée de TrOCR (3, 384, 384)."""
    from PIL import Image
    g = np.asarray(gris, np.float32)
    lo = float(np.percentile(g, 0.5)) if g.size else 0.0
    if lo < 200:  # contraste : l'encre la plus foncée ramenée vers le noir (encre claire, crayon)
        g = np.clip((g - lo) / max(255.0 - lo, 1.0) * 255.0, 0, 255)
    im = Image.fromarray(g.astype(np.uint8)).convert("RGB").resize((384, 384), Image.BICUBIC)
    a = np.asarray(im, np.float32) / 255.0
    return ((a - 0.5) / 0.5).transpose(2, 0, 1)


def _image_mots(mots: list[Mot]) -> np.ndarray:
    """Le groupe tel qu'il sera posé (espaces de N2 gardées), tracé net comme lecteur._image."""
    from PIL import Image, ImageDraw
    tous, x = [], 0.0
    for k, m in enumerate(mots):
        if k:
            x += max(float(m.espace_avant), 0.3)
        tous += [np.asarray(T)[:, :2] + [x, 0.0] for T in m.traits if len(T)]
        x += float(m.largeur)
    if not tous:
        return np.full((8, 8), 255, np.float32)
    P = np.vstack(tous)
    x0, y0 = P.min(0) - 0.7
    x1, y1 = P.max(0) + 0.7
    px = PX_XH
    im = Image.new("L", (max(8, int((x1 - x0) * px)), max(8, int((y1 - y0) * px))), 255)
    d = ImageDraw.Draw(im)
    for Q in tous:
        pts = [((a - x0) * px, (b - y0) * px) for a, b in Q]
        d.line(pts if len(pts) > 1 else pts * 2, fill=0, width=max(2, int(round(0.12 * px))), joint="curve")
    return np.asarray(im, np.float32)


def seuil_variante(e_police: float) -> float:
    """Écart minimal exigé entre le groupe et une variante, selon l'écart mesuré sur la police."""
    delta = min(DELTA_MAX, DELTA_REF + 0.5 * max(0.0, MARGE_ABS + DELTA_REF - e_police))
    return min(MARGE_ABS, e_police - delta)


def _decoder(L, h: np.ndarray, textes: list[str]):
    """Lecture forcée de chaque texte sur l'image encodée h → [(note, [écart de chaque jeton au premier
    choix du lecteur, en nats, ≥ 0])]."""
    import lecteur as LM
    seqs = [L._jetons(t) + [2] for t in textes]
    n = max(len(q) for q in seqs)
    out = []
    for a in range(0, len(seqs), 48):  # par paquets (mémoire)
        lot = seqs[a:a + 48]
        inp = np.ones((len(lot), n), np.int64)
        for i, q in enumerate(lot):
            inp[i, :len(q)] = [2] + q[:-1]
        lg = L.dec.run(["logits"], {"input_ids": inp, "encoder_hidden_states": np.repeat(h, len(lot), axis=0)})[0]
        for i, q in enumerate(lot):
            r = lg[i, :len(q)]
            v = r[np.arange(len(q)), q]
            out.append((float((v - LM._lse(r)).sum()), [round(float(x), 3) for x in (r.max(-1) - v)]))
    return out


def _lecture_libre(L, h: np.ndarray, n_max: int = 16) -> str:
    """Ce que le lecteur lit de lui-même (décodage glouton) : pour les messages."""
    ids = [2]
    for _ in range(n_max):
        lg = L.dec.run(["logits"], {"input_ids": np.array([ids], np.int64), "encoder_hidden_states": h})[0]
        k = int(lg[0, -1].argmax())
        if k == 2:
            break
        ids.append(k)
    return L.tok.decode(ids[1:]).strip()


def _jeton_vers_mot(L, textes: list[str]) -> list[int] | None:
    """Mot de chaque jeton du groupe (fin de séquence comprise → dernier mot), None si la découpe du
    groupe n'est pas la somme des découpes de ses mots."""
    tout = L._jetons(" ".join(textes))
    par = []
    for k, t in enumerate(textes):
        par += [k] * len(L._jetons(t))
    if len(par) != len(tout):
        return None
    return par + [len(textes) - 1]


def texte_lu(t: str) -> str:
    """Ce que le lecteur doit lire d'un mot : sans accents (dessinés à part), ligatures défaites,
    apostrophes et guillemets droits (« ° » gardé : voir EQUIV_DEGRE)."""
    import unicodedata
    t = t.replace("œ", "oe").replace("Œ", "Oe").replace("æ", "ae").replace("Æ", "Ae")
    t = t.replace("’", "'").replace("‘", "'").replace("«", '"').replace("»", '"').replace("…", "...")
    return "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c) or c == "°")


def _cibles(lus: list[str]) -> list[str]:
    base = " ".join(lus)
    out = [base]
    if "°" in base:
        for e in EQUIV_DEGRE:
            for v in (base.replace("°", e), base.replace("°", e + " ")):  # « 4 "C » ou « 4 " C »
                for w in (v, v.replace("C", "c")):  # C et c manuscrits ne diffèrent que par la taille
                    w = " ".join(w.split())
                    if w.strip() and w not in out:
                        out.append(w)
    return out


def _compact(t: str) -> str:
    return "".join(t.split()).lower()


_REFS_GROUPES: dict | None = None
REFS_GROUPES = OUTIL / ".cache" / "lecteur-groupes-v2.json"


def _ref_groupe(L, texte: str, lectures: list[str]) -> list:
    """Notes et jetons lus de chaque lecture sur le groupe écrit dans la police propre (Kalam), en
    cache disque (une fois par texte)."""
    global _REFS_GROUPES
    import hashlib
    import json
    if _REFS_GROUPES is None:
        try:
            _REFS_GROUPES = json.loads(REFS_GROUPES.read_text())
        except Exception:
            _REFS_GROUPES = {}
    cle = hashlib.sha1(json.dumps([texte, lectures], ensure_ascii=False).encode()).hexdigest()
    if cle not in _REFS_GROUPES:
        X = L._image_texte([texte])
        h = L.enc.run(None, {"pixel_values": X[None].astype(np.float32)})[0]
        _REFS_GROUPES[cle] = [[n, p] for n, p in _decoder(L, h, lectures)]
        try:
            REFS_GROUPES.parent.mkdir(parents=True, exist_ok=True)
            REFS_GROUPES.write_text(json.dumps(_REFS_GROUPES, ensure_ascii=False))
        except Exception:
            pass
    return _REFS_GROUPES[cle]


def lire_groupe(X: np.ndarray, textes: list[str], importants: list[bool] | None = None) -> dict:
    """Relit strictement un groupe de mots (`textes`, tels qu'écrits) sur une image prête pour TrOCR.

    → {douteux, fautifs: [indices des mots en cause], note, ecart, seuil, variante, raison, lu?}.
    Douteux si un jeton s'écarte du premier choix du lecteur de plus de 1,2 nat au-delà de ce qu'il fait
    sur la police propre, ou si une variante fausse v se lit trop bien : écart e(v) <
    `seuil_variante(e_police(v))` (voir plus haut)."""
    L = _lecteur()
    if not L:
        return dict(douteux=False, fautifs=[], note=None, ecart=None, seuil=None, variante=None, raison="sans lecteur")
    lus = [texte_lu(t) for t in textes]
    cibles = _cibles(lus)
    exclus = {_compact(c) for c in cibles}
    vars_ = [(v, k) for v, k in variantes_groupe(lus, importants) if _compact(v) not in exclus]
    lectures = cibles + [v for v, _ in vars_]
    h = L.enc.run(None, {"pixel_values": X[None].astype(np.float32)})[0]
    main = _decoder(L, h, lectures)
    ref = _ref_groupe(L, " ".join(textes), lectures)
    nc = len(cibles)
    k_best = int(np.argmax([n for n, _ in main[:nc]]))
    note, ecarts_jetons = main[k_best]
    note_ref = max(n for n, _ in ref[:nc])
    ecarts_ref = ref[k_best][1]
    jetons = [L.tok.id_to_token(i) for i in L._jetons(cibles[k_best])]
    rates = [j for j, (tok, d_, r_) in enumerate(zip(jetons, ecarts_jetons, ecarts_ref))
             if any(c.isalpha() for c in tok.lstrip("▁")) and d_ > 1.5 * max(0.0, r_) + TOLERANCE_JETON]
    fautifs: set[int] = set()
    raison = []
    if rates:
        mots_t = cibles[k_best].split()
        carte = _jeton_vers_mot(L, mots_t) if len(mots_t) == len(textes) else None
        fautifs |= {carte[j] for j in rates} if carte else set(range(len(textes)))
        raison.append(f"{len(rates)} jeton(s) mal lu(s) dans « {cibles[k_best]} »")
    pire, pire_marge, pire_seuil, pire_ecart = None, None, None, None
    for (v, mot_k), (nv, _), (nr, _) in zip(vars_, main[nc:], ref[nc:]):
        e = note - nv
        seuil = seuil_variante(note_ref - nr)
        if pire_marge is None or e - seuil < pire_marge:
            pire, pire_marge, pire_seuil, pire_ecart = v, e - seuil, seuil, e
        if e < seuil:
            fautifs.add(mot_k)
    if pire_marge is not None and pire_marge < 0:
        raison.append(f"« {pire} » se lit presque aussi bien (écart {pire_ecart:.2f} < {pire_seuil:.2f})")
    douteux = bool(fautifs)
    res = dict(douteux=douteux, fautifs=sorted(fautifs), note=round(note, 3),
               ecart=None if pire_ecart is None else round(pire_ecart, 3),
               seuil=None if pire_seuil is None else round(pire_seuil, 3), variante=pire, raison=" ; ".join(raison))
    if douteux:
        res["lu"] = _lecture_libre(L, h)
    return res


_CACHE_GROUPES: dict | None = None
CACHE_GROUPES = OUTIL / ".cache" / "groupes-lus-v2.json"


def _cache_disque(nom: str):
    """Petit cache JSON (tools/ecriture/.cache/), chargé une fois par processus."""
    global _CACHE_GROUPES, _CACHE_RENDU
    import json
    if nom == "groupes":
        if _CACHE_GROUPES is None:
            try:
                _CACHE_GROUPES = json.loads(CACHE_GROUPES.read_text())
            except Exception:
                _CACHE_GROUPES = {}
        return _CACHE_GROUPES
    if _CACHE_RENDU is None:
        try:
            _CACHE_RENDU = json.loads(CACHE_RENDU.read_text())
        except Exception:
            _CACHE_RENDU = {}
    return _CACHE_RENDU


def _sauver_cache(nom: str):
    import json
    f, d = (CACHE_GROUPES, _CACHE_GROUPES) if nom == "groupes" else (CACHE_RENDU, _CACHE_RENDU)
    try:
        f.parent.mkdir(parents=True, exist_ok=True)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(d or {}, ensure_ascii=False))
        tmp.replace(f)
    except Exception:
        pass


def _lire_image(gris: np.ndarray, textes: list[str], importants: list[bool], cache: str | None) -> dict:
    """lire_groupe sur une image en gris, avec un cache disque (même image, même texte → même verdict :
    une page recuite sans changement d'écriture ne relit rien)."""
    import hashlib
    cle = None
    if cache:
        g8 = np.round(np.asarray(gris)).astype(np.uint8)
        cle = hashlib.sha1(g8.tobytes() + repr((g8.shape, textes, importants, MARGE_ABS, DELTA_REF, DELTA_MAX,
                                                TOLERANCE_JETON)).encode()).hexdigest()
        cc = _cache_disque(cache)
        if cle in cc:
            return dict(cc[cle])
    r = lire_groupe(_vers_trocr(gris), textes, importants)
    if cache:
        _cache_disque(cache)[cle] = {k: v for k, v in r.items()
                                     if k in ("douteux", "fautifs", "ecart", "seuil", "variante", "raison", "lu", "note")}
        _sauver_cache(cache)
    return r


def _verifier_groupe(mots: list[Mot]) -> dict:
    return _lire_image(_image_mots(mots), [m.texte for m in mots], [m.important for m in mots], "groupes")


def _relire_importants(lignes: list[list[Mot]]) -> list[tuple[int, int, str]]:
    """Relit chaque groupe important des lignes → [(ligne, mot, libellé du douteux)]."""
    out = []
    if not _lecteur():
        return out
    for n_l, mots in enumerate(lignes):
        for g in _groupes([m.texte for m in mots], [m.important for m in mots]):
            r = _verifier_groupe([mots[k] for k in g])
            if r["douteux"]:
                for k in r["fautifs"]:
                    out.append((n_l, g[k], f"{mots[g[k]].texte} (groupe « {' '.join(mots[q].texte for q in g)} » "
                                           f"lu « {r.get('lu', '?')} »)"))
    return out


def _ecrire_une_fois(texte, main, graine, encre, outil, contexte=None, verifier=True) -> Bloc:
    E = _mod()
    style = MAINS_N2.get(main, main)
    est_imp = lambda t: IMP.important(t, contexte)  # noqa: E731
    res = E.ecrire(texte, style=style, graine=int(graine), largeur_max=None, encre=encre, outil=outil,
                   importants=est_imp)
    info = main_info(main)
    lignes = []
    douteux = []
    idx = []
    for n_l, ligne in enumerate(res["lignes"]):
        mots = []
        prec = None
        for m in ligne["mots"]:
            traits, larg, (x0, y0, x1, y1) = _au_repere_du_mot(m)
            traits = _redresser(traits)
            esp = 0.0 if prec is None else max(0.0, x0 - prec)
            xs = np.concatenate([t[:, 0] for t in traits]) if traits else np.zeros(1)
            mot = Mot(texte=m["texte"], traits=traits, largeur=larg, espace_avant=esp,
                      hauteur_x=float(m.get("hauteur_x", 1.0)),
                      debord_g=max(0.0, -float(xs.min())), debord_d=max(0.0, float(xs.max()) - larg),
                      important=bool(m.get("important", False)))
            lu = m.get("lu")
            if lu is not None and not all(lu if isinstance(lu, list) else [lu]):
                douteux.append(m["texte"])
                idx.append((n_l, len(mots)))
            elif not mot.important:
                autre = _chiffres_douteux(mot)  # (un mot à chiffres est toujours important : jamais ici)
                if autre:
                    douteux.append(f"{m['texte']} (lu « {autre} »)")
                    idx.append((n_l, len(mots)))
            mots.append(mot)
            prec = x1
        lignes.append(mots)
    if verifier:
        deja = set(idx)
        for n_l, n_m, lib in _relire_importants(lignes):
            if (n_l, n_m) not in deja:
                deja.add((n_l, n_m))
                douteux.append(lib)
                idx.append((n_l, n_m))
    enc = res.get("encre") or {}
    if "charge" not in enc:  # repli : nuances par défaut
        enc = dict(nuances(encre or "bic", outil))
    from styles import STYLES
    st = STYLES[style]
    pente = math.tan(math.radians(st.cisaillement))
    return Bloc(lignes=lignes, main=main, style=style, interligne=float(res.get("interligne", info["interligne"])),
                taille=float(res.get("taille_conseillee", info["taille"])),
                epaisseur=float(res.get("epaisseur_conseillee", info["epaisseur"])),
                encre=dict(id=enc.get("id", encre), outil=enc.get("outil", outil), charge=enc["charge"], clair=enc["clair"]),
                pente=pente, douteux=douteux, graine=int(graine), douteux_idx=idx)


ESSAIS_BLOC = 3  # graines essayées pour un bloc entier
ESSAIS_MOT = 8  # graines essayées pour réécrire seul un mot douteux


def _groupe_de(bloc: Bloc, n_l: int, n_m: int) -> list[int]:
    mots = bloc.lignes[n_l]
    for g in _groupes([m.texte for m in mots], [m.important for m in mots]):
        if n_m in g:
            return g
    return [n_m]


def _reecrire_mots(bloc: Bloc, main, graine, encre, outil, contexte=None) -> Bloc:
    """Réécrit seul chaque mot douteux (autre graine, même main, même encre) jusqu'à ce qu'il se
    relise bien ; le mot réécrit garde sa place dans la ligne (l'espace qui le précède). Un mot
    important est relu à nouveau dans son groupe (« 180 g ») une fois remis à sa place."""
    restants, restants_idx = [], []
    remplaces = []
    for (n_l, n_m), lib in zip(bloc.douteux_idx, bloc.douteux):
        ancien = bloc.lignes[n_l][n_m]
        trouve = None
        g = _groupe_de(bloc, n_l, n_m) if ancien.important else [n_m]
        for k in range(ESSAIS_MOT):
            gr = int(graine) * 31 + 977 * (k + 1) + 13 * n_l + n_m
            seul = _ecrire_une_fois(ancien.texte, main, gr, encre, outil, contexte, verifier=len(g) == 1)
            mots = [m for l in seul.lignes for m in l]
            if len(mots) != 1 or seul.douteux:
                continue
            nouveau = mots[0]
            nouveau.espace_avant = ancien.espace_avant
            if len(g) > 1:  # relu dans son groupe, à sa place
                groupe = [nouveau if q == n_m else bloc.lignes[n_l][q] for q in g]
                if _verifier_groupe(groupe)["douteux"]:
                    continue
            trouve = nouveau
            bloc.remplaces.append(f"{ancien.texte} (graine {gr})")
            break
        if trouve is not None:
            bloc.lignes[n_l][n_m] = trouve
            remplaces.append((n_l, n_m))
        else:
            restants.append(lib)
            restants_idx.append((n_l, n_m))
    # deux mots remplacés dans un même groupe : le groupe final est relu tel quel
    if len(remplaces) > 1 and _lecteur():
        vus = set()
        for (n_l, n_m) in remplaces:
            if not bloc.lignes[n_l][n_m].important:
                continue
            g = tuple(_groupe_de(bloc, n_l, n_m))
            if len(g) < 2 or (n_l, g) in vus or sum((n_l, q) in remplaces for q in g) < 2:
                continue
            vus.add((n_l, g))
            r = _verifier_groupe([bloc.lignes[n_l][q] for q in g])
            for k in r["fautifs"] if r["douteux"] else []:
                if (n_l, g[k]) not in restants_idx:
                    restants.append(f"{bloc.lignes[n_l][g[k]].texte} (groupe « "
                                    f"{' '.join(bloc.lignes[n_l][q].texte for q in g)} » lu « {r.get('lu', '?')} »)")
                    restants_idx.append((n_l, g[k]))
    bloc.douteux, bloc.douteux_idx = restants, restants_idx
    return bloc


def ecrire_bloc(texte: str, main: str, graine: int, encre: str | None = None, outil: str | None = None,
                essais: int = ESSAIS_BLOC, contexte: dict | None = None) -> Bloc:
    """Écrit `texte` (« \\n » = nouvelle ligne) dans la main donnée. Une ligne de sortie par ligne
    de texte, sans césure : la mise en page est faite par le moteur des pages.

    Chaque mot est vérifié (relecture de N2, `lu`) ; les mots importants (`importants.important`,
    avec `contexte` = {'ingredients': [...], 'noms': [...]} de la recette en cours) le sont sans
    aucune tolérance et relus dans leur groupe (« 180 g »). Un mot douteux est d'abord réécrit seul
    avec d'autres graines ; s'il en reste, le bloc entier est réécrit avec une autre graine (jusqu'à
    `essais` fois) et l'on garde l'essai qui a le moins de mots douteux (la liste reste dans
    `Bloc.douteux`)."""
    meilleur = None
    for k in range(max(1, essais)):
        g = int(graine) + 7919 * k
        bloc = _ecrire_une_fois(texte, main, g, encre, outil, contexte)
        if bloc.douteux:
            bloc = _reecrire_mots(bloc, main, g, encre, outil, contexte)
        if not bloc.douteux:
            return bloc
        if meilleur is None or len(bloc.douteux) < len(meilleur.douteux):
            meilleur = bloc
    return meilleur


# =============================================================================================
# Relecture de l'encre RENDUE (cuisson, lot P2) : relire_rendu(encre_rgba, mots_places)
# =============================================================================================
_CACHE_RENDU: dict | None = None
CACHE_RENDU = OUTIL / ".cache" / "relire-rendu-v2.json"


def gris_sur_blanc(encre: np.ndarray) -> np.ndarray:
    """Calque d'encre RGBA (couleur du pigment + alpha, composé « over ») → niveaux de gris sur fond
    blanc (255). Une image RGB (déjà composée sur le papier) est simplement passée en gris, le papier
    ramené au blanc."""
    a = np.asarray(encre)
    if a.ndim == 2:
        return a.astype(np.float32)
    lum = a[..., :3].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    if a.shape[2] == 4:
        al = a[..., 3].astype(np.float32) / 255.0
        return 255.0 * (1 - al) + lum * al
    fond = float(np.percentile(lum, 90)) if lum.size else 255.0
    return np.clip(lum / max(fond, 1.0) * 255.0, 0, 255)


def _boite_xyxy(b) -> tuple[float, float, float, float]:
    x, y, w, h = (float(v) for v in b)
    return x, y, x + w, y + h


def _groupes_places(mots_places: list[dict], drapeaux: list[bool]) -> list[list[int]]:
    """Groupes de lecture parmi les mots posés : mêmes règles que `_groupes`, entre mots voisins dans
    la liste, sur la même ligne (même `ligne` et même `bloc` s'ils sont donnés, sinon boîtes qui se
    chevauchent en hauteur et écart horizontal de moins de 2 hauteurs de boîte)."""
    def voisins(a, b):
        ma, mb = mots_places[a], mots_places[b]
        for cle in ("ligne", "bloc"):
            if cle in ma and cle in mb and ma[cle] != mb[cle]:
                return False
        ax0, ay0, ax1, ay1 = _boite_xyxy(ma["boite"])
        bx0, by0, bx1, by1 = _boite_xyxy(mb["boite"])
        h = max(ay1 - ay0, by1 - by0, 1.0)
        return min(ay1, by1) - max(ay0, by0) > 0.2 * h and -0.5 * h < bx0 - ax1 < 2.0 * h

    textes = [str(m.get("texte", "")) for m in mots_places]
    out = []
    debut = 0
    for i in range(1, len(textes) + 1):  # suites de mots voisins, puis groupes dans chaque suite
        if i == len(textes) or not voisins(i - 1, i):
            for g in _groupes(textes[debut:i], drapeaux[debut:i]):
                out.append([debut + k for k in g])
            debut = i
    return out


def mots_places(mots, echelle: float = 1.0, contexte: dict | None = None, barres=()) -> list[dict]:
    """MotPose de la mise en page (texte, boite (x0, y0, x1, y1) en px de page, ligne, bloc) → entrée
    de `relire_rendu` pour une image rendue à `echelle` (2 à la cuisson). `barres` : indices (dans
    `mots`) des mots raturés exprès, à ne pas relire."""
    out = []
    barres = set(barres)
    for i, mp in enumerate(mots):
        x0, y0, x1, y1 = (float(v) for v in mp.boite)
        texte = str(mp.texte)
        out.append(dict(texte=texte, boite=(x0 * echelle, y0 * echelle, (x1 - x0) * echelle, (y1 - y0) * echelle),
                        important=IMP.important(texte, contexte) and i not in barres,
                        ligne=getattr(mp, "ligne", None), bloc=getattr(mp, "bloc", None), barre=i in barres))
    return out


def relire_rendu(encre_rgba: np.ndarray, mots_places: list[dict], contexte: dict | None = None,
                 cache: bool = True) -> list[dict]:
    """Relit sur l'ENCRE RENDUE (après le modèle d'encre et le papier) les mots importants posés sur
    la page, et renvoie les douteux (liste vide = tout est bien lu).

    encre_rgba : calque d'encre de la page (H, W, 4) uint8, tel que `rendu_encre.composer` le rend
        (RGB composé sur le papier accepté aussi) ;
    mots_places : [{texte, boite: (x, y, w, h) en px DE CETTE IMAGE, important: bool,
        ligne?: n° de ligne, bloc?: id du bloc, barre?: bool}] dans l'ordre de lecture. `important`
        absent : calculé par `importants.important(texte, contexte)`. Un mot raturé exprès
        (`barre: True`) n'est pas relu. `mots_places(mise.mots, echelle)` fabrique cette liste depuis
        les MotPose de la mise en page.

    Les mots importants voisins se relisent ensemble (« 180 g », « 4 °C », « 40 min ») : la boîte du
    groupe est recadrée, passée en gris sur blanc, puis relue par le même lecteur TrOCR, forcé sur le
    texte voulu et comparé à ses variantes (chiffres voisins, sosies 0 → o/c/C, lettre ou chiffre en
    moins, unité absente ou déformée). Chaque douteux : {texte, mots: [indices dans mots_places],
    boite: (x, y, w, h), lu: lecture libre du lecteur, raison, ecart, variante}."""
    if not mots_places or not _lecteur():
        return []
    gris = gris_sur_blanc(encre_rgba)
    H, W = gris.shape
    drapeaux = [False if m.get("barre") else
                bool(m["important"]) if "important" in m else IMP.important(str(m.get("texte", "")), contexte)
                for m in mots_places]
    douteux = []
    for g in _groupes_places(mots_places, drapeaux):
        textes = [str(mots_places[k]["texte"]) for k in g]
        bs = [_boite_xyxy(mots_places[k]["boite"]) for k in g]
        x0, y0 = min(b[0] for b in bs), min(b[1] for b in bs)
        x1, y1 = max(b[2] for b in bs), max(b[3] for b in bs)
        hb = max(y1 - y0, 1.0)
        xh = hb / 2.3  # hauteur d'x estimée (boîte ≈ hampes + corps + jambages)
        m_ = 0.7 * xh
        X0, Y0 = max(0, int(math.floor(x0))), max(0, int(math.floor(y0)))
        X1, Y1 = min(W, int(math.ceil(x1))), min(H, int(math.ceil(y1)))
        if X1 - X0 < 2 or Y1 - Y0 < 2:
            continue
        crop = gris[Y0:Y1, X0:X1]
        pad = int(round(m_))
        can = np.full((crop.shape[0] + 2 * pad, crop.shape[1] + 2 * pad), 255, np.float32)
        can[pad:pad + crop.shape[0], pad:pad + crop.shape[1]] = crop
        r = _lire_image(can, textes, [drapeaux[k] for k in g], "rendu" if cache else None)
        if r["douteux"]:
            douteux.append(dict(texte=" ".join(textes), mots=list(g), boite=(x0, y0, x1 - x0, y1 - y0),
                                lu=r.get("lu"), raison=r.get("raison"), ecart=r.get("ecart"), seuil=r.get("seuil"),
                                variante=r.get("variante")))
    return douteux


def nuances(encre: str, outil: str | None = None) -> dict:
    """Nuances d'une encre (chargée / claire) et son outil par défaut."""
    try:
        import encre as M
        info = M.ENCRES[encre]
        return dict(id=encre, outil=outil or info["outil"], charge=info["charge"], clair=info["clair"])
    except Exception:  # repli
        return dict(id=encre, outil=outil or "bille", charge="#2e2e49", clair="#6c6b84")


def encrer_traits(traits: list, encre: str, outil: str | None, graine: int, main: str = "soignee",
                  proteger: bool = False) -> list:
    """Encre des tracés faits main du moteur (ratures, soulignés, accolades…) avec le modèle
    d'encre de N2 : `traits` = [(n, 4) x, y, pression, vitesse] en hauteurs d'x. Renvoie (n, 5).
    `proteger` : tracé qui fait partie d'un mot important (barre de fraction de « 5/6 », signe
    ajouté à un nombre) : jamais de saut de bille."""
    valides = [np.asarray(t, float) for t in traits if len(t)]
    if not valides:
        return []
    try:
        import encre as M
        res = {"style": MAINS_N2.get(main, main),
               "lignes": [{"mots": [{"traits": [t[:, :4].tolist() for t in valides], "important": bool(proteger)}]}]}
        M.encrer(res, encre, outil, int(graine))
        return [np.asarray(t, float) for t in res["lignes"][0]["mots"][0]["traits"]]
    except Exception:
        return [_repli_encre(t) for t in valides]
