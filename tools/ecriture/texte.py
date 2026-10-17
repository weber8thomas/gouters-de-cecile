"""Préparation du texte : découpe en mots, et pour chaque caractère français ce que le réseau
sait écrire (alphabet d'IAM-OnDB, sans accents) + ce qu'on dessine à la main par-dessus.

- é è ê ë à â ä ù û ü ô ö î ï ÿ ç (et capitales) : lettre de base écrite par le réseau,
  diacritique ajouté en traits (`diacritiques.py`) ;
- œ : « oe » écrit par le réseau puis le e ramené sur le o (ligature) ; æ → « ae » ;
- ½ ¼ ¾ : le 1 et le 2 écrits par le réseau, réduits, le numérateur levé, barre dessinée ;
- « » ° = * € et la ponctuation en fin de mot (. , ; : ! ?) : glyphes dessinés
  (`diacritiques.glyphe`) — le réseau finit mal un mot sur un point ;
- ’ ‘ → ', “ ” → ", … → ..., – — → -, × → x, & → et ;
- espaces insécables (U+00A0, U+202F) : « 120 g », « Cécile ! » ne sont jamais coupés en fin
  de ligne ; espace fine avant ! ? ; : » et après «.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field

MARQUES = {
    "é": ("e", "aigu"), "è": ("e", "grave"), "ê": ("e", "circonflexe"), "ë": ("e", "trema"),
    "à": ("a", "grave"), "â": ("a", "circonflexe"), "ä": ("a", "trema"),
    "ù": ("u", "grave"), "û": ("u", "circonflexe"), "ü": ("u", "trema"),
    "ô": ("o", "circonflexe"), "ö": ("o", "trema"),
    "î": ("i", "circonflexe"), "ï": ("i", "trema"),
    "ÿ": ("y", "trema"), "ç": ("c", "cedille"), "á": ("a", "aigu"), "í": ("i", "aigu"),
    "ó": ("o", "aigu"), "ú": ("u", "aigu"), "ñ": ("n", "tilde"),
    "É": ("E", "aigu"), "È": ("E", "grave"), "Ê": ("E", "circonflexe"), "Ë": ("E", "trema"),
    "À": ("A", "grave"), "Â": ("A", "circonflexe"), "Ù": ("U", "grave"), "Û": ("U", "circonflexe"),
    "Ô": ("O", "circonflexe"), "Î": ("I", "circonflexe"), "Ï": ("I", "trema"), "Ç": ("C", "cedille"),
}
REMPLACEMENTS = {
    "æ": "ae", "Æ": "Ae",
    "’": "'", "‘": "'", "ʼ": "'", "“": '"', "”": '"', "„": '"',
    "…": "...", "–": "-", "—": "-", "‐": "-", "‑": "-", "−": "-", "×": "x",
}
FRACTIONS = {"½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3"}
DESSINES = set("«»°=*€⁄")
PONCTUATION_FINALE = set(".,;:!?")
MOTS_REMPLACES = {"&": "et"}

ESPACES_FINES_AVANT = set("!?;:»")
NBSP = {" ", " ", " ", " "}


@dataclass
class Segment:
    genre: str  # "reseau" (écrit par le réseau) ou "dessin" (glyphe tracé)
    texte: str  # texte pour le réseau, ou le glyphe dessiné
    marques: list[tuple[int, str]] = field(default_factory=list)  # (indice dans texte, marque)
    role: str = ""  # "num" / "den" : chiffres d'une fraction (½)
    original: str = ""


@dataclass
class Mot:
    texte: str  # tel qu'écrit
    segments: list[Segment]
    espace_avant: str = "normale"  # "normale" | "fine" | "aucune"
    insecable_avant: bool = False  # ne pas couper la ligne juste avant ce mot
    saut_avant: bool = False  # retour à la ligne forcé (\n)


def _segments(token: str, connait, non_geres: list[str]) -> list[Segment]:
    segs: list[Segment] = []

    def reseau() -> Segment:
        if not segs or segs[-1].genre != "reseau" or segs[-1].role:
            segs.append(Segment("reseau", ""))
        return segs[-1]

    if token in MOTS_REMPLACES:
        token = MOTS_REMPLACES[token]
    for ch in token:
        if ch in DESSINES:
            segs.append(Segment("dessin", ch, original=ch))
        elif ch in FRACTIONS:
            n, d = FRACTIONS[ch].split("/")
            segs.append(Segment("reseau", n, role="num", original=ch))
            segs.append(Segment("dessin", "⁄", original=""))
            segs.append(Segment("reseau", d, role="den", original=""))
        elif ch in "œŒ":  # o et e écrits par le réseau, puis le e ramené sur le o (ligature)
            s = reseau()
            s.marques.append((len(s.texte), "oe"))
            s.texte += "oe" if ch == "œ" else "Oe"
            s.original += ch
        elif ch in MARQUES:
            base, marque = MARQUES[ch]
            s = reseau()
            s.marques.append((len(s.texte), marque))
            s.texte += base
            s.original += ch
        elif ch in REMPLACEMENTS:
            s = reseau()
            s.texte += REMPLACEMENTS[ch]
            s.original += ch
        elif connait(ch):
            s = reseau()
            s.texte += ch
            s.original += ch
        else:
            # dernière chance : lettre décomposable (accent rare) → lettre de base sans accent
            base = unicodedata.normalize("NFD", ch)[0]
            if base != ch and connait(base):
                s = reseau()
                s.texte += base
                s.original += ch
            else:
                non_geres.append(ch)
    segs = [s for s in segs if s.texte]
    # « x » final (joyeux, deux, gâteaux…) : le réseau, appris sur de l'anglais, le rate presque
    # toujours en fin de mot ; il est tracé à la main (deux traits croisés, à la pente de la main)
    if segs and segs[-1].genre == "reseau" and not segs[-1].role:
        s = segs[-1]
        k = len(s.texte)
        while k > 0 and s.texte[k - 1] in PONCTUATION_FINALE:
            k -= 1
        if k >= 2 and s.texte[k - 1] == "x" and s.texte[k - 2].isalpha():
            fin = s.texte[k:]
            s.texte = s.texte[: k - 1] + fin
            s.marques = [(i, m) for i, m in s.marques if i < k - 1]
            segs.append(Segment("dessin", "x", original="x"))
            if fin:
                s.texte = s.texte[: k - 1]
                segs += [Segment("reseau", fin, original=fin)]
    # ponctuation en fin de mot : dessinée (le réseau finit mal un mot sur un point : il le
    # change en virgule ou s'emballe) ; « Cécile! », « levure. », « 3. », « ! »
    if segs and segs[-1].genre == "reseau" and not segs[-1].role:
        s = segs[-1]
        k = len(s.texte)
        while k > 0 and s.texte[k - 1] in PONCTUATION_FINALE:
            k -= 1
        if k < len(s.texte):
            fin = s.texte[k:]
            s.texte = s.texte[:k]
            s.marques = [(i, m) for i, m in s.marques if i < k]
            if not s.texte:
                segs.pop()
            segs += [Segment("dessin", c, original=c) for c in fin]
    return segs


def x_final(token: str) -> bool:
    """Le mot finit-il par un « x » tracé à la main (« joyeux », « deux, », « gâteaux ! ») ?"""
    t = token.rstrip("".join(PONCTUATION_FINALE))
    return len(t) >= 2 and t[-1] == "x" and t[-2].isalpha()


def decouper(texte: str, connait) -> tuple[list[Mot], list[str]]:
    """Découpe en mots. `connait(c)` dit si le réseau sait écrire le caractère c."""
    non_geres: list[str] = []
    mots: list[Mot] = []
    texte = unicodedata.normalize("NFC", texte)
    i, n = 0, len(texte)
    sep = ""
    while i < n:
        ch = texte[i]
        if ch.isspace():
            sep += ch
            i += 1
            continue
        j = i
        while j < n and not texte[j].isspace():
            j += 1
        token = texte[i:j]
        segs = _segments(token, connait, non_geres)
        if segs:
            m = Mot(texte=token, segments=segs)
            m.saut_avant = "\n" in sep
            if not mots or m.saut_avant:
                m.espace_avant = "aucune"
            elif token[0] in ESPACES_FINES_AVANT or (mots and mots[-1].texte.endswith("«")):
                m.espace_avant = "fine"
                m.insecable_avant = True
            insec = any(c in NBSP for c in sep)
            if insec:
                m.insecable_avant = True
                if " " in sep or " " in sep:
                    m.espace_avant = "fine"
            mots.append(m)
        sep = ""
        i = j
    return mots, sorted(set(non_geres))
