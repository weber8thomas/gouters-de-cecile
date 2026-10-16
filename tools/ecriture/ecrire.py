#!/usr/bin/env python3
"""Écriture manuscrite générée trait par trait — « Les goûters de Cécile ».

    python tools/ecriture/ecrire.py --style soignee --graine 4127 --largeur 14 "Le cake citron de Julie"
    python tools/ecriture/ecrire.py --style mamie --svg apercu.svg "3 œufs, 120 g de sucre"

API :
    from ecrire import ecrire
    page = ecrire("Le cake citron de Julie", style="soignee", graine=4127, largeur_max=14)

Chaque mot est écrit par un réseau de synthèse d'écriture (Graves 2013, poids MIT) amorcé
par une ligne d'écriture réelle (la « main » du style) ; on tire plusieurs candidats par mot
et on garde le plus lisible ; les accents sont ajoutés en traits ; la mise en page (césure,
dérive de ligne, espaces) est faite ici. Sortie en unités de hauteur d'x, y vers le bas.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from dataclasses import dataclass, field, replace
from pathlib import Path

ICI = Path(__file__).resolve().parent
if str(ICI) not in sys.path:
    sys.path.insert(0, str(ICI))

import moteur  # noqa: E402  (fixe les fils BLAS avant NumPy)
import numpy as np  # noqa: E402

import diacritiques as dia  # noqa: E402
import encre as encre_mod  # noqa: E402
import lecteur as lecteur_mod  # noqa: E402
from styles import STYLES, Style  # noqa: E402
from texte import Mot, decouper  # noqa: E402

VERSION = 26  # version du tracé : à incrémenter quand le rendu change (invalide le cache)
CACHE = ICI / ".cache"

LETTRES_X = set("acemnorsuvwxz")
JAMBAGES = set("gjpqyf,;()JYGZ")  # (capitales cursives à jambage comprises)
HAMPES = set("bdfhklt'\"!?/()[0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") | set("#%")
# durée relative d'écriture de chaque caractère (pour repérer une lettre sautée ou bégayée)
DUREE = {c: 1.0 for c in "abcdeghknopqsuvxyz"}
DUREE.update({"m": 1.5, "w": 1.5, "i": 0.65, "l": 0.75, "t": 0.85, "r": 0.8, "f": 1.0, "j": 0.8,
              ".": 0.35, ",": 0.4, "'": 0.4, '"': 0.5, "-": 0.5, "!": 0.6, "?": 0.9, ":": 0.45,
              ";": 0.55, "/": 0.5, "(": 0.5, ")": 0.5, "M": 1.7, "W": 1.7, "I": 0.7, " ": 0.6})


def _duree(c: str) -> float:
    if c in DUREE:
        return DUREE[c]
    if c.isupper():
        return 1.3
    if c.isdigit():
        return 0.9
    return 1.0


# =============================================================================================
# Le réseau et les mains
# =============================================================================================
@dataclass
class Main:
    style: Style
    etat: dict  # état du réseau après lecture de l'amorce
    xh: float  # hauteur d'x en unités brutes
    pente: float  # tangente de l'inclinaison naturelle des lettres
    largeur_car: float  # largeur moyenne d'un caractère (hauteurs d'x)


class Ecrivain:
    """Garde le réseau et les mains en mémoire (une instance par processus)."""

    _instance: "Ecrivain | None" = None

    @classmethod
    def get(cls) -> "Ecrivain":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.modele = moteur.Modele()
        d = np.load(moteur.POIDS / "amorces.npz")
        self.amorces = {}
        i = 0
        while f"amorce{i}_offsets" in d.files:
            self.amorces[i] = (d[f"amorce{i}_offsets"].astype(np.float32), str(d[f"amorce{i}_texte"]))
            i += 1
        self.mains: dict[str, Main] = {}
        self._lecteur = None

    def lecteur(self):
        if self._lecteur is None:
            self._lecteur = lecteur_mod.Lecteur()
        return self._lecteur

    # -- mains -----------------------------------------------------------------------------
    def _amorce(self, style: Style):
        """Offsets et texte de l'amorce : n° d'une ligne d'IAM-OnDB (via Grzego) ou nom d'une
        amorce « maison » (tools/ecriture/amorces/<nom>.npz, voir amorces_maison.py)."""
        if isinstance(style.amorce, str):
            d = np.load(ICI / "amorces" / f"{style.amorce}.npz")
            return d["offsets"].astype(np.float32), str(d["texte"])
        return self.amorces[style.amorce]

    def main(self, style: Style) -> Main:
        signature = [VERSION, style.dict()]
        if isinstance(style.amorce, str):
            signature.append(hashlib.sha1((ICI / "amorces" / f"{style.amorce}.npz").read_bytes()).hexdigest())
        cle = _hash(signature)
        if cle in self.mains:
            return self.mains[cle]
        f = CACHE / "mains" / f"{style.nom}-{cle[:12]}.npz"
        if f.exists():
            d = np.load(f)
            etat = {k[6:]: d[k] for k in d.files if k.startswith("etat__")}
            etat["n_amorce"] = int(d["n_amorce"])
            etat["texte"] = str(d["texte"])
            m = Main(style, etat, float(d["xh"]), float(d["pente"]), float(d["largeur_car"]))
        else:
            offs, txt = self._amorce(style)
            offs = offs.copy()
            offs[:, :2] *= style.echelle_amorce
            etat = self.modele.amorcer(offs, txt)
            xh, pente, lc = self._etalonner(style, etat)
            m = Main(style, etat, xh, pente, lc)
            f.parent.mkdir(parents=True, exist_ok=True)
            np.savez(f, **{f"etat__{k}": v for k, v in etat.items() if isinstance(v, np.ndarray)},
                     n_amorce=etat["n_amorce"], texte=etat["texte"], xh=xh, pente=pente, largeur_car=lc)
        self.mains[cle] = m
        return m

    def _etalonner(self, style: Style, etat: dict):
        """Mesure la hauteur d'x, la pente et la chasse de la main sur des mots témoins."""
        mots = ["nous", "avons", "sucre", "caramel", "versez", "encore", "amour", "crème", "cuire", "oranges"]
        mots = [m.replace("è", "e") for m in mots]
        dem = [(m, style.biais, moteur.graine_de("etalon", style.nom, m, k)) for m in mots for k in range(2)]
        traces = self.modele.ecrire_lot(dem, amorce=etat, garde=900, fin=SUITE, marge_fin=ARRET,
                                        fin_par_position=True)
        xhs, pentes, larg = [], [], []
        for tr in traces:
            if not tr.fini or len(tr.points) < 10:
                continue
            P, car = tr.points, tr.car
            m = (car > -0.5) & (car < len(tr.texte) - 0.5)
            if m.sum() < 8:
                continue
            y = P[m, 1]
            xhs.append(np.percentile(y, 92) - np.percentile(y, 8))
            pentes.append(_pente_lettres(P[m]))
            larg.append((P[m, 0].max() - P[m, 0].min()) / len(tr.texte))
        xh = float(np.median(xhs)) if xhs else 60.0
        pente = float(np.median(pentes)) if pentes else 0.0
        lc = float(np.median(larg)) / xh if larg else 1.0
        return xh, pente, lc

    # -- génération ---------------------------------------------------------------------------
    def ecrire_segments(self, main: Main, demandes: list[tuple[str, int]], biais: float, n_cand: int,
                        lecteur=None):
        """demandes : (texte, graine). Renvoie pour chacune le meilleur candidat analysé.

        Sans lecteur : le meilleur selon le score géométrique (`analyser`).
        Avec lecteur (TrOCR) : on relit les candidats deux par deux, dans l'ordre du score, et
        on s'arrête dès qu'un candidat se lit bien ; sinon on en redemande (3 tentatives)."""
        n = len(demandes)
        n_cand0 = n_cand
        meilleur: list[dict | None] = [None] * n
        restants = list(range(n))
        for tentative in range(TENTATIVES):
            if not restants:
                break
            b = biais + 0.3 * tentative
            if tentative:
                n_cand = n_cand0 * 2  # peu de mots à reprendre : deux fois plus de tirages, même coût
            traces = [None] * (len(restants) * n_cand)
            # le mot fictif qui suit dépend de la ponctuation (après un point : majuscule)
            for suite in (SUITE, SUITE_PHRASE):
                dem, pos = [], []
                for j, i in enumerate(restants):
                    txt, g = demandes[i]
                    if (suite == SUITE_PHRASE) != (txt[-1:] in ".!?"):
                        continue
                    for k in range(n_cand):
                        dem.append((txt, b, moteur.graine_de(g, k, tentative)))
                        pos.append(j * n_cand + k)
                if not dem:
                    continue
                res = self.modele.ecrire_lot(dem, amorce=main.etat, garde=8 * main.xh, fin=suite,
                                             marge_fin=ARRET, fin_par_position=True)
                for p_, r_ in zip(pos, res):
                    traces[p_] = r_
            cands = {}
            for j, i in enumerate(restants):
                cs = [analyser(t, main) for t in traces[j * n_cand : (j + 1) * n_cand]]
                cs = sorted([c for c in cs if c is not None], key=lambda c: c["score"])
                cands[i] = [c for c in cs if c["score"] < 25] or cs[:1]
                for c in cands[i]:
                    c["valeur"] = -c["score"]
            if lecteur is None:
                for i in restants:
                    if cands[i] and (meilleur[i] is None or cands[i][0]["valeur"] > meilleur[i]["valeur"]):
                        meilleur[i] = cands[i][0]
                restants = [i for i in restants if meilleur[i] is None or meilleur[i]["score"] > SEUIL_REESSAI]
                continue
            accepte = set()
            # chiffres, fractions, lettre seule : TrOCR les lit mal, on garde le choix géométrique
            for i in restants:
                if not _a_relire(demandes[i][0]) and cands[i]:
                    if meilleur[i] is None or cands[i][0]["valeur"] > meilleur[i]["valeur"]:
                        meilleur[i] = cands[i][0]
                    accepte.add(i)
            refs = lecteur.references(sorted({demandes[i][0] for i in restants if i not in accepte}))
            for r in range(0, n_cand, 2):  # deux candidats par mot et par tour (images bien remplies)
                items, ref = [], []
                for i in restants:
                    if i in accepte:
                        continue
                    for c in cands[i][r : r + 2]:
                        traits = [Q for Q, _ in c["traits"]] + completer(c, set(), main.pente, np.random.default_rng(0))
                        items.append((c["texte"], traits))
                        ref.append((i, c))
                if not items:
                    break
                def jetons_lus(premiers, ref_premiers):
                    # chaque jeton que le lecteur reconnaît dans la police propre doit être (presque)
                    # son premier choix ici ; un seul écart toléré pour les mots d'au moins 3 jetons
                    rates = sum(1 for p_, r_ in zip(premiers, ref_premiers) if r_ and not p_)
                    return rates == 0 or (rates == 1 and len(premiers) >= 3)

                def accepter(mot, nt):
                    ref_note, ref_premiers, _ = refs[mot]
                    return jetons_lus(nt[1], ref_premiers) and nt[0] - ref_note > seuil_lecture(mot)

                for (i, c), (note, premiers, amput) in zip(ref, lecteur.noter(items, accepter)):
                    ref_note, ref_premiers, ref_amput = refs[c["texte"]]
                    ecart = note - ref_note
                    # lu comme le mot attendu : chaque jeton que le lecteur reconnaît dans la
                    # police propre doit aussi être son premier choix ici, et le mot amputé
                    # d'une lettre ne doit pas se lire mieux (que dans la police propre)
                    lu = jetons_lus(premiers, ref_premiers)
                    if amput is not None and amput > max(0.0, ref_amput or 0.0) + 0.3:
                        lu = False
                        ecart -= amput
                    c["lecture"] = round(ecart, 2)
                    c["lu"] = lu
                    c["valeur"] = min(ecart, 0.0) - 0.25 * c["score"] - (0.0 if lu else 2.5)
                    if meilleur[i] is None or c["valeur"] > meilleur[i]["valeur"]:
                        meilleur[i] = c
                    if lu and ecart > seuil_lecture(c["texte"]):
                        accepte.add(i)
            restants = [i for i in restants if i not in accepte]
        return meilleur


