"""Inférence NumPy du réseau de synthèse d'écriture de type Graves (2013) :
LSTM « peephole » à 3 couches + fenêtre d'attention gaussienne sur le texte + mélange de
20 gaussiennes bivariées pour le prochain déplacement du stylo.

Poids : X-rayLaser/pytorch-handwriting-synthesis-toolkit, point de contrôle `Epoch_52`
(licence MIT, entraîné sur IAM-OnDB), convertis en .npz par `convertir_poids.py`.
Aucune dépendance à PyTorch ni TensorFlow.

Génération par lots : on écrit plusieurs mots × plusieurs candidats d'un coup, chaque
élément du lot ayant son propre flux aléatoire (graine dérivée du mot) : le résultat d'un mot
ne dépend pas des autres mots du lot (les produits matriciels OpenBLAS donnent des lignes
identiques bit à bit dès que le lot compte au moins 2 lignes — on complète sinon).
"""
from __future__ import annotations

import os

# Avant NumPy : un seul fil BLAS (les petits produits sont 10× plus lents en multi-fil ici).
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import zlib  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402

RACINE = Path(__file__).resolve().parents[2]
POIDS = RACINE / "vendor" / "poids"


def _sig(x):
    return 0.5 * (np.tanh(0.5 * x) + 1.0)


@dataclass
class Trace:
    """Un mot écrit par le réseau (unités brutes IAM, y vers le bas)."""

    texte: str
    points: np.ndarray  # (n, 3) : x, y, fin de trait (1 = le stylo se lève après ce point)
    car: np.ndarray  # (n,) position d'attention (indice fractionnaire du caractère en cours)
    fini: bool
    score: float = 0.0
    infos: dict = field(default_factory=dict)


