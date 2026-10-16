"""L'encre : quantité d'encre déposée en chaque point (`encre`, 0 à 1) selon l'outil, et
nuances de chaque encre pour l'aperçu.

Chaque point d'un trait devient [x, y, pression, vitesse, encre] :
- `pression` (0–1) : appui *effectif* sur le papier, qui donne l'épaisseur. Pour la plume il
  inclut l'écartement du bec : pleins (traits descendants) 2 à 3 fois plus épais que les déliés.
- `vitesse` : vitesse relative du stylo (1 = vitesse médiane du mot).
- `encre` (0–1) : quantité d'encre posée. 1 = trait chargé (couleur `charge` de l'encre),
  0,5 ≈ couleur `clair`, 0 = presque rien (le papier transparaît). Déterministe par graine.

Comportements (mesures : design-system/docs/references-carnets.md § 4.3–4.4) :
- plume (porte-plume) : pleine et foncée après avoir trempé la plume, elle se vide sur 5 à 15
  mots puis on retrempe ; petites flaques là où le bec s'arrête ou tourne (fins de mots, bas
  de boucles) ;
- bille : régulière, épaisseur presque constante ; petits sauts (blancs très courts) dans les
  traits rapides, petit pâté à certains départs ;
- crayon : suit l'appui, plus clair et granuleux dans les traits rapides, pas de plein/délié ;
- feutre : très régulier, un peu plus foncé là où deux traits se croisent ;
- partout : trait rapide = plus fin et plus clair ; trait lent, départs et arrêts = plus foncés.
"""
from __future__ import annotations

import math

import numpy as np

# ---------------------------------------------------------------------------------------------
# Les encres. charge = « cœur » mesuré (trait plein), clair = trait léger / délié rapide.
# Couleurs tirées des mesures sur de vrais carnets (références § 4.4), rapprochées des jetons
# gc-ink-* du projet.
# ---------------------------------------------------------------------------------------------
ENCRES: dict[str, dict] = {
    # id        outil       charge     clair      notes
    "plume": dict(outil="plume", charge="#30375a", clair="#7f8199",
                  source="plume bleu-noir ; bleu tiré vers le gris du papier (réf. 29, 30)"),
    "brune": dict(outil="plume", charge="#60533f", clair="#9a8a6c",
                  source="ferrogallique brune (réf. 09 : cœur #60533f, milieu #887a60)"),
    "noire": dict(outil="plume", charge="#2a1d12", clair="#6e5b42",
                  source="noire brunie vers 1900 (réf. 13, 16)"),
    "bic": dict(outil="bille", charge="#2e2e49", clair="#6c6b84",
                source="bille bleue 1963 (réf. 25 : cœur #2e2e49, milieu #797887)"),
    "crayon": dict(outil="crayon", charge="#8d836a", clair="#a69b82",
                   source="mine de plomb (réf. 18 : cœur #8d836a, milieu #a99e85)"),
    "feutre": dict(outil="feutre", charge="#4a3d5f", clair="#7a7090",
                   source="feutre violet-gris (jeton gc-ink-feutre, sourdi comme réf. 29)"),
    "rouge": dict(outil="bille", charge="#83432f", clair="#b17f6e",
                  source="rouge de correction (réf. 05 : cœur #7f5043, milieu #a37b6d)"),
    "chocolat": dict(outil="feutre", charge="#3d281b", clair="#7c6450",
                     source="la main de Cécile, jeton gc-ink #3a2216 sourdi"),
}

# Réglages par outil (unités : hauteurs d'x de longueur de trait)
OUTILS: dict[str, dict] = {
    "plume": dict(
        capacite=(90.0, 170.0),  # longueur de trait écrite avec une trempée (≈ 5 à 15 mots)
        retrempe=(0.12, 0.3),  # on retrempe au début d'un mot quand la réserve passe sous ce seuil
        depart=(0.55, 1.0),  # réserve au début du bloc
        flaque=0.3,  # surcroît d'encre aux arrêts et virages lents (× réserve)
        plein=0.85,  # écartement du bec sur les pleins
    ),
    "bille": dict(
        sauts=1.1,  # sauts par hauteur d'x de trait rapide
        saut_long=(0.02, 0.06),
        pate=0.12,  # probabilité d'un petit pâté au départ d'un trait
    ),
    "crayon": dict(grain=0.13),
    "feutre": dict(croisement=0.12),
}