TENTATIVES = 3


def _a_relire(texte: str) -> bool:
    return sum(c.isalpha() for c in texte) >= 2


def seuil_lecture(texte: str) -> float:
    """Écart toléré entre log P(texte | image) et la note du même texte écrit dans une police
    manuscrite propre : au-dessus, le mot est considéré comme bien lu."""
    return -1.4 - 0.1 * len(texte)


SEUIL_REESSAI = 4.0
# L'attention du réseau devance un peu la lettre qu'il trace : on la retarde d'autant pour
# attribuer chaque point à sa lettre ; les traits dont l'attention a dépassé la fin du mot de
# plus de FIN_MOT appartiennent au mot suivant (fictif) ou sont des points/barres retardés.
AVANCE = 0.35
FIN_MOT = 0.6
SUITE = " the"  # mot fictif qui suit : le réseau finit le mot comme au milieu d'une ligne
SUITE_PHRASE = " The"  # … après . ! ? (sinon le point devient virgule)
ARRET = 1.15  # on arrête quand l'attention arrive sur le mot fictif


def _hash(obj) -> str:
    return hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _pente_lettres(P: np.ndarray) -> float:
    """Tangente de l'inclinaison des pleins (traits qui descendent), + = penche à droite."""
    d = np.diff(P[:, :2], axis=0)
    ok = (P[:-1, 2] < 0.5) & (np.abs(d[:, 1]) > 2.0 * np.abs(d[:, 0])) & (np.abs(d[:, 1]) > 1e-6)
    if ok.sum() < 5:
        return 0.0
    t = -d[ok, 0] / d[ok, 1]
    w = np.abs(d[ok, 1])
    o = np.argsort(t)
    cw = np.cumsum(w[o])
    return float(np.clip(t[o][np.searchsorted(cw, cw[-1] / 2)], -0.8, 0.8))