class Modele:
    def __init__(self, fichier: Path | None = None):
        d = np.load(fichier or POIDS / "xray_epoch_52.npz")
        w = {k: d[k].astype(np.float32) for k in d.files if not k.startswith("__")}
        self.mu = d["__mu"].astype(np.float32)
        self.std = d["__std"].astype(np.float32)
        cs = str(d["__charset"])
        self.alphabet = {c: i + 1 for i, c in enumerate(cs)}
        self.A = len(cs) + 1
        self.H = 400
        self.L = {}
        for n in ("lstm1", "lstm2", "lstm3"):
            self.L[n] = dict(
                W=w[f"{n}.W_xh"], ci=w[f"{n}.W_ci"], cf=w[f"{n}.W_cf"], co=w[f"{n}.W_co"],
                bi=w[f"{n}.b_i"], bf=w[f"{n}.b_f"], bc=w[f"{n}.b_c"], bo=w[f"{n}.b_o"],
            )
        self.Wwin = np.ascontiguousarray(
            np.concatenate([w["window.alpha.weight"], w["window.beta.weight"], w["window.k.weight"]]).T
        )
        self.bwin = np.concatenate([w["window.alpha.bias"], w["window.beta.bias"], w["window.k.bias"]])
        noms = ("pi", "mu", "sd", "ro", "eos")
        self.Wmix = np.ascontiguousarray(np.concatenate([w[f"mixture.{n}.weight"] for n in noms]).T)
        self.bmix = np.concatenate([w[f"mixture.{n}.bias"] for n in noms])

    # -- alphabet -------------------------------------------------------------------------
    def connait(self, c: str) -> bool:
        return c in self.alphabet

    def encoder(self, texte: str) -> np.ndarray:
        return np.array([self.alphabet.get(c, 0) for c in texte], dtype=np.int64)

    def un_parmi_n(self, codes_list, U):
        C = np.zeros((len(codes_list), U, self.A), np.float32)
        for b, codes in enumerate(codes_list):
            C[b, np.arange(len(codes)), codes] = 1.0
        return C

    # -- une étape -----------------------------------------------------------------------
    def _lstm(self, n, inp, h, c):
        p = self.L[n]
        z = np.concatenate([inp, h], axis=1) @ p["W"]
        H = self.H
        i = _sig(z[:, :H] + c * p["ci"] + p["bi"])
        f = _sig(z[:, H : 2 * H] + c * p["cf"] + p["bf"])
        c = f * c + i * np.tanh(z[:, 2 * H : 3 * H] + p["bc"])
        o = _sig(z[:, 3 * H :] + c * p["co"] + p["bo"])
        return o * np.tanh(c), c

    def etat_initial(self, B):
        z = lambda n: np.zeros((B, n), np.float32)  # noqa: E731
        return dict(h1=z(400), c1=z(400), h2=z(400), c2=z(400), h3=z(400), c3=z(400), k=z(10), w=z(self.A))

    def etape(self, x, s, C, biais, avec_melange=True):
        """x : (B,3) entrée normalisée ; C : (B,U,A) texte un-parmi-n ; biais : (B,1)."""
        h1, c1 = self._lstm("lstm1", np.concatenate([x, s["w"]], 1), s["h1"], s["c1"])
        win = h1 @ self.Wwin + self.bwin
        a = np.exp(win[:, :10])
        b = np.exp(win[:, 10:20])
        kk = s["k"] + np.exp(win[:, 20:30])
        u = np.arange(C.shape[1], dtype=np.float32)
        e = np.maximum(-b[:, :, None] * (kk[:, :, None] - u) ** 2, -80.0)
        phi = np.einsum("bm,bmu->bu", a, np.exp(e))
        w = np.einsum("bu,bua->ba", phi, C)
        h2, c2 = self._lstm("lstm2", np.concatenate([x, h1, w], 1), s["h2"], s["c2"])
        h3, c3 = self._lstm("lstm3", np.concatenate([x, h2, w], 1), s["h3"], s["c3"])
        s.update(h1=h1, c1=c1, h2=h2, c2=c2, h3=h3, c3=c3, k=kk, w=w)
        if not avec_melange:
            return None, phi
        m = np.concatenate([h1, h2, h3], 1) @ self.Wmix + self.bmix
        pi_hat = m[:, :20] * (1 + biais)
        pi = np.exp(pi_hat - pi_hat.max(1, keepdims=True))
        pi /= pi.sum(1, keepdims=True)
        sd = np.exp(m[:, 60:100] - biais)
        melange = (pi, m[:, 20:40], m[:, 40:60], sd[:, :20], sd[:, 20:], np.tanh(m[:, 100:120]), _sig(m[:, 120]))
        return melange, phi

    # -- amorce --------------------------------------------------------------------------
    def amorcer(self, offsets: np.ndarray, texte: str):
        """Fait lire au réseau une ligne réelle (offsets bruts (n,3)) : renvoie l'état, à
        réutiliser pour tous les mots de ce style. Calculé sur un lot de 2 (voir en-tête)."""
        B = 2
        codes = self.encoder(texte + " ")
        C = self.un_parmi_n([codes] * B, len(codes))
        s = self.etat_initial(B)
        x = np.zeros((B, 3), np.float32)
        entree = offsets.astype(np.float32).copy()
        entree[:, :2] = (entree[:, :2] - self.mu[:2]) / self.std[:2]
        bz = np.zeros((B, 1), np.float32)
        for t in range(len(entree)):
            self.etape(x, s, C, bz, avec_melange=False)
            x = np.repeat(entree[t : t + 1], B, 0)
        etat = {k: v[0].copy() for k, v in s.items()}
        etat["x"] = x[0].copy()
        etat["n_amorce"] = len(texte) + 1
        etat["texte"] = texte + " "
        return etat

    # -- génération ----------------------------------------------------------------------
    def ecrire_lot(self, demandes, amorce=None, pas_par_car=40, garde=None, fin="  ", marge_fin=0.45,
                   fin_par_position=False, seuil_calage=2.0):
        """demandes : liste de (texte, biais, graine_entière). Renvoie une liste de `Trace`.
        Le texte est complété par deux espaces (le réseau a appris des lignes suivies d'espaces).
        `amorce` : état renvoyé par `amorcer` (ou None : écriture « libre »).
        `garde` : abandon d'un candidat qui s'écarte de plus de `garde` (unités brutes) de son
        point de départ en y (trait qui part en vrille)."""
        n_reel = len(demandes)
        if n_reel == 0:
            return []
        dem = list(demandes) + ([demandes[0]] if n_reel == 1 else [])
        B = len(dem)
        n_am = 0 if amorce is None else amorce["n_amorce"]
        prefixe = "" if amorce is None else amorce["texte"]
        # le texte de l'amorce reste lisible par la fenêtre : l'attention reprend juste après
        codes = [self.encoder(prefixe + texte + fin) for texte, _, _ in dem]
        U = max(len(c) for c in codes)
        C = self.un_parmi_n(codes, U)
        fin_idx = np.array([len(c) - 1 for c in codes])
        long_mot = np.array([len(t) for t, _, _ in dem], np.float32)
        longueurs = np.array([len(t) for t, _, _ in dem])
        T = int(pas_par_car * (longueurs.max() + 3))
        biais = np.array([[b] for _, b, _ in dem], np.float32)
        alea_u = np.zeros((B, T))
        alea_z = np.zeros((B, T, 2))
        alea_e = np.zeros((B, T))
        for b, (_, _, g) in enumerate(dem):
            r = np.random.default_rng(g)
            alea_u[b] = r.random(T)
            alea_z[b] = r.standard_normal((T, 2))
            alea_e[b] = r.random(T)
        if amorce is None:
            s = self.etat_initial(B)
            x = np.zeros((B, 3), np.float32)
        else:
            s = {k: np.repeat(amorce[k][None], B, 0) for k in ("h1", "c1", "h2", "c2", "h3", "c3", "k", "w")}
            x = np.repeat(amorce["x"][None], B, 0)
        actifs = np.arange(B)
        sorties = np.zeros((B, T, 3), np.float32)
        poscar = np.zeros((B, T), np.float32)
        n_pas = np.zeros(B, np.int64)
        fini = np.zeros(B, bool)
        y_cum = np.zeros(B, np.float64)
        nll = np.zeros(B, np.float64)
        mouv = np.full(B, 10.0)
        u = np.arange(U, dtype=np.float32)
        for t in range(T):
            if len(actifs) == 0:
                break
            seul = len(actifs) == 1
            if seul:  # garder ≥ 2 lignes (déterminisme des produits)
                s = {k: np.repeat(v, 2, 0) for k, v in s.items()}
                x = np.repeat(x, 2, 0)
                sel = np.repeat(actifs, 2)
            else:
                sel = actifs
            # anti-calage : à biais élevé, le réseau peut « hésiter » (pas minuscules, l'attention
            # rampe) ; on relâche alors le biais le temps qu'il reparte
            b_eff = biais[sel].copy()
            cale = (mouv[sel] < seuil_calage)[:, None]
            b_eff = np.where(cale, np.minimum(b_eff, 0.15), b_eff)
            (pi, m1, m2, s1, s2, ro, eos), phi = self.etape(x, s, C[sel], b_eff)
            if seul:
                s = {k: v[:1] for k, v in s.items()}
                pi, m1, m2, s1, s2, ro, eos, phi = (a[:1] for a in (pi, m1, m2, s1, s2, ro, eos, phi))
            n = len(actifs)
            ii = np.arange(n)
            cum = np.cumsum(pi, 1)
            g = np.minimum((cum < alea_u[actifs, t][:, None]).sum(1), 19)
            z1, z2 = alea_z[actifs, t, 0], alea_z[actifs, t, 1]
            sa, sb, rr = s1[ii, g], s2[ii, g], ro[ii, g]
            dx = m1[ii, g] + sa * z1
            dy = m2[ii, g] + sb * (rr * z1 + np.sqrt(np.maximum(1 - rr * rr, 0)) * z2)
            # lever de stylo tiré au sort (Graves) : au seuil fixe 0,5, le stylo reste parfois
            # posé en fin de lettre et le réseau dérive en une traîne tremblée
            e = (alea_e[actifs, t] < eos).astype(np.float32)
            # vraisemblance du pas tiré (mélange complet) : un mot écrit « à contre-courant » du
            # réseau a une vraisemblance basse — indice de lettre ratée
            zx = (dx[:, None] - m1) / s1
            zy = (dy[:, None] - m2) / s2
            q = 1 - ro * ro
            dens = pi * np.exp(np.maximum(-(zx * zx + zy * zy - 2 * ro * zx * zy) / (2 * q), -60)) / (
                2 * np.pi * s1 * s2 * np.sqrt(q))
            nll[actifs] += -np.log(dens.sum(1) + 1e-12)
            xn = np.stack([dx, dy, e], 1).astype(np.float32)
            sorties[actifs, t] = xn
            ph = phi / np.maximum(phi.sum(1, keepdims=True), 1e-9)
            poscar[actifs, t] = (ph * u).sum(1) - n_am
            n_pas[actifs] = t + 1
            # fin du mot : l'attention a passé la dernière lettre (+ marge) et le stylo est levé,
            # ou elle bute sur la fin du texte
            fi = fin_idx[actifs]
            dern = phi[ii, fi]
            if fin_par_position:
                fin = poscar[actifs, t] > long_mot[actifs] + marge_fin
            else:
                fin = ((poscar[actifs, t] > long_mot[actifs] + marge_fin) & (e > 0.5)) | (dern > 0.8)
            y_cum[actifs] += dy * self.std[1] + self.mu[1]
            pas_brut = np.hypot(dx * self.std[0] + self.mu[0], dy * self.std[1] + self.mu[1])
            mouv[actifs] = 0.75 * mouv[actifs] + 0.25 * pas_brut
            hors = np.abs(y_cum[actifs]) > garde if garde is not None else np.zeros(n, bool)
            fini[actifs[fin]] = True
            garder = ~(fin | hors)
            if not garder.all():
                actifs = actifs[garder]
                s = {k: v[garder] for k, v in s.items()}
                xn = xn[garder]
            x = xn
        traces = []
        for b in range(n_reel):
            n = int(n_pas[b])
            d = sorties[b, :n].copy()
            d[:, :2] = d[:, :2] * self.std[:2] + self.mu[:2]
            if n:
                d[-1, 2] = 1.0
            pts = np.cumsum(d[:, :2], 0)
            traces.append(Trace(texte=dem[b][0], points=np.concatenate([pts, d[:, 2:3]], 1),
                                car=poscar[b, :n].copy(), fini=bool(fini[b]),
                                infos={"nll": float(nll[b] / max(n, 1))}))
        return traces


def graine_de(*parts) -> int:
    """Graine entière stable (indépendante de PYTHONHASHSEED)."""
    h = 0
    for p in parts:
        h = zlib.crc32(str(p).encode("utf-8"), h)
    return h
