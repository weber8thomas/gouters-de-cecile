"""Cuisson des pages du carnet (appelé par `node scripts/bake-pages.mjs`).

    tools/ecriture/.venv/bin/python scripts/pages/cuire.py [--only lisa,julie] [--force] [--apercus]
                                                          [--format ecran|a5] [--sans-4x]

Pages cuites :
  - les descriptions écrites à la main : `src/content/pages/<id>.json` (pages d'invités, page de
    titre, garde, sommaire, intercalaires) ;
  - les recettes reçues du plan `src/content/pages/recettes.json` : `src/content/recettes/<slug>.json`
    (RecetteRecue) → recette.py (pagination automatique) → <slug>-gauche, <slug>-droite et, si la
    recette est longue, <slug>-feuillet-recto / -verso (feuille de cahier glissée dans le carnet).

Ordre et folios : `src/content/carnet.json` (source unique) — double page k (0 = titre) → gauche 2k+2,
droite 2k+3 ; `sansFolio` : rien d'écrit, pas de zone réservée au folio. Le sommaire et les
intercalaires sont générés depuis le carnet et le roster (recette.resoudre_generes).

Pour chaque page :
  1. papier → design-system/baked/pages/papier/<f>.webp : un FEUILLET du carnet par image (recto =
     folio impair, verso = la même image en miroir, src/content/pages/papiers.json) ; un papier absent
     de papiers.json (feuillet pas encore préparé par le lot Pa) est remplacé par une autre découpe d'un
     feuillet existant, et c'est écrit dans le journal ; garde (contre-plat) : `papier` de sa page ;
  2. mise en page naturelle (mise_en_page.py, gestes.py) avec l'écriture générée (ecriture.py) et les
     croquis (croquis.py : traits comme l'encre, lavis multiplié ensuite) ;
  3. rastérisation et composition encre × papier exactement dessous (rendu_encre.py), avec la
     transparence de la page au dos, le décalque de la page en vis-à-vis (si papiers.json le demande)
     et la lumière ;
  4. calque d'encre → design-system/baked/pages/<id>.webp (RGBA, 2×), pages/1x/<id>.webp (1×) et la
     passe ×4 de la loupe en tuiles 2 × 2 (4 px de recouvrement) : pages/4x/<id>-<r><c>.webp ;
  5. relecture de l'encre rendue (lot E : ecriture.relire_rendu) ;
  6. manifeste → src/content/pages/manifeste.json (lu par <PageCuite>).

Format A5 (`--format a5`) : chaque invité est repaginé pour une feuille A5 recto-verso (148 × 210 mm
+ 3 mm de fond perdu, 300 dpi ; recette.pages_a5) ; images composées (papier + encre, JPEG) dans
design-system/baked/a5/, manifeste design-system/baked/a5/manifeste.json (lu par le lot Pr).

Code de sortie 1 si un mot ne tient pas (débordement, annotation non placée, recette trop longue
même avec le feuillet), si un contenu met une correction dans un mot important, ou si un mot
important se relit mal sur l'encre rendue : aucun mot n'est jamais perdu ni faux en silence.

Déterministe ; cache par empreinte (description, page au dos, papier, croquis utilisés, version de
l'outil d'écriture et du moteur) dans design-system/baked/pages/.cuisson.json. La passe ×4 a sa propre
entrée (`x4/<id>`, clé = empreinte de la page + qualités ×4) : une cuisson sans ×4 garde les tuiles encore
valides, et une cuisson avec ×4 ne fait la passe que pour les pages dont l'encre a changé.

Modes (`--mode`) :
  complet  (défaut) écran 2× + variante 1× + passe ×4 + relecture de l'encre rendue → design-system/baked/pages/ ;
  rapide   aperçu : composition papier + encre à 1× en JPEG, ni 1×, ni ×4, ni relecture de l'encre rendue
           (la mise en page, les débordements et les mots douteux de l'écriture sont les mêmes) →
           verification/out/cuisson-rapide/ (son propre cache et son propre manifeste ; le site n'y lit rien).
Parallèle (`--jobs N`, défaut : cœurs − 2, au plus 8) : les pages à cuire, dans l'ordre du carnet, sont
réparties par paquets de pages voisines (même feuillet, même double page : les rectos se partagent) entre
des processus séparés (OMP_NUM_THREADS=1 chacun) ; le processus principal réunit le cache et le manifeste.
Mêmes octets qu'en séquentiel : chaque page ne dépend que de sa description, de son dos et de son vis-à-vis.
"""
from __future__ import annotations

import argparse
import os
import hashlib
import inspect
import io
import json
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))

import numpy as np  # noqa: E402

import ecriture as ECR  # noqa: E402
import formats as F  # noqa: E402
import mise_en_page as MEP  # noqa: E402
import feuillets as PAP  # noqa: E402
import rendu_encre as R  # noqa: E402
import recette as RC  # noqa: E402

try:  # lot E (en parallèle) : mots importants
    import importants as IMP  # noqa: E402
except Exception:  # pragma: no cover - le module arrive avec le lot E
    IMP = None

RACINE = ICI.parents[1]
DESCRIPTIONS = RACINE / "src/content/pages"
SOURCES = RACINE / "design-system/sources/papier"
SORTIE = RACINE / "design-system/baked/pages"
SORTIE_A5 = RACINE / "design-system/baked/a5"
APERCUS = RACINE / "verification/out/b/pages"
SORTIE_RAPIDE = RACINE / "verification/out/cuisson-rapide"
CACHE = SORTIE / ".cuisson.json"
ECHELLE = F.ECRAN.echelle
LARG, HAUT = F.ECRAN.px()
VERSION_MOTEUR = 3
Q_PAPIER, Q_ENCRE, Q_ALPHA = 86, 50, 70
Q_4X, Q_4X_ALPHA = 60, 70
VERSION_4X = 1
Q_A5 = 92
BUDGET_ENCRE = 245 * 1024  # encre ≤ 250 Ko par page à 2× : au-delà, qualités un peu plus basses
PALIERS = [(Q_ENCRE, Q_ALPHA), (46, 64), (42, 58), (38, 52)]
NON_PAGES = {"manifeste.json", "papiers.json", "recettes.json"}
# Aperçu rapide : même page de référence, échelle 1, sans variante 1× ni passe ×4.
RAPIDE = F.Format("rapide", F.ECRAN.W, F.ECRAN.H, 1.0)
# Scripts lancés à la main, jamais importés par la cuisson (vérifié sur sys.modules après une cuisson
# complète) : hors empreinte, les modifier ne recuit plus tout le carnet. tests/ n'est pas lu (glob *.py).
HORS_EMPREINTE = {"apercu.py", "reparer.py", "planche_graines.py", "couverture.py"}
OUTIL_HORS_EMPREINTE = {"banc.py", "specimen.py", "convertir_poids.py", "amorces_maison.py", "rendu.py"}
UNITES_IMPORTANTES = re.compile(r"^(\d|½|¼|¾|°|th\.?$|(g|kg|cl|ml|l|dl|min|h|cm|mm)[.,;:)]*$)")


def h(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=MEP._json_defaut).encode()).hexdigest()


def empreinte_moteur() -> str:
    m = hashlib.sha256(str(VERSION_MOTEUR).encode())
    for f in sorted(ICI.glob("*.py")):
        if f.name not in HORS_EMPREINTE:
            m.update(f.read_bytes())
    # réglage de l'écriture (taille, épaisseur) : le changer recuit tout le carnet
    reglage = ICI.parents[1] / "src/content/ecriture.json"
    if reglage.exists():
        m.update(reglage.read_bytes())
    return m.hexdigest()[:16]