# =============================================================================================
# Analyse d'un candidat : nettoyage, normalisation, score de lisibilité
# =============================================================================================
def analyser(tr: moteur.Trace, main: Main) -> dict | None:
    P, car, texte = tr.points, tr.car, tr.texte
    L = len(texte)
    if len(P) < 3:
        return None
    fins = np.where(P[:, 2] > 0.5)[0]
    debuts = np.r_[0, fins[:-1] + 1]
    traits = [(a, b + 1) for a, b in zip(debuts, fins) if b + 1 > a]
    dans = []  # traits écrits pendant le mot
    apres = []  # traits retardés (points sur i, barres de t…) ou parasites
    rejetes = 0
    avant = []
    for a, b in traits:
        c = float(np.median(car[a:b]))
        if c < -0.45:
            avant.append((a, b))  # tracé « avant » le mot : souvenir de l'amorce… ou 1re lettre
        elif c > L + FIN_MOT:
            apres.append((a, b))
        else:
            dans.append((a, b))
    # la 1re lettre est parfois tracée alors que l'attention n'a pas encore quitté l'espace :
    # on la garde si elle est grande et collée au reste du mot ; les petits signes isolés partent
    if dans:
        x_suite = P[dans[0][0] : dans[0][1], 0].min()
        for a, b in reversed(avant):
            Q = P[a:b, :2]
            if max(np.ptp(Q[:, 0]), np.ptp(Q[:, 1])) > 0.5 * main.xh and Q[:, 0].max() > x_suite - 0.5 * main.xh:
                dans.insert(0, (a, b))
                x_suite = min(x_suite, Q[:, 0].min())
            else:
                rejetes += 1
    else:
        rejetes += len(avant)
    # grand trait qui revient loin en arrière après coup (le réseau « barre » un mot fantôme) :
    # parasite. Les vrais retours (barre de t, point, accent, 2e trait d'un x) sont petits.
    propres = []
    x_max = -1e9
    for a, b in dans:
        Q = P[a:b, :2]
        taille = max(np.ptp(Q[:, 0]), np.ptp(Q[:, 1]))
        if x_max > -1e8 and Q[:, 0].max() < x_max - 1.0 * main.xh and taille > 0.75 * main.xh:
            rejetes += 1
            continue
        propres.append((a, b))
        x_max = max(x_max, Q[:, 0].max())
    dans = propres
    if not dans:
        return None
    # petit point posé avant le début du mot (souvenir de l'amorce) : parasite
    gros = [(a, b) for a, b in dans if max(np.ptp(P[a:b, 0]), np.ptp(P[a:b, 1])) > 0.3 * main.xh]
    if gros:
        x_debut = min(P[a:b, 0].min() for a, b in gros)
        avant = len(dans)
        x_fin = max(P[a:b, 0].max() for a, b in gros)
        # … et petits points posés après la fin du mot (la ponctuation est dessinée à part)
        dans = [(a, b) for a, b in dans if (a, b) in gros or
                (P[a:b, 0].mean() > x_debut - 0.25 * main.xh and P[a:b, 0].mean() < x_fin + 0.2 * main.xh)]
        rejetes += avant - len(dans)
    xs = np.concatenate([P[a:b, 0] for a, b in dans])
    x0, x1 = xs.min(), xs.max()
    xh = main.xh
    garde = []
    for a, b in apres:
        # dernière lettre finie après le passage de l'attention, point final, barre de t,
        # point sur i… gardés s'ils restent collés au mot ; le reste est un début de mot fantôme
        Q = P[a:b, :2]
        w, h = np.ptp(Q[:, 0]), np.ptp(Q[:, 1])
        cx = Q[:, 0].mean()
        if max(w, h) < 0.75 * xh and x0 - 0.3 * xh < cx < x1 + 0.15 * xh:
            garde.append((a, b))
        else:
            rejetes += 1
    traits = dans + garde
    sel = np.concatenate([np.arange(a, b) for a, b in traits])
    Pk, ck = P[sel], car[sel] - AVANCE
    idx = np.clip(np.round(ck).astype(int), 0, L - 1)
    sans_j = np.array([c not in JAMBAGES for c in texte])
    lx = np.array([c in LETTRES_X for c in texte])
    corps = (ck > -0.5) & (ck < L + 0.2)
    mb = corps & sans_j[idx]
    # ligne de base : médiane des bas de chaque lettre sans jambage (robuste aux points d'un
    # J ou d'un y attribués par erreur à la lettre voisine)
    bas_lettres = []
    for j in range(L):
        if texte[j] in LETTRES_X:
            m = corps & (idx == j)
            if m.sum() >= 3:
                bas_lettres.append(np.percentile(Pk[m, 1], 90))
    if len(bas_lettres) >= 2:
        base = float(np.median(bas_lettres))
    elif mb.sum() >= 6:
        base = np.percentile(Pk[mb, 1], 93)
    else:
        base = np.percentile(Pk[corps, 1] if corps.sum() > 3 else Pk[:, 1], 60) + 0.3 * xh
    mx = corps & lx[idx]
    facteur = 1.0
    if mx.sum() >= 10:
        xh_mot = np.percentile(Pk[mx, 1], 92) - np.percentile(Pk[mx, 1], 8)
        facteur = float(np.clip(xh_mot / xh, 0.75, 1.3) ** 0.5)
    ech = xh * facteur
    # redressement du mot (le réseau écrit parfois en pente) : régression sur le bas des lettres
    bas_x, bas_y = [], []
    for j in range(L):
        if texte[j] in JAMBAGES or texte[j] == " ":
            continue
        m = corps & (idx == j)
        if m.sum() >= 3:
            bas_x.append(Pk[m, 0].mean())
            bas_y.append(np.percentile(Pk[m, 1], 90))
    angle = 0.0
    if len(bas_x) >= 3 and np.ptp(bas_x) > 1.5 * xh:
        pente = np.polyfit(bas_x, bas_y, 1)[0]
        a = math.atan(pente)
        if abs(a) < math.radians(9):
            angle = -0.75 * a
    Q = Pk[:, :2].copy()
    Q[:, 0] -= x0
    Q[:, 1] -= base
    if angle:
        ca, sa = math.cos(angle), math.sin(angle)
        Q = np.stack([Q[:, 0] * ca - Q[:, 1] * sa, Q[:, 0] * sa + Q[:, 1] * ca], 1)
    Q /= ech
    Q[:, 0] -= Q[:, 0].min()
    # --- score (plus bas = mieux) ---------------------------------------------------------
    score = 0.0 if tr.fini else 40.0
    score += 1.5 * rejetes
    # durée passée sur chaque lettre : lettre sautée, bégayée, ou gribouillis
    d = np.array([(idx[corps] == j).sum() for j in range(L)], float)
    e = np.array([_duree(c) for c in texte])
    vit = np.median(d / e) if L else 1.0
    if vit > 0:
        r = np.log((d + 1.0) / (e * vit + 1.0))
        score += 2.5 * float(np.mean(r**2)) + 1.2 * float(np.max(np.abs(r)))
    score += 3.0 * float((d[e >= 0.8] <= 2).sum())
    # géométrie : rien ne doit partir trop haut ou trop bas
    ymin, ymax = Q[:, 1].min(), Q[:, 1].max()
    a_hampe = any(c in HAMPES or c.isupper() for c in texte)
    a_jambe = any(c in JAMBAGES for c in texte)
    score += 4.0 * max(0.0, -ymin - (3.0 if a_hampe else 1.75))
    score += 4.0 * max(0.0, ymax - (2.3 if a_jambe else 0.75))
    # barres de t, points sur i et j : sans eux, « sachet » se lit « sachel », « Julie » « Julu ».
    # Il en manque souvent (le réseau les pose « après coup », parfois jamais) : on les note pour
    # les ajouter à la main (`completer`), avec une petite pénalité pour préférer un mot complet.
    segs = []
    k = 0
    for a, b in traits:
        segs.append(Q[k : k + (b - a)])
        k += b - a
    manquants = []
    for j, c in enumerate(texte):
        if c not in "tij":
            continue
        m = idx == j
        if m.sum() < 2:
            continue
        if not _a_point_ou_barre(segs, c, Q[m], main.pente):
            manquants.append(j)
            score += 0.8 if c == "t" else 0.3
    larg = Q[:, 0].max() / max(L, 1)
    score += 6.0 * float(np.log(max(larg, 1e-3) / main.largeur_car) ** 2)
    # traits isolés
    out_traits = []
    k = 0
    for a, b in traits:
        n = b - a
        out_traits.append((Q[k : k + n], ck[k : k + n]))
        k += n
    return dict(texte=texte, traits=out_traits, score=score, fini=tr.fini, largeur=float(Q[:, 0].max()),
                manquants=manquants)


