"""Formats de cuisson des pages du carnet (CONTRACT § 13.4, lot P2).

Le moteur de mise en page travaille toujours en **px de la page de référence** : 850 px de large
pour la page rognée (la hauteur d'x du corps vaut 1,9 % de cette largeur, quel que soit le format).
Un format dit seulement :

  - la taille de la page en px de référence (`W`, `H`, **fond perdu compris**) ;
  - l'échelle de cuisson (`echelle` : px de l'image par px de référence) ;
  - le fond perdu (`fond_perdu`, px de référence de chaque côté, compris dans `W` et `H`) ;
  - sa taille physique (mm, dpi) quand il est fait pour l'impression ;
  - le facteur de hauteur d'x (`xh_facteur`) : on écrit un peu plus petit sur papier qu'à l'écran.

    ecran   850 × 960 px, échelle 2 (1700 × 1920), plus une variante 1× et une passe d'encre ×4
            découpée en tuiles 2 × 2 (loupe) ;
    a5      148 × 210 mm + 3 mm de fond perdu de chaque côté (154 × 216 mm), 300 dpi
            (1819 × 2551 px) ; la page rognée garde 850 px de référence de large.

Les rayons de flou et de grain du rendu (rendu_encre.py) sont exprimés relativement à l'échelle 2 :
`px(r, echelle) = r × echelle / 2`. À l'échelle 2, rien ne change (mêmes octets qu'avant).
"""
from __future__ import annotations

from dataclasses import dataclass, field

MM_POUCE = 25.4
LARGEUR_REF = 850.0  # largeur de la page rognée, px de référence
ECHELLE_REF = 2.0  # échelle à laquelle les rayons de rendu ont été réglés


@dataclass(frozen=True)
class Format:
    nom: str
    W: float  # largeur de la page, fond perdu compris (px de référence)
    H: float
    echelle: float  # px de l'image par px de référence
    fond_perdu: float = 0.0  # px de référence de chaque côté (compris dans W, H)
    mm: tuple | None = None  # (largeur, hauteur) en mm, fond perdu compris
    rogne_mm: tuple | None = None  # (largeur, hauteur) de la page rognée en mm
    fond_perdu_mm: float = 0.0
    dpi: int | None = None
    xh_facteur: float = 1.0
    variante_1x: bool = False  # écrit aussi une variante 1× (écrans de densité 1)
    tuiles_4x: bool = False  # passe d'encre ×4 en tuiles 2 × 2 (loupe)
    folio: bool = True  # le livre imprime un folio (zone réservée en bas, côté extérieur)
    extras: dict = field(default_factory=dict)

    def px(self) -> tuple[int, int]:
        """Taille de l'image cuite (px)."""
        return int(round(self.W * self.echelle)), int(round(self.H * self.echelle))

    def taille(self) -> list:
        """Taille de la page en px de référence (champ `taille` d'une description)."""
        return [round(self.W, 3), round(self.H, 3)]

    def r(self, rayon_a_2x: float) -> float:
        """Rayon (px) réglé à l'échelle 2, ramené à l'échelle de ce format."""
        return rayon(rayon_a_2x, self.echelle)

    def manifeste(self) -> dict:
        d = {"format": self.nom, "largeur": round(self.W, 3), "hauteur": round(self.H, 3),
             "echelle": round(self.echelle, 6), "px": list(self.px())}
        if self.mm:
            d.update(taille_mm=list(self.mm), rogne_mm=list(self.rogne_mm), fond_perdu_mm=self.fond_perdu_mm,
                     dpi=self.dpi, fond_perdu=round(self.fond_perdu, 3))
        return d


def rayon(rayon_a_2x: float, echelle: float) -> float:
    """Un rayon de flou ou de grain réglé à l'échelle 2 (px), exprimé à `echelle`."""
    return float(rayon_a_2x) * float(echelle) / ECHELLE_REF


def _a5(dpi: int = 300, fond_mm: float = 3.0, rogne=(148.0, 210.0), xh_facteur: float = 0.86) -> Format:
    mm_px = rogne[0] / LARGEUR_REF  # mm par px de référence
    fp = fond_mm / mm_px
    W = LARGEUR_REF + 2 * fp
    H = rogne[1] / mm_px + 2 * fp
    ech = dpi / MM_POUCE * mm_px  # px d'image par px de référence
    return Format("a5", W, H, ech, fond_perdu=fp, mm=(rogne[0] + 2 * fond_mm, rogne[1] + 2 * fond_mm), rogne_mm=tuple(rogne),
                  fond_perdu_mm=fond_mm, dpi=dpi, xh_facteur=xh_facteur, folio=False,
                  extras={"mm_par_px": mm_px})


ECRAN = Format("ecran", 850.0, 960.0, 2.0, variante_1x=True, tuiles_4x=True)
A5 = _a5()
FORMATS = {"ecran": ECRAN, "a5": A5}


def mm_vers_ref(mm: float, fmt: Format = A5) -> float:
    """mm → px de référence d'un format imprimé."""
    return float(mm) / fmt.extras["mm_par_px"]


def tuiles(larg: int, haut: int, n: int = 2, recouvrement: int = 4):
    """Découpe n × n d'une image larg × haut avec `recouvrement` px de part et d'autre des coupes.
    → [(r, c, x0, y0, x1, y1)] en px (bornes exclues à droite)."""
    out = []
    xs = [round(larg * k / n) for k in range(n + 1)]
    ys = [round(haut * k / n) for k in range(n + 1)]
    for r in range(n):
        for c in range(n):
            x0 = max(0, xs[c] - (recouvrement if c else 0))
            x1 = min(larg, xs[c + 1] + (recouvrement if c < n - 1 else 0))
            y0 = max(0, ys[r] - (recouvrement if r else 0))
            y1 = min(haut, ys[r + 1] + (recouvrement if r < n - 1 else 0))
            out.append((r, c, x0, y0, x1, y1))
    return out
