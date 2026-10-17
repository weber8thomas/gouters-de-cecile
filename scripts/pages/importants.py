"""Mots importants du carnet (CONTRACT § 13, lot E) : ceux qu'on ne doit jamais mal lire.

    tools/ecriture/.venv/bin/python scripts/pages/importants.py            # vérifie tout le contenu
    tools/ecriture/.venv/bin/python scripts/pages/importants.py a.json …   # vérifie ces fichiers

Est important :
  - tout jeton qui contient un chiffre, « ° » ou une fraction (½ ¼ ¾ ⅓ ⅔) : « 180 », « (180 », « 1h, »,
    « 175° », « 5/6). », « ½ » ;
  - une unité (`UNITES` : g, kg, cl, ml, l, dl, cm, mm, min, h, °C, °, c., s., càs, càc, th.…), même
    seule : « g » de « 180 g », « min » de « 40 min » ;
  - un nom : prénom du roster (src/content/roster.json), « Cécile », « Mamie », « Rose », et les noms
    passés dans `contexte['noms']` ;
  - un ingrédient : ceux de la recette en cours (`contexte['ingredients']`, mots ou lignes
    d'ingrédients ; ou `contexte['recette']`, une RecetteRecue), plus une petite liste par défaut
    (`INGREDIENTS`), au singulier comme au pluriel, avec ou sans élision (« d'huile », « l'œuf »).

Ce que cela change (lot E) :
  - l'écriture générée relit TOUS les jetons de ces mots, même courts, dans leur groupe (« 180 g »,
    « 4 °C », « 40 min ») et sans aucune tolérance (scripts/pages/ecriture.py) ; la bille ne saute
    jamais sur leurs traits (tools/ecriture/encre.py) ; la cuisson relit l'encre rendue
    (`ecriture.relire_rendu`) ;
  - `verifier_contenu` refuse toute fausse faute : correction voulue À L'INTÉRIEUR d'un mot (insertion
    `^{…}` collée, rature partielle : « 180^{g} », « farin^{e} », « fari~~m~~>{n}e »), unité ajoutée à
    une quantité (« 180 ^{g} »), coquille corrigée (rature de deux formes proches du même mot :
    « ~~carrières~~>{carottes} », « ~~farin~~>{farine} »), qu'il s'agisse ou non d'un mot important.
    Restent permis le remplacement complet d'une quantité (« ~~150 g~~>{120 g} », « ~~45 min~~>{40 min} » :
    le nouveau groupe est écrit en entier et relu strictement), le remplacement d'un mot par un autre
    et la phrase ajoutée (« sel^{ et 1 de cannelle} »).

Ce module ne dépend que de la bibliothèque standard (il est importé par la mise en page et par
l'écriture : aucun import du moteur ici, pas d'import circulaire).
"""
from __future__ import annotations

import functools
import json
import re
import sys
import unicodedata
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE = ICI.parents[1]
ROSTER = RACINE / "src/content/roster.json"

# ---------------------------------------------------------------------------------------------
# Unités. `mise_en_page.UNITES` (ligne ≈ 75, propriété du lot P) sert à ne pas couper « 120 g » en
# fin de ligne ; on en garde ici la forme nue (sans la ponctuation collée, qu'on retire avant de
# comparer) et on y ajoute les mesures de cuisine (c. à s., càc…). Un test vérifie que toute unité
# de mise_en_page reste reconnue ici (tests/test_importants.py).
# ---------------------------------------------------------------------------------------------
UNITES = frozenset({
    "g", "kg", "mg", "cl", "ml", "l", "dl", "cm", "mm", "min", "mn", "h", "s", "%", "°", "°c", "°f",
    "c", "c.", "s.", "cs", "cc", "càs", "càc", "c.à.s", "c.à.c", "c.à.s.", "c.à.c.", "cas", "cac",
    "cuil.", "cuill.", "càs.", "càc.", "th", "th.", "gr", "gr.",
})
FRACTIONS = set("½¼¾⅓⅔⅛")
SIGNES = set("°") | FRACTIONS

# Noms toujours importants (en plus des prénoms du roster)
NOMS_FIXES = ("Cécile", "Mamie", "Rose")