def _a_point_ou_barre(segs, c, P, pente) -> bool:
    """La lettre (points P) a-t-elle déjà son point (i, j) ou sa barre (t) ?"""
    cx = float(np.median(P[:, 0]))
    if c == "t":
        top = P[np.argmin(P[:, 1])]
    for S in segs:
        if len(S) < 1:
            continue
        if c == "t":
            if len(S) < 2:
                continue
            dS = np.diff(S, axis=0)
            y = S[:-1, 1]
            hor = (np.abs(dS[:, 1]) < 0.5 * np.abs(dS[:, 0])) & (y > -1.85) & (y < -0.75)
            if np.abs(dS[hor, 0]).sum() < 0.2:
                continue
            xs = S[:-1][hor, 0]
            ym = float(np.mean(y[hor]))
            x_tige = top[0] - pente * (ym - top[1])
            if xs.min() < x_tige + 0.08 and xs.max() > x_tige - 0.08:
                return True
        elif np.ptp(S[:, 0]) < 0.45 and np.ptp(S[:, 1]) < 0.5 and S[:, 1].mean() < -1.05 \
                and abs(S[:, 0].mean() - cx) < 0.8:
            return True
    return False


def _signe_proche(segs, c, P, pente) -> bool:
    """Critère large (pour ne jamais doubler un point ou une barre)."""
    cx = float(np.median(P[:, 0]))
    for S in segs:
        if c == "t":
            if len(S) < 2:
                continue
            dS = np.diff(S, axis=0)
            y = S[:-1, 1]
            hor = (np.abs(dS[:, 1]) < 0.7 * np.abs(dS[:, 0])) & (y > -2.0) & (y < -0.6) \
                & (S[:-1, 0] > cx - 0.6) & (S[:-1, 0] < cx + 0.7)
            if np.abs(dS[hor, 0]).sum() > 0.15:
                return True
        else:
            if max(np.ptp(S[:, 0]), np.ptp(S[:, 1])) < 0.5 and S[:, 1].mean() < -0.95 \
                    and abs(S[:, 0].mean() - cx - pente * (-S[:, 1].mean() - 0.5)) < 1.0:
                return True
    return False


