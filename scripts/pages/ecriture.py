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


def _lecteur():
    global _LECTEUR
    if _LECTEUR is None:
        import lecteur
        _LECTEUR = lecteur.Lecteur() if lecteur.disponible() else False
    return _LECTEUR


def _chiffres_douteux(mot: Mot) -> str | None:
    """Les chiffres ne sont pas relus par N2 (« 180 » sorti « 100 », « 120 » sorti « 170 ») :
    on relit le mot avec le relecteur de N2 (TrOCR) en comparant le nombre voulu à toutes ses
    variantes à un chiffre près. Renvoie la lecture préférée si ce n'est pas le nombre voulu."""
    w = mot.texte
    if not any(c.isdigit() for c in w):
        return None
    L = _lecteur()
    if not L:
        return None
    try:
        import lecteur as LM
        alts = [w] + sorted({w[:i] + d + w[i + 1:] for i, c in enumerate(w) if c.isdigit() for d in "0123456789" if d != c})
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


def _ecrire_une_fois(texte, main, graine, encre, outil) -> Bloc:
    E = _mod()
    style = MAINS_N2.get(main, main)
    res = E.ecrire(texte, style=style, graine=int(graine), largeur_max=None, encre=encre, outil=outil)
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
                      debord_g=max(0.0, -float(xs.min())), debord_d=max(0.0, float(xs.max()) - larg))
            lu = m.get("lu")
            if lu is not None and not all(lu if isinstance(lu, list) else [lu]):
                douteux.append(m["texte"])
                idx.append((n_l, len(mots)))
            else:
                autre = _chiffres_douteux(mot)
                if autre:
                    douteux.append(f"{m['texte']} (lu « {autre} »)")
                    idx.append((n_l, len(mots)))
            mots.append(mot)
            prec = x1
        lignes.append(mots)
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


def _reecrire_mots(bloc: Bloc, main, graine, encre, outil) -> Bloc:
    """Réécrit seul chaque mot douteux (autre graine, même main, même encre) jusqu'à ce qu'il se
    relise bien ; le mot réécrit garde sa place dans la ligne (l'espace qui le précède)."""
    restants, restants_idx = [], []
    for (n_l, n_m), lib in zip(bloc.douteux_idx, bloc.douteux):
        ancien = bloc.lignes[n_l][n_m]
        trouve = None
        for k in range(ESSAIS_MOT):
            g = int(graine) * 31 + 977 * (k + 1) + 13 * n_l + n_m
            seul = _ecrire_une_fois(ancien.texte, main, g, encre, outil)
            mots = [m for l in seul.lignes for m in l]
            if len(mots) == 1 and not seul.douteux:
                trouve = mots[0]
                trouve.espace_avant = ancien.espace_avant
                bloc.remplaces.append(f"{ancien.texte} (graine {g})")
                break
        if trouve is not None:
            bloc.lignes[n_l][n_m] = trouve
        else:
            restants.append(lib)
            restants_idx.append((n_l, n_m))
    bloc.douteux, bloc.douteux_idx = restants, restants_idx
    return bloc


def ecrire_bloc(texte: str, main: str, graine: int, encre: str | None = None, outil: str | None = None,
                essais: int = ESSAIS_BLOC) -> Bloc:
    """Écrit `texte` (« \\n » = nouvelle ligne) dans la main donnée. Une ligne de sortie par ligne
    de texte, sans césure : la mise en page est faite par le moteur des pages.

    Chaque mot est vérifié (relecture de N2, `lu`, et chiffres relus à un chiffre près). Un mot
    douteux est d'abord réécrit seul avec d'autres graines ; s'il en reste, le bloc entier est
    réécrit avec une autre graine (jusqu'à `essais` fois) et l'on garde l'essai qui a le moins de
    mots douteux (la liste reste dans `Bloc.douteux`)."""
    meilleur = None
    for k in range(max(1, essais)):
        g = int(graine) + 7919 * k
        bloc = _ecrire_une_fois(texte, main, g, encre, outil)
        if bloc.douteux:
            bloc = _reecrire_mots(bloc, main, g, encre, outil)
        if not bloc.douteux:
            return bloc
        if meilleur is None or len(bloc.douteux) < len(meilleur.douteux):
            meilleur = bloc
    return meilleur


def nuances(encre: str, outil: str | None = None) -> dict:
    """Nuances d'une encre (chargée / claire) et son outil par défaut."""
    try:
        import encre as M
        info = M.ENCRES[encre]
        return dict(id=encre, outil=outil or info["outil"], charge=info["charge"], clair=info["clair"])
    except Exception:  # repli
        return dict(id=encre, outil=outil or "bille", charge="#2e2e49", clair="#6c6b84")


def encrer_traits(traits: list, encre: str, outil: str | None, graine: int, main: str = "soignee") -> list:
    """Encre des tracés faits main du moteur (ratures, soulignés, accolades…) avec le modèle
    d'encre de N2 : `traits` = [(n, 4) x, y, pression, vitesse] en hauteurs d'x. Renvoie (n, 5)."""
    valides = [np.asarray(t, float) for t in traits if len(t)]
    if not valides:
        return []
    try:
        import encre as M
        res = {"style": MAINS_N2.get(main, main),
               "lignes": [{"mots": [{"traits": [t[:, :4].tolist() for t in valides]}]}]}
        M.encrer(res, encre, outil, int(graine))
        return [np.asarray(t, float) for t in res["lignes"][0]["mots"][0]["traits"]]
    except Exception:
        return [_repli_encre(t) for t in valides]