# Ingrédients courants (forme de base, sans accents ni majuscules, au singulier ; le pluriel en
# -s / -x est reconnu). Une recette ajoute les siens par `contexte['ingredients']`.
INGREDIENTS = frozenset("""
farine sucre beurre oeuf lait levure sel chocolat vanille cannelle citron carotte noix huile creme
miel pomme poire amande noisette orange fraise framboise myrtille banane abricot cerise rhubarbe
prune mirabelle coing marron chataigne cacao muscade gingembre coco yaourt pavot zeste confiture
caramel rhum cafe the eau cassonade vergeoise maizena fecule bicarbonate praline raisin avoine
pepite glace fromage mascarpone ricotta lime pistache sesame anis badiane cardamome clou safran
""".split())

# Mots vides et mots de mesure : jamais pris pour des ingrédients (lignes d'ingrédients du contexte)
MOTS_VIDES = frozenset("""
de du des la le les l d a au aux et ou en un une pour avec sans sur sous dans par bien tres plus
moins selon autre autres ce cette ces son sa ses mon ma mes ton ta tes qui que quoi y il elle on
je tu nous vous ils elles se si ne pas peu tout toute tous toutes chaque quelques environ
gros grosse grosses grand grande petit petite petits petites demi moitie entier entiere
cuillere cuilleres cuil cuill sachet sachets pincee pincees verre verres tasse tasses bol pot
pots gousse gousses morceau morceaux tranche tranches brin brins botte bottes poignee filet
goutte gouttes paquet paquets boite boites rape rapee rapees rapes fondu fondue fondus mou molle
froid froide tiede chaud chaude fluide chimique concasse concassee concassees concasses vegetale
vegetal non traite traites bio frais fraiche extrait option bonus soupe jus fleur poudre bloc
""".split())

ELISIONS = ("l'", "d'", "qu'", "j'", "n'", "s'", "t'", "m'", "c'", "jusqu'", "lorsqu'", "puisqu'")
PONCT_BORDS = "()[]{}«»\"“”„‘’',;:!?…·*_~^"


def _sans_accents(s: str) -> str:
    s = s.replace("œ", "oe").replace("Œ", "Oe").replace("æ", "ae").replace("Æ", "Ae")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm(s: str) -> str:
    """Minuscules, sans accents, apostrophes droites (forme de comparaison)."""
    return _sans_accents(s.replace("’", "'").replace("‘", "'")).lower()


def _nu(jeton: str) -> str:
    """Jeton sans balisage ni ponctuation de bord (le point final reste : « c. », « s. »)."""
    t = jeton.strip()
    t = re.sub(r"__|~~|\^\{|\}|>\{", "", t)
    t = t.strip(PONCT_BORDS + " ")
    return t


def _sans_elision(t: str) -> str:
    n = norm(t)
    for e in ELISIONS:
        if n.startswith(e) and len(n) > len(e):
            return t[len(e):]
    return t


@functools.lru_cache(maxsize=1)
def noms_roster() -> frozenset:
    """Prénoms du roster (formes normalisées) + Cécile, Mamie, Rose."""
    noms = set(NOMS_FIXES)
    try:
        r = json.loads(ROSTER.read_text())
        for g in r.get("guests", []):
            if g.get("firstName"):
                noms.add(g["firstName"])
    except Exception:  # roster absent (tests isolés) : les noms fixes suffisent
        pass
    return frozenset(norm(n) for n in noms)


def _singulier(n: str) -> list[str]:
    out = [n]
    if len(n) > 3 and n[-1] in "sx":
        out.append(n[:-1])
    return out


