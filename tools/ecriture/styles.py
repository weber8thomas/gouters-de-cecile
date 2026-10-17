"""Les mains du carnet : une écriture par invité.

Un style = une **amorce** (une ligne d'écriture réelle que le réseau lit avant d'écrire, et
dont il imite la main) + un **biais** (plus haut = plus soigné, moins varié) + des réglages de
mise en page (pente des lettres ajoutée, largeur, taille conseillée, espaces, interligne,
nervosité de la ligne).

Amorces : les 8 lignes d'IAM-OnDB fournies par Grzego/handwriting-generation (MIT), converties
dans les unités du réseau par `convertir_poids.py` (`vendor/poids/amorces.npz`).

Unités : hauteur d'x (la hauteur d'un « x » de la main). `taille` est la taille conseillée
relative entre les mains (à multiplier par la hauteur d'x visée du rôle).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Style:
    nom: str
    description: str
    amorce: int | str  # n° de la ligne d'IAM-OnDB (0–7) ou nom d'une amorce maison (amorces/<nom>.npz)
    biais: float  # lisibilité : 0 = brut, 1 = net, 2+ = très régulier
    cisaillement: float = 0.0  # degrés ajoutés à la pente des lettres (+ = penche à droite)
    largeur: float = 1.0  # étirement horizontal des lettres
    taille: float = 1.0  # taille conseillée relative (métadonnée)
    interligne: float = 3.2  # en hauteurs d'x
    espace: float = 0.95  # espace entre mots (hauteurs d'x)
    nervosite: float = 0.5  # 0 = posé, 1 = agité (dérive de ligne, rotation des mots)
    pente_ligne: float = -0.4  # degrés : négatif = la ligne monte un peu
    epaisseur: float = 0.11  # épaisseur conseillée du trait (hauteurs d'x) à pression 1
    candidats: int = 4  # tirages par mot (on garde le plus lisible)
    echelle_amorce: float = 1.0  # correction d'échelle de l'amorce (taille des pas)
    version: int = 1  # à incrémenter quand un réglage change le tracé (invalide le cache)

    def dict(self):
        return asdict(self)


STYLES: dict[str, Style] = {
    s.nom: s
    for s in [
        Style("mamie", "cursive ancienne, liée, régulière, penchée", amorce="mamie", biais=2.0,
              cisaillement=6, largeur=0.96, taille=1.0, interligne=3.6, espace=1.0,
              nervosite=0.35, pente_ligne=-0.3, epaisseur=0.11, candidats=6),
        Style("ecole", "cursive scolaire sage, droite et ronde", amorce=3, biais=2.0,
              cisaillement=-2, largeur=1.04, taille=1.05, interligne=3.4, espace=1.1,
              nervosite=0.25, pente_ligne=-0.2, epaisseur=0.11, candidats=6),
        Style("soignee", "adulte, script net et serré", amorce=1, biais=2.0,
              cisaillement=0, largeur=1.0, taille=1.0, interligne=3.0, espace=0.95,
              nervosite=0.35, pente_ligne=-0.3, epaisseur=0.115),
        Style("ado", "ronde, grosse, aérée", amorce=6, biais=1.7,
              cisaillement=-3, largeur=1.08, taille=1.15, interligne=2.9, espace=1.15,
              nervosite=0.6, pente_ligne=-0.6, epaisseur=0.135),
        Style("papa", "script carré, droit, appuyé", amorce=5, biais=2.4,
              cisaillement=-4, largeur=1.0, taille=1.05, interligne=2.9, espace=1.9,
              nervosite=0.3, pente_ligne=0.2, epaisseur=0.13),
        Style("pressee", "rapide, penchée, petite", amorce="pressee", biais=1.5,
              cisaillement=8, largeur=0.92, taille=0.9, interligne=3.1, espace=0.8,
              nervosite=0.85, pente_ligne=-0.9, epaisseur=0.1, candidats=6),
        Style("cecile", "la main du livre : vive, ronde, lisible", amorce=4, biais=1.7,
              cisaillement=2, largeur=1.0, taille=1.0, interligne=3.1, espace=1.0,
              nervosite=0.45, pente_ligne=-0.5, epaisseur=0.115),
    ]
}