def empreinte_outil() -> str:
    """Comme ecriture.version_outil, sans les scripts de l'outil d'écriture que la cuisson n'importe pas."""
    outil = getattr(ECR, "OUTIL", None)
    if outil is None:
        return ECR.version_outil()
    h_ = hashlib.sha256()
    for f in sorted(Path(outil).glob("*.py")):
        if f.name not in OUTIL_HORS_EMPREINTE:
            h_.update(f.name.encode())
            h_.update(f.read_bytes())
    return h_.hexdigest()[:16]


def _ecrire(f: Path, data: bytes):
    """Écriture atomique : deux processus qui cuisent le même papier écrivent les mêmes octets."""
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_name(f".{f.name}.{os.getpid()}.tmp")
    tmp.write_bytes(data)
    tmp.replace(f)


def _accepte(f, nom: str) -> bool:
    try:
        return nom in inspect.signature(f).parameters
    except (TypeError, ValueError):
        return False


# =============================================================================================
# Mots importants (lot E : scripts/pages/importants.py) — import gardé, repli minimal
# =============================================================================================
def est_important(jeton: str, contexte: dict | None = None) -> bool:
    if IMP is not None and hasattr(IMP, "important"):
        try:
            return bool(IMP.important(jeton, contexte))
        except Exception:
            pass
    t = jeton.strip("«»()[],.;:!?\"' ")
    return bool(t) and (any(c.isdigit() for c in t) or bool(UNITES_IMPORTANTES.match(t)) or "Cécile" in t)


def textes_page(page: dict) -> list[str]:
    """Textes balisés d'une description (pour importants.verifier_contenu)."""
    out = []
    for b in page.get("blocs", []):
        for k in ("texte", "titre", "signature", "sous"):
            if isinstance(b.get(k), str):
                out.append(b[k])
        for s in b.get("segments") or []:
            out.append(s["texte"])
        if isinstance(b.get("titre"), dict):
            out.append(b["titre"].get("texte", ""))
        for l in b.get("lignes") or []:
            out.append(l["texte"] if isinstance(l, dict) else l)
    return [t for t in out if t]


def verifier_contenus(pages: dict) -> dict:
    """importants.verifier_contenu (lot E) sur chaque page : aucune correction voulue dans un mot
    important. → {id de page: [erreurs]}."""
    if IMP is None or not hasattr(IMP, "verifier_contenu"):
        return {}
    out = {}
    for pid, page in pages.items():
        errs = []
        for t in textes_page(page):
            try:
                errs += [str(e) for e in (IMP.verifier_contenu(t) or [])]
            except Exception as e:  # le lot E travaille en parallèle
                errs.append(f"verifier_contenu a échoué : {type(e).__name__}: {e}")
        if errs:
            out[pid] = errs
    return out


def jeton_douteux(lib) -> str:
    """« 300g (lu « 3ccg ») », « 180 (groupe « 180 g » lu « 1809 ») » → le mot ; un dict du lot E →
    son texte."""
    if isinstance(lib, dict):
        return str(lib.get("texte") or lib.get("mot") or lib.get("attendu") or "")
    return str(lib).split(" (")[0].strip()


def contexte_importants(pages: dict, pid: str, plan: dict | None = None) -> dict:
    """Contexte des mots importants d'une page (lot E, importants.important) : les lignes
    d'ingrédients de sa recette — les deux pages de sa double page, ou la RecetteRecue."""
    p = pages[pid]
    if "contexte_importants" in p:
        return p["contexte_importants"]  # recette reçue : posé par recette.gabarits (même que la pagination)
    lignes = []
    for q in pages.values():
        if q.get("double") is not None and q.get("double") == p.get("double"):
            for b in q.get("blocs", []):
                if b.get("type") == "ingredients":
                    lignes += [l.get("texte", "") if isinstance(l, dict) else str(l) for l in b.get("lignes") or []]
    return {"ingredients": sorted(set(lignes))} if lignes else {}


# =============================================================================================
# Descriptions
# =============================================================================================
def charger_descriptions(dossier: Path | None = None):
    dossier = dossier or DESCRIPTIONS
    pages = {}
    for f in sorted(dossier.glob("*.json")):
        if f.name in NON_PAGES:
            continue
        d = json.loads(f.read_text())
        d.setdefault("id", f.stem)
        pages[d["id"]] = d
    papiers = json.loads((dossier / "papiers.json").read_text())
    plan_f = dossier / "recettes.json"
    plan = json.loads(plan_f.read_text()) if plan_f.exists() else {"recettes": {}}
    return pages, papiers, plan


def appliquer_carnet(pages: dict, carnet: dict, roster: dict, journal: list | None = None) -> dict:
    """Folios, double page, côté et `sansFolio` venus de carnet.json (source unique) ; blocs générés
    (sommaire, intercalaires). Une page absente du carnet garde ce que dit sa description."""
    fol = RC.folios_carnet(carnet)
    out = {}
    for pid, p in pages.items():
        p = dict(p)
        f = fol.get(pid)
        if f is not None and p.get("type") != "feuillet":
            if journal is not None and p.get("folio") not in (None, f["folio"]):
                journal.append(f"{pid} : folio {p.get('folio')} → {f['folio']} (carnet.json)")
            p.update(folio=f["folio"], double=f["double"], cote=f["cote"])
            if f["sansFolio"]:
                p["sansFolio"] = True
        out[pid] = RC.resoudre_generes(p, carnet, roster)
    return out


def ajouter_contextes(pages: dict, plan: dict | None = None) -> dict:
    """Contexte des mots importants de chaque page (ingrédients de sa recette)."""
    out = {}
    for pid, p in pages.items():
        ctx = contexte_importants(pages, pid, plan)
        out[pid] = dict(p, contexte_importants=ctx) if (ctx and "contexte_importants" not in p) else p
    return out


def taille_page(page: dict) -> tuple[int, int]:
    """Taille de la page en px de la page de référence (850 × 960, ou la `taille` du feuillet)."""
    w, h_ = page.get("taille", (MEP.W, MEP.H))
    return int(round(w)), int(round(h_))


def feuillet_de(page: dict):
    """(id du papier, miroir). Carnet : recto = folio impair, verso = folio pair (dos du recto
    précédent, même image en miroir). Feuillet volant : une image par face, sans miroir. Une page
    peut imposer son papier (`papier`, contre-plat : papier de garde ; feuille A5 : `face`)."""
    if page.get("type") == "feuillet":
        return f"{page['papier']}-{page.get('face', 'recto')}", False
    if page.get("papier"):
        if page.get("format") == "a5":
            return f"{page['papier']}-{page.get('face', 'recto')}", False
        return page["papier"], bool(page.get("papier_miroir", False))
    folio = page["folio"]
    if folio % 2:
        return f"f{folio}", False
    return f"f{folio - 1}", True


def folio_dos(folio: int) -> int:
    return folio + 1 if folio % 2 else folio - 1