def ingredients_de(lignes) -> list[str]:
    """Mots-ingrédients d'une liste de lignes (ou de mots) d'ingrédients : sans balisage, ni nombres,
    ni unités, ni mots vides ou de mesure (« 2 cuillères à café de cannelle » → « cannelle »)."""
    if isinstance(lignes, str):
        lignes = [lignes]
    out = []
    for ligne in lignes or []:
        if not isinstance(ligne, str):
            continue
        ligne = re.sub(r":[a-z][a-z0-9-]*:", " ", ligne)  # icônes
        ligne = re.sub(r"~~(.+?)~~>\{([^}]*)\}", r"\2", ligne)  # la correction remplace le raturé
        ligne = re.sub(r"\^\{([^}]*)\}", r" \1 ", ligne)
        for w in re.split(r"[\s/]+", ligne):
            t = _sans_elision(_nu(w)).strip(".")
            n = norm(t)
            if len(n) < 3 or any(c.isdigit() for c in n) or n in UNITES or n in MOTS_VIDES:
                continue
            if not n.isalpha():
                continue
            out.append(n)
    return out


@functools.lru_cache(maxsize=64)
def _ingredients_ctx(cle: tuple) -> frozenset:
    return frozenset(s for n in cle for s in _singulier(n))


def _lignes_recette(recette: dict) -> list[str]:
    lignes = []
    for g in (recette or {}).get("ingredients", []) or []:
        for l in g.get("lignes", []) if isinstance(g, dict) else []:
            lignes.append(l.get("texte", "") if isinstance(l, dict) else str(l))
    for ex in (recette or {}).get("extras", []) or []:
        for l in ex.get("lignes", []) if isinstance(ex, dict) else []:
            lignes.append(l.get("texte", "") if isinstance(l, dict) else str(l))
    return lignes


def _contexte(contexte: dict | None):
    """→ (ingrédients normalisés du contexte, noms normalisés du contexte)."""
    if not contexte:
        return frozenset(), frozenset()
    ing = list(contexte.get("ingredients") or [])
    if contexte.get("recette"):
        ing += _lignes_recette(contexte["recette"])
    mots = tuple(sorted(set(ingredients_de(ing))))
    noms = frozenset(norm(n) for n in (contexte.get("noms") or []))
    return _ingredients_ctx(mots), noms


def est_unite(jeton: str) -> bool:
    if norm(jeton.strip()).endswith("'"):  # « l' », « d' » : une élision, pas une unité
        return False
    t = _nu(jeton)
    n = norm(t)
    return bool(n) and (n in UNITES or n.rstrip(".,;:") in UNITES)


def est_nombre(jeton: str) -> bool:
    """Contient un chiffre, une fraction ou « ° » (« 180 », « (180 », « ½ », « 175° », « 1h, »)."""
    return any(c.isdigit() or c in SIGNES for c in jeton)


def important(jeton: str, contexte: dict | None = None) -> bool:
    """Le jeton (un mot tel qu'écrit, ponctuation collée comprise) est-il un mot important ?"""
    if not jeton or not jeton.strip():
        return False
    if re.fullmatch(r"\s*:[a-z][a-z0-9-]*:\s*", jeton):  # icône (« :carotte: ») : un croquis, pas un mot
        return False
    if est_nombre(jeton):
        return True
    if norm(jeton.strip()).endswith("'"):  # « l' », « d' », « qu' » : une élision seule
        return False
    t = _nu(jeton)
    if not t:
        return False
    if est_unite(t):
        return True
    t = _sans_elision(t)
    n = norm(t).strip(".-")
    if not n:
        return False
    ing_ctx, noms_ctx = _contexte(contexte)
    for forme in {n, *n.split("-")}:
        if forme in noms_roster() or forme in noms_ctx:
            return True
        for s in _singulier(forme):
            if s in INGREDIENTS or s in ing_ctx:
                return True
    return False


# =============================================================================================
# Validation du contenu : aucune correction voulue dans un mot important
# =============================================================================================
# Même balisage que mise_en_page.py (`_BAL`) : ~~raturé~~>{correction} · ~~raturé~~>mot · ~~raturé~~
# · __souligné__ · ^{inséré}
_BAL = re.compile(r"~~(.+?)~~(?:>(\{[^}]*\}|[^\s~_^]+(?:\s+[^\s~_^]+)?))?|__(.+?)__|\^\{([^}]*)\}")


def _car_de_mot(c: str) -> bool:
    return c.isalnum() or c in SIGNES or c in "'’-"


def _bord_gauche(texte: str, i: int) -> str:
    """Partie de mot collée juste avant la position i (vide si espace ou début)."""
    j = i
    while j > 0 and _car_de_mot(texte[j - 1]):
        j -= 1
    return texte[j:i]


