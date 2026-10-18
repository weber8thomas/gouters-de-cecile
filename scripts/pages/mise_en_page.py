"""Moteur de mise en page « naturelle » des pages du carnet.

Entrée : une description de page (src/content/pages/<id>.json, ou fabriquée par recette.py). Sortie :
les traits à cuire (px de la page, y vers le bas), les boîtes des mots, le texte réel de la page
(accessibilité), les zones réservées aux éléments vivants (photo collée, coin du feuillet volant) et
les croquis (traits + lavis) demandés au module des croquis (scripts/pages/croquis.py, lot C).

Page de référence : 850 × 1200 px (format 17 × 24 cm). Une page de feuillet volant (`type: "feuillet"`) a sa propre
`taille` (≈ 0,8 × la page) ; la hauteur d'x reste en px de la page de référence (même écriture).

Les dix règles de design-system/docs/references-carnets.md § 5, avec la contrainte de lisibilité
du projet (hauteur d'x ≥ 1,8 % de la largeur de page, lue à 3 m sur la TV et sur un téléphone) :

 1. marges asymétriques, droite mangée (reliure respectée : l'ombre du pli mange 5 à 8 %) ;
 2. interligne ≈ celui de la main (2,9 à 3,6 hauteurs d'x), ± 6 % ; il se resserre sur les
    dernières lignes quand la page est pleine (jamais la taille sous 1,8 %) ;
 3. lignes jamais horizontales : biais de page ± 0,5°, pente de ligne ± 0,35° (bornée à
    ± 1,5°), ligne de base en marche aléatoire (≤ 0,15 hauteur d'x) ; sur un cahier, l'écriture
    suit la réglure (± 0,3 hauteur d'x), une ligne tous les deux carreaux ;
 4. marge gauche qui flotte (± 0,8 % L, bornée), alinéa de 3 à 7 % sur un paragraphe sur trois ;
 5. titres au fer, décalés ou centrés de travers, 1,3 à 1,4 × le corps, soulignés à la main ;
 6. filet court centré ou rien entre les parties ;
 7. ingrédients dans le texte (mains anciennes) ou en colonne / deux colonnes à barre tremblée /
    accolade (mains modernes) ; quand l'invité avait mis un emoji, un **croquis** sert de puce ;
 8. préparation en paragraphe continu, note finale soulignée ;
 9. pages pleines ou blanc libre en bas, jamais centrées verticalement ;
10. ajouts tardifs d'une autre encre ou d'une autre main posés dans l'espace libre (interligne,
    marge, fin de ligne) sans décaler le texte, ratures (trait simple, correction au-dessus, ‸).

Le dernier mot d'une ligne se tasse (espace − 35 %, largeur − 8 % au plus) plutôt que de passer
à la ligne ; aucune césure dans un mot. Rien n'est jamais posé dans une zone réservée : une ligne
trop étroite à côté d'une photo est sautée, un mot qui toucherait une zone vivante est un
débordement (la cuisson échoue).
"""
from __future__ import annotations

import hashlib
import importlib
import json
import math
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

import ecriture as ECR
import gestes as TR

ICI = Path(__file__).resolve().parent
RACINE = ICI.parents[1]
W, H = 850.0, 1200.0  # page de référence (px) : livre de recettes 17 × 24 cm (rapport 0,708)
# Hauteurs d'x par rôle (fraction de la largeur de la page de référence). Plan v5 : écriture d'un vrai
# carnet imprimé en 17 × 24 cm (corps ≈ 2,1 mm de hauteur d'x), 35 % plus fine qu'en v4 ; à l'écran,
# le zoom et la loupe prennent le relais. FINESSE règle tout d'un coup (rôles ET plancher).
# Réglage de l'utilisatrice (src/content/ecriture.json : « taille », « epaisseur », 1 = valeurs ci-dessous).
def _reglage_ecriture() -> dict:
    try:
        return json.loads((RACINE / "src/content/ecriture.json").read_text())
    except (OSError, ValueError):
        return {}


REGLAGE_ECRITURE = _reglage_ecriture()
FINESSE = 0.65 * float(REGLAGE_ECRITURE.get("taille", 1.0))
ROLES = {
    "corps": 0.0190 * FINESSE,
    "mot": 0.0194 * FINESSE,
    "titre": 0.0190 * 1.36 * FINESSE,
    "signature": 0.0190 * 1.32 * FINESSE,
    "annotation": 0.0184 * FINESSE,
    "legende": 0.0188 * FINESSE,
    "correction": 0.0181 * FINESSE,
}
XH_MIN = 0.0181 * FINESSE * W
# Le stylo ne rétrécit pas avec la lettre : la largeur du trait (en hauteurs d'x) est compensée pour
# garder à peu près l'épaisseur absolue de la v4 (une écriture plus petite, pas plus maigre).
EPAISSEUR_STYLO = 1.8 * float(REGLAGE_ECRITURE.get("epaisseur", 1.0))
TAILLE_PUCE = 1.3  # côté de la boîte d'une puce-croquis (hauteurs d'x) : un emoji fait ≈ une capitale
TAILLE_ICONE = 1.75  # petit croquis à côté d'un ingrédient (bout de ligne, marge) : discret mais lisible
TAILLE_EMOJI = 1.6  # croquis en ligne à la place d'un emoji (« Yummy … 🥕😎 »)
TAILLE_BANDEAU = 2.5  # prénom du bandeau, en hauteurs d'x du corps (2,2 à 2,8 : écrit en grand, sans crier)
# Espace entre les mots × celle de la main : un peu plus aérée que nature (lecture à 3 m, sur téléphone).
ESPACE = 1.12

PONCT = re.compile(r"^[!?:;»)\].,…]+$")
UNITES = {"g", "kg", "cl", "ml", "l", "dl", "min", "h", "mm", "cm", "%", "°C", "°", "°C)", "g,", "g.", "min.", "min,"}
ICONE = re.compile(r"^:([a-z][a-z0-9-]*):$")
_COUPE_ICONES = re.compile(r"(:[a-z][a-z0-9-]*:)")


def _norm(s: str) -> str:
    """Normalisation caractère par caractère (même longueur) : minuscules, sans accents."""
    out = []
    for c in s:
        if c in "’‘":
            out.append("'")
            continue
        if c in "  ":
            out.append(" ")
            continue
        d = [x for x in unicodedata.normalize("NFKD", c) if not unicodedata.combining(x)]
        out.append((d[0] if d else c).lower())
    return "".join(out)


def empreinte(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=_json_defaut).encode()).hexdigest()


def _json_defaut(o):
    if isinstance(o, np.ndarray):
        return np.round(o.astype(float), 4).tolist()
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, tuple):
        return list(o)
    return str(o)


# =============================================================================================
# Croquis (lot C, scripts/pages/croquis.py) : adaptateur UNIQUE
# =============================================================================================
# API (CONTRACT § 12.3) : disponibles() ; dessiner(nom, *, boite=(x, y, w, h), encre, graine, lavis=True)
# → {'traits': [[(x, y, p, v, e), …], …], 'lavis': […], 'boite': …} en px de page ;
# transmittance_lavis(lavis, forme, echelle, relief) → ndarray (H, W, 3).
# Tant que le module n'existe pas, ou qu'un nom n'est pas prêt (absent de disponibles(), ou de
# verification/out/c/PRETS.txt quand ce fichier existe), la place du croquis est RÉSERVÉE (aucune
# encre dessous) et la cuisson continue.
CROQUIS_MODULE = None  # injecté par les tests ; sinon chargé à la demande
_CROQUIS_ETAT: dict = {}
PRETS = RACINE / "verification/out/c/PRETS.txt"


def croquis_module():
    if CROQUIS_MODULE is not None:
        return CROQUIS_MODULE or None
    if "mod" not in _CROQUIS_ETAT:
        mod = None
        if os.environ.get("GC_CROQUIS", "1") != "0" and (ICI / "croquis.py").exists():
            try:
                mod = importlib.import_module("croquis")
            except Exception as e:  # le lot C travaille en parallèle : on réserve la place
                _CROQUIS_ETAT["erreur"] = f"{type(e).__name__}: {e}"
        _CROQUIS_ETAT["mod"] = mod
    return _CROQUIS_ETAT["mod"]


def croquis_disponibles() -> set:
    C = croquis_module()
    if C is None:
        return set()
    cle = id(C)
    if _CROQUIS_ETAT.get("dispo_de") != cle:
        try:
            noms = set(C.disponibles())
        except Exception as e:
            _CROQUIS_ETAT["erreur"] = f"disponibles() : {e}"
            noms = set()
        if CROQUIS_MODULE is None and PRETS.exists():
            prets = {l.strip().split()[0] for l in PRETS.read_text().splitlines() if l.strip() and not l.startswith("#")}
            noms &= prets
        _CROQUIS_ETAT["dispo"] = noms
        _CROQUIS_ETAT["dispo_de"] = cle
    return _CROQUIS_ETAT["dispo"]


def choisir_croquis(noms) -> str:
    """Premier nom prêt parmi les variantes (« tarte » ou « tasse »…), sinon le premier (réservé)."""
    if isinstance(noms, str):
        noms = [noms]
    dispo = croquis_disponibles()
    for n in noms:
        if n in dispo:
            return n
    return noms[0]


def croquis_dessiner(nom, boite, encre_id, graine, lavis=True, **options) -> dict:
    """dessiner() du lot C ; les options (main, outil, xh : stylo de l'invité ; variante : même
    petit dessin d'une ligne à l'autre d'une liste) ne sont passées que si le module les connaît."""
    C = croquis_module()
    boite = tuple(float(v) for v in boite)
    opts = {k: v for k, v in options.items() if v is not None}
    if opts:
        try:
            return C.dessiner(nom, boite=boite, encre=encre_id, graine=int(graine), lavis=lavis, **opts)
        except TypeError:
            pass
    return C.dessiner(nom, boite=boite, encre=encre_id, graine=int(graine), lavis=lavis)


def croquis_variante(nom, graine, taille):
    """Variante commune à toute une liste à puces (une vraie personne refait le même petit dessin)."""
    C = croquis_module()
    f = getattr(C, "choisir_variante", None) if C is not None else None
    if f is None:
        return None
    try:
        return f(nom, int(graine), float(taille))
    except Exception:
        return None


def croquis_empreinte(demandes: list) -> str:
    """Empreinte des données de croquis utilisées par une page (invalide le cache quand un croquis
    change) : pour chaque nom, le résultat de dessiner() sur une boîte témoin, et la liste des
    noms prêts. Les noms non prêts (place réservée) comptent aussi : quand ils arrivent, la page
    est recuite."""
    noms = sorted({n for n in demandes})
    dispo = croquis_disponibles()
    m = hashlib.sha256(json.dumps(sorted(dispo & set(noms))).encode())
    for n in noms:
        m.update(n.encode())
        if n in dispo:
            try:
                d = croquis_dessiner(n, (0.0, 0.0, 100.0, 100.0), "bic", 1, True)
                m.update(empreinte(d).encode())
            except Exception as e:
                m.update(f"erreur {e}".encode())
        else:
            m.update(b"reserve")
    return m.hexdigest()[:16]


# =============================================================================================
# Balisage : ~~150 g~~>{120 g}  ·  ~~oups~~  ·  __souligné__  ·  ^{inséré}  ·  :croquis: (icône)
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


def texte_sans_balises(texte: str) -> str:
    """Texte lisible d'un texte balisé (corrections appliquées, icônes retirées)."""
    brut, marques = analyser(texte)
    s = brut
    for mq in sorted(marques, key=lambda m: -m["debut"]):
        if mq["genre"] == "rature":
            s = s[: mq["debut"]] + (mq.get("correction") or "") + s[mq["fin"]:]
        elif mq["genre"] == "insertion":
            s = s[: mq["debut"]] + mq["correction"] + " " + s[mq["debut"]:]
    s = _COUPE_ICONES.sub(" ", s)
    return re.sub(r"\s+", " ", s.replace("\n", " ")).strip()


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
    sans_saut: bool = False  # glyphe d'un mot important (drapeau du lot E) : jamais de blanc de bille


@dataclass
class MotPose:
    texte: str
    base: tuple  # (x0, y0, x1, y1) ligne de base, px de page
    xh: float
    boite: tuple  # (x0, y0, x1, y1)
    bloc: str
    ligne: int
    rature: bool = False  # mot barré (on ne le relit pas : c'est la correction au-dessus qui compte)
    contexte: str = ""  # texte du bloc (pour savoir si le mot est important)


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
    pleine: float = 0.0  # largeur disponible sans zone réservée (pour savoir si la ligne est rognée)

    def y(self, x: float) -> float:
        k = (x - self.x0) / self.pas
        marche = float(np.interp(k, np.arange(len(self.noeuds)), self.noeuds))
        return self.y0 + math.tan(self.theta) * (x - self.x0) + marche


_BARRE = re.compile(r"(?<=\d)/(?=\d)")


def _copie_collee(m: ECR.Mot) -> ECR.Mot:
    c = ECR.Mot(texte=m.texte, traits=m.traits, largeur=m.largeur, espace_avant=0.06, hauteur_x=m.hauteur_x,
                debord_g=m.debord_g, debord_d=m.debord_d)
    c.colle = True
    return c


def _accepte_contexte() -> bool:
    """ecriture.ecrire_bloc (lot E) prend-il le contexte des mots importants (ingrédients, noms) ?"""
    import inspect
    f = ECR.ecrire_bloc
    try:
        return "contexte" in inspect.signature(f).parameters
    except (TypeError, ValueError):
        return False


def _sans_saut(P: np.ndarray, drapeau, k: int) -> bool:
    """Drapeau « pas de saut de bille » d'un trait (lot E) : 6e colonne des points, ou attribut du mot
    (`sans_saut` : booléen pour tout le mot, ou liste par trait)."""
    if P.ndim == 2 and P.shape[1] >= 6:
        return bool(np.nanmax(P[:, 5]) > 0.5)
    if isinstance(drapeau, (list, tuple)):
        return bool(drapeau[k]) if k < len(drapeau) else False
    return bool(drapeau)