def completer(geo: dict, ignorer: set, pente: float, rng) -> list[np.ndarray]:
    """Ajoute les points sur i/j et les barres de t que le réseau n'a pas posés."""
    out = []
    texte = geo["texte"]
    segs = [Q for Q, _ in geo["traits"]]
    for j in geo.get("manquants", []):
        if j in ignorer:
            continue
        P = _points_lettre(geo, j)
        if len(P) < 2:
            continue
        c = texte[j]
        if c == "t":
            if "tt" in texte[max(0, j - 1) : j + 2]:
                continue  # « tt » : une seule barre pour les deux, le réseau la pose déjà
            if _a_point_ou_barre(segs, c, P, pente):
                continue  # la hampe est déjà barrée
        elif _signe_proche(segs, c, P, pente):
            continue  # quelque chose qui y ressemble est déjà là : ne pas doubler
        if c in "ij":
            corps = P[(P[:, 1] > -1.2) & (P[:, 1] < 0.05)]
            if len(corps) < 2:
                corps = P
            cx = float(np.median(corps[:, 0]) + pente * (-np.median(corps[:, 1]) - 0.5))
            y = -1.42 + rng.normal(0, 0.06)
            out.append(dia._point(cx + pente * (-y - 0.5) + rng.normal(0, 0.04), y, rng))
        else:  # t : la hampe est le point le plus haut de la lettre
            top = P[np.argmin(P[:, 1])]
            # barre ratée (petit point au-dessus de la hampe, qui ferait lire un i) : on l'enlève
            geo["traits"] = [(Q, cc) for Q, cc in geo["traits"]
                             if not (max(np.ptp(Q[:, 0]), np.ptp(Q[:, 1])) < 0.25 and -2.1 < Q[:, 1].mean() < -0.85
                                     and abs(Q[:, 0].mean() - top[0]) < 0.45)]
            y = float(np.clip(top[1] * 0.45, -1.35, -1.0)) + rng.normal(0, 0.04)
            xs = top[0] - pente * (y - top[1])
            g = rng.uniform(0.22, 0.32)
            d = rng.uniform(0.26, 0.4)
            pente_barre = rng.normal(-0.05, 0.04)
            out.append(dia._polyline([[xs - g, y + pente_barre * -g], [xs, y + rng.normal(0, 0.012)],
                                      [xs + d, y - pente_barre * d]], 8))
    return out


# =============================================================================================
# Diacritiques, fractions
# =============================================================================================
def _points_lettre(geo, j):
    pts = [Q[np.round(c).astype(int) == j] for Q, c in geo["traits"]]
    pts = [p for p in pts if len(p)]
    return np.vstack(pts) if pts else np.zeros((0, 2))


def poser_marques(geo: dict, marques: list[tuple[int, str]], pente: float, rng) -> list[np.ndarray]:
    nouveaux = []
    texte = geo["texte"]
    for j, nom in marques:
        P = _points_lettre(geo, j)
        if len(P) < 2:  # estimer entre les voisines
            g, d = _points_lettre(geo, j - 1), _points_lettre(geo, j + 1)
            xs = [p[:, 0].mean() for p in (g, d) if len(p)]
            cx = float(np.mean(xs)) if xs else geo["largeur"] / 2
            corps = np.array([[cx, -1.0], [cx, 0.0]])
        else:
            corps = P
        maj = texte[j].isupper()
        # centre de la lettre, ramené à la hauteur du milieu du corps
        ys = corps[:, 1]
        bande = corps[(ys > (-1.9 if maj else -1.05)) & (ys < 0.1)]
        if len(bande) < 2:
            bande = corps
        cx = float(np.median(bande[:, 0]) + pente * (-np.median(bande[:, 1]) - 0.5))
        if texte[j] in "iI" and nom in ("trema", "circonflexe", "aigu", "grave"):
            _enlever_point_du_i(geo, cx, pente)
        if nom == "cedille":
            bas = bande[bande[:, 1] > -0.4]
            cxb = float(np.median(bas[:, 0])) if len(bas) else cx
            nouveaux += dia.marque(nom, cxb, 0, rng, pente=pente, bas=0.0)
            continue
        if maj:
            haut = float(np.clip(np.percentile(corps[:, 1], 3), -2.6, -1.4))
            ech = 0.85
        else:
            haut = float(np.clip(np.percentile(bande[:, 1], 6), -1.2, -0.85))
            ech = 1.0
        cx_haut = cx + pente * (-haut - 0.5)
        nouveaux += dia.marque(nom, cx_haut, haut, rng, pente=pente, echelle=ech)
    return nouveaux


def _enlever_point_du_i(geo: dict, cx: float, pente: float):
    meilleur, dmin = None, 1e9
    for k, (Q, c) in enumerate(geo["traits"]):
        w, h = np.ptp(Q[:, 0]), np.ptp(Q[:, 1])
        y = Q[:, 1].mean()
        if max(w, h) < 0.4 and -2.2 < y < -0.95:
            x = Q[:, 0].mean() - pente * (-y - 0.5)
            dd = abs(x - cx)
            if dd < dmin and dd < 0.9:
                meilleur, dmin = k, dd
    if meilleur is not None:
        geo["traits"].pop(meilleur)


def lier_oe(geo: dict, j: int, recul: float = 0.3) -> dict:
    """« œ » : le e vient chevaucher le o (le réseau a écrit « oe » ; on rapproche le e et la
    suite du mot, en douceur le long de la liaison, sans cassure)."""
    traits = []
    for Q, c in geo["traits"]:
        t = np.clip((c - (j + 0.45)) / 0.4, 0, 1)
        dx = recul * t * t * (3 - 2 * t)
        traits.append((np.column_stack([Q[:, 0] - dx, Q[:, 1]]), c))
    allx = np.concatenate([Q[:, 0] for Q, _ in traits])
    return dict(geo, traits=traits, largeur=float(allx.max() - min(0.0, allx.min())))


def en_fraction(geo: dict, role: str) -> dict:
    """« ½ » : le 1 et le 2 écrits par le réseau, réduits ; le 1 levé (la barre est dessinée)."""
    k = 0.6
    dy = -0.78 if role == "num" else 0.0
    traits = [(Q * k + [0.0, dy], c) for Q, c in geo["traits"]]
    return dict(geo, traits=traits, largeur=geo["largeur"] * k)