STYLE_ENCRE = {  # encre et outil par défaut de chaque main (CONTRACT § 8) ; None = outil de l'encre
    "mamie": ("brune", None), "ecole": ("plume", None), "soignee": ("bic", None),
    "ado": ("feutre", None), "papa": ("noire", "bille"), "pressee": ("bic", None),
    "cecile": ("chocolat", None),
}


def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i : i + 2], 16) for i in (0, 2, 4)], float)


def _arc(T):
    d = np.linalg.norm(np.diff(T[:, :2], axis=0), axis=1)
    return np.r_[0.0, np.cumsum(d)]


def _lisse(a, n=2):
    a = a.copy()
    for _ in range(n):
        if len(a) >= 3:
            a[1:-1] = 0.25 * a[:-2] + 0.5 * a[1:-1] + 0.25 * a[2:]
    return a


def _bruit_lent(rng, s, echelle=0.6, amp=1.0):
    """Bruit lisse le long de l'abscisse curviligne s (période ~ échelle)."""
    if len(s) == 0:
        return s
    n = int(s[-1] / echelle) + 3
    noeuds = rng.normal(0, amp, n)
    return np.interp(s / echelle, np.arange(n), noeuds)


def _bouts(s, L, long=0.05):
    """1 aux deux extrémités du trait, 0 au milieu (départs et arrêts)."""
    return np.clip(1 - np.minimum(s, L - s) / long, 0, 1)


def encrer(res: dict, encre: str, outil: str | None, graine: int, pente: float = 0.0) -> dict:
    """Ajoute la quantité d'encre à chaque point (5e valeur) et ajuste la pression selon l'outil.
    Modifie `res` (sortie d'`ecrire`) en place et le renvoie."""
    from moteur import graine_de

    info = ENCRES[encre]
    outil = outil or info["outil"]
    reg = OUTILS[outil]
    rng = np.random.default_rng(graine_de(graine, res["style"], encre, outil, "encre"))
    # direction des pleins : vers le bas, penchée comme l'écriture
    plein_dir = np.array([-math.sin(math.atan(pente)), math.cos(math.atan(pente))])
    reserve = float(rng.uniform(*reg.get("depart", (1, 1)))) if outil == "plume" else 1.0
    capacite = float(rng.uniform(*reg["capacite"])) if outil == "plume" else 1.0
    seuil = float(rng.uniform(*reg["retrempe"])) if outil == "plume" else 0.0
    trempes = []
    for n_l, ligne in enumerate(res["lignes"]):
        for n_m, mot in enumerate(ligne["mots"]):
            if outil == "plume" and reserve < seuil:
                reserve = 1.0
                capacite = float(rng.uniform(*reg["capacite"]))
                seuil = float(rng.uniform(*reg["retrempe"]))
                trempes.append([n_l, n_m])
            nouveaux = []
            tous = [np.asarray(t, float) for t in mot["traits"]]
            for k, T in enumerate(tous):
                if len(T) == 0:
                    nouveaux.append([])
                    continue
                s = _arc(T)
                L = float(s[-1])
                p, v = T[:, 2].copy(), np.maximum(T[:, 3], 0.0)
                rapide = np.clip(v - 1.0, 0, 1.5)
                lent = np.clip(1.0 - v, 0, 1)
                bouts = _bouts(s, L)
                if len(T) > 1:
                    d = np.gradient(T[:, :2], axis=0)
                    d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
                else:
                    d = np.zeros((1, 2))
                if outil == "plume":
                    # réserve qui se vide le long du trait
                    R = np.clip(reserve - s / capacite, 0.0, 1.0)
                    reserve = float(R[-1]) if len(R) else reserve
                    # flaques : arrêts, virages lents, bas de boucle
                    virage = np.zeros(len(T))
                    if len(T) > 2:
                        virage[1:-1] = np.clip(1 - np.sum(d[:-2] * d[2:], axis=1), 0, 2) / 2
                    bas_boucle = np.zeros(len(T))
                    if len(T) > 4:
                        y = T[:, 1]
                        loc = (y[1:-1] >= y[:-2]) & (y[1:-1] >= y[2:])
                        bas_boucle[1:-1] = loc.astype(float)
                        bas_boucle = _lisse(bas_boucle, 2) * 2
                    flaque = reg["flaque"] * R * np.clip(0.9 * bouts + 0.8 * virage * (0.4 + lent) + 0.5 * bas_boucle, 0, 1.2)
                    base_p = 0.8 + 0.2 * p - 0.22 * rapide + 0.1 * lent + 0.08 * bouts
                    e = (0.56 + 0.44 * R**0.7) * base_p + flaque
                    # pleins et déliés : le bec s'ouvre sur les traits qui descendent
                    plein = np.clip(d @ plein_dir, 0, 1) ** 1.5
                    p = np.clip(p * (0.42 + reg["plein"] * plein) + 0.25 * flaque, 0.12, 1.0)
                elif outil == "bille":
                    e = 0.84 + 0.05 * _bruit_lent(rng, s) - 0.18 * rapide + 0.08 * bouts * lent
                    # sauts : la bille accroche mal dans les traits rapides
                    pos = 0.0
                    while L > 0:
                        taux = reg["sauts"] * max(0.2, float(np.mean(rapide)) + 0.15)
                        pos += float(rng.exponential(1.0 / taux))
                        if pos >= L:
                            break
                        i = int(np.searchsorted(s, pos))
                        if i < len(v) and v[i] > 1.15:
                            lg = float(rng.uniform(*reg["saut_long"]))
                            m = (s >= pos) & (s < pos + lg)
                            e[m] *= float(rng.uniform(0.3, 0.55))
                        pos += 0.05
                    if L > 0.1 and rng.random() < reg["pate"]:
                        m = s < 0.03
                        e[m] = 1.0
                        p[m] = np.minimum(1.0, p[m] + 0.3)
                    p = 0.72 + 0.28 * p  # épaisseur presque constante
                elif outil == "crayon":
                    grain = _lisse(rng.normal(0, reg["grain"], len(T)), 1)
                    e = np.clip(0.4 + 0.58 * p - 0.25 * rapide + 0.08 * lent, 0.08, 1) * (1 + grain)
                    p = 0.68 + 0.32 * p
                else:  # feutre
                    e = 0.88 + 0.03 * _bruit_lent(rng, s, 0.8) - 0.06 * rapide + 0.05 * bouts
                    p = 0.84 + 0.16 * p
                    # croisements : deux couches d'encre
                    autres = [tous[j][:, :2] for j in range(len(tous)) if j != k and len(tous[j])]
                    if autres and reg["croisement"]:
                        A = np.vstack(autres)
                        dd = np.min(np.linalg.norm(T[:, None, :2] - A[None, :, :], axis=2), axis=1)
                        e = e + reg["croisement"] * np.clip(1 - dd / 0.07, 0, 1)
                e = np.clip(e, 0.0, 1.0)
                nouveaux.append(np.column_stack([T[:, :2], np.clip(p, 0, 1), v, e]).round(3).tolist())
            mot["traits"] = nouveaux
    res["encre"] = dict(id=encre, outil=outil, charge=info["charge"], clair=info["clair"],
                        parametres={k: list(v) if isinstance(v, tuple) else v for k, v in reg.items()},
                        trempes=trempes)
    return res


