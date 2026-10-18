"""Le « lecteur » : relit chaque mot généré avec un modèle de reconnaissance d'écriture
(TrOCR small handwritten, Microsoft, licence MIT du dépôt microsoft/unilm ; export ONNX de
Xenova) et note à quel point l'image se lit comme le texte voulu :
log P(texte | image), en forçant le décodeur sur le texte attendu.

Il ne sert qu'à **choisir** parmi les candidats du réseau d'écriture (et à en redemander quand
aucun ne se lit bien) : rien de TrOCR ne se retrouve dans le tracé.

Plusieurs mots (candidats) sont composés sur une même « ligne » d'image, comme les lignes
d'IAM sur lesquelles TrOCR a appris ; la note de chaque mot est la somme des log-probabilités
de ses jetons. On regarde aussi, jeton par jeton, si le jeton attendu est le premier choix
du lecteur : sinon il lirait autre chose (« annivenaire » pour « anniversaire »).
~0,3 s par image (CPU, 1 fil).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parents[2]
DOSSIER = RACINE / "vendor" / "trocr"
FICHIERS = ("encoder_model.onnx", "decoder_model_quantized.onnx", "tokenizer.json")
MOTS_PAR_IMAGE = 6
CARS_PAR_IMAGE = 34
POLICE_REFERENCE = RACINE / "design-system" / "fonts" / "kalam-latin-400-normal.woff2"


def disponible() -> bool:
    if not all((DOSSIER / f).exists() for f in FICHIERS):
        return False
    try:
        import onnxruntime  # noqa: F401
        import PIL  # noqa: F401
        import tokenizers  # noqa: F401
    except ImportError:
        return False
    return True


# Lecture stricte (mots importants : nombres, unités, noms, ingrédients ; lot E) : en plus du mot
# amputé d'une lettre (à toute longueur, chiffres compris), le lecteur ne doit préférer aucune
# lecture voisine : chiffre confondu (« 180 » / « 100 »), chiffre pris pour une lettre (« 40 » /
# « 4C »), unité déformée (« g » / « q », « 9 »).
CHIFFRES_VOISINS = {"0": "689", "1": "74", "2": "731", "3": "852", "4": "91", "5": "638", "6": "058",
                    "7": "12", "8": "0369", "9": "480"}
SOSIES = {"0": "ocuCO", "1": "lIt", "2": "z", "3": "B", "4": "ytu", "5": "sS", "6": "b", "7": "t",
          "8": "B", "9": "gq", "g": "q9y", "q": "g9", "l": "1", "h": "bk", "C": "(L", "c": "e"}


def variantes(mot: str, strict: bool = False) -> list[str]:
    """Lectures voisines de `mot` qui ne doivent pas se lire mieux que lui.

    Ordinaire : le mot privé d'une lettre (hors lettres doubles : « ff » lu « f » n'est pas une
    lettre oubliée). Strict : privé d'un caractère quelconque (lettre ou chiffre, à toute longueur ;
    « 00 » lu « 0 » EST un chiffre oublié), plus les chiffres voisins et les sosies (CHIFFRES_VOISINS,
    SOSIES). Les variantes qui ne diffèrent que par la casse ou les espaces sont écartées."""
    out = set()
    for j, ch in enumerate(mot):
        double = ch == mot[j - 1 : j] or ch == mot[j + 1 : j + 2]
        if ch.isalpha() and not double or (strict and ch.isdigit()):
            out.add(mot[:j] + mot[j + 1 :])
    if strict:
        for j, ch in enumerate(mot):
            for d in CHIFFRES_VOISINS.get(ch, "") + SOSIES.get(ch, ""):
                out.add(mot[:j] + d + mot[j + 1 :])
    def _c(t):
        return "".join(t.split()).lower()
    return sorted(v for v in out if v.strip() and _c(v) != _c(mot))


def _lse(x):
    m = x.max(-1)
    return m + np.log(np.exp(x - m[..., None]).sum(-1))


def _lsm(x):
    x = x - x.max(-1, keepdims=True)
    return x - np.log(np.exp(x).sum(-1, keepdims=True))


class Lecteur:
    def __init__(self):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        so = ort.SessionOptions()
        so.intra_op_num_threads = 1  # plus rapide qu'en multi-fil sur ces machines
        so.inter_op_num_threads = 1
        so.log_severity_level = 3
        self.enc = ort.InferenceSession(str(DOSSIER / "encoder_model.onnx"), so)
        self.dec = ort.InferenceSession(str(DOSSIER / "decoder_model_quantized.onnx"), so)
        self.tok = Tokenizer.from_file(str(DOSSIER / "tokenizer.json"))
        self.n_images = 0
        self._refs: dict[str, float] = {}
        self._fichier_refs = Path(__file__).resolve().parent / ".cache" / "lecteur-references-v5.json"
        try:
            import json

            self._refs = json.loads(self._fichier_refs.read_text())
        except Exception:
            pass

    # -- image -----------------------------------------------------------------------------
    @staticmethod
    def _image(mots_traits, px=20):
        from PIL import Image, ImageDraw

        x = 0.0
        tous = []
        for traits in mots_traits:
            if not traits:
                continue
            P = np.vstack(traits)
            x0 = P[:, 0].min()
            tous += [np.asarray(Q)[:, :2] - [x0 - x, 0] for Q in traits]
            x += P[:, 0].max() - x0 + 1.1
        P = np.vstack(tous)
        x0, y0 = P.min(0) - 0.7
        x1, y1 = P.max(0) + 0.7
        im = Image.new("L", (max(8, int((x1 - x0) * px)), max(8, int((y1 - y0) * px))), 255)
        d = ImageDraw.Draw(im)
        for Q in tous:
            pts = [((a - x0) * px, (b - y0) * px) for a, b in Q]
            d.line(pts if len(pts) > 1 else pts * 2, fill=0, width=max(2, int(0.1 * px)), joint="curve")
        im = im.convert("RGB").resize((384, 384), Image.BICUBIC)
        a = np.asarray(im, np.float32) / 255.0
        return ((a - 0.5) / 0.5).transpose(2, 0, 1)

    @staticmethod
    def _image_texte(mots, px=40):
        """Les mêmes mots écrits dans une police manuscrite propre (Kalam) : la note de
        référence, qui mesure ce que coûte le mot lui-même au modèle de langue de TrOCR
        (« jusqu'a » ou « blanchisse » se lisent moins « facilement » que « the »)."""
        from PIL import Image, ImageDraw, ImageFont

        f = ImageFont.truetype(str(POLICE_REFERENCE), px)
        texte = "  ".join(mots)
        b = f.getbbox(texte)
        W, H = b[2] - b[0] + px, b[3] - b[1] + px
        im = Image.new("L", (W, H), 255)
        ImageDraw.Draw(im).text((px // 2 - b[0], px // 2 - b[1]), texte, font=f, fill=0)
        im = im.convert("RGB").resize((384, 384), Image.BICUBIC)
        a = np.asarray(im, np.float32) / 255.0
        return ((a - 0.5) / 0.5).transpose(2, 0, 1)

    def references(self, textes: list[str], strict: bool = False) -> dict[str, tuple[float, list[bool], float | None]]:
        """Notes de référence (police propre). `strict` : avec les variantes strictes (mots importants)."""
        cle = (lambda t: "\u241fstrict\u241f" + t) if strict else (lambda t: t)
        manquants = sorted({t for t in textes if cle(t) not in self._refs})
        if manquants:
            notes = self._noter_images(manquants, lambda groupe: self._image_texte(groupe), verifier=True,
                                       stricts=set(manquants) if strict else None)
            self._refs.update({cle(t): list(n) for t, n in zip(manquants, notes)})
            try:
                import json

                self._fichier_refs.parent.mkdir(parents=True, exist_ok=True)
                self._fichier_refs.write_text(json.dumps(self._refs, ensure_ascii=False))
            except Exception:
                pass
        return {t: self._refs[cle(t)] for t in textes}

    def _jetons(self, texte):
        return self.tok.encode(texte).ids[1:-1]

    # -- notes -----------------------------------------------------------------------------
    def noter(self, items: list[tuple[str, list[np.ndarray]]], accepter=None, stricts=None) -> list[tuple]:
        """items : (texte, traits) → pour chacun (log P(texte | image), [jeton attendu = 1er
        choix du lecteur ?] pour chaque jeton du mot, avantage de la meilleure variante amputée
        d'une lettre (None si non calculé)). `stricts` : textes relus strictement (variantes
        strictes, à toute longueur)."""
        textes = [t for t, _ in items]
        return self._noter_images(textes, lambda groupe, k0: self._image([items[k][1] for k in k0]),
                                  avec_index=True, verifier=True, accepter=accepter, stricts=stricts)

    def _noter_images(self, textes, faire_image, avec_index=False, verifier=False, accepter=None,
                      stricts=None) -> list:
        if not textes:
            return []
        lignes, ligne, n = [], [], 0
        for k, t in enumerate(textes):
            if ligne and (len(ligne) >= MOTS_PAR_IMAGE or n + len(t) > CARS_PAR_IMAGE):
                lignes.append(ligne)
                ligne, n = [], 0
            ligne.append(k)
            n += len(t) + 1
        if ligne:
            lignes.append(ligne)
        notes = [0.0] * len(textes)
        if avec_index:
            X = np.stack([faire_image([textes[k] for k in l], l) for l in lignes])
        else:
            X = np.stack([faire_image([textes[k] for k in l]) for l in lignes])
        self.n_images += len(lignes)
        h = self.enc.run(None, {"pixel_values": X})[0]
        seqs, spans = [], []
        for l in lignes:
            ids, sp = [], []
            for k in l:
                j = self._jetons(textes[k])
                sp.append((len(ids), len(ids) + len(j)))
                ids += j
            ids.append(2)
            sp[-1] = (sp[-1][0], len(ids))
            seqs.append(ids)
            spans.append(sp)
        L = max(len(s) for s in seqs)
        inp = np.ones((len(seqs), L), np.int64)
        for i, s in enumerate(seqs):
            inp[i, : len(s)] = [2] + s[:-1]
        lg = self.dec.run(["logits"], {"input_ids": inp, "encoder_hidden_states": h})[0]
        for i, (l, s, sp) in enumerate(zip(lignes, seqs, spans)):
            rangs = lg[i, : len(s)]
            v = rangs[np.arange(len(s)), s] - _lse(rangs)
            # le jeton attendu est-il le 1er choix du lecteur (avec le bon début de mot) ?
            # (ou presque : à moins de 1,2 nat du premier choix — « ch » manuscrit hésite avec « cl »)
            premier = (rangs[np.arange(len(s)), s] - rangs.max(-1)) > -1.2
            for k, (a, b) in zip(l, sp):
                n_mot = len(self._jetons(textes[k]))
                notes[k] = (float(v[a:b].sum()), [bool(x) for x in premier[a : a + n_mot]], None)
        if verifier:  # (aussi pour les références : le modèle de langue préfère parfois « tamises »)
            # lettre manquante ? le même mot privé d'une lettre se lit-il mieux que le mot entier ?
            # (« Ceile » écrit pour « Cecile » : le modèle de langue de TrOCR corrige tout seul).
            # Seulement pour les candidats qui seraient acceptés, et sur le début de ligne utile.
            var_seqs, var_ref = [], []
            for i, (l, s_, sp) in enumerate(zip(lignes, seqs, spans)):
                for q, k in enumerate(l):
                    mot = textes[k]
                    strict = bool(stricts) and mot in stricts
                    if (not strict and sum(ch.isalpha() for ch in mot) < 4) or \
                            (accepter is not None and not accepter(mot, notes[k])):
                        continue
                    vs = variantes(mot, strict)
                    if not vs:
                        continue
                    a_, b_ = sp[q]
                    n_mot = len(self._jetons(mot))
                    avant = s_[:a_]
                    apres = s_[a_ + n_mot : a_ + n_mot + 1]
                    ref_ids = avant + s_[a_ : a_ + n_mot] + apres
                    var_seqs.append(ref_ids)
                    var_ref.append((i, k, None, a_))
                    # (pas dans une lettre double : « ff » lu « f » n'est pas une lettre oubliée)
                    for v_ in vs:
                        var_seqs.append(avant + self._jetons(v_) + apres)
                        var_ref.append((i, k, v_, a_))
            if var_seqs:
                L2 = max(len(x) for x in var_seqs)
                inp = np.ones((len(var_seqs), L2), np.int64)
                for j, x in enumerate(var_seqs):
                    inp[j, : len(x)] = [2] + x[:-1]
                hv = h[[r[0] for r in var_ref]]
                lgv = self.dec.run(["logits"], {"input_ids": inp, "encoder_hidden_states": hv})[0]
                base, pire = {}, {}
                for j, (x, (i, k, v_, a_)) in enumerate(zip(var_seqs, var_ref)):
                    # le début de ligne est commun à toutes les variantes : on ne compte que la fin
                    rangs = lgv[j, a_ : len(x)]
                    tot = float((rangs[np.arange(len(rangs)), x[a_:]] - _lse(rangs)).sum())
                    if v_ is None:
                        base[k] = tot
                    else:
                        pire[k] = max(pire.get(k, -1e9), tot)
                for k, tot in pire.items():
                    # > 0 : une variante amputée d'une lettre se lit mieux que le mot entier
                    notes[k] = (notes[k][0], notes[k][1], tot - base[k])
        return notes