# =============================================================================================
# Lissage, vitesse et pression
# =============================================================================================
def _lisser(Q: np.ndarray, passes=2) -> np.ndarray:
    Q = Q.copy()
    if len(Q) < 5:
        return Q
    for _ in range(passes):
        Q[1:-1] = 0.25 * Q[:-2] + 0.5 * Q[1:-1] + 0.25 * Q[2:]
    return Q


def _suréchantillonner(Q: np.ndarray, v: np.ndarray, pas=0.05):
    """Catmull-Rom entre les points du réseau (écart ≤ `pas`), vitesse interpolée."""
    if len(Q) < 2:
        return Q, v
    P = np.vstack([2 * Q[0] - Q[1], Q, 2 * Q[-1] - Q[-2]])
    out, vv = [], []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(1, int(math.ceil(np.linalg.norm(p2 - p1) / pas)))
        for t in np.arange(n) / n:
            t2, t3 = t * t, t * t * t
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
            vv.append(v[i - 1] * (1 - t) + v[i] * t)
    out.append(Q[-1])
    vv.append(v[-1])
    return np.array(out), np.array(vv)


def finir_traits(traits: list[np.ndarray], v_ref: float | None = None) -> list[np.ndarray]:
    """Liste de traits (n,2) → liste de traits (m,4) : x, y, pression, vitesse relative."""
    lisses = []
    vitesses = []
    for Q in traits:
        Q = np.asarray(Q, float)
        if len(Q) == 1:
            Q = np.vstack([Q, Q + [0.02, 0.01]])
        Q = _lisser(Q)
        d = np.linalg.norm(np.diff(Q, axis=0), axis=1)
        v = np.r_[d[0], (d[:-1] + d[1:]) / 2, d[-1]] if len(d) else np.zeros(len(Q))
        lisses.append(Q)
        vitesses.append(v)
    if v_ref is None:
        allv = np.concatenate(vitesses) if vitesses else np.ones(1)
        v_ref = float(np.median(allv[allv > 1e-4])) if (allv > 1e-4).any() else 0.1
    out = []
    for Q, v in zip(lisses, vitesses):
        L = float(np.sum(np.linalg.norm(np.diff(Q, axis=0), axis=1)))
        Qs, vs = _suréchantillonner(Q, v)
        vr = vs / max(v_ref, 1e-4)
        if len(vr) >= 5:
            k = np.array([1, 2, 3, 2, 1], float)
            vr = np.convolve(np.pad(vr, 2, mode="edge"), k / k.sum(), mode="valid")
        p = np.clip(1.12 - 0.38 * vr, 0.32, 1.0)
        if L < 0.12:  # point, virgule : bien appuyé
            p = np.maximum(p, 0.9)
        else:
            # attaque : le stylo se pose (un peu plus fin sur ~0.05 x), fin : il se lève
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Qs, axis=0), axis=1))]
            p *= 0.82 + 0.18 * np.clip(s / 0.06, 0, 1)
            p *= 0.75 + 0.25 * np.clip((s[-1] - s) / 0.08, 0, 1)
        out.append(np.column_stack([Qs, p, vr]))
    return out


# =============================================================================================
# Écriture d'un texte
# =============================================================================================
@dataclass
class MotEcrit:
    mot: Mot
    traits: list[np.ndarray]  # (n,4) dans le repère du mot (ligne de base y=0, x≥0)
    largeur: float
    infos: dict = field(default_factory=dict)


def _ecrire_mots(texte: str, style: Style, graine: int, biais: float, n_cand: int,
                 utiliser_cache: bool = True, relire: bool = True):
    """Génère (ou relit) la géométrie de chaque mot, avant mise en page."""
    relire = relire and lecteur_mod.disponible()
    cle = _hash([VERSION, style.dict(), texte, graine, biais, n_cand, relire])
    f = CACHE / "textes" / f"{style.nom}-{cle[:16]}.json"
    if utiliser_cache and f.exists():  # le réseau n'est même pas chargé
        d = json.loads(f.read_text())
        mots, non_geres = decouper(texte, lambda c: c in d["alphabet"])
        res = []
        for m, dm in zip(mots, d["mots"]):
            res.append(MotEcrit(m, [np.array(t) for t in dm["traits"]], dm["largeur"], dm.get("infos", {})))
        return res, non_geres, True, d.get("pente", 0.0)
    ecr = Ecrivain.get()
    main = ecr.main(style)
    mots, non_geres = decouper(texte, ecr.modele.connait)
    demandes, ou = [], []
    for i, m in enumerate(mots):
        for s, seg in enumerate(m.segments):
            if seg.genre == "reseau":
                ou.append((i, s))
                demandes.append((seg.texte, moteur.graine_de(graine, style.nom, i, s, seg.texte)))
    resultats = ecr.ecrire_segments(main, demandes, biais, n_cand, ecr.lecteur() if relire else None)
    geo_par = {k: r for k, r in zip(ou, resultats)}
    sortie = []
    for i, m in enumerate(mots):
        rng = np.random.default_rng(moteur.graine_de(graine, style.nom, i, "marques"))
        traits_mot: list[np.ndarray] = []
        x = 0.0
        scores, lectures, lus = [], [], []
        fin_trait = None  # x de la fin du dernier trait écrit par le réseau
        for s, seg in enumerate(m.segments):
            if seg.genre == "dessin":
                tr, w = dia.glyphe(seg.texte, rng, pente=main.pente)
                if x > 0:
                    if seg.texte == "x" and fin_trait is not None:
                        x = min(x, fin_trait)  # le x part d'où la lettre précédente s'achève
                    if seg.texte in ".,;:" and traits_mot:
                        # après une écriture penchée, le bas du mot finit avant son haut
                        bas = [t[t[:, 1] > -0.7, 0] for t in traits_mot]
                        bas = [b for b in bas if len(b)]
                        if bas:
                            x = min(x, float(max(b.max() for b in bas)))
                    x += dia.ECART_AVANT.get(seg.texte, 0.12) * float(rng.uniform(0.8, 1.25))
                traits_mot += [t + [x, 0] for t in tr]
                x += w
                continue
            geo = geo_par[(i, s)]
            if geo is None:
                continue
            if seg.role in ("num", "den"):
                geo = en_fraction(geo, seg.role)
            for j, nom in seg.marques:
                if nom == "oe":
                    geo = lier_oe(geo, j)
            scores.append(round(float(geo["score"]), 2))
            if "lecture" in geo:
                lectures.append(geo["lecture"])
                lus.append(bool(geo.get("lu", True)))
            marques = [(j, nom) for j, nom in seg.marques if nom != "oe"]
            extra = poser_marques(geo, marques, main.pente, rng) if marques else []
            extra += completer(geo, {j for j, _ in seg.marques}, main.pente, rng)
            if x > 0:
                x += 0.03 if seg.role == "den" else 0.12
            traits_mot += [Q + [x, 0] for Q, _ in geo["traits"]]
            traits_mot += [Q + [x, 0] for Q in extra]
            principaux = [Q for Q, c in geo["traits"] if len(Q) > 3 and np.ptp(Q[:, 0]) + np.ptp(Q[:, 1]) > 0.4]
            fin_trait = x + float(principaux[-1][-1, 0]) if principaux else None
            x += geo["largeur"]
        finis = finir_traits(traits_mot)
        larg = max((t[:, 0].max() for t in finis), default=0.0)
        sortie.append(MotEcrit(m, finis, float(larg), {"score": scores, "lecture": lectures, "lu": lus}))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({
        "alphabet": "".join(sorted(ecr.modele.alphabet)),
        "pente": main.pente,
        "mots": [{"texte": me.mot.texte, "largeur": me.largeur, "infos": me.infos,
                  "traits": [np.round(t, 4).tolist() for t in me.traits]} for me in sortie],
    }, ensure_ascii=False))
    return sortie, non_geres, False, main.pente