def _bord_droit(texte: str, i: int) -> str:
    j = i
    while j < len(texte) and _car_de_mot(texte[j]):
        j += 1
    return texte[i:j]


def _compact(s: str) -> str:
    return re.sub(r"\s+", "", norm(s))


def _sous_suite(a: str, b: str) -> bool:
    """a s'obtient-il en retirant des caractères à b ?"""
    it = iter(b)
    return all(c in it for c in a)


def _jetons(s: str) -> list[str]:
    return [w for w in re.split(r"\s+", s) if w]


def _texte_lisible(texte: str) -> str:
    """Le texte balisé sans balises (pour retrouver les voisins d'une marque)."""
    return _BAL.sub(lambda m: (m.group(2) or m.group(1) or "").strip("{}") if m.group(1) is not None
                    else (m.group(3) if m.group(3) is not None else m.group(4)), texte)


# Deux formes du même mot mal écrit : ressemblance (difflib) ≥ 0,5 avec les trois mêmes premières
# lettres (« carrières » / « carottes » : 0,59), ou ≥ 0,75 quel que soit le début (« masion » /
# « maison »). Deux mots voisins mais différents passent (« pomme » / « poire », « cannelle » /
# « vanille », « belle » / « jolie »).
SEUIL_PROCHES = 0.5
SEUIL_PROCHES_LIBRE = 0.75


def formes_proches(a: str, b: str) -> bool:
    """Deux formes proches du même mot (coquille corrigée) : « carrières » / « carottes »,
    « farin » / « farine », « suc » / « sucre ». Deux mots différents (« belle » / « jolie ») ou deux
    quantités (« 150 g » / « 120 g ») ne le sont pas."""
    import difflib
    brut_a, brut_b = "".join(a.split()), "".join(b.split())
    a, b = _compact(a), _compact(b)
    if not a or not b:
        return False
    if a == b:  # seul un accent ou une majuscule change : « Cecile » / « Cécile »
        return brut_a != brut_b
    if any(c.isdigit() for c in a + b):  # quantités : un ajustement, pas une coquille
        return False
    if _sous_suite(a, b) or _sous_suite(b, a):
        return True
    r = difflib.SequenceMatcher(None, a, b).ratio()
    return r >= SEUIL_PROCHES_LIBRE or (r >= SEUIL_PROCHES and a[:3] == b[:3])