def mot_icone(nom: str, largeur: float = 1.3, colle: bool = False) -> ECR.Mot:
    """Mot-icône : un croquis posé dans la ligne à la place d'un emoji (« :carotte: »). `colle` : il
    reste sur la ligne du mot qui le précède (icône discrète en bout de ligne d'ingrédient)."""
    if colle:
        m = ECR.Mot(texte=f":{nom}:", traits=[], largeur=TAILLE_ICONE * 1.05, espace_avant=0.55)
        m.colle = True
        m.taille_icone = TAILLE_ICONE
        return m
    m = ECR.Mot(texte=f":{nom}:", traits=[], largeur=max(largeur, TAILLE_EMOJI * 1.05), espace_avant=0.0)
    m.taille_icone = TAILLE_EMOJI
    return m


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
    if getattr(cur, "colle", False):
        return True
    if ICONE.match(t) and ICONE.match(p):
        return True
    if ICONE.match(t) or ICONE.match(p):
        return False
    if PONCT.match(t) or t.startswith("°") or t in ("»",):
        return True
    if p in ("«", "(") or p.endswith("("):
        return True
    if re.search(r"[\d½¼¾⅓⅔]$", p) and (t.rstrip(",.;:)") in UNITES or t.startswith("°")):
        return True
    if p in ("c.", "th.", "c", "1/2") and len(t) <= 3:
        return True
    if p == "à" and t.rstrip(",.;:)") in ("s", "c", "s.", "c."):  # « 1 c. à s. » ne se coupe pas
        return True
    if re.fullmatch(r"\d+", p) and re.match(r"^[a-zœæéèàâ]", t):  # « 4 œufs » ne se sépare pas
        return True
    return False


# =============================================================================================
# Encres : une encre pas encore livrée par l'outil d'écriture (lot E : « bille-bleue ») est remplacée
# par sa plus proche voisine, et le remplacement est signalé (journal de cuisson).
# =============================================================================================
REPLIS_ENCRE = {"bille-bleue": "bic"}
ENCRES_REMPLACEES: dict = {}


def encre_dispo(enc_id):
    if enc_id is None:
        return None
    try:
        import encre as _M  # tools/ecriture/encre.py
        connues = _M.ENCRES
    except Exception:
        return enc_id
    if enc_id in connues:
        return enc_id
    rep = REPLIS_ENCRE.get(enc_id, "bic")
    ENCRES_REMPLACEES[enc_id] = rep
    return rep


# Zone du folio imprimé par le livre (Livre/Face : `bottom: --gc-space-4`, à --gc-page-pad-outer du
# bord extérieur) : large par défaut ; « juste » (`folio_juste`) = la boîte réelle du numéro, et une
# ligne ne la touche que si ses jambages y descendent (0,55 x sous la ligne de base, pas 1 x).
FOLIO_LARGE = {"gauche": (0.045, 0.94, 0.15, 1.0), "droite": (0.85, 0.94, 0.955, 1.0)}
FOLIO_JUSTE = {"gauche": (0.06, 0.947, 0.135, 1.0), "droite": (0.865, 0.947, 0.94, 1.0)}
# Folio écrit à la main (`Mise.folio`) : même main et même encre sur tout le carnet, hauteur d'x 0,9 × celle
# du corps ; le bord extérieur de la boîte « juste » sert d'alignement (gauche à 0,06 W, droite à 0,94 W).
FOLIO_MAIN, FOLIO_ENCRE, FOLIO_ECHELLE = "cecile", "crayon", 0.9

# =============================================================================================
# Le moteur
# =============================================================================================
_BLOCS: dict = {}  # écritures déjà demandées (et vérifiées) dans ce processus
# blocs posés AVANT le texte coulé (zones réservées : la recette coule autour)
BLOCS_RESERVES = ("bandeau", "courant", "cadre", "etiquette", "ornement", "cartouche")