def _boite(pts: np.ndarray):
    return [round(float(pts[:, 0].min()), 3), round(float(pts[:, 1].min()), 3),
            round(float(pts[:, 0].max()), 3), round(float(pts[:, 1].max()), 3)]


def mettre_en_page(mots: list[MotEcrit], style: Style, graine: int, largeur_max: float | None,
                   interligne: float | None = None) -> list[dict]:
    """Césure par mot, dérive de ligne, espaces inégales, mots légèrement tournés."""
    rng = np.random.default_rng(moteur.graine_de(graine, style.nom, "page"))
    nerv = style.nervosite
    interligne = interligne or style.interligne
    cis = math.tan(math.radians(style.cisaillement))
    # 1) chaque mot transformé dans son repère (largeur, pente des lettres, taille, rotation)
    formes = []
    for me in mots:
        k = float(np.exp(rng.normal(0, 0.02 + 0.025 * nerv)))
        rot = math.radians(rng.normal(0, 0.35 + 0.6 * nerv))
        dy = float(rng.normal(0, 0.02 + 0.035 * nerv))
        traits = []
        for t in me.traits:
            t = t.copy()
            t[:, 0] = t[:, 0] * style.largeur - t[:, 1] * cis
            t[:, :2] *= k
            traits.append(t)
        if traits:
            x0 = min(t[:, 0].min() for t in traits)
            for t in traits:
                t[:, 0] -= x0
        w = max((t[:, 0].max() for t in traits), default=0.0)
        formes.append(dict(me=me, traits=traits, largeur=w, rot=rot, dy=dy, k=k))
    # 2) césure : par groupes insécables (« 120 g », « Cécile ! »), jamais dans un mot
    for i, fm in enumerate(formes):
        base = {"normale": style.espace, "fine": 0.38 * style.espace, "aucune": 0.0}[fm["me"].mot.espace_avant]
        fm["espace"] = base * float(np.clip(rng.normal(1.0, 0.12 + 0.1 * nerv), 0.7, 1.4))
    groupes: list[list[int]] = []
    for i, fm in enumerate(formes):
        mot = fm["me"].mot
        if groupes and mot.insecable_avant and not mot.saut_avant:
            groupes[-1].append(i)
        else:
            groupes.append([i])
    # marge de gauche qui dérive d'une ligne à l'autre (jamais alignée au pixel)
    def marge():
        return abs(float(rng.normal(0, 0.05 + 0.1 * nerv)))

    lignes: list[list[int]] = [[]]
    marges = [0.0]
    x = 0.0
    for g in groupes:
        if formes[g[0]]["me"].mot.saut_avant and lignes[-1]:
            lignes.append([])
            marges.append(marge())
            x = marges[-1]
        w = sum(formes[i]["largeur"] + formes[i]["espace"] for i in g)
        # la pente de la ligne et la rotation des mots grignotent un peu de place : on garde 2 %
        if lignes[-1] and largeur_max and x + w > largeur_max * 0.98:
            lignes.append([])
            marges.append(marge())
            x = marges[-1]
        if not lignes[-1]:
            w -= formes[g[0]]["espace"]
        lignes[-1] += g
        x += w
    # 3) placement
    sortie = []
    y_base = 0.0
    for n, ligne in enumerate(lignes):
        if not ligne:
            continue
        if n > 0:
            y_base += interligne * float(np.clip(rng.normal(1.0, 0.015 + 0.02 * nerv), 0.95, 1.06))
        pente = math.tan(math.radians(style.pente_ligne + rng.normal(0, 0.15 + 0.45 * nerv)))
        onde_a = (0.02 + 0.05 * nerv) * rng.uniform(0.5, 1.0)
        onde_l = rng.uniform(10, 22)
        onde_p = rng.uniform(0, 2 * math.pi)
        x = marges[n]
        mots_l = []
        for pos, i in enumerate(ligne):
            fm = formes[i]
            if pos > 0:
                x += fm["espace"]
            w = fm["largeur"]
            ang = math.atan(pente) + fm["rot"]
            ca, sa = math.cos(ang), math.sin(ang)

            def place(px, py, x=x):
                y0 = y_base + pente * x + onde_a * math.sin(2 * math.pi * x / onde_l + onde_p) + fm["dy"]
                return x + px * ca - py * sa, y0 + px * sa + py * ca

            traits = []
            for t in fm["traits"]:
                X, Y = place(t[:, 0], t[:, 1])
                traits.append(np.column_stack([X, Y, t[:, 2], t[:, 3]]))
            b0, b1 = place(0.0, 0.0), place(w, 0.0)
            h0 = place(0.0, -fm["k"])
            allp = np.vstack([t[:, :2] for t in traits]) if traits else np.array([[x, y_base]])
            mots_l.append(dict(
                texte=fm["me"].mot.texte,
                boite=_boite(allp),
                ligne_de_base=[[round(b0[0], 3), round(b0[1], 3)], [round(b1[0], 3), round(b1[1], 3)]],
                hauteur_x=round(fm["k"], 3),
                haut_x=[round(h0[0], 3), round(h0[1], 3)],
                score=fm["me"].infos.get("score"),
                lecture=fm["me"].infos.get("lecture"),
                lu=fm["me"].infos.get("lu"),
                traits=[np.round(t, 3).tolist() for t in traits],
            ))
            x += w
        allp = np.array([[m["boite"][0], m["boite"][1]] for m in mots_l] + [[m["boite"][2], m["boite"][3]] for m in mots_l])
        sortie.append(dict(
            boite=_boite(allp),
            ligne_de_base=[mots_l[0]["ligne_de_base"][0], mots_l[-1]["ligne_de_base"][1]],
            mots=mots_l,
        ))
    return sortie