# ---------------------------------------------------------------------------------------------
# Couleur d'un point (pour l'aperçu ; la cuisson finale peut reprendre la même formule)
# ---------------------------------------------------------------------------------------------
def couleurs(e: np.ndarray, v: np.ndarray, encre: str, papier: str, lumiere: np.ndarray | None = None,
             couvrance: np.ndarray | None = None) -> np.ndarray:
    """Couleur opaque (RGB 0–255) de chaque point posé sur le papier.

    e ≥ 0,5 : de `clair` à `charge` ; e < 0,5 : de presque-papier à `clair`.
    Un trait rapide pâlit encore un peu. `couvrance` (0–1) : part du papier qui transparaît
    dans les traits très fins. `lumiere` (−1 ombre … +1 lumière) : plus clair et plus chaud
    dans la lumière, plus foncé et plus froid dans l'ombre."""
    info = ENCRES[encre]
    C, K, P = _hex(info["charge"]), _hex(info["clair"]), _hex(papier)
    t = np.clip(e - 0.07 * np.clip(v - 1.0, 0, 1.5), 0, 1)[:, None]
    haut = K + (C - K) * np.clip((t - 0.5) / 0.5, 0, 1)
    bas = P + (K - P) * (0.22 + 0.78 * np.clip(t / 0.5, 0, 1))
    col = np.where(t >= 0.5, haut, bas)
    if couvrance is not None:
        a = np.clip(couvrance, 0, 1)[:, None]
        col = P + (col - P) * a
    if lumiere is not None:
        lu = np.asarray(lumiere, float)[:, None]
        chaud = np.array([1.035, 1.0, 0.95])
        froid = np.array([0.95, 0.965, 1.02])
        col = np.where(lu >= 0, col + (np.minimum(col * chaud * 1.05, 255) - col) * lu,
                       col + (col * froid * 0.92 - col) * (-lu))
    return np.clip(col, 0, 255)