class Mise:
    def __init__(self, desc: dict, serrage: tuple | None = None, global_pas: float = 1.0, sonde: bool = False,
                 dessins: bool = True):
        self.desc = desc
        self.id = desc["id"]
        self.type = desc.get("type", "page")
        self.W, self.H = (float(v) for v in desc.get("taille", (W, H)))
        self.cote = desc.get("cote", "droite")
        self.graine = int(desc.get("graine", 1))
        self.rng = np.random.default_rng(self.graine)
        r = self.rng
        self.main = desc.get("main", "soignee")
        self.encre = encre_dispo(desc.get("encre"))
        self.serrage = serrage  # (n_lignes_total, n_dernieres, facteur)
        # interligne local (pagination : −4 % pour combler un trou en bas de page)
        self.global_pas = global_pas * float(desc.get("pas_local", 1.0))
        # réglage de la page (« ecriture » : taille, epaisseur), en plus de celui du carnet
        ecr = desc.get("ecriture") or {}
        self.xh_facteur = float(desc.get("xh_facteur", 1.0)) * float(ecr.get("taille", 1.0))
        self.trait = EPAISSEUR_STYLO * float(ecr.get("epaisseur", 1.0))
        # plancher de lisibilité (écran : 1,8 % de la largeur ; A5 imprimé : un peu plus petit, voir formats.py)
        self.xh_min = float(desc.get("xh_min", XH_MIN / W)) * W * float(ecr.get("taille", 1.0))
        self.dessins = dessins
        self.grille = desc.get("grille")  # réglure du cahier (feuillet volant) : l'écriture la suit
        self._k_prec = None
        m = desc.get("marges", {})
        if self.grille:
            g = self.grille
            self.ml = m.get("gauche", (g["marge_x"] / self.W) + r.uniform(0.010, 0.018)) * self.W
            self.xr = self.W * (1 - m.get("droite", r.uniform(0.03, 0.045)))
        elif self.cote == "gauche":  # extérieur à gauche, reliure à droite
            self.ml = self.W * m.get("gauche", r.uniform(0.052, 0.066))
            self.xr = self.W * (1 - m.get("droite", r.uniform(0.058, 0.066)))
        else:
            self.ml = self.W * m.get("gauche", r.uniform(0.078, 0.092))
            self.xr = self.W * (1 - m.get("droite", r.uniform(0.022, 0.032)))
        self.haut = self.H * m.get("haut", r.uniform(0.062, 0.08))
        self.bas = 1e9 if sonde else self.H * (1 - m.get("bas", 0.035))
        self.biais = float(np.clip(r.normal(desc.get("biais", 0.0), 0.22), -0.5, 0.5))
        self.sigma_pente = float(desc.get("sigma_pente", r.uniform(0.22, 0.4)))
        if self.grille:
            self.biais = float(self.grille.get("angle", 0.0))
            self.sigma_pente = float(desc.get("sigma_pente", 0.12))
        # zones réservées (nommées) : éléments vivants (photo, coin du feuillet), place d'une note,
        # folio imprimé du livre (bas, côté extérieur)
        self.reserves: list = []  # [(rect, nom)]
        self.vivants = {}
        self.zones = {}
        for v in desc.get("vivants", []):
            if "rect" not in v:
                continue  # posée par son bloc pendant la mise en page (vignette du sommaire)
            x, y, w, h = v["rect"]
            rect = (x * self.W, y * self.H, (x + w) * self.W, (y + h) * self.H)
            if v.get("vivant", True):
                self.vivants[v["nom"]] = rect
            self.zones[v["nom"]] = rect
            self.reserves.append((rect, v["nom"]))
        self.folio_juste = bool(desc.get("folio_juste", False))
        if self.type != "feuillet" and not desc.get("sansFolio") and desc.get("zone_folio", True):
            # folio imprimé par le livre (Livre/Face : `bottom: --gc-space-4`, à --gc-page-pad-outer du bord
            # extérieur, 28 px) : x ≈ 0,066 à 0,125 et y ≈ 0,95 à 0,985 de la page, aux trois crans
            fx0, fy0, fx1, fy1 = (FOLIO_JUSTE if self.folio_juste else FOLIO_LARGE)[self.cote if self.cote == "gauche" else "droite"]
            self.reserves.append(((fx0 * self.W, fy0 * self.H, fx1 * self.W, fy1 * self.H), "folio"))
        self._ignorer: tuple = ()  # zones ignorées pendant l'écriture DANS une zone (le mot du cadre)
        self.liens: list = []  # [{cible, rect (px), invite?}] : lignes du sommaire (cliquables)
        self.zones_blocs: dict = {}  # bandeau, courant, cadre : boîte posée (px)
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
        self.croquis: list[dict] = []  # demandes de croquis (puces, icônes, dessins de marge)
        self.lavis: list = []  # lavis des croquis dessinés (cuits par transmittance_lavis)
        self.croquis_non_places: list[str] = []
        self.folio_mots: list = []  # le folio écrit à la main (hors du texte coulé, voir `folio`)

    # ---- écriture (N2) --------------------------------------------------------------------
    def ecrire(self, texte, main, graine, encre=None, outil=None):
        encre = encre_dispo(encre)
        ctx = self.desc.get("contexte_importants")
        cle = (texte, main, graine, encre, outil, json.dumps(ctx, sort_keys=True, ensure_ascii=False) if ctx else None)
        if cle not in self._bloc_cache:
            if cle not in _BLOCS:
                if ctx and _accepte_contexte():
                    _BLOCS[cle] = ECR.ecrire_bloc(texte, main, graine, encre=encre, outil=outil, contexte=ctx)
                else:
                    _BLOCS[cle] = ECR.ecrire_bloc(texte, main, graine, encre=encre, outil=outil)
            b = _BLOCS[cle]
            self._bloc_cache[cle] = b
            self.douteux += b.douteux
        return self._bloc_cache[cle]

    def ecrire_segments(self, segments, main, enc_id, outil):
        """Atomes d'un bloc ([{texte, graine}]) écrits CHACUN À PART, avec sa graine : un atome qui
        passe d'une page à l'autre garde exactement la même écriture. Les icônes « :nom: » deviennent
        des mots-icônes (croquis). → (texte brut, marques, mots, bloc de référence)."""
        bruts, marques, mots = [], [], []
        ref = None
        n = 0
        for s in segments:
            g = int(s["graine"])
            morceaux = [p for p in _COUPE_ICONES.split(s["texte"]) if p.strip()]
            k = 0
            for p in morceaux:
                p = p.strip()
                if ICONE.match(p):
                    ic = mot_icone(ICONE.match(p).group(1))
                    if mots:  # l'emoji suit le mot écrit juste avant : il ne passe pas seul à la ligne
                        ic.colle = True
                        ic.espace_avant = 0.45 if not ICONE.match(mots[-1].texte) else 0.12
                    mots.append(ic)
                    brut_p, marques_p = p, []
                    for mq in marques_p:
                        marques.append(dict(mq, debut=mq["debut"] + n, fin=mq["fin"] + n))
                    bruts.append(brut_p)
                    n += len(brut_p) + 1
                    continue
                # « 5/6 » : le réseau d'écriture rate la barre entre deux chiffres (elle disparaît
                # ou devient un 7) ; elle est tracée à la main, collée aux deux chiffres
                sous = _BARRE.split(p)
                for q, sp in enumerate(sous):
                    if q:
                        mots.append(self._mot_barre(main, enc_id, outil, g + 7 * q))
                        bruts[-1] += "/"
                        n += 1
                    brut_p, marques_p = analyser(sp)
                    bloc = self.ecrire(brut_p, main, g + 101 * k, enc_id, outil)
                    k += 1
                    ref = ref or bloc
                    nouv = [m for l in bloc.lignes for m in l]
                    if q and nouv:
                        nouv[0] = _copie_collee(nouv[0])
                    mots += nouv
                    for mq in marques_p:
                        marques.append(dict(mq, debut=mq["debut"] + n, fin=mq["fin"] + n))
                    if q:
                        bruts[-1] += brut_p
                        n += len(brut_p)
                    else:
                        bruts.append(brut_p)
                        n += len(brut_p)
                n += 1
        if ref is None:  # que des icônes
            info = ECR.main_info(main)
            ref = ECR.Bloc(lignes=[], main=main, style=info["style"], interligne=info["interligne"], taille=info["taille"],
                           epaisseur=info["epaisseur"], encre=ECR.nuances(enc_id or "bic", outil))
        return " ".join(bruts), marques, mots, ref

    def _mot_barre(self, main, enc_id, outil, graine) -> ECR.Mot:
        """Barre de fraction « / » tracée d'un geste (repère du mot, unité = hauteur d'x)."""
        rng = np.random.default_rng(graine)
        inc = float(rng.uniform(0.38, 0.5))
        a = np.array([0.08 + rng.normal(0, 0.03), 0.18 + rng.normal(0, 0.04)])
        b = np.array([0.08 + inc + rng.normal(0, 0.03), -1.32 + rng.normal(0, 0.06)])
        G = TR.geste(TR.trait_courbe(a, b, rng, 1.0, 0.01, 12), rng, 1.0, appui=0.8, vif=1.3, tremble=0.01)
        enc = ECR.nuances(enc_id or "bic", outil)
        try:  # la barre fait partie d'un nombre (« 5/6 ») : mot important, jamais de saut de bille (lot E)
            traits = ECR.encrer_traits([G], enc["id"], enc.get("outil"), int(graine) % (2 ** 31), main, proteger=True)
        except TypeError:
            traits = ECR.encrer_traits([G], enc["id"], enc.get("outil"), int(graine) % (2 ** 31), main)
        m = ECR.Mot(texte="/", traits=[np.asarray(t, float) for t in traits], largeur=inc + 0.18, espace_avant=0.06)
        m.colle = True
        m.important = True
        return m

    def xh_de(self, role: str, main: str) -> float:
        taille = ECR.main_info(main)["taille"]
        return max(self.xh_min, ROLES[role] * W * taille * self.xh_facteur)

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

    def plage(self, y: float, xh: float, x0: float, x1: float, ignorer=()):
        """Intervalle [x0, x1] d'une ligne de base y hors des zones réservées : le plus large des
        morceaux libres (None s'il est trop étroit : la ligne sera sautée)."""
        haut, bas = y - 2.2 * xh, y + 1.0 * xh
        libres = [(x0, x1)]
        ignorer = tuple(ignorer) + tuple(self._ignorer)
        for (rx0, ry0, rx1, ry1), nom in self.reserves:
            if nom in ignorer or haut > ry1:
                continue
            if (y + 0.55 * xh if (nom == "folio" and self.folio_juste) else bas) < ry0:
                continue
            a, b = rx0 - 0.4 * xh, rx1 + 0.4 * xh
            nouv = []
            for (u, v) in libres:
                if b <= u or a >= v:
                    nouv.append((u, v))
                    continue
                if a > u:
                    nouv.append((u, a))
                if b < v:
                    nouv.append((b, v))
            libres = nouv
        if not libres:
            return None
        # le début de la ligne n'est jamais décalé par une zone (folio en bas à gauche, photo) :
        # une vraie main s'arrête au-dessus plutôt que d'écrire à côté
        u, v = libres[0]
        if u > x0 + 0.5 or v - u < max(9 * xh, 0.3 * (x1 - x0)):
            return None
        return u, v

    def _y_grille(self, y: float, sauter: float) -> float:
        """Ligne de base posée sur la réglure : une ligne tous les deux carreaux (± 0,3 x)."""
        g = self.grille
        c = g["carreau"]
        if self._k_prec is None:
            k = math.ceil((y - g["y0"]) / c - 0.3)
        else:
            # une ligne tous les deux carreaux ; une ligne laissée en blanc pour un vrai saut (≥ 0,6)
            pas = 2 * max(1, int(math.floor((y - self.base) / (2 * c) + 0.5 - (0.0 if sauter >= 0.6 else 0.45))))
            k = self._k_prec + pas
        self._k_prec = k
        return g["y0"] + k * c

    def nouvelle_ligne(self, xh: float, interligne: float, *, x0=None, x1=None, sauter=0.0, pente=None,
                       sigma=None, derive=True, premier_haut=1.55) -> Ligne | None:
        n = len(self.lignes)
        pas = interligne * xh
        if self.base is None:
            y = self.haut + premier_haut * xh
        else:
            moy = 0.5 * (pas + (self.pas_prec or pas))
            y = self.base + moy * (1 + sauter) * self._facteur_pas(n) * float(np.clip(self.rng.normal(1, 0.035), 0.93, 1.07))
        if derive:
            self.marge_derive = float(np.clip(0.55 * self.marge_derive + self.rng.normal(0.004, 0.006) * self.W, 0, 0.03 * self.W))
        gx = (self.ml if x0 is None else x0) + (self.marge_derive if derive and x0 is None else 0)
        dx = self.xr if x1 is None else x1
        while True:
            if self.grille:
                y = self._y_grille(y, sauter)
                yb = y + float(np.clip(self.rng.normal(-0.04, 0.09), -0.3, 0.2)) * xh
            else:
                yb = y
            if yb > self.bas:
                return None
            p = self.plage(yb, xh, gx, dx)
            if p is not None:
                break
            # zone réservée (photo, coin du feuillet) : on passe dessous
            self.base = y
            y = y + (0.0 if self.grille else 0.5 * pas)
        gx2, dx2 = p
        theta = self._pente(sigma, pente)
        pas_m = 2.0 * xh
        k = int((dx2 - gx2) / pas_m) + 3
        marche = np.cumsum(self.rng.normal(0, 0.035 * xh, k))
        marche = np.clip(marche - marche.mean(), -0.15 * xh, 0.15 * xh)
        if self.grille:  # l'écriture suit la réglure : ligne de base calée sur le trait du carreau
            yb += math.tan(math.radians(self.grille.get("angle", 0.0))) * (gx2 - self.grille.get("xc", self.W / 2))
        L = Ligne(y0=yb, x0=gx2, x1=dx2, theta=theta, xh=xh, noeuds=marche, pas=pas_m, n=n, pleine=dx - gx)
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
        w = mot.largeur * xh * ech_x
        b = (x, y, x + w * ca, y + w * sa)
        ic = ICONE.match(mot.texte.strip())
        if ic:  # icône en ligne : un croquis à la place de l'emoji
            t = getattr(mot, "taille_icone", TAILLE_PUCE) * xh * float(np.clip(r.normal(1.0, 0.05), 0.92, 1.1))
            bx = x + (w - t) / 2 + r.normal(0, 0.05) * xh
            by = y - t + r.normal(0.06, 0.05) * xh
            boite = (bx, by, bx + t, by + t)
            self.demander_croquis(ic.group(1), (bx, by, t, t), encre, int(self.graine * 7 + len(self.croquis) * 31),
                                  role="icone", ep=ep * xh, xh=xh)
            mp = MotPose(mot.texte, b, xh, boite, bloc, ligne.n)
            self.mots.append(mp)
            ligne.mots.append(mp)
            return mp, w * ca
        tous = []
        ss_mot = getattr(mot, "sans_saut", None)
        if ss_mot is None:
            ss_mot = bool(getattr(mot, "important", False))  # lot E : mot important → aucun saut de bille
        for k_t, T in enumerate(mot.traits):
            P = np.asarray(T, float).copy()
            lx = P[:, 0] * xh * ech_x
            ly = P[:, 1] * xh
            P[:, 0] = x + lx * ca - ly * sa
            P[:, 1] = y + lx * sa + ly * ca
            self.traces.append(Trace(P[:, :5], ep * xh * self.trait, encre, sans_saut=_sans_saut(P, ss_mot, k_t)))
            tous.append(P[:, :2])
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
        W_ = self.W
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
                    gx = (self.ml if x0 is None else x0) + (alinea * W_ if not lignes else retrait_suite * W_)
                    fin = prevoir(g, (self.xr if x1 is None else x1) - gx)
                    if any(i in haut_requis for gr in groupes[g:fin] for i in gr):
                        extra = 1.6 / interligne  # place pour la correction écrite au-dessus
                ligne = self.nouvelle_ligne(xh, interligne, x0=(None if x0 is None and not (lignes and retrait_suite) else
                                                                (x0 if x0 is not None else self.ml) + (retrait_suite * W_ if lignes else 0.0)),
                                            x1=x1, sauter=(sauter if not lignes else 0.0) + extra,
                                            pente=pente, sigma=sigma, derive=derive, premier_haut=premier_haut + extra * interligne)
                if ligne is None:
                    self.deborde.append(bloc)
                    return poses, lignes
                lignes.append(ligne)
                x = ligne.x0 + (alinea * W_ if len(lignes) == 1 and premiere is None else 0.0)
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
                if k and getattr(m, "colle", False):
                    e = m.espace_avant * float(np.clip(r.normal(1, 0.2), 0.5, 1.5))
                if k and ICONE.match(m.texte) and not getattr(m, "colle", False):
                    e = 0.3 * espace * float(np.clip(r.normal(1, 0.2), 0.6, 1.4))
                if e > 0 and i > 0:
                    # l'encre qui dépasse (queue d'un « s », attaque d'une majuscule) ne doit pas
                    # coller les mots : l'espace se mesure d'encre à encre
                    deb = 0.85 * (getattr(mots[i - 1], "debord_d", 0.0) + getattr(m, "debord_g", 0.0))
                    e = max(e, (0.5 if e >= 0.45 * espace else 0.08) * espace + deb) if deb > 0 else e
                larg.append((e * xh, m.largeur * xh))
            total = sum(a + b for a, b in larg)
            depasse = x + total - ligne.x1
            ech_x, ech_esp = 1.0, 1.0
            if depasse > 0 and debut_ligne and ligne.pleine and (ligne.x1 - ligne.x0) < 0.92 * ligne.pleine:
                # ligne rognée par une zone réservée : le mot passe à la ligne suivante, jamais dessous
                ligne = None
                continue
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
            self.traces.append(Trace(P, ep * xh * self.trait, encre))
            self.marques_boites.append((P[:, 0].min(), P[:, 1].min(), P[:, 0].max(), P[:, 1].max()))

    # ---- croquis ----------------------------------------------------------------------------------
    def demander_croquis(self, nom, boite, encre: dict, graine: int, role: str, ep: float, lavis: bool = True,
                         main: str | None = None, xh: float | None = None, liste: int | None = None):
        """Réserve la place d'un croquis (x, y, w, h en px de page) ; il est dessiné en fin de page,
        au stylo de l'invité (main, hauteur d'x du corps). `liste` : graine de la liste à puces
        (même variante du dessin sur toutes ses lignes, même coupées entre deux pages)."""
        x, y, w, h = boite
        self.croquis.append(dict(nom=nom, boite=[round(float(v), 3) for v in boite], encre=dict(encre), graine=int(graine),
                                 role=role, ep=float(ep), lavis=lavis, dessine=False, main=main or self.main,
                                 xh=xh, liste=liste))
        self.marques_boites.append((x, y, x + w, y + h))

    def _dessiner_croquis(self):
        dispo = croquis_disponibles() if self.dessins else set()
        for req in self.croquis:
            if req["nom"] not in dispo:
                continue
            variante = None
            if req.get("liste") is not None:
                variante = croquis_variante(req["nom"], req["liste"], max(req["boite"][2], req["boite"][3]))
            try:
                d = croquis_dessiner(req["nom"], req["boite"], req["encre"]["id"], req["graine"], req["lavis"],
                                     main=ECR.MAINS_N2.get(req["main"], req["main"]), outil=req["encre"].get("outil"),
                                     xh=req.get("xh"), variante=variante)
            except Exception as e:  # le lot C travaille en parallèle : la place reste réservée
                req["erreur"] = f"{type(e).__name__}: {e}"
                continue
            diam = float(d.get("diam", d.get("epaisseur", req["ep"])))
            enc = dict(d["encre"]) if isinstance(d.get("encre"), dict) and "charge" in d["encre"] else req["encre"]
            for T in d.get("traits", []):
                P = np.asarray(T, float)
                if P.ndim != 2 or len(P) == 0:
                    continue
                if P.shape[1] < 5:
                    P = ECR._repli_encre(P)
                self.traces.append(Trace(P[:, :5].copy(), diam * self.trait, enc))
            if req["lavis"] and d.get("lavis"):
                self.lavis.append(d["lavis"])
            req["dessine"] = True
            req["sha"] = empreinte(d)[:16]

    # ---- blocs ---------------------------------------------------------------------------------
    def _style_bloc(self, b: dict, role: str):
        main = b.get("main", self.main)
        enc_id = encre_dispo(b.get("encre", self.encre))
        outil = b.get("outil", self.desc.get("outil") if enc_id == self.encre else None)
        info = ECR.main_info(main)
        xh = self.xh_de(b.get("role", role), main) * float(b.get("echelle", 1.0))
        return main, enc_id, outil, info, xh

    @staticmethod
    def _ep(epaisseur: float, b: dict) -> float:
        """Épaisseur (en hauteurs d'x) d'un texte écrit en grand (`echelle` k) : même stylo, un peu
        plus appuyé — le trait ne grossit pas comme la lettre (k^0,3 au lieu de k)."""
        k = float(b.get("echelle", 1.0))
        return epaisseur * (k ** -0.7 if k > 1 else 1.0)

    def _segments(self, b: dict, graine: int) -> list:
        segs = b.get("segments")
        if segs:
            return segs
        return [{"texte": b["texte"], "graine": graine}]

    def bloc_texte(self, b: dict, role: str, idx: int, **kw):
        """Bloc de texte balisé (paragraphe, note, mot…) : écrit, coule, marque."""
        main, enc_id, outil, info, xh = self._style_bloc(b, role)
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        brut, marques, mots, bloc = self.ecrire_segments(self._segments(b, graine), main, enc_id, outil)
        encre = dict(bloc.encre)
        interligne = float(b.get("interligne", bloc.interligne))
        spans = _spans(brut, [mots])
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
        s = _COUPE_ICONES.sub(" ", s)
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
                    ch = TR.souligne(xa, ya, xb, yb, r, xh, double=b.get("souligne_double", False), dy=0.5)
                    enc = encre if not b.get("souligne_encre") else ECR.nuances(b["souligne_encre"])
                    self.tracer(ch, xh, enc, bloc.epaisseur * 0.95, graine + 50 + k, main)
                else:  # rature
                    c_main = corr_cfg.get("main", main)
                    c_enc = ECR.nuances(corr_cfg["encre"]) if corr_cfg.get("encre") else encre
                    c_ep = ECR.main_info(c_main)["epaisseur"]
                    ch = TR.rature(xa, ya, xb, yb, r, xh)
                    self.tracer(ch, xh, c_enc, c_ep, graine + 70 + k, c_main)
            if mq["genre"] == "rature":
                for p in dedans:
                    p.rature = True
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
        L = Ligne(y0=float(base[1]), x0=float(base[0]), x1=self.W, theta=ang + math.radians(r.normal(-1.2, 0.8)), xh=xh,
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
        brut, marques, mots, bloc = self.ecrire_segments(self._segments(b, graine), main, enc_id, outil)
        espace = info["espace"]
        largeur = sum(m.largeur * xh for m in mots) + espace * xh * (len(mots) - 1)
        r = self.rng
        pos = b.get("position", "fer")
        dispo = self.xr - self.ml
        if pos == "centre":
            x = self.ml + (dispo - largeur) / 2 - r.uniform(0.03, 0.09) * self.W
        elif pos == "decale":
            x = max(self.ml, self.W * r.uniform(0.2, 0.28) - (0.0 if self.cote == "gauche" else -0.02 * self.W))
        else:
            x = self.ml + r.uniform(0.0, 0.012) * self.W
        x = float(np.clip(x, self.ml, max(self.ml, self.xr - largeur)))
        sauter = float(b.get("avant", 0.0))
        ep = self._ep(bloc.epaisseur, b)
        poses, lignes = self.couler(mots, xh, float(b.get("interligne", bloc.interligne * 0.92)), dict(bloc.encre),
                                    ep, b.get("id", "titre"), espace=espace, x0=x, derive=False,
                                    sauter=sauter, premier_haut=b.get("premier_haut", 1.7))
        self.blocs_lignes[b.get("id", "titre")] = lignes
        spans = _spans(brut, [mots])
        self._marquer(b, brut, marques, poses, spans, xh, dict(bloc.encre), bloc, main, graine)
        sl = b.get("souligne", "aucun")
        ok = [p for p in poses if p is not None]
        if sl != "aucun" and ok:
            enc = ECR.nuances(b["souligne_encre"]) if b.get("souligne_encre") else dict(bloc.encre)
            if sl == "mot-a-mot":
                for k, p in enumerate(ok):
                    if PONCT.match(p.texte.strip()):
                        continue
                    self.tracer(TR.souligne(*p.base, r, xh, dy=0.5), xh, enc, ep * 0.9, graine + 10 + k, main)
            else:
                for n_l in sorted({p.ligne for p in ok}):
                    part = [p for p in ok if p.ligne == n_l and not PONCT.match(p.texte.strip())]
                    if not part:
                        continue
                    a, z = part[0].base, part[-1].base
                    self.tracer(TR.souligne(a[0], a[1], z[2], z[3], r, xh, double=(sl == "double"), dy=0.55),
                                xh, enc, ep * 0.9, graine + 10, main)
        self.texte.append(self._texte_lisible(brut, marques))
        return lignes

    def ingredients(self, b, idx):
        disp = b.get("disposition", "texte")
        if disp == "puces":
            return self.ingredients_puces(b, idx)
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
        # icônes « :oeuf: » en bout de ligne : retirées du texte écrit, posées après le dernier mot
        icones_items = []
        propres = []
        for it in items:
            parts = [q.strip() for q in _COUPE_ICONES.split(it) if q.strip()]
            icones_items.append([ICONE.match(q).group(1) for q in parts if ICONE.match(q)])
            propres.append(" ".join(q for q in parts if not ICONE.match(q)))
        items = propres
        if disp == "colonne":
            colonnes = [items]
            icones_cols = [icones_items]
        else:
            n = (len(items) + 1) // 2
            colonnes = [items[:n], items[n:]]
            icones_cols = [icones_items[:n], icones_items[n:]]
        # une écriture par colonne (l'encre et ses trempées suivent l'ordre d'écriture)
        blocs, brut_cols, marques_cols = [], [], []
        for c, col in enumerate(colonnes):
            brut, marques = analyser("\n".join(col))
            brut_cols.append(brut)
            marques_cols.append(marques)
            blocs.append(self.ecrire(brut, main, graine + 13 * c, enc_id, outil))
        encre = dict(blocs[0].encre)
        interligne = float(b.get("interligne", blocs[0].interligne))
        x_g = self.ml + r.uniform(0.0, 0.02) * self.W
        if disp == "colonne":
            bornes = [(x_g, self.xr)]
        else:
            larg_g = max(sum(m.largeur * xh for m in l) + info["espace"] * xh * (len(l) - 1)
                         + len(icones_cols[0][k]) * (TAILLE_PUCE * 1.05 + 0.6) * xh
                         for k, l in enumerate(blocs[0].lignes))
            x_barre = x_g + larg_g + r.uniform(0.022, 0.032) * self.W
            x_d = x_barre + r.uniform(0.032, 0.045) * self.W
            bornes = [(x_g, x_barre - 0.02 * self.W), (x_d, self.xr)]
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
                ics = icones_cols[c][k] if k < len(icones_cols[c]) else []
                l = list(l) + [mot_icone(nm, colle=True) for nm in ics]
                p, ls = self.couler(l, xh, interligne, encre, bloc.epaisseur, bid, espace=info["espace"],
                                    x0=bornes[c][0] + r.uniform(-0.004, 0.01) * self.W, x1=bornes[c][1], derive=False,
                                    sauter=float(b.get("avant", 0.0)) if (k == 0 and c == 0) else 0.0,
                                    haut_requis=req, retrait_suite=0.03)
                p = p[:len(l) - len(ics)]
                n0 += len(p)
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

    def ingredients_puces(self, b, idx):
        """Liste à puces-croquis : une ligne par ingrédient (atome écrit avec sa propre graine), le
        croquis à la place du tiret (≈ 1,1 hauteur d'x, posé sur la ligne de base, un peu de
        travers), les lignes qui continuent rentrées sous le texte. Une ligne sans puce
        (« Bonus : … ») part de la marge."""
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        r = self.rng
        bid = b.get("id", f"b{idx}")
        toutes = []
        x_puce0 = self.ml + r.uniform(0.0, 0.012) * self.W
        for k, l in enumerate(b["lignes"]):
            if isinstance(l, str):
                l = {"texte": l}
            g = int(l.get("graine", graine + 13 * k))
            puce = l.get("puce", b.get("puce")) if "puce" in l else b.get("puce")
            brut, marques, mots, bloc = self.ecrire_segments([{"texte": l["texte"], "graine": g}], main, enc_id, outil)
            encre = dict(bloc.encre)
            interligne = float(b.get("interligne", bloc.interligne))
            t = TAILLE_PUCE * xh * float(np.clip(r.normal(1.0, 0.05), 0.92, 1.1))
            ecart = 0.5 * xh * float(np.clip(r.normal(1, 0.12), 0.75, 1.3))
            x_txt = x_puce0 + r.normal(0, 0.05) * xh + ((t + ecart) if puce else 0.0)
            spans = _spans(brut, [mots])
            poses, lignes = self.couler(mots, xh, interligne, encre, bloc.epaisseur, bid, espace=info["espace"],
                                        x0=x_txt, derive=False, sauter=float(b.get("avant", 0.0)) if k == 0 else 0.0,
                                        haut_requis=_haut_requis(marques, spans), retrait_suite=0.0)
            if lignes and puce:
                L = lignes[0]
                xp = L.x0 - t - ecart + r.normal(0, 0.06) * xh
                yb = L.y(xp) + r.normal(0.08, 0.05) * xh
                self.demander_croquis(puce, (xp, yb - t, t, t), encre, g + 5, role="puce", ep=bloc.epaisseur * xh * 0.9,
                                      main=main, xh=xh, liste=int(b.get("graine_puces", graine)))
            self._marquer(b, brut, marques, poses, spans, xh, encre, bloc, main, g)
            self.texte.append(self._texte_lisible(brut, marques))
            toutes += lignes
        self.blocs_lignes[bid] = toutes
        return toutes

    def etape(self, b, idx):
        """Étape d'une recette : « Étape n » souligné sur sa ligne (`disposition: ligne`) ou en tête
        du paragraphe (`tete`), puis le texte (atomes = phrases, chacune sa graine)."""
        bid = b.get("id", f"b{idx}")
        titre = b.get("titre")
        segs = b.get("segments", [])
        avant = float(b.get("avant", 0.0))
        if titre and b.get("disposition", "tete") == "ligne":
            self.bloc_texte(dict(b, segments=[titre], id=bid + "-titre"), "corps", idx, alinea=0.0, sauter=avant)
            if segs:
                self.bloc_texte(dict(b, segments=segs, id=bid), "corps", idx, alinea=float(b.get("alinea", 0.0)))
            return
        self.bloc_texte(dict(b, segments=([titre] if titre else []) + segs, id=bid), "corps", idx,
                        alinea=float(b.get("alinea", 0.0)), sauter=avant)

    def filet(self, b, idx):
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        r = self.rng
        enc = ECR.nuances(enc_id or "bic", outil)
        pas = info["interligne"] * xh
        y = (self.base or self.haut) + pas * float(b.get("hauteur", 0.62))
        if y > self.bas:
            return
        xc = self.ml + (self.xr - self.ml) * float(b.get("centre", r.uniform(0.42, 0.5)))
        lg = self.W * float(b.get("longueur", r.uniform(0.18, 0.3)))
        self.tracer(TR.filet(xc, y, lg, r, xh), xh, enc, info["epaisseur"], self.graine + idx * 5, main)
        self.base = y - pas * 0.25
        self.pas_prec = pas

    def mot(self, b, idx):
        r = self.rng
        retrait = float(b.get("retrait", r.uniform(0.12, 0.22)))
        pente = float(b.get("pente", r.uniform(-2.0, 1.0)))
        return self.bloc_texte(b, "mot", idx, x0=self.ml + retrait * self.W * 0.55, alinea=retrait * 0.45,
                               pente=pente, sigma=0.35, sauter=float(b.get("avant", 0.6)))[1]

    def signature(self, b, idx):
        main, enc_id, outil, info, xh = self._style_bloc(b, "signature")
        r = self.rng
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        bloc = self.ecrire(b["texte"], main, graine, enc_id, outil)
        mots = [m for l in bloc.lignes for m in l]
        larg = sum(m.largeur * xh for m in mots) + info["espace"] * xh * (len(mots) - 1)
        xpos = float(b.get("x", r.uniform(0.56, 0.68))) * self.W
        xpos = min(xpos, self.xr - larg - 0.02 * self.W)
        pente = float(b.get("pente", r.uniform(-5.5, -3.0)))
        sauter = float(b.get("avant", 0.0))
        if self.grille:
            sauter = max(sauter, 0.7)
        poses, lignes = self.couler(mots, xh, float(b.get("interligne", bloc.interligne * 0.85)), dict(bloc.encre),
                                    bloc.epaisseur * 1.05, b.get("id", "signature"), espace=info["espace"], x0=xpos,
                                    pente=pente, sigma=0.1, derive=False, sauter=sauter)
        self.blocs_lignes[b.get("id", "signature")] = lignes
        self.texte.append(b["texte"])
        return lignes

    def espace(self, b, idx):
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        if self.base is not None:
            self.base += float(b.get("lignes", 1)) * info["interligne"] * xh

    # ---- annotations : posées après coup, dans l'espace libre ----------------------------------
    def _libre(self, boite, marge, ignorer=()):
        x0, y0, x1, y1 = boite
        if x0 < 0.02 * self.W or x1 > 0.985 * self.W or y0 < 0.02 * self.H or y1 > 0.975 * self.H:
            return False
        for (a0, b0, a1, b1) in [m.boite for m in self.mots] + self.marques_boites:
            if x0 - marge < a1 and x1 + marge > a0 and y0 - marge < b1 and y1 + marge > b0:
                return False
        for (a0, b0, a1, b1), nom in self.reserves:
            if nom in ignorer:
                continue
            if x0 - marge < a1 and x1 + marge > a0 and y0 - marge < b1 and y1 + marge > b0:
                return False
        return True

    def annotation(self, b, idx):
        """Ajout tardif (autre main, autre encre) : premier emplacement libre parmi `places`, ou dans
        la zone réservée `dans` (ex. « suite sur la feuille », au-dessus du coin du feuillet)."""
        main, enc_id, outil, info, xh = self._style_bloc(b, b.get("role", "annotation"))
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        r = self.rng
        brut, marques, mots, bloc = self.ecrire_segments(self._segments(b, graine), main, enc_id, outil)
        encre = dict(bloc.encre)
        larg = self._mesure(mots, xh, info["espace"])[0]
        pente = float(b.get("pente", r.uniform(-3.5, -1.5)))
        candidats = []
        ignorer = ()
        if b.get("dans") in self.zones:
            zx0, zy0, zx1, zy1 = self.zones[b["dans"]]
            ignorer = (b["dans"],)
            libre_x = max(0.0, (zx1 - zx0) - larg - 0.6 * xh)
            fxs = (1.0, 0.85, 0.65, 0.4, 0.0) if b.get("aligne") == "droite" else (0.5, 0.2, 0.8, 0.0, 1.0)
            for fy in (0.62, 0.5, 0.75, 0.4, 0.85):
                for fx in fxs:
                    candidats.append((zx0 + 0.2 * xh + fx * libre_x, zy0 + fy * (zy1 - zy0)))
        for pl in b.get("places", []):
            if "x" in pl:
                candidats.append((pl["x"] * self.W, pl["y"] * self.H))
            elif "apres" in pl:
                ls = self.blocs_lignes.get(pl["apres"]) or []
                if ls and ls[-1].mots:
                    der = ls[-1].mots[-1]
                    candidats.append((der.base[2] + pl.get("dx", 1.2) * xh, der.base[3] + pl.get("dy", 0.0) * xh))
            elif "sous" in pl:
                ls = self.blocs_lignes.get(pl["sous"]) or []
                if ls:
                    L = ls[-1]
                    candidats.append((L.x0 + pl.get("dx", 0.0) * self.W, L.y0 + pl.get("dy", 1.5) * L.xh * 2))
                elif pl["sous"] in self.zones:
                    rx0, ry0, rx1, ry1 = self.zones[pl["sous"]]
                    candidats.append((rx0 + pl.get("dx", 0.0) * self.W, ry1 + pl.get("dy", 0.04) * self.H))
            elif "au_dessus" in pl:
                ls = self.blocs_lignes.get(pl["au_dessus"]) or []
                if ls:
                    L = ls[0]
                    candidats.append((L.x0 + pl.get("dx", 0.0) * self.W, L.y0 - pl.get("dy", 1.6) * L.xh * 2))
        choisi = None
        for (cx, cy) in candidats:
            for decal in (0.0, -0.6, 0.6, -1.2, 1.2):
                y = cy + decal * xh
                ang = math.radians(pente)
                x1 = cx + larg * math.cos(ang)
                y1 = y + larg * math.sin(ang)
                boite = (min(cx, x1) - 0.1 * xh, min(y, y1) - 1.9 * xh, max(cx, x1) + 0.2 * xh, max(y, y1) + 0.9 * xh)
                if self._libre(boite, 0.25 * xh, ignorer):
                    choisi = (cx, y)
                    break
            if choisi:
                break
        if choisi is None:
            self.non_places.append(b.get("id", f"annotation-{idx}"))
            if not candidats:
                return
            choisi = candidats[0]
        L = Ligne(y0=choisi[1], x0=choisi[0], x1=self.W, theta=math.radians(pente), xh=xh,
                  noeuds=np.clip(np.cumsum(r.normal(0, 0.03 * xh, int(larg / (2 * xh)) + 3)), -0.12 * xh, 0.12 * xh),
                  pas=2 * xh, n=-1)
        x = L.x0
        poses = []
        for k, m in enumerate(mots):
            if k:
                x += self._espace_libre(mots[k - 1], m, info["espace"], float(np.clip(r.normal(1, 0.08), 0.9, 1.12))) * xh
            mp, adv = self.poser(L, m, x, xh, encre, bloc.epaisseur, b.get("id", "annotation"))
            poses.append(mp)
            x += adv
        self.blocs_lignes[b.get("id", f"annotation-{idx}")] = [L]
        spans = _spans(brut, [mots])
        self._marquer(b, brut, marques, poses, spans, xh, encre, bloc, main, graine)
        if b.get("fleche"):
            f = b["fleche"]
            depart = np.array(f.get("depart", [poses[0].base[0] - 0.4 * xh, poses[0].base[1] - 0.4 * xh]))
            if f.get("depuis") == "fin":
                der = poses[-1]
                depart = np.array([der.boite[2] + 0.45 * xh, der.base[3] - 0.45 * xh])
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
            elif "vers_zone" in f and f["vers_zone"] in self.zones:
                zx0, zy0, zx1, zy1 = self.zones[f["vers_zone"]]
                arrivee = np.array([zx0 + f.get("fx", 0.15) * (zx1 - zx0), zy0 + f.get("fy", 0.35) * (zy1 - zy0)])
            elif "dx" in f:
                arrivee = depart + np.array([f["dx"] * xh, f.get("dy", 0.0) * xh])
            else:
                arrivee = np.array([f["x"] * self.W, f["y"] * self.H])
            self.tracer(TR.fleche(depart, arrivee, r, xh, f.get("courbure", 0.15)), xh, encre, bloc.epaisseur, graine + 9, main)
        lisible = self._texte_lisible(brut, marques)
        self.texte.append(lisible if b.get("sans_parentheses") else f"({lisible})")

    def croquis_marge(self, b, idx):
        """Petit dessin de la recette, dans un blanc (marge, bas de page, à côté de la photo) : premier
        emplacement libre parmi `places` (coin haut-gauche, fractions), puis le blanc libre le plus
        proche de `pres` ; on essaie la taille voulue puis un peu plus petit."""
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        nom = choisir_croquis(b["nom"])
        r = self.rng
        encre = ECR.nuances(enc_id or "bic", outil)
        tw, th = b.get("taille", [0.17, 0.17])
        tw, th = tw * W, th * W  # en px absolus (même taille sur un feuillet)
        px, py = b.get("pres", [0.72, 0.86])
        px, py = px * self.W, py * self.H
        if b.get("sous_bloc"):
            # sous un bloc (titre d'intercalaire) : centré dessous, un peu de travers
            ms = [m.boite for m in self.mots if m.bloc.startswith(b["sous_bloc"])]
            if ms:
                A = np.array(ms, float)
                px = float((A[:, 0].min() + A[:, 2].max()) / 2) + r.normal(0.03, 0.02) * self.W
                py = float(A[:, 3].max()) + th * 0.5 * 0.9 + float(b.get("ecart", 0.05)) * self.H
        choisi = None
        for s in (1.0, 0.88, 0.76, 0.66):
            w, h = tw * s, th * s
            cands = [(pl["x"] * self.W, pl["y"] * self.H) for pl in b.get("places", [])]
            pas = 0.02 * self.W
            grille = [(x, y) for x in np.arange(0.03 * self.W, self.W - w - 0.02 * self.W, pas)
                      for y in np.arange(0.03 * self.H, 0.95 * self.H - h, pas)]
            grille.sort(key=lambda p: (p[0] + w / 2 - px) ** 2 + (p[1] + h / 2 - py) ** 2)
            for (x, y) in cands + grille:
                if self._libre((x, y, x + w, y + h), 0.45 * xh):
                    choisi = (x, y, w, h)
                    break
            if choisi:
                break
        if choisi is None:
            self.croquis_non_places.append(nom)
            return
        x, y, w, h = choisi
        x += r.normal(0, 0.1) * xh
        y += r.normal(0, 0.1) * xh
        self.demander_croquis(nom, (x, y, w, h), encre, int(b.get("graine", self.graine * 31 + idx * 7)), role="dessin",
                              ep=ECR.main_info(main)["epaisseur"] * xh * 0.85, lavis=b.get("lavis", True), main=main, xh=xh)

    def icones_bloc(self, b):
        """Deux ou trois petits croquis à côté des ingrédients clés d'un texte (« beurre », « œuf ») :
        dans la marge, à hauteur de la ligne où le mot est écrit (`place: marge`), ou au bout de cette
        ligne (`fin`) ; discrets (≈ 1,15 hauteur d'x) ; jamais sur du texte."""
        bid = b.get("id")
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        encre = ECR.nuances(enc_id or "bic", outil)
        r = self.rng
        lignes = {L.n: L for L in self.blocs_lignes.get(bid, [])}
        for k, ic in enumerate(b.get("icones", [])):
            cible = _norm(ic["mot"])
            mp = next((m for m in self.mots if m.bloc == bid and _norm(m.texte).strip("«»(),.;:!?").startswith(cible)), None)
            if mp is None or mp.ligne not in lignes:
                self.croquis_non_places.append(f"{ic['nom']} (mot « {ic['mot']} » introuvable)")
                continue
            L = lignes[mp.ligne]
            t = float(ic.get("taille", TAILLE_ICONE)) * xh * float(np.clip(r.normal(1, 0.05), 0.9, 1.1))
            essais = []
            places = [ic.get("place", "marge")] + [p for p in ("marge", "fin") if p != ic.get("place", "marge")]
            for pl in places:
                if pl == "marge":
                    x = L.x0 - t - 0.55 * xh + r.normal(0, 0.08) * xh
                else:
                    der = L.mots[-1] if L.mots else mp
                    x = der.boite[2] + 0.5 * xh + r.normal(0, 0.08) * xh
                y = L.y(x) - t + r.normal(0.1, 0.06) * xh
                essais.append((x, y))
            for (x, y) in essais:
                if x > 0.015 * self.W and x + t < 0.985 * self.W and self._libre((x, y, x + t, y + t), 0.12 * xh):
                    self.demander_croquis(ic["nom"], (x, y, t, t), encre, int(self.graine * 13 + k * 101), role="icone",
                                          ep=ECR.main_info(main)["epaisseur"] * xh * 0.85, main=main, xh=xh)
                    break
            else:
                self.croquis_non_places.append(ic["nom"])

    # =========================================================================================
    # v4 : blocs posés avant le texte (bandeau, titre courant, cadre du mot) ; sommaire ; chapitre
    # =========================================================================================
    @staticmethod
    def _espace_libre(prec, m, espace: float, alea: float = 1.0) -> float:
        """Espace (hauteurs d'x) avant le mot `m` sur une ligne posée à la main : celle du texte coulé
        (ESPACE × espace de la main), d'encre à encre ; un mot collé (icône, « / ») garde la sienne."""
        if getattr(m, "colle", False):
            return m.espace_avant
        e = ESPACE * espace * alea
        deb = 0.85 * (getattr(prec, "debord_d", 0.0) + getattr(m, "debord_g", 0.0))
        return max(e, 0.5 * espace + deb) if deb > 0 else e

    def _mesure(self, mots, xh: float, espace: float):
        """(largeur, montée, descente) d'une suite de mots écrits sur une ligne (px)."""
        larg = 0.0
        ys = []
        for k, m in enumerate(mots):
            if k:
                larg += self._espace_libre(mots[k - 1], m, espace) * xh
            larg += m.largeur * xh
            for T in m.traits:
                if len(T):
                    ys.append(np.asarray(T)[:, 1])
        if ys:
            Y = np.concatenate(ys)
            return larg, float(-Y.min()) * xh, float(max(Y.max(), 0.0)) * xh
        return larg, 1.4 * xh, 0.3 * xh

    def _ligne_libre(self, mots, x: float, y: float, xh: float, pente_deg: float, encre: dict, ep: float, bloc: str,
                     espace: float):
        """Écrit une suite de mots sur une ligne posée à la main (prénom, titre du cadre, folio…)."""
        r = self.rng
        larg = sum(m.largeur * xh for m in mots) + espace * xh * max(0, len(mots) - 1)
        L = Ligne(y0=y, x0=x, x1=self.W, theta=math.radians(pente_deg), xh=xh,
                  noeuds=np.clip(np.cumsum(r.normal(0, 0.03 * xh, int(larg / (2 * xh)) + 3)), -0.12 * xh, 0.12 * xh),
                  pas=2 * xh, n=-1)
        poses, xx = [], x
        for k, m in enumerate(mots):
            if k:
                xx += self._espace_libre(mots[k - 1], m, espace, float(np.clip(r.normal(1, 0.08), 0.9, 1.12))) * xh
            mp, adv = self.poser(L, m, xx, xh, encre, ep, bloc)
            poses.append(mp)
            xx += adv
        self.blocs_lignes.setdefault(bloc, []).append(L)
        return poses, L

    def _boite_de(self, n_mots: int, n_marques: int, marge: float):
        """Boîte de l'encre posée depuis (n_mots, n_marques) (mots + tracés), élargie de `marge`."""
        bx = [m.boite for m in self.mots[n_mots:]] + list(self.marques_boites[n_marques:])
        if not bx:
            return None
        A = np.array(bx, float)
        return (float(A[:, 0].min() - marge), float(A[:, 1].min() - marge), float(A[:, 2].max() + marge), float(A[:, 3].max() + marge))

    def _touche_reserve(self, boite, marge: float, sauf=()) -> bool:
        x0, y0, x1, y1 = boite
        for (a0, b0, a1, b1), nom in self.reserves:
            if nom in sauf:
                continue
            if x0 - marge < a1 and x1 + marge > a0 and y0 - marge < b1 and y1 + marge > b0:
                return True
        return False

    def _reserver(self, bid: str, boite):
        self.reserves.append((tuple(float(v) for v in boite), bid))
        self.zones_blocs[bid] = tuple(float(v) for v in boite)

    @staticmethod
    def _nb_lignes(mots, xh: float, espace: float, largeur: float) -> int:
        n, x = 1, 0.0
        for m in mots:
            w = m.largeur * xh
            e = ESPACE * espace * xh if x > 0 and not getattr(m, "colle", False) else (0.1 * xh if x > 0 else 0.0)
            if x > 0 and x + e + w > largeur and not getattr(m, "colle", False):
                n += 1
                x = w
            else:
                x += e + w
        return n

    def bandeau(self, b, idx):
        """Le prénom de l'invité écrit en grand (2,2 à 2,8 × la hauteur d'x du corps), dans sa main et
        son encre, souligné d'un geste, avec un sous-titre au crayon (« depuis Lyon ») ; posé à côté de
        la photo, sinon juste dessous, sinon juste dessus (la photo et le prénom se lisent ensemble).
        La boîte est réservée : le texte de la page coule autour."""
        bid = b.get("id", "bandeau")
        r = self.rng
        main = b.get("main", self.main)
        enc_id = encre_dispo(b.get("encre", self.encre))
        outil = b.get("outil", self.desc.get("outil") if enc_id == self.encre else None)
        info = ECR.main_info(main)
        k = float(b.get("taille", TAILLE_BANDEAU))
        xh_c = self.xh_de("corps", main)
        xh = xh_c * k
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        brut, marques, mots, bloc = self.ecrire_segments(self._segments(b, graine), main, enc_id, outil)
        esp = info["espace"] * 0.92
        larg, asc, desc = self._mesure(mots, xh, esp)
        encre = dict(bloc.encre)
        ep = self._ep(bloc.epaisseur, {"echelle": k})
        sous = b.get("sous")
        s_main = b.get("sous_main", "cecile")
        s_enc = encre_dispo(b.get("sous_encre", "crayon"))
        mots_s, larg_s, asc_s, desc_s, xh_s, bloc_s, brut_s, marques_s = [], 0.0, 0.0, 0.0, 0.0, None, "", []
        if sous:
            xh_s = self.xh_de("legende", s_main)
            brut_s, marques_s, mots_s, bloc_s = self.ecrire_segments(
                [{"texte": sous, "graine": int(b.get("sous_graine", graine + 17))}], s_main, s_enc, b.get("sous_outil"))
            larg_s, asc_s, desc_s = self._mesure(mots_s, xh_s, ECR.main_info(s_main)["espace"])
        souligne_bas = 0.42 * xh + 0.35 * xh  # souligné + son épaisseur et sa remontée
        dx_s = r.uniform(0.3, 0.85) * xh
        h_nom = asc + max(desc, souligne_bas)
        h_sous = (0.55 * xh_c + asc_s + desc_s) if sous else 0.0
        w_box = max(larg + 0.6 * xh, dx_s + larg_s + 0.2 * xh)
        h_box = h_nom + h_sous
        photo = self.zones.get(b.get("pres", "photo"))
        gap = float(b.get("ecart", 0.03)) * self.W
        places = b.get("places") or ["cote", "dessous", "dessus"]
        cands = []
        if photo:
            px0, py0, px1, py1 = photo
            for pl in places:
                if pl == "cote":
                    cotes = [("d", self.xr - (px1 + gap)), ("g", (px0 - gap) - self.ml)]
                    cotes.sort(key=lambda c: -c[1])
                    for cote, place in cotes:
                        if place < w_box:
                            continue
                        jeu = r.uniform(0.0, 0.3) * (place - w_box)
                        x = px1 + gap + jeu if cote == "d" else px0 - gap - w_box - jeu
                        for fy in (r.uniform(0.1, 0.24), 0.04, 0.35, 0.5):
                            cands.append((x, py0 + (py1 - py0) * fy))
                elif pl == "dessous":
                    for fx in (r.uniform(0.0, 0.07), 0.12, 0.0):
                        cands.append((max(self.ml, px0 + fx * self.W), py1 + 0.55 * xh_c))
                elif pl == "dessus":
                    cands.append((max(self.ml, px0 + r.uniform(0.0, 0.06) * self.W), py0 - 0.45 * xh_c - h_box))
        if not cands or "haut" in places:
            cands.append((self.ml + r.uniform(0.0, 0.025) * self.W, self.haut - 0.2 * h_box))
        choisi = None
        for (x, y) in cands:
            boite = (x, y, x + w_box, y + h_box)
            if x < 0.03 * self.W or boite[2] > 0.975 * self.W or y < 0.018 * self.H or boite[3] > 0.92 * self.H:
                continue
            if self._touche_reserve(boite, 0.25 * xh_c):
                continue
            choisi = (x, y)
            break
        if choisi is None:
            self.non_places.append(f"{bid} (« {brut} » : aucune place près de la photo)")
            return
        x, y = choisi
        n_m, n_q = len(self.mots), len(self.marques_boites)
        yb = y + asc
        pente = float(b.get("pente", r.uniform(-2.6, 0.4)))
        poses, L = self._ligne_libre(mots, x + 0.1 * xh, yb, xh, pente, encre, ep, bid, esp)
        if b.get("souligne", "trait") != "aucun" and poses:
            a, z = poses[0].base, poses[-1].base
            self.tracer(TR.souligne_nom(a[0], a[1], z[2], z[3], r, xh, dy=0.42, double=b.get("souligne") == "double"),
                        xh, encre, ep * 0.9, graine + 9, main)
        if sous:
            ys = L.y(x) + max(desc, souligne_bas) + 0.55 * xh_c + asc_s
            enc_s = dict(bloc_s.encre)
            ps, _ = self._ligne_libre(mots_s, x + dx_s, ys, xh_s, float(b.get("sous_pente", r.uniform(-2.5, 0.0))), enc_s,
                                      bloc_s.epaisseur, bid + "-sous", ECR.main_info(s_main)["espace"])
        self._reserver(bid, self._boite_de(n_m, n_q, 0.45 * xh_c))
        self.texte.append(self._texte_lisible(brut, marques) + (f", {self._texte_lisible(brut_s, marques_s)}" if sous else ""))

    def courant(self, b, idx):
        """Titre courant : rappel du prénom, petit, au crayon, en tête de la page (côté extérieur)."""
        bid = b.get("id", "courant")
        r = self.rng
        main = b.get("main", "cecile")
        enc_id = encre_dispo(b.get("encre", "crayon"))
        info = ECR.main_info(main)
        xh = max(self.xh_min, self.xh_de("annotation", main) * float(b.get("echelle", 0.96)))
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        brut, marques, mots, bloc = self.ecrire_segments(self._segments(b, graine), main, enc_id, b.get("outil"))
        larg, asc, desc = self._mesure(mots, xh, info["espace"])
        exterieur = self.cote != "gauche"
        for k in range(6):
            yb = self.H * float(b.get("y", r.uniform(0.045, 0.056))) + k * 0.4 * xh
            fx = r.uniform(0.06, 0.1) + 0.03 * k
            x = self.W * (1 - fx) - larg if exterieur else self.W * fx
            boite = (x, yb - asc, x + larg, yb + desc)
            if not self._touche_reserve(boite, 0.3 * xh):
                break
        else:
            self.non_places.append(f"{bid} (« {brut} »)")
            return
        n_m, n_q = len(self.mots), len(self.marques_boites)
        self._ligne_libre(mots, x, yb, xh, float(b.get("pente", r.uniform(-2.0, 0.8))), dict(bloc.encre), bloc.epaisseur,
                          bid, info["espace"])
        self._reserver(bid, self._boite_de(n_m, n_q, 0.4 * xh))
        self.texte.append(self._texte_lisible(brut, marques))

    def cadre(self, b, idx):
        """Le mot pour Cécile dans un cadre tracé à la main (« Pour Cécile » en petit en haut, le mot
        dans l'encre de l'invité, sa signature en bas à droite), posé AVANT la recette — en bas de la
        page par défaut — et réservé : la recette coule autour. `style` : `double` (double trait) ou
        `ondule` (trait ondulé, petit cœur sur un angle). `position: "bandeau"` : sous le prénom du
        bandeau (`pres`, défaut « bandeau »), à droite de la photo ; `lignes_min` : nombre de lignes
        imposé (un cadre « mot à venir » garde la taille d'un vrai mot)."""
        bid = b.get("id", "cadre")
        r = self.rng
        style = b.get("style", "double")
        main, enc_id, outil, info, xh = self._style_bloc(b, "mot")
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        brut, marques, mots, bloc = self.ecrire_segments(self._segments(b, graine), main, enc_id, outil)
        encre = dict(bloc.encre)
        esp = info["espace"]
        interligne = float(b.get("interligne", bloc.interligne * 0.95))
        pitch = interligne * xh
        xh_c = self.xh_de("corps", main)
        # « Pour Cécile » : petit, même main et même encre (il a écrit le titre avant de tracer le cadre)
        t_main = b.get("titre_main", main)
        t_enc = encre_dispo(b.get("titre_encre", enc_id))
        titre = b.get("titre", "Pour Cécile")
        xh_t = max(self.xh_min, self.xh_de("annotation", t_main) * 0.98)
        tb = None
        if titre:
            tb = self.ecrire_segments([{"texte": titre, "graine": int(b.get("titre_graine", graine + 3))}], t_main, t_enc,
                                      outil if t_enc == enc_id else None)
        sig = b.get("signature")
        s_main = b.get("signature_main", main)
        xh_s = self.xh_de("signature", s_main) * float(b.get("signature_echelle", 0.9))
        sb = None
        if sig:
            sb = self.ecrire_segments([{"texte": sig, "graine": int(b.get("signature_graine", graine + 5))}], s_main, enc_id, outil)
        larg_t, asc_t, desc_t = self._mesure(tb[2], xh_t, ECR.main_info(t_main)["espace"]) if tb else (0, 0, 0)
        larg_s, asc_s, desc_s = self._mesure(sb[2], xh_s, ECR.main_info(s_main)["espace"]) if sb else (0, 0, 0)
        # position `bandeau` (la première page d'un invité) : sous le prénom, à droite de la photo, le bord
        # gauche du cadre aligné sur le prénom ; sinon `bas` (défaut : en bas de la page droite)
        pos = b.get("position", "bas")
        bx_ref = self.zones_blocs.get(b.get("pres", "bandeau")) if pos == "bandeau" else None
        if pos == "bandeau" and bx_ref is None:
            self.non_places.append(f"{bid} (pas de bandeau où le poser)")
            return
        x_bd = bx_ref[0] + 0.45 * xh_c if bx_ref is not None else None
        if bx_ref is not None:
            lw = min(float(b.get("largeur", 0.46)) * self.W, self.xr - x_bd)
        else:
            lw = min(float(b.get("largeur", 0.64)) * self.W, self.xr - self.ml)
        pad_x = float(b.get("marge", 1.55)) * xh
        pad_y = 0.85 * xh
        n = self._nb_lignes(mots, xh, esp, (lw - 2 * pad_x) * 0.92)
        fixe = "lignes_min" in b  # cadre de taille imposée (mot à venir) : le texte ne le resserre pas
        n = max(n, int(b.get("lignes_min", 1)))
        folio = next((z for z, nom in self.reserves if nom == "folio"), None)
        etat0 = (len(self.traces), len(self.mots), len(self.marques_boites), len(self.lignes), list(self.deborde),
                 len(self.texte), dict(self.blocs_lignes), list(self.croquis))
        sauve = (self.base, self.pas_prec, self.bas, self.haut, self.marge_derive, self.pente_prec, self._ignorer)
        dx_frac = b.get("x")
        jeu_x = r.uniform(0.0, 0.05) * self.W
        bas_frac = float(b.get("bas", r.uniform(0.042, 0.058)))
        pente = float(b.get("pente", r.uniform(-1.4, 0.4)))
        reduit = False
        sig_en_ligne = None  # None : pas encore essayé ; True : la signature finit la dernière ligne du mot
        jeu_t = r.uniform(0.75, 0.95)
        for essai in range(7):
            h_titre = (asc_t + 0.95 * xh) if tb else 0.4 * xh
            h_sig = ((asc_s + desc_s + 0.15 * xh) if not sig_en_ligne else 0.25 * xh) if sb else 0.0
            h = pad_y + h_titre + (n - 1) * pitch + 0.55 * xh + h_sig + 0.7 * pad_y
            if bx_ref is not None:
                x0 = x_bd
            elif dx_frac is not None:
                x0 = float(dx_frac) * self.W
            else:
                x0 = (self.xr - lw - jeu_x) if self.cote != "gauche" else (self.ml + jeu_x * 0.6)
            x0 = float(np.clip(x0, self.ml - 0.01 * self.W, self.xr - lw))
            x1 = x0 + lw
            if pos == "bas":
                y1 = self.H * (1 - bas_frac)
                if folio is not None and x1 > folio[0] - 0.3 * xh_c and x0 < folio[2]:
                    y1 = min(y1, folio[1] - 0.45 * xh_c)
                y0 = y1 - h
            elif pos == "bandeau":
                y0 = bx_ref[3]  # juste sous le prénom (sa boîte réservée, marge comprise)
                y1 = y0 + h
            else:
                y0 = float(b.get("y", 0.6)) * self.H
                y1 = y0 + h
            self._ignorer = (bid,)
            enc_t = dict(tb[3].encre) if tb else encre
            if tb:
                tx = x0 + pad_x * jeu_t
                ty = y0 + pad_y + asc_t
                self._ligne_libre(tb[2], tx, ty, xh_t, r.uniform(-2.5, 0.3), enc_t, tb[3].epaisseur, bid + "-titre",
                                  ECR.main_info(t_main)["espace"])
                self.base = ty
            else:
                self.base = y0 + pad_y
            self.pas_prec = pitch
            self.bas = y1 - 0.7 * pad_y - h_sig - 0.25 * xh
            n_d = len(self.deborde)
            spans = _spans(brut, [mots])
            poses, lignes = self.couler(mots, xh, interligne, encre, bloc.epaisseur, bid, espace=esp, x0=x0 + pad_x,
                                        x1=x1 - 0.85 * pad_x, derive=False, pente=pente, sigma=0.3, sauter=-0.12 if tb else 0.0,
                                        premier_haut=asc_t / xh + 1.2, haut_requis=_haut_requis(marques, spans))
            deb = bid in self.deborde[n_d:]
            reel = len([L for L in lignes if L.mots])
            der = [L for L in lignes if L.mots]
            x_fin = max((m.boite[2] for m in der[-1].mots), default=x0) if der else x0
            place_sig = bool(sb) and der and x_fin + 1.1 * xh + larg_s <= x1 - 0.75 * pad_x
            essayer_ligne = (not deb and sig_en_ligne is None and place_sig and (reduit or reel >= n))
            if sig_en_ligne and not place_sig:
                sig_en_ligne = False  # finalement pas la place : signature en dessous
                essayer_ligne = True
            if (deb and essai < 5) or (not deb and reel < n and not reduit and not fixe) or essayer_ligne:
                # le mot prend une ligne de plus (ou de moins) que prévu : on recommence avec un cadre
                # à sa mesure (jamais de grand blanc entre le mot et la signature)
                del self.traces[etat0[0]:]
                del self.mots[etat0[1]:]
                del self.marques_boites[etat0[2]:]
                del self.lignes[etat0[3]:]
                self.deborde[:] = etat0[4]
                self.blocs_lignes = dict(etat0[6])
                self.croquis = list(etat0[7])
                if deb:
                    n += 1
                elif essayer_ligne:
                    sig_en_ligne = True if sig_en_ligne is None else False
                else:
                    n, reduit = max(1, reel), True
                continue
            break
        self.blocs_lignes[bid] = lignes
        self._marquer(b, brut, marques, poses, spans, xh, encre, bloc, main, graine)
        if sb and sig_en_ligne and der:
            # la signature finit la dernière ligne du mot, poussée à droite, un peu plus bas
            sx = max(x_fin + 1.1 * xh, x1 - 0.75 * pad_x - larg_s - r.uniform(0.0, 0.5) * xh)
            sy = der[-1].y(sx) + 0.3 * xh
            self._ligne_libre(sb[2], sx, sy, xh_s, float(b.get("signature_pente", r.uniform(-4.0, -2.0))), dict(sb[3].encre),
                              sb[3].epaisseur * 1.05, bid + "-signature", ECR.main_info(s_main)["espace"])
        elif sb:
            sx = x1 - 0.7 * pad_x - larg_s - r.uniform(0.0, 0.8) * xh
            sy = y1 - 0.7 * pad_y - desc_s
            self._ligne_libre(sb[2], sx, sy, xh_s, float(b.get("signature_pente", r.uniform(-5.0, -2.5))), dict(sb[3].encre),
                              sb[3].epaisseur * 1.05, bid + "-signature", ECR.main_info(s_main)["espace"])
        # le cadre, tracé après coup autour du tout
        self.tracer(TR.cadre(x0, y0, x1, y1, r, xh, style), xh, encre, bloc.epaisseur * 0.95, graine + 31, main)
        if style == "ondule":
            coin = b.get("coeur", "haut-droite")
            cx = x1 - r.uniform(0.2, 0.6) * xh if "droite" in coin else x0 + r.uniform(0.2, 0.6) * xh
            cy = y0 + r.uniform(-0.15, 0.15) * xh if "haut" in coin else y1 + r.uniform(-0.15, 0.15) * xh
            self.tracer(TR.coeur(cx, cy, float(b.get("taille_coeur", 1.5)) * xh, r, xh), xh, encre, bloc.epaisseur, graine + 37, main)
        (self.base, self.pas_prec, self.bas, self.haut, self.marge_derive, self.pente_prec, self._ignorer) = sauve
        m = 0.5 * xh_c
        boite = (x0 - m, y0 - m, x1 + m, (self.H if b.get("position", "bas") == "bas" else y1 + m))
        if b.get("style") == "ondule":
            boite = (boite[0], boite[1] - 0.8 * xh, boite[2], boite[3])
        self._reserver(bid, boite)
        if pos == "bandeau":
            # la recette commence SOUS le bandeau et son cadre, jamais à côté du cadre (sinon le titre se coupe) :
            # la première ligne monte d'environ 2,6 hauteurs d'x au-dessus de sa ligne de base
            self.haut = max(self.haut, y1 + m + 2.6 * xh_c)
        self.cadre_rect = (x0, y0, x1, y1)
        lis = self._texte_lisible(brut, marques)
        self.texte.append((f"{titre} : " if titre else "") + lis + (f" — {sig}" if sig else ""))

    def ornement(self, b, idx):
        """Ornement tracé à la plume, sans mots (pages décorées : frontispices, sommaire) : `forme`
        « cadre » (cadre orné : double cadre, volutes et feuille aux angles, nœud de ruban au milieu du haut
        si `ruban`, petit cœur au milieu du bas si `coeur`) ou « frise » (rinceau qui ondule sur la largeur
        de `rect`, à mi-hauteur ; `amplitude`, `onde` en hauteurs d'x). `rect` : fractions de la page.
        Posé avant le texte ; une frise est réservée (le texte coule autour), un cadre ne l'est pas (les
        zones vivantes sont dedans). Aucun trait sous une zone vivante (contrôlé)."""
        bid = b.get("id", "ornement")
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        encre = ECR.nuances(enc_id or "terracotta", outil)
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        r = np.random.default_rng(graine)
        x, y, w, h = (float(v) for v in b["rect"])
        x0, y0, x1, y1 = x * self.W, y * self.H, (x + w) * self.W, (y + h) * self.H
        if b.get("forme", "cadre") == "frise":
            chemins = TR.frise(x0, x1, (y0 + y1) / 2, r, xh, float(b.get("amplitude", 0.55)), float(b.get("onde", 4.2)))
        else:
            chemins = TR.cadre_orne(x0, y0, x1, y1, r, xh, ruban=bool(b.get("ruban", True)), coeur_bas=bool(b.get("coeur", True)))
        n0 = len(self.traces)
        self.tracer(chemins, xh, encre, info["epaisseur"] * float(b.get("trait", 1.0)), graine, main)
        for t in self.traces[n0:]:
            P = t.pts[:, :2]
            for nom, (a0, b0, a1, b1) in self.vivants.items():
                if np.any((P[:, 0] > a0) & (P[:, 0] < a1) & (P[:, 1] > b0) & (P[:, 1] < b1)):
                    self.deborde.append(f"{bid} : un trait touche la zone {nom}")
                    break
        if b.get("forme", "cadre") == "frise":
            A = np.vstack([t.pts[:, :2] for t in self.traces[n0:]])
            m = 0.3 * xh
            self._reserver(bid, (float(A[:, 0].min()) - m, float(A[:, 1].min()) - m, float(A[:, 0].max()) + m,
                                 float(A[:, 1].max()) + m))

    def etiquette(self, b, idx):
        """Quelques mots écrits à la main dans une boîte (`rect`, fractions de la page), centrés,
        coupés en lignes à sa largeur : « Scanne-moi pour voir ma vidéo » sous le QR de l'A5, la
        dédicace, le colophon. « \\n » : retour à la ligne voulu ; ligne vide : un blanc. `decalage` :
        chaque ligne un peu plus à droite (fraction de la largeur), comme une dédicace écrite d'un jet.
        La boîte est réservée."""
        bid = b.get("id", "etiquette")
        r = self.rng
        main = b.get("main", "cecile")
        enc_id = encre_dispo(b.get("encre", "crayon"))
        info = ECR.main_info(main)
        xh = self.xh_de(b.get("role", "legende"), main) * float(b.get("echelle", 1.0))
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        fx, fy, fw, fh = b["rect"]
        x0, y0, w, hh = fx * self.W, fy * self.H, fw * self.W, fh * self.H
        esp = info["espace"]
        ep = self._ep(ECR.main_info(main)["epaisseur"], b)
        lignes = []  # [(mots, bloc d'écriture)] ; None = blanc
        lisibles = []
        dec = float(b.get("decalage", 0.0)) * self.W
        for k, texte in enumerate(b["texte"].split("\n")):
            if not texte.strip():
                lignes.append(None)
                continue
            brut, marques, mots, bloc = self.ecrire_segments([{"texte": texte, "graine": graine + 13 * k}], main, enc_id,
                                                             b.get("outil"))
            lisibles.append(self._texte_lisible(brut, marques))
            cur, larg = [], 0.0
            for m in mots:
                e = self._espace_libre(cur[-1], m, esp) * xh if cur else 0.0
                dispo = w - dec * len([x for x in lignes if x is not None])  # chaque ligne commence plus à droite
                if cur and larg + e + m.largeur * xh > dispo and not getattr(m, "colle", False):
                    lignes.append((cur, bloc))
                    cur, larg, e = [], 0.0, 0.0
                cur.append(m)
                larg += e + m.largeur * xh
            if cur:
                lignes.append((cur, bloc))
        pas = info["interligne"] * xh * float(b.get("interligne", 0.86))
        y = y0 + 1.55 * xh
        n_ecrites = 0
        for k, item in enumerate(lignes):
            if item is None:
                y += 0.55 * pas
                continue
            ligne, bloc = item
            lg, _, _ = self._mesure(ligne, xh, esp)
            if dec:
                x = x0 + n_ecrites * dec + r.normal(0, 0.1) * xh
            else:
                x = x0 + max(0.0, (w - lg) / 2) + r.normal(0, 0.12) * xh + (0.25 * xh if n_ecrites % 2 else 0.0)
            self._ligne_libre(ligne, x, y, xh, float(b.get("pente", r.uniform(-2.5, 0.5))) + r.normal(0, 0.4), dict(bloc.encre),
                              self._ep(bloc.epaisseur, b), bid, esp)
            n_ecrites += 1
            y += pas
        if y - pas + 0.7 * xh > y0 + hh + 0.5 * xh:
            self.deborde.append(f"{bid} (trop long pour sa boîte)")
        self._reserver(bid, self._boite_de(len(self.mots) - sum(len(i[0]) for i in lignes if i), len(self.marques_boites), 0.3 * xh)
                       or (x0, y0, x0 + w, y0 + hh))
        self.texte.append(" ".join(lisibles))

    def cartouche(self, b, idx):
        """Cartouche (l'ex-libris du contre-plat) : un cadre tracé à la main autour de `rect` (fractions
        de la page), `style` double ou ondule comme le cadre du mot, à l'`encre` voulue ; les lignes
        s'écrivent dedans avec des blocs `etiquette`. La boîte est réservée."""
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        enc = ECR.nuances(enc_id or "bic", outil)
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        fx, fy, fw, fh = b["rect"]
        x0, y0, x1, y1 = fx * self.W, fy * self.H, (fx + fw) * self.W, (fy + fh) * self.H
        self.tracer(TR.cadre(x0, y0, x1, y1, self.rng, xh, b.get("style", "double")), xh, enc,
                    self._ep(info["epaisseur"], b), graine, main)
        self._reserver(b.get("id", "cartouche"), (x0, y0, x1, y1))

    def sommaire(self, b, idx):
        """Lignes « Prénom — recette ........ folio » (points de conduite à la main), regroupées par
        chapitre (`chapitre: true` : titre du chapitre, sans folio). Chaque ligne qui a une `cible`
        donne un lien (manifeste `liens`, rect en fractions de page). Les lignes viennent du carnet
        (recette.lignes_sommaire : `chapitres`, `fin`, `titres`) quand la description n'en donne pas.

        Débordement (une vingtaine d'invités, ≈ 30 lignes) — prévu, pas encore fait : le sommaire
        commencerait alors en haut de la page GAUCHE de sa double page (la dédicace remonte en tête de
        cette page, plus petite, et le sommaire suit dessous), puis continuerait sur la page droite
        (`sommaire`), coupé entre deux chapitres de préférence, jamais entre un titre de chapitre et sa
        première ligne. Aujourd'hui, un sommaire trop long pour sa page est un débordement (cuisson en
        code 1) : jamais une ligne perdue."""
        bid = b.get("id", "sommaire")
        main, enc_id, outil, info, xh = self._style_bloc(b, "corps")
        r = self.rng
        graine = int(b.get("graine", self.graine * 31 + idx * 7))
        interligne = float(b.get("interligne", info["interligne"] * 1.08))
        x_folio = self.xr - float(b.get("marge_folio", r.uniform(0.025, 0.045))) * self.W
        for k, l in enumerate(b.get("lignes", [])):
            g = int(l.get("graine", graine + 37 * k))
            lid = f"{bid}-{k + 1}"
            n_m = len(self.mots)
            if l.get("chapitre"):
                tb = {"type": "titre", "id": lid, "segments": [{"texte": l["texte"], "graine": g}], "position": "fer",
                      "souligne": l.get("souligne", "trait"), "echelle": float(l.get("echelle", 1.22)),
                      "avant": float(l.get("avant", 0.75 if k else 0.15)), "premier_haut": 1.6}
                for c in ("main", "encre", "outil"):
                    if c in b:
                        tb[c] = b[c]
                ls = self.titre(tb, idx * 100 + k)
                if not ls:
                    break
                if l.get("cible"):
                    self._lien(l, n_m, xh, ls[-1])
                continue
            # « Prénom — recette » : le tiret est tracé à la main (l'écriture en ferait un petit « - » bas)
            parties = [t.strip() for t in l["texte"].split(" — ")] if " — " in l["texte"] else [l["texte"]]
            brut, marques, mots, bloc = self.ecrire_segments([{"texte": parties[0], "graine": g}], main, enc_id, outil)
            mots2 = []
            if len(parties) > 1:
                b2 = self.ecrire_segments([{"texte": " — ".join(parties[1:]), "graine": g + 5}], main, enc_id, outil)
                mots2 = b2[2]
                brut, marques = brut + " — " + b2[0], marques + [dict(m, debut=m["debut"] + len(brut) + 3, fin=m["fin"] + len(brut) + 3)
                                                              for m in b2[1]]
            encre = dict(bloc.encre)
            fol = str(l["folio"]) if l.get("folio") is not None else ""
            fm = self.ecrire_segments([{"texte": fol, "graine": g + 11}], main, enc_id, outil)[2] if fol else []
            larg_f, _, _ = self._mesure(fm, xh, info["espace"])
            retrait = float(l.get("retrait", b.get("retrait", 0.045))) * self.W + r.normal(0, 0.004) * self.W
            L = self.nouvelle_ligne(xh, interligne, x0=self.ml + retrait, sauter=max(float(l.get("avant", 0)), float(b.get("avant", 0.08))),
                                    derive=False, sigma=0.16)
            if L is None:
                self.deborde.append(lid)
                break
            x = L.x0
            for j, m in enumerate(mots):
                if j:
                    e = ESPACE * info["espace"] * float(np.clip(r.normal(1, 0.1), 0.85, 1.2))
                    x += (m.espace_avant if getattr(m, "colle", False) else e) * xh
                _, adv = self.poser(L, m, x, xh, encre, bloc.epaisseur, lid)
                x += adv
            if mots2:
                x += info["espace"] * xh * float(np.clip(r.normal(1.05, 0.08), 0.9, 1.2))
                lg_t = xh * float(r.uniform(0.85, 1.15))
                self.tracer(TR.tiret(x, L.y(x) + 0.05 * xh, lg_t, r, xh), xh, encre, bloc.epaisseur, g + 7, main)
                x += lg_t + info["espace"] * xh * float(np.clip(r.normal(1.05, 0.08), 0.9, 1.2))
                for j, m in enumerate(mots2):
                    if j:
                        e = ESPACE * info["espace"] * float(np.clip(r.normal(1, 0.1), 0.85, 1.2))
                        x += (m.espace_avant if getattr(m, "colle", False) else e) * xh
                    _, adv = self.poser(L, m, x, xh, encre, bloc.epaisseur, lid)
                    x += adv
            mots = mots + mots2
            xf = x_folio - larg_f + r.normal(0, 0.1) * xh
            if xf < x + 1.6 * xh:
                self.deborde.append(f"{lid} (ligne trop longue pour son folio)")
            xx = xf
            for j, m in enumerate(fm):
                if j:
                    xx += max(m.espace_avant, 0.08) * xh
                _, adv = self.poser(L, m, xx, xh, encre, bloc.epaisseur, lid)
                xx += adv
            xa, xb = x + r.uniform(0.35, 0.6) * xh, xf - r.uniform(0.35, 0.55) * xh
            self.tracer(TR.points_conduite(xa, L.y(xa), xb, L.y(xb), r, xh), xh, encre, bloc.epaisseur, g + 3, main)
            self.blocs_lignes[lid] = [L]
            spans = _spans(brut, [mots])
            self._marquer(l, brut, marques, [p for p in self.mots[n_m:n_m + len(mots)]], spans, xh, encre, bloc, main, g)
            if l.get("cible"):
                self._lien(l, n_m, xh, L)
            self._vignette(b, l, L, xh)
            self.texte.append(self._texte_lisible(brut, marques) + (f", page {fol}" if fol else ""))

    def _vignette(self, b: dict, l: dict, L: Ligne, xh: float):
        """La petite aquarelle vivante d'une entrée du sommaire (`vignettes` : invité ou cible → nom d'une
        zone vivante de la page, déclarée sans `rect`, ou {zone, hauteur}) : dans le retrait de la ligne,
        centrée sur ses lettres, de `vignette` (fraction de la hauteur de page) de haut."""
        v = (b.get("vignettes") or {}).get(l.get("invite") or l.get("cible"))
        if not v:
            return
        nom, hv = (v, float(b.get("vignette", 0.06))) if isinstance(v, str) else (v["zone"], float(v.get("hauteur", b.get("vignette", 0.06))))
        hv *= self.H
        x1 = L.x0 - 0.45 * xh
        x0 = max(0.03 * self.W, x1 - float(b.get("vignette_largeur", 0.1)) * self.W)
        yc = L.y(x1) - 0.55 * xh
        rect = (x0, yc - hv / 2, x1, yc + hv / 2)
        self.vivants[nom] = rect
        self.zones[nom] = rect
        self.reserves.append((rect, nom))

    def _lien(self, l: dict, n_m: int, xh: float, L: Ligne):
        """Rectangle cliquable d'une ligne du sommaire : toute la ligne, du début du texte au folio."""
        bx = [m.boite for m in self.mots[n_m:]]
        if not bx:
            return
        A = np.array(bx, float)
        x0 = float(A[:, 0].min()) - 0.4 * xh
        x1 = float(A[:, 2].max()) + 0.4 * xh
        y0 = min(float(A[:, 1].min()), L.y0 - 1.9 * L.xh) - 0.25 * xh
        y1 = max(float(A[:, 3].max()), L.y0 + 0.75 * L.xh) + 0.2 * xh
        e = {"cible": l["cible"], "rect": (x0, y0, x1, y1)}
        if l.get("invite"):
            e["invite"] = l["invite"]
        self.liens.append(e)

    def chapitre(self, b, idx):
        """Intercalaire : titre du chapitre en grand dans la main du carnet, souligné, la liste des
        invités du chapitre en petit dessous ; le croquis (bloc différé) se pose sous le tout."""
        bid = b.get("id", "chapitre")
        r = self.rng
        tb = {"type": "titre", "id": bid, "texte": b["titre"], "position": b.get("position", "centre"),
              "souligne": b.get("souligne", "trait"), "echelle": float(b.get("taille", 1.8)), "avant": float(b.get("avant", 0.0)),
              "premier_haut": float(b.get("premier_haut", 1.7))}
        for c in ("main", "encre", "outil", "graine", "souligne_encre"):
            if c in b:
                tb[c] = b[c]
        ls = self.titre(tb, idx)
        if not ls or not b.get("invites"):
            return
        noms = b["invites"]
        texte = noms if isinstance(noms, str) else (", ".join(noms[:-1]) + " et " + noms[-1] if len(noms) > 1 else noms[0])
        main = b.get("invites_main", b.get("main", self.main))
        enc_id = encre_dispo(b.get("invites_encre", b.get("encre", self.encre)))
        info = ECR.main_info(main)
        xh = max(self.xh_min, self.xh_de("annotation", main))
        g = int(b.get("invites_graine", self.graine * 31 + idx * 7 + 5))
        brut, marques, mots, bloc = self.ecrire_segments([{"texte": texte, "graine": g}], main, enc_id, b.get("outil"))
        larg, asc, desc = self._mesure(mots, xh, info["espace"])
        titre_mots = [m for L in ls for m in L.mots]
        if titre_mots:
            A = np.array([m.boite for m in titre_mots], float)
            cx = float((A[:, 0].min() + A[:, 2].max()) / 2)
            yb = float(A[:, 3].max()) + 1.15 * ls[-1].xh * 0.6 + asc
        else:
            cx, yb = self.W / 2, (self.base or self.haut) + 2 * xh
        x = cx - larg / 2 + r.normal(0.02, 0.02) * self.W
        poses, L = self._ligne_libre(mots, x, yb, xh, r.uniform(-1.8, 0.6), dict(bloc.encre), bloc.epaisseur, bid + "-invites",
                                     info["espace"])
        self.base = yb
        self.texte.append(self._texte_lisible(brut, marques))

    # ---- contrôle : rien sous une zone vivante -------------------------------------------------
    def _verifier_zones(self):
        for m in self.mots:
            x0, y0, x1, y1 = m.boite
            for nom, (a0, b0, a1, b1) in self.vivants.items():
                if x0 < a1 and x1 > a0 and y0 < b1 and y1 > b0:
                    self.deborde.append(f"{m.bloc} : « {m.texte} » touche la zone {nom}")
        for c in self.croquis:
            x, y, w, h = c["boite"]
            for nom, (a0, b0, a1, b1) in self.vivants.items():
                if x < a1 and x + w > a0 and y < b1 and y + h > b0:
                    self.deborde.append(f"croquis {c['nom']} touche la zone {nom}")

    # ---- folio écrit à la main ----------------------------------------------------------------
    def folio(self):
        """Le numéro de la page, écrit à la main au crayon (main de Cécile), en bas du côté extérieur (à
        droite sur une page droite, à gauche sur une page gauche), dans la boîte « juste » réservée. Rien
        sur une page `sansFolio`, sans `folio`, ni sur un feuillet volant (pas de zone réservée).

        Le folio n'est pas du texte coulé : ses mots sortent de `self.mots` (donc du texte de la page et
        des contrôles de mots) et restent dans `self.folio_mots` ; ses traits vont dans `self.traces`.
        Il ne doit toucher ni un trait, ni un croquis, ni un élément vivant : sinon la page est signalée."""
        n = self.desc.get("folio")
        if n is None or str(n).strip() == "" or not any(nom == "folio" for _, nom in self.reserves):
            return
        cote = "gauche" if self.cote == "gauche" else "droite"
        fx0, _, fx1, _ = FOLIO_JUSTE[cote]
        xh = FOLIO_ECHELLE * self.xh_de("corps", self.main)
        espace = ECR.main_info(FOLIO_MAIN)["espace"]
        brut, _, mots, bloc = self.ecrire_segments([{"texte": str(n), "graine": self.graine * 17 + 41}], FOLIO_MAIN,
                                                   encre_dispo(FOLIO_ENCRE), None)
        larg, _, _ = self._mesure(mots, xh, espace)
        x = self.W * fx0 if cote == "gauche" else self.W * fx1 - larg
        y = self.H * (1 - self.desc.get("marges", {}).get("bas", 0.035))  # ligne de base : marge du bas
        n_mots, n_traces = len(self.mots), len(self.traces)
        self._ligne_libre(mots, x, y, xh, float(self.rng.uniform(-1.2, 0.4)), dict(bloc.encre), bloc.epaisseur, "folio",
                          espace)
        self.folio_mots = self.mots[n_mots:]
        del self.mots[n_mots:]
        if not self.folio_mots:
            return
        A = np.array([m.boite for m in self.folio_mots], float)
        x0, y0, x1, y1 = float(A[:, 0].min()), float(A[:, 1].min()), float(A[:, 2].max()), float(A[:, 3].max())
        marge = 0.25 * xh

        def touche(a0, b0, a1, b1) -> bool:
            return a0 < x1 + marge and a1 > x0 - marge and b0 < y1 + marge and b1 > y0 - marge

        for t in self.traces[:n_traces]:
            P = t.pts[:, :2]
            if np.any((P[:, 0] > x0 - marge) & (P[:, 0] < x1 + marge) & (P[:, 1] > y0 - marge) & (P[:, 1] < y1 + marge)):
                self.deborde.append(f"folio {n} touche un trait de la page")
                break
        for c in self.croquis:
            cx, cy, cw, ch = c["boite"]
            if touche(cx, cy, cx + cw, cy + ch):
                self.deborde.append(f"folio {n} touche le croquis {c['nom']}")
        for nom, (a0, b0, a1, b1) in self.vivants.items():
            if touche(a0, b0, a1, b1):
                self.deborde.append(f"folio {n} touche la zone {nom}")

    # ---- page entière ------------------------------------------------------------------------
    def composer(self):
        differe, dessins = [], []
        # 1. les zones posées avant le texte (prénom, titre courant, cadre du mot) : il coule autour
        for i, b in enumerate(self.desc.get("blocs", [])):
            if b["type"] in BLOCS_RESERVES:
                getattr(self, b["type"])(b, i)
        self.n_avant = len(self.lignes)  # lignes écrites dans les zones (le mot du cadre) : hors du texte coulé
        for i, b in enumerate(self.desc.get("blocs", [])):
            t = b["type"]
            if t in BLOCS_RESERVES:
                continue
            if t == "chapitre" and b.get("croquis"):
                dessins.append((i, {"type": "croquis", "id": b.get("id", "chapitre") + "-croquis", "nom": b["croquis"],
                                    "taille": b.get("croquis_taille", [0.27, 0.25]), "sous_bloc": b.get("id", "chapitre"),
                                    "main": b.get("main", self.main), "encre": b.get("croquis_encre", b.get("encre", self.encre)),
                                    "graine": int(b.get("croquis_graine", self.graine * 31 + i * 7 + 3))}))
            if t in ("annotation", "legende"):
                differe.append((i, b))
                continue
            if t == "croquis":
                dessins.append((i, b))
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
            elif t == "etape":
                self.etape(b, i)
            elif t == "filet":
                self.filet(b, i)
            elif t == "mot":
                self.mot(b, i)
            elif t == "signature":
                self.signature(b, i)
            elif t == "espace":
                self.espace(b, i)
            elif t == "sommaire":
                self.sommaire(b, i)
            elif t == "chapitre":
                self.chapitre(b, i)
            else:
                raise ValueError(f"{self.id} : type de bloc inconnu « {t} »")
        for b in self.desc.get("blocs", []):
            if b.get("icones") and b["type"] not in ("annotation", "legende", "croquis"):
                self.icones_bloc(b)
        for i, b in differe:
            self.annotation(dict(b, role=b.get("role", "legende" if b["type"] == "legende" else "annotation")), i)
        for i, b in dessins:
            self.croquis_marge(b, i)
        self.folio()  # le numéro à la main : en dernier, dans sa zone réservée
        self._verifier_zones()
        self._dessiner_croquis()
        return self


def noms_croquis(desc: dict) -> list:
    """Noms de croquis qu'une description peut utiliser (puces, icônes en ligne, dessins de marge),
    sans composer la page : pour l'empreinte du cache."""
    out = []

    def textes(b):
        for k in ("texte",):
            if isinstance(b.get(k), str):
                yield b[k]
        for s in b.get("segments", []) or []:
            yield s["texte"]
        if b.get("titre") and isinstance(b["titre"], dict):
            yield b["titre"]["texte"]
        for l in b.get("lignes", []) or []:
            yield l["texte"] if isinstance(l, dict) else l

    for b in desc.get("blocs", []):
        if b.get("puce"):
            out.append(b["puce"])
        out += [ic["nom"] for ic in b.get("icones", []) or []]
        for l in b.get("lignes", []) or []:
            if isinstance(l, dict) and l.get("puce"):
                out.append(l["puce"])
        if b["type"] == "croquis":
            out += b["nom"] if isinstance(b["nom"], list) else [b["nom"]]
        if b["type"] == "chapitre" and b.get("croquis"):
            out += b["croquis"] if isinstance(b["croquis"], list) else [b["croquis"]]
        for t in textes(b):
            out += [m.strip(":") for m in _COUPE_ICONES.findall(t)]
    return sorted(set(out))


def tient(m: Mise) -> bool:
    """La page tient : aucun débordement, aucune annotation (des mots !) non placée."""
    return not m.deborde and not m.non_places


def trou_bas(m: Mise) -> float:
    """Blanc laissé en bas de la page sous la dernière ligne du texte coulé, en lignes du corps
    (interligne de la main) : de la dernière ligne de base à la plus basse ligne de base où une ligne
    pourrait encore commencer à la marge (zones réservées comprises : folio, cadre du mot, note de
    suite, coin du feuillet). 0 : la page est pleine."""
    lignes = [L for L in m.lignes[getattr(m, "n_avant", 0):] if L.mots]
    if not lignes:
        return 0.0
    info = ECR.main_info(m.main)
    xh = m.xh_de("corps", m.main)
    pas = info["interligne"] * xh
    bas = m.H * (1 - m.desc.get("marges", {}).get("bas", 0.035))
    y = max(L.y0 for L in lignes)
    yb = bas
    while yb > y and m.plage(yb, xh, m.ml, m.xr) is None:
        yb -= 1.0
    return max(0.0, (yb - y) / pas)


def mettre_en_page(desc: dict, dessins: bool = True, serrage_max: int | None = None) -> Mise:
    """Compose la page ; si elle déborde, resserre l'interligne des dernières lignes (jusqu'à −28 %),
    puis légèrement toute la page (−6 %). Au-delà : la page est signalée (`deborde`), on ne réduit
    jamais l'écriture : la recette continue page suivante (recette.py) ou la cuisson échoue."""
    m = Mise(desc, dessins=dessins).composer()
    if tient(m) or desc.get("grille"):
        return m
    n = len(Mise(desc, sonde=True, dessins=False).composer().lignes)
    essais = [(5, 0.85, 1.0), (6, 0.78, 1.0), (7, 0.72, 1.0), (8, 0.72, 0.97), (9, 0.72, 0.94)]
    # une page paginée (recette.py) se resserre peu : la suite va sur la page suivante
    serrage_max = desc.get("serrage_max", serrage_max)
    if serrage_max is not None:
        essais = essais[:int(serrage_max)]
    for dernieres, fac, glob in essais:
        m2 = Mise(desc, serrage=(n, dernieres, fac), global_pas=glob, dessins=dessins).composer()
        if tient(m2):
            m2.serre = (dernieres, fac, glob)
            return m2
        m = m2
    return m