def ecrire(texte: str, style: str = "soignee", graine: int = 0, largeur_max: float | None = None, *,
           encre: str | None = None, outil: str | None = None,
           pente: float | None = None, inclinaison: float = 0.0,
           interligne: float | None = None, biais: float | None = None, candidats: int | None = None,
           cache: bool = True, relire: bool = True) -> dict:
    """Écrit `texte` dans la main `style`. Unités : hauteur d'x de la main, y vers le bas,
    première ligne de base à y ≈ 0. Chaque point : [x, y, pression, vitesse, encre].
    `encre` : plume, brune, noire, bic, crayon, feutre, rouge, chocolat (défaut : celle de la
    main) ; `outil` : plume, bille, crayon, feutre (défaut : celui de l'encre).
    `pente` : pente de base des lignes en degrés (négatif = la ligne monte ; défaut : celle de
    la main) ; `inclinaison` : degrés ajoutés à la pente des lettres (+ = penche à droite).
    Ni l'une ni l'autre ne régénère les mots (cache conservé). Voir README."""
    t0 = time.time()
    st = STYLES[style]
    b = st.biais if biais is None else biais
    n = st.candidats if candidats is None else candidats
    mots, non_geres, depuis_cache, pente_main = _ecrire_mots(texte, st, graine, b, n, cache, relire)
    st_page = replace(st, pente_ligne=st.pente_ligne if pente is None else pente,
                      cisaillement=st.cisaillement + inclinaison)
    lignes = mettre_en_page(mots, st_page, graine, largeur_max, interligne)
    e_def, o_def = encre_mod.STYLE_ENCRE.get(style, ("bic", None))
    if encre is None:
        encre, outil = e_def, outil or o_def
    bl = [ligne["boite"] for ligne in lignes]
    boite = [min(c[0] for c in bl), min(c[1] for c in bl), max(c[2] for c in bl), max(c[3] for c in bl)] if bl else [0, 0, 0, 0]
    res = dict(
        version=VERSION,
        texte=texte,
        style=style,
        graine=graine,
        unite="hauteur_x",
        point=["x", "y", "pression", "vitesse", "encre"],
        largeur_max=largeur_max,
        interligne=interligne or st.interligne,
        pente=st_page.pente_ligne,
        inclinaison=round(st_page.cisaillement, 2),
        taille_conseillee=st.taille,
        epaisseur_conseillee=st.epaisseur,
        boite=boite,
        lignes=lignes,
        non_geres=non_geres,
        cache=depuis_cache,
    )
    pente_lettres = math.tan(math.atan(pente_main) + math.radians(st_page.cisaillement))
    encre_mod.encrer(res, encre, outil, graine, pente=pente_lettres)
    res["duree_s"] = round(time.time() - t0, 3)
    return res


# =============================================================================================
def main(argv=None):
    ap = argparse.ArgumentParser(description="Écriture manuscrite générée trait par trait.")
    ap.add_argument("texte", nargs="?", help="texte à écrire (\\n pour un retour à la ligne)")
    ap.add_argument("--style", default="soignee", choices=sorted(STYLES))
    ap.add_argument("--graine", type=int, default=0)
    ap.add_argument("--largeur", type=float, default=None, help="largeur max d'une ligne (hauteurs d'x)")
    ap.add_argument("--interligne", type=float, default=None)
    ap.add_argument("--pente", type=float, default=None, help="pente des lignes en degrés (négatif = monte)")
    ap.add_argument("--inclinaison", type=float, default=0.0, help="degrés ajoutés à la pente des lettres")
    ap.add_argument("--biais", type=float, default=None, help="lisibilité (défaut : celle du style)")
    ap.add_argument("--candidats", type=int, default=None)
    ap.add_argument("--svg", help="écrit aussi un aperçu SVG")
    ap.add_argument("--encre", default=None, choices=sorted(encre_mod.ENCRES), help="défaut : celle de la main")
    ap.add_argument("--outil", default=None, choices=sorted(encre_mod.OUTILS), help="défaut : celui de l'encre")
    ap.add_argument("--lumiere", type=float, default=0.3, help="lumière de l'aperçu SVG (0 = aucune)")
    ap.add_argument("--sans-cache", action="store_true")
    ap.add_argument("--rapide", action="store_true", help="sans relecture TrOCR (plus rapide, moins sûr)")
    ap.add_argument("--styles", action="store_true", help="liste les styles")
    ap.add_argument("--compact", action="store_true", help="JSON sans indentation")
    a = ap.parse_args(argv)
    if a.styles:
        print(json.dumps({k: v.dict() for k, v in STYLES.items()}, ensure_ascii=False, indent=1))
        return 0
    if a.texte is None:
        ap.error("texte manquant")
    texte = a.texte.replace("\\n", "\n")
    res = ecrire(texte, a.style, a.graine, a.largeur, encre=a.encre, outil=a.outil, pente=a.pente,
                 inclinaison=a.inclinaison, interligne=a.interligne, biais=a.biais,
                 candidats=a.candidats, cache=not a.sans_cache, relire=not a.rapide)
    if a.svg:
        import rendu

        Path(a.svg).write_text(rendu.svg(res, lumiere=a.lumiere))
    print(json.dumps(res, ensure_ascii=False, indent=None if a.compact else 1))
    print(f"[ecriture] {a.style} : {res['duree_s']} s{' (cache)' if res['cache'] else ''}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