def verifier_contenu(texte: str, contexte: dict | None = None) -> list[str]:
    """Erreurs du texte balisé (aucune fausse faute dans le texte des invités, CONTRACT § 13) :
      - une insertion `^{…}` collée à un mot (elle y ajoute des lettres : « 180^{g} », « farin^{e} »,
        « bel^{l}e ») ;
      - une insertion d'unité ou de nombre seuls à côté d'une quantité (« 180 ^{g} ») ;
      - une rature partielle, qui coupe un mot (« fari~~m~~>{n}e ») ;
      - une rature `~~a~~>{b}` dont a et b sont deux formes proches du même mot (coquille corrigée :
        « ~~carrières~~>{carottes} », « ~~farin~~>{farine} »).
    Restent permis : une insertion qui ajoute du sens (« sel^{ et 1 de cannelle} »), le remplacement
    complet d'une quantité (« ~~150 g~~>{120 g} », « ~~45 min~~>{40 min} ») ou d'un mot par un autre
    (« ~~belle~~>{jolie} »), une rature sans correction, un souligné. Les messages disent si le mot
    touché est important (nombre, unité, nom, ingrédient). Renvoie une liste (vide = correct)."""
    erreurs = []
    if not isinstance(texte, str) or ("~~" not in texte and "^{" not in texte):
        return erreurs

    def genre(mots):
        return "le mot important" if any(important(w, contexte) for w in mots if w) else "le mot"

    for m in _BAL.finditer(texte):
        if m.group(3) is not None:  # souligné : jamais une faute
            continue
        gauche = _bord_gauche(texte, m.start())
        droite = _bord_droit(texte, m.end())
        extrait = texte[max(0, m.start() - 12): m.end() + 12].replace("\n", " ")
        if m.group(4) is not None:  # insertion ^{…}
            ins = m.group(4)
            colle_g = bool(gauche) and not ins[:1].isspace()
            colle_d = bool(droite) and not ins[-1:].isspace()
            if colle_g or colle_d:
                mot = (gauche if colle_g else "") + ins.strip() + (droite if colle_d else "")
                parties = [(gauche if colle_g else ""), (droite if colle_d else ""), mot]
                erreurs.append(f"insertion « ^{{{ins}}} » dans {genre(parties)} « {mot} » : une lettre ajoutée "
                               f"est une fausse faute (… {extrait} …)")
                continue
            # insertion séparée : une unité ou un nombre seuls ajoutés à côté d'une quantité
            js = _jetons(ins)
            if js and all(est_unite(j) or est_nombre(j) for j in js):
                avant = _jetons(_texte_lisible(texte[: m.start()]))
                apres = _jetons(_texte_lisible(texte[m.end():]))
                voisins = [v for v in avant[-1:] + apres[:1] if est_nombre(v) or est_unite(v)]
                if voisins:
                    erreurs.append(f"insertion « ^{{{ins}}} » qui complète la quantité « {' '.join(voisins)} » "
                                   f"(… {extrait} …)")
            continue
        # rature ~~a~~>{b} / ~~a~~>b / ~~a~~
        barre = m.group(1)
        corr = m.group(2)
        if corr and corr.startswith("{"):
            corr = corr[1:-1]
        if gauche or droite:  # rature partielle : elle coupe un mot
            mots = [gauche + barre + droite] + ([gauche + corr + droite] if corr is not None else [])
            touches = [w for m_ in mots for w in _jetons(m_)] + [p for p in (gauche, droite) if p]
            erreurs.append(f"rature partielle « ~~{barre}~~ » dans {genre(touches)} « {mots[-1]} » (… {extrait} …)")
            continue
        if not corr:
            continue
        a, b = _compact(barre), _compact(corr)
        if a != b and len(b) > len(a) and len(b) - len(a) <= 3 and _sous_suite(a, b) \
                and any(important(j, contexte) for j in _jetons(corr)):
            erreurs.append(f"correction « ~~{barre}~~>{{{corr}}} » qui ajoute une lettre ou une unité manquante "
                           f"au mot important « {corr} » (… {extrait} …)")
            continue
        ja, jb = _jetons(barre), _jetons(corr)
        paires = list(zip(ja, jb)) if len(ja) == len(jb) else [(barre, corr)]
        proches = [(x, y) for x, y in paires if formes_proches(x, y)]
        if proches:
            x, y = proches[0]
            erreurs.append(f"coquille corrigée « ~~{barre}~~>{{{corr}}} » : « {x} » et « {y} » sont deux formes "
                           f"du même mot ({genre([y])} « {y} ») — une fausse faute (… {extrait} …)")
    return erreurs
    for m in _BAL.finditer(texte):
        if m.group(3) is not None:  # souligné : jamais une faute
            continue
        gauche = _bord_gauche(texte, m.start())
        droite = _bord_droit(texte, m.end())
        extrait = texte[max(0, m.start() - 12): m.end() + 12].replace("\n", " ")
        if m.group(4) is not None:  # insertion ^{…}
            ins = m.group(4)
            colle_g = bool(gauche) and not ins[:1].isspace()
            colle_d = bool(droite) and not ins[-1:].isspace()
            if colle_g or colle_d:
                mot = (gauche if colle_g else "") + ins.strip() + (droite if colle_d else "")
                parties = [p for p in ((gauche if colle_g else ""), (droite if colle_d else ""), mot) if p]
                if any(important(p, contexte) for p in parties):
                    erreurs.append(f"insertion « ^{{{ins}}} » dans le mot important « {mot} » (… {extrait} …)")
                continue
            # insertion séparée : une unité ou un nombre seuls ajoutés à côté d'une quantité
            js = _jetons(ins)
            if js and all(est_unite(j) or est_nombre(j) for j in js):
                avant = _jetons(_texte_lisible(texte[: m.start()]))
                apres = _jetons(_texte_lisible(texte[m.end():]))
                voisins = [v for v in avant[-1:] + apres[:1] if est_nombre(v) or est_unite(v)]
                if voisins:
                    erreurs.append(f"insertion « ^{{{ins}}} » qui complète la quantité « {' '.join(voisins)} » "
                                   f"(… {extrait} …)")
            continue
        # rature ~~a~~>{b} / ~~a~~>b / ~~a~~
        barre = m.group(1)
        corr = m.group(2)
        if corr and corr.startswith("{"):
            corr = corr[1:-1]
        if gauche or droite:  # rature partielle : elle coupe un mot
            mots = [gauche + barre + droite] + ([gauche + corr + droite] if corr is not None else [])
            touches = [w for m_ in mots for w in _jetons(m_)] + [p for p in (gauche, droite) if p]
            if any(important(w, contexte) for w in touches):
                erreurs.append(f"rature partielle « ~~{barre}~~ » dans le mot important « {mots[-1]} » (… {extrait} …)")
            continue
        if corr:
            a, b = _compact(barre), _compact(corr)
            if a != b and len(b) > len(a) and len(b) - len(a) <= 3 and _sous_suite(a, b) \
                    and any(important(j, contexte) for j in _jetons(corr)):
                erreurs.append(f"correction « ~~{barre}~~>{{{corr}}} » qui ajoute une lettre ou une unité manquante "
                               f"au mot important « {corr} » (… {extrait} …)")
    return erreurs


