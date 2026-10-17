"""Convertit les poids et données tiers téléchargés dans vendor/ (voir telecharger.sh) en
fichiers NumPy, sans PyTorch ni TensorFlow :

- X-rayLaser/pytorch-handwriting-synthesis-toolkit (MIT) : `checkpoints/Epoch_52/model.pt`
  (archive zip PyTorch : pickle + tampons bruts) lu avec un dé-pickleur restreint (seules les
  classes nécessaires sont autorisées : aucun code venu du fichier n'est exécuté)
  → vendor/poids/xray_epoch_52.npz ;
- Grzego/handwriting-generation (MIT) : `data/styles.pkl` (8 lignes d'IAM-OnDB, offsets de
  stylo) → mises à l'échelle du réseau ci-dessus et redressées → vendor/poids/amorces.npz.

Usage : .venv/bin/python -I convertir_poids.py
"""
from __future__ import annotations

import io
import json
import pickle
import sys
import zipfile
from collections import OrderedDict
from pathlib import Path

import numpy as np

RACINE = Path(__file__).resolve().parents[2]
VENDOR = RACINE / "vendor"
SORTIE = VENDOR / "poids"


# --------------------------------------------------------------------------------------------
# PyTorch (zip) sans torch
# --------------------------------------------------------------------------------------------
class _Stockage:
    def __init__(self, dtype):
        self.dtype = dtype


_TYPES_STOCKAGE = {
    "FloatStorage": np.float32,
    "DoubleStorage": np.float64,
    "HalfStorage": np.float16,
    "LongStorage": np.int64,
    "IntStorage": np.int32,
}


def _reconstruire_tenseur(stockage, decalage, forme, pas, *_):
    tampon = stockage
    n = int(np.prod(forme)) if len(forme) else 1
    if n == 0:
        return np.zeros(forme, dtype=tampon.dtype)
    elt = tampon.itemsize
    vue = np.lib.stride_tricks.as_strided(
        tampon[decalage:], shape=tuple(forme), strides=tuple(s * elt for s in pas)
    )
    return np.array(vue)


class _DepickleurTorch(pickle.Unpickler):
    def __init__(self, f, zf: zipfile.ZipFile, prefixe: str):
        super().__init__(f)
        self.zf = zf
        self.prefixe = prefixe

    def find_class(self, module, name):
        if module == "collections" and name == "OrderedDict":
            return OrderedDict
        if module == "torch._utils" and name == "_rebuild_tensor_v2":
            return _reconstruire_tenseur
        if module == "torch" and name in _TYPES_STOCKAGE:
            return _Stockage(_TYPES_STOCKAGE[name])
        raise pickle.UnpicklingError(f"classe refusée : {module}.{name}")

    def persistent_load(self, pid):
        # ('storage', type, clé, emplacement, nombre)
        _, type_stockage, cle, _emplacement, _n = pid
        brut = self.zf.read(f"{self.prefixe}/data/{cle}")
        return np.frombuffer(brut, dtype=type_stockage.dtype)


def lire_torch(chemin: Path) -> dict[str, np.ndarray]:
    zf = zipfile.ZipFile(chemin)
    nom_pkl = next(n for n in zf.namelist() if n.endswith("data.pkl"))
    prefixe = nom_pkl.rsplit("/", 1)[0]
    with zf.open(nom_pkl) as f:
        etat = _DepickleurTorch(io.BytesIO(f.read()), zf, prefixe).load()
    return {k: np.asarray(v, dtype=np.float32) for k, v in etat.items()}


# --------------------------------------------------------------------------------------------
class _DepickleurNumpy(pickle.Unpickler):
    """Pickles de Grzego (styles, alphabet) : seulement des tableaux NumPy et des types simples."""

    AUTORISES = {
        ("numpy.core.multiarray", "_reconstruct"),
        ("numpy._core.multiarray", "_reconstruct"),
        ("numpy", "ndarray"),
        ("numpy", "dtype"),
        ("numpy.core.multiarray", "scalar"),
        ("numpy._core.multiarray", "scalar"),
    }

    def find_class(self, module, name):
        if (module, name) in self.AUTORISES:
            mod = module.replace("numpy.core", "numpy._core")
            import importlib

            return getattr(importlib.import_module(mod), name)
        raise pickle.UnpicklingError(f"classe refusée : {module}.{name}")


def lire_pickle_numpy(chemin: Path):
    with open(chemin, "rb") as f:
        return _DepickleurNumpy(f, encoding="latin1").load()


ECHELLE_GRZEGO_VERS_XRAY = 87.6  # rapport des pas médians (mesuré : 15,94 / 0,182)


def _redresser(offs: np.ndarray) -> tuple[np.ndarray, float]:
    """Remet la ligne d'amorce à l'horizontale (pente de la ligne de base estimée sur le bas
    des tracés) : sinon le réseau recopie la pente et chaque mot penche."""
    P = np.cumsum(offs[:, :2].astype(np.float64), 0)
    x, y = P[:, 0], P[:, 1]
    bords = np.linspace(x.min(), x.max(), 9)
    xs, ys = [], []
    for a, b in zip(bords[:-1], bords[1:]):
        m = (x >= a) & (x < b)
        if m.sum() > 10:
            xs.append(x[m].mean())
            ys.append(np.percentile(y[m], 80))
    pente = np.polyfit(xs, ys, 1)[0] if len(xs) >= 3 else 0.0
    a = -np.arctan(pente)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    Q = P @ R.T
    out = offs.astype(np.float32).copy()
    out[:, :2] = np.diff(np.vstack([[0, 0], Q]), axis=0)
    return out, float(np.degrees(np.arctan(pente)))


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    ep = VENDOR / "xray" / "checkpoints" / "Epoch_52"
    poids = lire_torch(ep / "model.pt")
    meta = json.loads((ep / "meta.json").read_text())
    np.savez(
        SORTIE / "xray_epoch_52.npz",
        **poids,
        __mu=np.array(meta["mu"], np.float32),
        __std=np.array(meta["std"], np.float32),
        __charset=np.array(meta["charset"]),
    )
    print("écrit", SORTIE / "xray_epoch_52.npz", len(poids), "tenseurs")

    grz = VENDOR / "grzego" / "data"
    trad = lire_pickle_numpy(grz / "translation.pkl")
    inv = {int(v): k for k, v in trad.items()}
    styles = lire_pickle_numpy(grz / "styles.pkl")
    sortie = {}
    for i, (c, t) in enumerate(zip(styles[0], styles[1])):
        offs = np.asarray(c, np.float32).copy()
        offs[:, :2] *= ECHELLE_GRZEGO_VERS_XRAY
        offs, pente = _redresser(offs)
        texte = "".join(inv.get(int(k), "") for k in t)
        sortie[f"amorce{i}_offsets"] = offs
        sortie[f"amorce{i}_texte"] = np.array(texte)
        print(f"amorce {i} : {texte!r} ({len(offs)} points, pente corrigée {pente:+.1f}°)")
    np.savez(SORTIE / "amorces.npz", **sortie)
    print("écrit", SORTIE / "amorces.npz")


if __name__ == "__main__":
    sys.exit(main())