class Cuisine:
    def __init__(self, pages, papiers, force=False, apercus=False, sortie: Path | None = None, apercus_dir: Path | None = None,
                 cache: Path | None = None, fmt: F.Format = F.ECRAN, x4: bool | None = None, relecture: bool = True):
        self.pages = pages
        self.papiers = papiers
        self.force = force
        self.apercus = apercus
        self.fmt = fmt
        self.ech = float(fmt.echelle)
        self.x4 = fmt.tuiles_4x if x4 is None else (x4 and fmt.tuiles_4x)
        self.relecture = relecture
        sortie = sortie or SORTIE
        self.sortie = sortie
        self.apercus_dir = apercus_dir or APERCUS
        self.cache_f = cache or (sortie / ".cuisson.json")
        self.cache = json.loads(self.cache_f.read_text()) if self.cache_f.exists() else {}
        self.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p and p.get("type") != "feuillet"
                          and p.get("format") != "a5"}
        self._papier = {}
        self._papier1 = {}
        self._recto = {}
        self._mises = {}
        self._cfg = {}
        self._V = {}
        self.moteur = empreinte_moteur()
        self.outil = empreinte_outil()
        self.journal = []
        self.douteux_importants: dict = {}

    # ---- papier -------------------------------------------------------------------------------
    def cfg_papier(self, fid: str) -> dict:
        if fid in self._cfg:
            return self._cfg[fid]
        feuillets = self.papiers.get("feuillets", {})
        gardes = self.papiers.get("gardes", {})
        cahiers = self.papiers.get("cahiers", {})
        base, _, face = fid.rpartition("-")
        if fid in feuillets:
            cfg = dict(feuillets[fid])
        elif fid in gardes:
            cfg = dict(gardes[fid])
        elif base in cahiers and face in ("recto", "verso"):
            cfg = dict(cahiers[base], face=face)
        elif base in feuillets and face in ("recto", "verso"):  # feuille A5 : une image par face
            cfg = dict(feuillets[base], face_a5=face)
        elif base in gardes and face in ("recto", "verso"):
            cfg = dict(gardes[base], face_a5=face)
        else:
            cfg = self._repli_papier(fid)
        self._cfg[fid] = cfg
        return cfg

    def _repli_papier(self, fid: str) -> dict:
        """Papier pas encore dans papiers.json (lot Pa) : une autre découpe du feuillet existant le plus
        proche (même source, position et graine décalées), signalée dans le journal."""
        feuillets = self.papiers.get("feuillets", {})
        base, _, face = fid.rpartition("-")
        nom = base if face in ("recto", "verso") else fid
        nums = {int(k[1:]): k for k in feuillets if re.fullmatch(r"f\d+", k) and feuillets[k].get("genre", "feuillet") == "feuillet"}
        m = re.fullmatch(r"f(\d+)", nom)
        if nums:
            n = int(m.group(1)) if m else 1
            k = min(nums, key=lambda v: (abs(v - n), v))
            src = nums[k]
        else:
            src = next(iter(feuillets))
            n = 1
        cfg = dict(feuillets[src])
        cfg.update(x=round((float(cfg.get("x", 0.5)) + 0.37 * (n + 1)) % 1.0, 3),
                   y=round((float(cfg.get("y", 0.5)) + 0.29 * (n + 2)) % 1.0, 3),
                   graine=int(cfg.get("graine", 7)) * 31 + n, repli=src)
        if face in ("recto", "verso"):
            cfg["face_a5"] = face
        self.journal.append(f"papier « {nom} » absent de papiers.json (lot Pa) : repli sur une autre découpe de {src}")
        return cfg

    def _eviter(self, fid: str):
        """Zones de texte des deux faces d'un feuillet du carnet (aucune rousseur ni tache dessous) :
        seulement si papiers.json le demande (`eviter_texte`) — sinon le lot Pa garde ses effets dans
        les marges communes aux deux faces, et le papier ne dépend pas du texte."""
        if not hasattr(PAP, "zones_mise") or not self.cfg_papier(fid).get("eviter_texte"):
            return None
        m = re.fullmatch(r"f(\d+)", fid)
        if not m or self.fmt.mm:  # impression : papier indépendant du texte
            return None
        n = int(m.group(1))
        out = []
        for folio, miroir in ((n, False), (n + 1, True)):
            p = self.par_folio.get(folio)
            if p is None:
                continue
            try:
                out += PAP.zones_mise(self.mise(p["id"]), miroir=miroir, marge=6.0)
            except Exception as e:
                self.journal.append(f"zones de {p['id']} pour le papier {fid} : {type(e).__name__}: {e}")
        return out or None

    def _fabriquer_papier(self, cfg: dict, larg: int, haut: int, eviter):
        if "face" in cfg:
            return PAP.cahier(cfg, larg, haut, SOURCES, cfg["face"], self.ech)
        kw = {}
        f = PAP.feuillet
        if _accepte(f, "echelle"):
            kw["echelle"] = self.ech
        if self.fmt.fond_perdu and _accepte(f, "fond_perdu"):
            kw["fond_perdu"] = self.fmt.fond_perdu
        if cfg.get("face_a5") and _accepte(f, "face"):
            kw["face"] = cfg["face_a5"]
            if _accepte(f, "ombre_reliure"):
                kw["ombre_reliure"] = float(cfg.get("ombre_reliure_a5", 1.0))
        if eviter is not None and _accepte(f, "eviter"):
            kw["eviter"] = eviter
        return f({k: v for k, v in cfg.items() if k not in ("face_a5", "repli")}, larg, haut, SOURCES, **kw)

    def papier(self, fid: str, taille=None) -> np.ndarray:
        """Papier tel que le navigateur le décodera (pixels du WebP)."""
        if fid in self._papier:
            return self._papier[fid]
        from PIL import Image
        cfg = self.cfg_papier(fid)
        larg, haut = taille or self.fmt.px()
        eviter = self._eviter(fid)
        cle = h({"cfg": cfg, "v": self.moteur, "q": Q_PAPIER, "taille": [larg, haut], "eviter": eviter, "ech": self.ech})
        f = self.sortie / "papier" / f"{fid}.webp"
        if not self.force and self.cache.get(f"papier/{fid}") == cle and f.exists():
            pass
        else:
            t = time.time()
            img = self._fabriquer_papier(cfg, larg, haut, eviter)
            data = R.webp(img, Q_PAPIER)
            _ecrire(f, data)
            self.cache[f"papier/{fid}"] = cle
            self.journal.append(f"papier {fid} : {len(data) // 1024} Ko ({time.time() - t:.1f} s)")
        arr = np.asarray(Image.open(f).convert("RGB"))
        if self.fmt.variante_1x:
            # variante 1× (écrans de densité 1 : TV 1080p, ordinateur) : 4 fois moins de pixels à décoder
            f1 = self.sortie / "1x" / "papier" / f"{fid}.webp"
            if self.force or self.cache.get(f"papier1x/{fid}") != cle or not f1.exists():
                petit = Image.fromarray(arr).resize((larg // 2, haut // 2), Image.LANCZOS)
                _ecrire(f1, R.webp(np.asarray(petit), Q_PAPIER))
                self.cache[f"papier1x/{fid}"] = cle
            self._papier1[fid] = np.asarray(Image.open(f1).convert("RGB"))
        self._papier[fid] = arr
        return arr

    def _px(self, page):
        if not self.fmt.mm:  # écran (et aperçu rapide) : taille de la page ou du feuillet volant
            w, h_ = taille_page(page)
            return int(w * self.ech), int(h_ * self.ech)
        return self.fmt.px()

    def papier_page1(self, page: dict) -> np.ndarray:
        fid, miroir = feuillet_de(page)
        self.papier(fid, self._px(page))
        P = self._papier1[fid]
        return P[:, ::-1].copy() if miroir else P

    def papier_page(self, page: dict) -> np.ndarray:
        fid, miroir = feuillet_de(page)
        P = self.papier(fid, self._px(page))
        return P[:, ::-1].copy() if miroir else P

    def dos_de(self, page: dict):
        if "dos" in page:
            return self.pages.get(page["dos"]) if page["dos"] else None
        if page.get("type") == "feuillet" or "folio" not in page or page.get("contre_plat") or page.get("format") == "a5":
            return None
        return self.par_folio.get(folio_dos(page["folio"]))

    def vis_a_vis(self, page: dict):
        """La page de l'autre côté du pli (même double page) : son encre se décalque un peu."""
        if page.get("type") == "feuillet" or "folio" not in page or page.get("format") == "a5":
            return None
        f = page["folio"]
        autre = self.par_folio.get(f + 1 if page.get("cote") == "gauche" else f - 1)
        if autre is None or autre.get("double") != page.get("double") or autre.get("contre_plat") or page.get("contre_plat"):
            return None
        return autre

    def cfg_decalque(self, page: dict):
        fid, _ = feuillet_de(page)
        cfg = self.cfg_papier(fid).get("decalque", self.papiers.get("decalque"))
        return cfg if (cfg and hasattr(PAP, "decalque")) else None

    # ---- encre --------------------------------------------------------------------------------
    def mise(self, pid: str):
        if pid not in self._mises:
            self._mises[pid] = MEP.mettre_en_page(self.pages[pid])
        return self._mises[pid]

    def recto(self, pid: str):
        """Mise en page + transmittance de l'encre de la page (sans transparence du verso)."""
        if pid in self._recto:
            return self._recto[pid]
        page = self.pages[pid]
        t = time.time()
        mise = self.mise(pid)
        P = self.papier_page(page)
        larg, haut = self._px(page)
        ech = self.ech
        rel = R.relief(P, ech)
        rng = np.random.default_rng(page.get("graine", 1) + 991)
        if _accepte(PAP.grain_bruit, "echelle"):
            bruit = PAP.grain_bruit(P, rel, rng, echelle=ech)
        else:
            bruit = PAP.grain_bruit(P, rel, rng) * (ech / 2.0)
        cartes = R.rasteriser(mise.traces, larg, haut, ech, bruit)
        lam = R.lumiere_carte(larg, haut, page.get("cote", "droite"))
        Rt, union = R.transmittance(cartes, rel, lam, ech)
        T_lavis = None
        # lavis des croquis : multiplié avec l'encre, juste après elle (même papier, même relief)
        if mise.lavis:
            C = MEP.croquis_module()
            for lv in mise.lavis:
                try:
                    try:
                        T = C.transmittance_lavis(lv, (haut, larg), ech, rel, lam)
                    except TypeError:
                        T = C.transmittance_lavis(lv, (haut, larg), ech, rel)
                    T = np.asarray(T, np.float32)
                    if T.shape[:2] != (haut, larg):
                        raise ValueError(f"forme {T.shape} au lieu de {(haut, larg, 3)}")
                    if T.ndim == 2:
                        T = T[..., None]
                    T = np.clip(T, 0, 1)
                    Rt = Rt * T
                    T_lavis = T if T_lavis is None else T_lavis * T
                    union = np.maximum(union, self._couverture_lavis(C, T))
                except Exception as e:  # le lot C travaille en parallèle : on garde le trait
                    self.journal.append(f"{pid} : lavis ignoré ({type(e).__name__}: {e})")
        self._recto[pid] = (mise, Rt, union, {"bruit": bruit, "lavis": T_lavis})
        reserves = [c["nom"] for c in mise.croquis if not c["dessine"]]
        self.journal.append(f"{pid} : mise en page + rendu {time.time() - t:.1f} s, {len(mise.lignes)} lignes"
                            + (f", serrage {mise.serre}" if getattr(mise, "serre", None) else "")
                            + (f", croquis {sum(c['dessine'] for c in mise.croquis)}/{len(mise.croquis)}"
                               + (f" (place réservée : {sorted(set(reserves))})" if reserves else "") if mise.croquis else "")
                            + (f" — DÉBORDE : {mise.deborde}" if mise.deborde else "")
                            + (f" — non placés : {mise.non_places}" if mise.non_places else "")
                            + (f" — mots douteux : {mise.douteux}" if mise.douteux else ""))
        return self._recto[pid]

    @staticmethod
    def _couverture_lavis(C, T):
        cv = getattr(C, "couverture_lavis", None) if C is not None else None
        return np.asarray(cv(T) if cv else np.clip((1 - T.min(axis=2)) * 6, 0, 1), np.float32)

    def transparence(self, page: dict, forme):
        """V : transparence de la page au dos × décalque de la page en vis-à-vis (ou None)."""
        fid, _ = feuillet_de(page)
        V = None
        dos = self.dos_de(page)
        if dos is not None:
            _, R_dos, _, _ = self.recto(dos["id"])
            force = float(self.cfg_papier(fid).get("transparence", 0.045))
            V = R.verso_transmittance(R_dos, force, self.ech)
        dec = self.cfg_decalque(page)
        vav = self.vis_a_vis(page) if dec else None
        if vav is not None:
            try:
                _, R_vav, _, _ = self.recto(vav["id"])
                D = PAP.decalque(R_vav, dec, echelle=self.ech, graine=int(page.get("graine", 1)))
                V = D if V is None else V * D
            except Exception as e:
                self.journal.append(f"{page['id']} : décalque ignoré ({type(e).__name__}: {e})")
        return V

    def empreinte_contenu(self, page: dict) -> dict:
        return {"page": page, "croquis": MEP.croquis_empreinte(MEP.noms_croquis(page))}

    def empreinte_page(self, pid: str) -> str:
        page = self.pages[pid]
        dos = self.dos_de(page)
        fid, miroir = feuillet_de(page)
        dec = self.cfg_decalque(page)
        vav = self.vis_a_vis(page) if dec else None
        return h({"page": self.empreinte_contenu(page), "dos": self.empreinte_contenu(dos) if dos else None,
                  "vav": [self.empreinte_contenu(vav), dec] if vav else None,
                  "papier": self.cfg_papier(fid), "eviter": self._eviter(fid), "miroir": miroir, "outil": self.outil,
                  "moteur": self.moteur,
                  "q": [Q_ENCRE, Q_ALPHA], "fmt": self.fmt.manifeste(), "x4": False})  # ×4 : clé à part (x4/<id>)

    def _a_jour(self, pid: str, ent: dict) -> bool:
        if self.fmt.nom != "ecran":
            return (self.sortie / f"{pid}.jpg").exists()
        return (self.sortie / f"{pid}.webp").exists() and (self.sortie / "1x" / f"{pid}.webp").exists()

    def _cle_4x(self, cle: str) -> str:
        return h({"page": cle, "q": [Q_4X, Q_4X_ALPHA], "v": VERSION_4X})

    def _x4_a_jour(self, pid: str, cle: str) -> bool:
        e = self.cache.get(f"x4/{pid}")
        if self.force or not e or e.get("cle") != self._cle_4x(cle):
            return False
        tu = e["encre4x"].get("tuiles", [])
        return bool(tu) and all((self.sortie / "4x" / f"{pid}-{t[0]}{t[1]}.webp").exists() for t in tu)

    def a_cuire(self, pid: str) -> bool:
        """Faut-il calculer quelque chose pour cette page (encre, ou passe ×4 demandée) ?"""
        cle = self.empreinte_page(pid)
        ent = self.cache.get(f"page/{pid}")
        if self.force or not ent or ent.get("cle") != cle or not self._a_jour(pid, ent):
            return True
        return bool(self.x4 and not self._x4_a_jour(pid, cle))

    def _avec_4x(self, pid: str, cle: str, man: dict) -> dict:
        """Manifeste de la page + `encre4x` quand ses tuiles sont valides (faites ici si --sans-4x n'est pas
        demandé) ; sans ×4, des tuiles encore valides sont gardées, des tuiles périmées ne sont pas annoncées."""
        man = {k: v for k, v in man.items() if k != "encre4x"}
        if not self.fmt.tuiles_4x:
            return man
        if not self._x4_a_jour(pid, cle):
            if not self.x4:
                return man
            page = self.pages[pid]
            mise, _, _, extra = self.recto(pid)
            P = self.papier_page(page)
            V = self._V[pid] if pid in self._V else self.transparence(page, P.shape[:2])
            self.cache[f"x4/{pid}"] = {"cle": self._cle_4x(cle), "encre4x": self.passe_4x(pid, page, mise, P, V, extra)}
        man["encre4x"] = self.cache[f"x4/{pid}"]["encre4x"]
        return man

    def cuire(self, pid: str):
        page = self.pages[pid]
        cle = self.empreinte_page(pid)
        ent = self.cache.get(f"page/{pid}")
        if not self.force and ent and ent.get("cle") == cle and self._a_jour(pid, ent):
            return self._avec_4x(pid, cle, ent["manifeste"])
        mise, Rt, union, extra = self.recto(pid)
        P = self.papier_page(page)
        fid, miroir = feuillet_de(page)
        V = self.transparence(page, P.shape[:2])
        self._V[pid] = V
        rgba, voulu = R.composer(P, Rt, union, V, self.ech)
        from PIL import Image
        man = {}
        if self.fmt.nom == "ecran":
            f = self.sortie / f"{pid}.webp"
            for q, qa in PALIERS:
                data = R.webp(rgba, q, qa)
                if len(data) <= BUDGET_ENCRE:
                    break
            if (q, qa) != PALIERS[0]:
                self.journal.append(f"{pid} : encre au-dessus du budget, qualités {q}/{qa}")
            _ecrire(f, data)
            # contrôle : le calque décodé posé sur le papier décodé redonne la composition voulue
            dec = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA")).astype(np.float32)
            a = dec[..., 3:4] / 255.0
            vu = dec[..., :3] * a + P.astype(np.float32) * (1 - a)
            err = np.abs(vu - voulu)
            self.journal.append(f"{pid} : encre {len(data) // 1024} Ko, écart composé moyen {err.mean():.2f} "
                                f"niveau, p99,9 {np.percentile(err, 99.9):.1f}")
            if self.apercus:
                self.apercus_dir.mkdir(parents=True, exist_ok=True)
                Image.fromarray(np.clip(np.round(vu), 0, 255).astype(np.uint8)).save(self.apercus_dir / f"{pid}.png")
            # variante 1× : la même encre réduite (transmittance moyennée), résolue sur le papier 1× décodé
            P1 = self.papier_page1(page)
            hh, ww = P1.shape[:2]
            # (on réduit la transmittance, pas la sortie : le papier 1× décodé n'est pas exactement la
            # réduction du papier 2×, et l'écart deviendrait un voile d'encre sur toute la page)
            Rv = Rt * (V if V is not None else 1.0)
            R1 = Rv.reshape(hh, 2, ww, 2, 3).mean(axis=(1, 3))
            u1 = union.reshape(hh, 2, ww, 2).mean(axis=(1, 3))
            rgba1, _ = R.composer(P1, R1.astype(np.float32), u1.astype(np.float32), None)
            d1 = R.webp(rgba1, Q_ENCRE, Q_ALPHA)
            _ecrire(self.sortie / "1x" / f"{pid}.webp", d1)
            self.journal.append(f"{pid} : encre 1× {len(d1) // 1024} Ko")
        else:
            # impression : l'image composée (papier + encre), opaque
            img = np.clip(np.round(voulu), 0, 255).astype(np.uint8)
            data = R.jpeg(img, Q_A5, self.fmt.dpi)
            _ecrire(self.sortie / f"{pid}.jpg", data)
            self.journal.append(f"{pid} : {self.fmt.nom} {img.shape[1]} × {img.shape[0]} px, {len(data) // 1024} Ko")
            if self.apercus:
                self.apercus_dir.mkdir(parents=True, exist_ok=True)
                Image.fromarray(img).save(self.apercus_dir / f"{pid}.png")
        # relecture de l'encre rendue (lot E)
        relu = self.relire(pid, mise, rgba) if self.relecture else None
        W_, H_ = mise.W, mise.H
        fr = lambda r: [round(r[0] / W_, 5), round(r[1] / H_, 5), round((r[2] - r[0]) / W_, 5), round((r[3] - r[1]) / H_, 5)]  # noqa: E731
        base = {
            "double": page.get("double"),
            "cote": page.get("cote"),
            "folio": page.get("folio"),
        }
        if page.get("sansFolio"):
            base["sansFolio"] = True
        if page.get("contre_plat"):
            base["contrePlat"] = True  # garde collée sur le carton de la couverture : pas de page au dos
        if self.fmt.nom == "ecran":
            base.update({
                "papier": f"pages/papier/{fid}",
                "miroir": miroir,
                "encre": f"pages/{pid}",
                "papier1x": f"pages/1x/papier/{fid}",
                "encre1x": f"pages/1x/{pid}",
            })
        else:
            base.update({"image": f"{self.fmt.nom}/{pid}", "fichier": f"{pid}.jpg", "face": page.get("face"), "invite": page.get("invite"),
                         "ordre": page.get("ordre")})
        man = dict(base, **man)
        man.update({
            "texte": "\n".join(t for t in mise.texte if t),
            "vivants": {k: fr(r) for k, r in mise.vivants.items()},
            "deborde": mise.deborde + [f"non placé : {a}" for a in mise.non_places],
            "lignes": len(mise.lignes),
        })
        if mise.liens:
            man["liens"] = [dict({k: v for k, v in l.items() if k != "rect"}, rect=fr(l["rect"])) for l in mise.liens]
        # aquarelles posées par l'application dans une zone vivante (calque à part : elle fleurit, s'anime)
        aq = {v["nom"]: {k: v[k] for k in ("aquarelle", "anime", "angle") if k in v}
              for v in page.get("vivants", []) if v.get("aquarelle") and v["nom"] in mise.vivants}
        if aq:
            man["aquarelles"] = aq
        if page.get("type") == "feuillet":
            man["type"] = "feuillet"
            man["taille"] = list(taille_page(page))
            man["face"] = page.get("face", "recto")
            if page.get("dos"):
                man["dos"] = page["dos"]
        elif page.get("type"):
            man["type"] = page["type"]
        if page.get("volant"):
            man["volant"] = dict(page["volant"])
        if page.get("suite"):
            man["suite"] = page["suite"]
        if page.get("recette"):
            man["recette"] = page["recette"]
        if mise.croquis:
            man["croquis"] = [{"nom": c["nom"], "role": c["role"], "dessine": c["dessine"],
                               "boite": [round(c["boite"][0] / W_, 4), round(c["boite"][1] / H_, 4),
                                         round(c["boite"][2] / W_, 4), round(c["boite"][3] / H_, 4)]}
                              for c in mise.croquis]
        if mise.croquis_non_places:
            man["croquis_non_places"] = mise.croquis_non_places
        douteux = list(mise.douteux) + [d for d in (relu or []) if d not in mise.douteux]
        if douteux:
            man["douteux"] = douteux
        imp = sorted({jeton_douteux(d) for d in douteux if self._important_douteux(d, mise)})
        if imp:
            man["douteux_importants"] = imp
        if relu is not None:
            man["relu"] = True
        self.cache[f"page/{pid}"] = {"cle": cle, "manifeste": man}
        man = self._avec_4x(pid, cle, man)
        self._V.pop(pid, None)
        return man

    # ---- passe ×4 (loupe) ----------------------------------------------------------------------
    def passe_4x(self, pid: str, page: dict, mise, P2: np.ndarray, V2, extra: dict) -> dict:
        """Encre ×4 en tuiles 2 × 2 (4 px de recouvrement), composée sur le papier 2× agrandi comme le
        navigateur l'agrandit sous la loupe : chaque tuile remplace le calque 2× là où elle est posée
        (même composition, transparence du verso comprise). → entrée `encre4x` du manifeste."""
        t = time.time()
        k = 2
        ech4 = self.ech * k
        H2, W2 = P2.shape[:2]
        W4, H4 = W2 * k, H2 * k
        M = 24  # marge de calcul (flous) autour de chaque tuile, px ×4
        out = []
        dossier = self.sortie / "4x"
        dossier.mkdir(parents=True, exist_ok=True)
        poids = 0
        for (r, c, x0, y0, x1, y1) in F.tuiles(W4, H4, 2, 4):
            X0, Y0, X1, Y1 = max(0, x0 - M), max(0, y0 - M), min(W4, x1 + M), min(H4, y1 + M)
            a0, b0 = X0 // k, Y0 // k
            a1, b1 = -(-X1 // k), -(-Y1 // k)
            sx, sy = X0 - a0 * k, Y0 - b0 * k
            fen = lambda A: R.agrandir(A[b0:b1, a0:a1], k)[sy:sy + (Y1 - Y0), sx:sx + (X1 - X0)]  # noqa: E731
            Pu = np.clip(np.round(fen(P2.astype(np.float32))), 0, 255).astype(np.uint8)
            rel = R.relief(Pu, ech4)
            bruit = fen(extra["bruit"]) * k
            cartes = R.rasteriser(mise.traces, X1 - X0, Y1 - Y0, ech4, bruit, origine=(X0, Y0))
            lam = R.lumiere_carte(W4, H4, page.get("cote", "droite"), fenetre=(X0, Y0, X1, Y1))
            Rt, union = R.transmittance(cartes, rel, lam, ech4)
            if extra.get("lavis") is not None:
                T = np.clip(fen(extra["lavis"]), 0, 1)
                Rt = Rt * T
                union = np.maximum(union, self._couverture_lavis(MEP.croquis_module(), T))
            V = fen(V2) if V2 is not None else None
            rgba, _ = R.composer(Pu, Rt, union, V, ech4)
            tuile = np.ascontiguousarray(rgba[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0])
            data = R.webp(tuile, Q_4X, Q_4X_ALPHA)
            _ecrire(dossier / f"{pid}-{r}{c}.webp", data)
            poids += len(data)
            out.append([r, c, round(x0 / W4, 6), round(y0 / H4, 6), round((x1 - x0) / W4, 6), round((y1 - y0) / H4, 6)])
        self.journal.append(f"{pid} : encre ×4 en 4 tuiles, {poids // 1024} Ko ({time.time() - t:.1f} s)")
        return {"base": f"pages/4x/{pid}", "echelle": round(ech4, 4), "px": [W4, H4], "recouvrement": 4, "tuiles": out}

    # ---- relecture de l'encre rendue (lot E) ------------------------------------------------------
    def mots_places(self, mise) -> list:
        """Mots écrits (boîte en px de l'image, drapeau important) : ni icônes ni mots barrés."""
        par_ligne: dict = {}
        for m in mise.mots:
            par_ligne.setdefault((m.bloc, m.ligne), []).append(m.texte)
        out = []
        for m in mise.mots:
            t = m.texte.strip()
            if not t or MEP.ICONE.match(t) or m.rature:
                continue
            ctx = mise.desc.get("contexte_importants")
            x0, y0, x1, y1 = m.boite
            out.append({"texte": t, "boite": [round(x0 * self.ech, 2), round(y0 * self.ech, 2), round((x1 - x0) * self.ech, 2),
                                               round((y1 - y0) * self.ech, 2)],
                        "important": est_important(t, ctx), "bloc": m.bloc, "ligne": m.ligne})
        return out

    def relire(self, pid: str, mise, rgba):
        f = getattr(ECR, "relire_rendu", None)
        if f is None:
            return None
        mots = self.mots_places(mise)
        try:
            if _accepte(f, "contexte"):
                res = f(rgba, mots, contexte=mise.desc.get("contexte_importants"))
            else:
                res = f(rgba, mots)
        except Exception as e:
            self.journal.append(f"{pid} : relire_rendu a échoué ({type(e).__name__}: {e})")
            return None
        out = []
        for d in res or []:
            if isinstance(d, dict):
                txt = jeton_douteux(d)
                lu = d.get("lu")
                out.append(f"{txt} (encre rendue lue « {lu} »)" if lu else f"{txt} (encre rendue)")
            else:
                out.append(str(d))
        if out:
            self.journal.append(f"{pid} : relecture de l'encre rendue, douteux : {out}")
        return out

    def _important_douteux(self, d, mise) -> bool:
        if isinstance(d, dict) and "important" in d:
            return bool(d["important"])
        if isinstance(d, str) and "(encre rendue" in d:
            return True  # relire_rendu (lot E) ne relit que les mots importants
        return est_important(jeton_douteux(d), mise.desc.get("contexte_importants"))

    def ecrire_cache(self):
        self.cache_f.parent.mkdir(parents=True, exist_ok=True)
        self.cache_f.write_text(json.dumps(self.cache, indent=1, ensure_ascii=False) + "\n")


def paginer_recettes(plan: dict, papiers: dict, cache: dict, moteur: str, outil: str, force=False, seul=(), journal=None,
                     carnet: dict | None = None, roster: dict | None = None):
    """Recettes du plan → descriptions de pages (pagination en cache : elle ne dépend que de la
    recette, du plan, du papier du feuillet, du roster et des versions du moteur et de l'outil
    d'écriture). Les folios viennent de carnet.json quand la recette y a sa double page."""
    pages, erreurs = {}, []
    fol = RC.folios_carnet(carnet) if carnet else {}
    roster = roster if roster is not None else RC.charger_roster()
    for slug, pr in plan.get("recettes", {}).items():
        rec = RC.charger_recette(slug, pr)
        double = pr.get("double", slug)
        g, d = fol.get(f"{double}-gauche"), fol.get(f"{double}-droite")
        if g and d and list(pr.get("folios", [])) != [g["folio"], d["folio"]]:
            if journal is not None:
                journal.append(f"{slug} : folios {pr.get('folios')} → {[g['folio'], d['folio']]} (carnet.json)")
            pr = dict(pr, folios=[g["folio"], d["folio"]])
        cfg = papiers.get("cahiers", {}).get(pr.get("feuillet", {}).get("papier", f"c-{slug}"))
        g_ros = RC.invite_info(slug, roster)
        cle = h({"recette": rec, "plan": pr, "cahier": cfg, "moteur": moteur, "outil": outil, "roster": g_ros})
        ent = cache.get(f"pagination/{slug}")
        if not force and ent and ent.get("cle") == cle:
            pages.update(ent["pages"])
            continue
        if seul and not any(s == slug or s.startswith(slug + "-") for s in seul) and ent:
            # pas demandée : on garde l'ancienne pagination (elle sera refaite quand on la cuira)
            pages.update(ent["pages"])
            continue
        try:
            res = RC.paginer(rec, pr, papiers, roster)
        except RC.Deborde as e:
            erreurs.append(str(e))
            continue
        if journal is not None:
            journal.append(f"{slug} : pagination {len(res.ordre)} pages ({', '.join(res.ordre)}), étapes « {res.disposition} », "
                           f"{res.sondes} sondes, {res.duree:.1f} s")
            for pid in res.ordre:
                aj = res.ajustements.get(pid)
                tr = res.trous.get(pid)
                journal.append(f"    {pid} : {len(res.repartition[pid])} atomes"
                               + (f", trou en bas {tr} ligne(s)" if tr is not None else "")
                               + (f", ajusté : {aj}" if aj else ""))
        pages.update(res.pages)
        cache[f"pagination/{slug}"] = {"cle": cle, "pages": res.pages, "ordre": res.ordre, "disposition": res.disposition,
                                       "ajustements": res.ajustements, "trous": res.trous}
    return pages, erreurs


def _imprimer(lignes):
    for l in lignes:
        print("  " + l, flush=True)


def jobs_defaut() -> int:
    return max(1, min(8, (os.cpu_count() or 2) - 2))


def ordre_carnet(pages: dict, ids: list) -> list:
    """Pages dans l'ordre du carnet (folio ; un feuillet volant juste après sa double page)."""
    fol_double = {}
    for p in pages.values():
        if p.get("folio") is not None and p.get("double") is not None:
            fol_double[p["double"]] = max(fol_double.get(p["double"], 0), p["folio"])
    def cle(pid):
        p = pages[pid]
        if p.get("folio") is not None and p.get("type") != "feuillet":
            return (p["folio"], 0, pid)
        return (fol_double.get(p.get("double"), 10 ** 6) + 0.5, 0 if p.get("face", "recto") == "recto" else 1, pid)
    return sorted(ids, key=cle)


def paquets(ids: list, jobs: int) -> list:
    """Un paquet de pages voisines par processus : les papiers et les rectos du dos et du vis-à-vis ne
    sont recalculés qu'aux bords des paquets (des paquets plus petits coûtent plus qu'ils n'équilibrent)."""
    n = max(2, -(-len(ids) // jobs))
    return [ids[k:k + n] for k in range(0, len(ids), n)]


_CACHES_ECR = (("rendu", "_CACHE_RENDU"), ("groupes", "_CACHE_GROUPES"))


def _travail(ids, pages, papiers, cache, options):
    """Processus de cuisson : un paquet de pages, rien d'écrit dans les caches partagés (le processus
    principal réunit le cache des pages et les caches de relecture de l'outil d'écriture)."""
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    if hasattr(ECR, "_sauver_cache"):
        ECR._sauver_cache = lambda nom: None
    fmt = F.FORMATS.get(options["format"]) or RAPIDE
    cu = Cuisine(pages, papiers, force=options["force"], apercus=options["apercus"], sortie=Path(options["sortie"]),
                 apercus_dir=Path(options["apercus_dir"]), cache=Path(options["cache"]), fmt=fmt, x4=options["x4"],
                 relecture=options["relecture"])
    cu.cache = cache
    avant = dict(cache)
    out = {}
    for pid in ids:
        t = time.time()
        out[pid] = cu.cuire(pid)
        _imprimer(cu.journal + [f"{pid} : {time.time() - t:.1f} s (processus {os.getpid()})"])
        cu.journal.clear()
    ecr = {nom: dict(getattr(ECR, attr) or {}) for nom, attr in _CACHES_ECR if hasattr(ECR, attr)}
    return out, {k: v for k, v in cu.cache.items() if avant.get(k) != v}, ecr, list(MEP.ENCRES_REMPLACEES)


def cuire_en_parallele(cuisine: Cuisine, ids: list, jobs: int, entrees: dict):
    sauver = getattr(ECR, "_sauver_cache", None)
    options = {"format": cuisine.fmt.nom, "force": cuisine.force, "apercus": cuisine.apercus, "sortie": str(cuisine.sortie),
               "apercus_dir": str(cuisine.apercus_dir), "cache": str(cuisine.cache_f), "x4": cuisine.x4,
               "relecture": cuisine.relecture}
    lots = paquets(ordre_carnet(cuisine.pages, ids), jobs)
    print(f"  {len(ids)} pages à cuire en {len(lots)} paquets sur {jobs} processus", flush=True)
    import multiprocessing
    with ProcessPoolExecutor(max_workers=min(jobs, len(lots)), mp_context=multiprocessing.get_context("spawn")) as pool:
        futs = [pool.submit(_travail, lot, cuisine.pages, cuisine.papiers, dict(cuisine.cache), options) for lot in lots]
        for fut in as_completed(futs):
            out, cache, ecr, encres = fut.result()
            entrees.update(out)
            cuisine.cache.update(cache)
            cuisine.ecrire_cache()
            for e in encres:
                if e not in MEP.ENCRES_REMPLACEES:
                    MEP.ENCRES_REMPLACEES.append(e)
            for nom, d in ecr.items():
                if sauver and hasattr(ECR, "_cache_disque"):
                    ECR._cache_disque(nom).update(d)
                    sauver(nom)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--apercus", action="store_true", help="écrit aussi verification/out/b/pages/<id>.png")
    ap.add_argument("--format", default="ecran", choices=sorted(F.FORMATS))
    ap.add_argument("--mode", default="complet", choices=["complet", "rapide"])
    ap.add_argument("--sans-4x", action="store_true", help="sans la passe d'encre ×4 (loupe)")
    ap.add_argument("--jobs", type=int, default=jobs_defaut(), help="processus de cuisson (1 : séquentiel)")
    ap.add_argument("--sortie", default="", help="dossier de sortie (cache et manifeste compris) au lieu du défaut")
    a = ap.parse_args(argv)
    t0 = time.time()
    rapide = a.mode == "rapide"
    if rapide and a.format != "ecran":
        ap.error("--mode rapide : format écran seulement")
    sortie = Path(a.sortie).resolve() if a.sortie else (SORTIE_RAPIDE if rapide else None)
    pages, papiers, plan = charger_descriptions()
    carnet, roster = RC.charger_carnet(), RC.charger_roster()
    seul = [s for s in a.only.split(",") if s]
    journal = []
    pages = appliquer_carnet(pages, carnet, roster, journal)
    cache_f = sortie / ".cuisson.json" if sortie else None
    if cache_f is not None and not cache_f.exists() and CACHE.exists():
        # la pagination ne dépend pas de la sortie : reprise du cache principal (lecture seule)
        cache_f.parent.mkdir(parents=True, exist_ok=True)
        base = json.loads(CACHE.read_text())
        cache_f.write_text(json.dumps({k: v for k, v in base.items() if k.startswith("pagination/")}, ensure_ascii=False))
    cuisine = Cuisine(pages, papiers, force=a.force, apercus=a.apercus, x4=not a.sans_4x and not rapide,
                      sortie=sortie, cache=cache_f, apercus_dir=(sortie / "apercus") if sortie else None,
                      fmt=RAPIDE if rapide else F.ECRAN, relecture=not rapide)
    generees, erreurs = paginer_recettes(plan, papiers, cuisine.cache, cuisine.moteur, cuisine.outil, a.force, seul, journal,
                                         carnet, roster)
    cuisine.ecrire_cache()  # la pagination est longue : gardée tout de suite
    _imprimer(journal)
    for e in erreurs:
        print(f"✗ recette trop longue : {e}", flush=True)
    doublons = set(generees) & set(pages)
    if doublons:
        print(f"✗ pages décrites deux fois (à la main et par une recette) : {sorted(doublons)}")
        return 1
    pages.update(generees)
    pages = ajouter_contextes(pages, plan)
    if a.format != "ecran":
        return main_imprime(a, pages, papiers, plan, carnet, roster, cuisine, seul, erreurs, t0)
    cuisine.pages = pages
    cuisine.par_folio = {p["folio"]: p for p in pages.values() if "folio" in p and p.get("type") != "feuillet"}
    choisies = [pid for pid in pages if not seul or any(pid == s or pages[pid].get("double") == s for s in seul)]
    contenus = verifier_contenus({pid: pages[pid] for pid in choisies})
    for pid, errs in contenus.items():
        print(f"✗ {pid} : correction dans un mot important : {errs}", flush=True)
    cuisine.sortie.mkdir(parents=True, exist_ok=True)
    manifeste_f = (sortie / "manifeste.json") if sortie else DESCRIPTIONS / "manifeste.json"
    ancien = json.loads(manifeste_f.read_text()) if manifeste_f.exists() else {"pages": {}}
    entrees = dict(ancien.get("pages", {}))
    a_cuire = [pid for pid in choisies if cuisine.a_cuire(pid)]
    print(f"  mode {a.mode} : {len(choisies)} pages, {len(a_cuire)} à cuire"
          + ("" if cuisine.x4 or rapide else " (sans ×4 : tuiles valides gardées)"), flush=True)
    paralleles = set(a_cuire) if a.jobs > 1 and len(a_cuire) > 1 else set()
    if paralleles:
        cuire_en_parallele(cuisine, a_cuire, a.jobs, entrees)
    for pid in choisies:  # séquentiel, et pages déjà à jour (manifeste depuis le cache)
        if pid in paralleles:
            continue
        entrees[pid] = cuisine.cuire(pid)
        cuisine.ecrire_cache()
        _imprimer(cuisine.journal)
        cuisine.journal.clear()
    if MEP.ENCRES_REMPLACEES:
        print(f"  encres pas encore livrées par l'outil d'écriture (lot E), remplacées : {MEP.ENCRES_REMPLACEES}")
    entrees = {k: v for k, v in sorted(entrees.items()) if k in pages}
    man = {
        "version": 3,
        "largeur": MEP.W, "hauteur": MEP.H, "echelle": cuisine.ech,
        "pages": entrees,
    }
    if rapide:
        man["mode"] = "rapide"
    manifeste_f.write_text(json.dumps(man, indent=1, ensure_ascii=False) + "\n")
    cuisine.ecrire_cache()
    if a.apercus:
        ap_dir = cuisine.apercus_dir
        ap_dir.mkdir(parents=True, exist_ok=True)
        for pid in choisies:
            (ap_dir / f"{pid}.json").write_text(json.dumps(pages[pid], indent=1, ensure_ascii=False, default=MEP._json_defaut) + "\n")
    return bilan(entrees, choisies, erreurs, contenus, t0)


def bilan(entrees: dict, choisies: list, erreurs: list, contenus: dict, t0: float) -> int:
    deb = {k: v["deborde"] for k, v in entrees.items() if v.get("deborde")}
    dou = {k: v["douteux"] for k, v in entrees.items() if v.get("douteux")}
    imp = {k: v["douteux_importants"] for k, v in entrees.items() if v.get("douteux_importants") and k in choisies}
    res = {k: sorted({c["nom"] for c in v.get("croquis", []) if not c["dessine"]}) for k, v in entrees.items()}
    res = {k: v for k, v in res.items() if v}
    if res:
        print(f"croquis en attente (place réservée) : {res}")
    if dou:
        print(f"mots douteux restants : {dou}")
    if imp:
        print(f"✗ mots IMPORTANTS douteux (nombres, unités, noms, ingrédients) : {imp}")
    print(f"pages cuites : {len(choisies)} en {time.time() - t0:.1f} s" + (f" — débordements : {deb}" if deb else ""))
    return 1 if (deb or erreurs or imp or contenus) else 0


# =============================================================================================
# Impression (A5)
# =============================================================================================
def main_imprime(a, pages, papiers, plan, carnet, roster, cuisine_ecran, seul, erreurs, t0) -> int:
    fmt = F.FORMATS[a.format]
    slugs = [s for d in carnet.get("doubles", []) for s in d.get("invites", []) if s != "cecile"]
    if seul:
        slugs = [s for s in slugs if s in seul or any(s in (d.get("invites") or []) and d["id"] in seul for d in carnet["doubles"])]
    descs, ordre = {}, {}
    for slug in slugs:
        try:
            res = RC.pages_a5(slug, pages, plan, papiers, carnet, roster, fmt)
        except RC.Deborde as e:
            erreurs.append(str(e))
            print(f"✗ {e}")
            continue
        descs.update(res.pages)
        ordre[slug] = res.ordre
        print(f"  {slug} : A5 {len(res.ordre)} pages ({', '.join(res.ordre)})", flush=True)
    sortie = SORTIE_A5
    cuisine = Cuisine(descs, papiers, force=a.force, apercus=a.apercus, sortie=sortie, fmt=fmt,
                      apercus_dir=RACINE / "verification/out/v4-p/a5", cache=sortie / ".cuisson.json")
    contenus = verifier_contenus(descs)
    manifeste_f = sortie / "manifeste.json"
    ancien = json.loads(manifeste_f.read_text()) if manifeste_f.exists() else {"pages": {}, "invites": {}}
    entrees = dict(ancien.get("pages", {}))
    invites = dict(ancien.get("invites", {}))
    for slug, ids in ordre.items():
        for k in [k for k in entrees if entrees[k].get("invite") == slug and k not in ids]:
            entrees.pop(k)
        for pid in ids:
            entrees[pid] = cuisine.cuire(pid)
            cuisine.ecrire_cache()
            _imprimer(cuisine.journal)
            cuisine.journal.clear()
        invites[slug] = ids
    man = dict({"version": 1}, **fmt.manifeste(), invites=invites, pages=dict(sorted(entrees.items())))
    man["_"] = ("Feuilles A5 recto-verso, une par invité (lot P, scripts/pages/cuire.py --format a5) : image composée "
                "papier + encre (JPEG, fond perdu compris) ; rects en fractions de la page AVEC fond perdu ; "
                "vivants.photo : tirage collé ; vivants.qr : QR (26 mm + zone calme) posé par le lot Pr.")
    sortie.mkdir(parents=True, exist_ok=True)
    manifeste_f.write_text(json.dumps(man, indent=1, ensure_ascii=False) + "\n")
    cuisine.ecrire_cache()
    return bilan(entrees, [p for ids in ordre.values() for p in ids], erreurs, contenus, t0)


if __name__ == "__main__":
    sys.exit(main())