# =============================================================================================
# Vérification de tout le contenu (CLI)
# =============================================================================================
_CLES_IGNOREES = {"id", "type", "main", "encre", "outil", "position", "souligne", "disposition", "gabarit",
                  "double", "cote", "papier", "puce", "croquis", "style", "source", "video", "slug", "_",
                  "adaptations", "fichier", "cible", "nom", "face", "dos", "suite", "recette"}


def _chaines(o, chemin="$"):
    if isinstance(o, str):
        yield chemin, o
    elif isinstance(o, list):
        for i, x in enumerate(o):
            yield from _chaines(x, f"{chemin}[{i}]")
    elif isinstance(o, dict):
        for k, v in o.items():
            if k in _CLES_IGNOREES:
                continue
            yield from _chaines(v, f"{chemin}.{k}")


def contexte_de(doc: dict) -> dict:
    """Contexte (ingrédients) d'un fichier de contenu : RecetteRecue, ou page décrite (blocs
    `ingredients`)."""
    lignes = _lignes_recette(doc) if isinstance(doc, dict) else []
    if isinstance(doc, dict):
        for b in doc.get("blocs", []) or []:
            if isinstance(b, dict) and b.get("type", "").startswith("ingredients"):
                for l in b.get("lignes", []) or []:
                    lignes.append(l.get("texte", "") if isinstance(l, dict) else str(l))
    return {"ingredients": lignes}


def verifier_fichier(f: Path) -> list[str]:
    try:
        doc = json.loads(Path(f).read_text())
    except Exception as e:
        return [f"{f} : illisible ({e})"]
    ctx = contexte_de(doc)
    out = []
    try:
        nom = Path(f).resolve().relative_to(RACINE)
    except ValueError:
        nom = f
    for chemin, s in _chaines(doc):
        for e in verifier_contenu(s, ctx):
            out.append(f"{nom} {chemin} : {e}")
    return out


def fichiers_contenu() -> list[Path]:
    pages = [p for p in sorted((RACINE / "src/content/pages").glob("*.json"))
             if p.name not in ("manifeste.json", "papiers.json")]
    return sorted((RACINE / "src/content/recettes").glob("*.json")) + pages


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    fichiers = [Path(a).resolve() for a in argv] if argv else fichiers_contenu()
    erreurs = []
    for f in fichiers:
        erreurs += verifier_fichier(f)
    for e in erreurs:
        print(f"✗ {e}")
    print(f"mots importants : {len(fichiers)} fichiers vérifiés, {len(erreurs)} erreur(s)")
    return 1 if erreurs else 0


if __name__ == "__main__":
    sys.exit(main())
