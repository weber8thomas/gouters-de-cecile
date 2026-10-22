#!/usr/bin/env python3
"""Photo cinématique : parallaxe 2,5D par calques rigides, à partir d'une vraie photo.

Principe : les personnes sont découpées (segmentation locale + détection de
visages) et chaque groupe de personnes devient un calque RIGIDE : il ne subit
qu'une translation d'ensemble, jamais de déformation interne, donc aucun visage
ni corps ne peut se tordre. Seul le décor suit la carte de profondeur (Depth
Anything V2). Les zones découvertes derrière les personnes sont comblées par
inpainting OpenCV. Aucun pixel n'est inventé par une IA générative.

Tout reste sur la machine : seuls les poids des modèles sont téléchargés.

Usage (depuis la racine du dépôt) :
  tools/parallaxe/.venv/bin/python scripts/parallaxe.py PHOTO [--planche]
  tools/parallaxe/.venv/bin/python scripts/parallaxe.py --dossier DOSSIER
Sortie : prive/baked/parallaxe/<nom>.mp4 (jamais ailleurs que sous prive/).
"""
import argparse
import json
import math
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

RACINE = Path(__file__).resolve().parent.parent
PRIVE = RACINE / "prive"
SORTIE = PRIVE / "baked" / "parallaxe"
APERCUS = PRIVE / "baked" / "apercus"
FFMPEG = "/opt/homebrew/bin/ffmpeg"
YUNET = RACINE / "tools" / "parallaxe" / "modeles" / "face_detection_yunet_2023mar.onnx"
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SEGMENTATION = "mattmdjaga/segformer_b2_clothes"  # segmentation de personnes (classe 0 = fond)
MODELES_PROFONDEUR = {
    "small": "depth-anything/Depth-Anything-V2-Small-hf",
    "base": "depth-anything/Depth-Anything-V2-Base-hf",
}
MOUVEMENTS = ("horizontal", "vertical", "zoom", "ellipse")
EXTENSIONS = {".jpg", ".jpeg", ".png"}


# ---------------------------------------------------------------- modèles

class Modeles:
    """Charge une seule fois la profondeur, la segmentation et les visages."""

    def __init__(self, profondeur="base"):
        from transformers import SegformerForSemanticSegmentation, pipeline

        self.appareil = "mps" if torch.backends.mps.is_available() else "cpu"
        self.profondeur = pipeline("depth-estimation", model=MODELES_PROFONDEUR[profondeur],
                                   device=self.appareil)
        self.seg = SegformerForSemanticSegmentation.from_pretrained(SEGMENTATION)
        self.seg = self.seg.to(self.appareil).eval()
        if not YUNET.exists():
            YUNET.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["curl", "-sL", "-o", str(YUNET), YUNET_URL], check=True)
        self.visages = cv2.FaceDetectorYN.create(str(YUNET), "", (320, 320), 0.6, 0.3, 5000)

    def carte_profondeur(self, img):
        """Profondeur relative en [0, 1] (1 = proche), à la taille de l'image."""
        brut = self.profondeur(img)["predicted_depth"]
        d = brut.squeeze().float().cpu().numpy()
        d = cv2.resize(d, img.size, interpolation=cv2.INTER_CUBIC)
        lo, hi = np.percentile(d, [2, 98])
        return np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1).astype(np.float32)

    def proba_personne(self, img):
        """Probabilité « personne » par pixel (tout sauf le fond du modèle)."""
        w, h = img.size
        ech = 768 / max(w, h)
        w2, h2 = max(32, round(w * ech / 32) * 32), max(32, round(h * ech / 32) * 32)
        x = np.asarray(img.resize((w2, h2), Image.BICUBIC), np.float32) / 255
        x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        t = torch.from_numpy(x.astype(np.float32)).permute(2, 0, 1)[None].to(self.appareil)
        with torch.no_grad():
            lg = self.seg(pixel_values=t).logits
        lg = F.interpolate(lg.float().cpu(), size=(h, w), mode="bilinear", align_corners=False)
        return (1 - torch.softmax(lg, 1)[0, 0]).numpy().astype(np.float32)

    def boites_visages(self, img):
        """Boîtes (x, y, l, h) des visages, détecteur YuNet."""
        w, h = img.size
        bgr = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
        self.visages.setInputSize((w, h))
        _, f = self.visages.detect(bgr)
        return [] if f is None else [tuple(map(float, r[:4])) for r in f]


# ---------------------------------------------------------------- préparation

def charger_photo(chemin, grand_cote):
    """Photo ouverte (orientation EXIF respectée), réduite au grand côté voulu,
    dimensions paires pour yuv420p."""
    img = ImageOps.exif_transpose(Image.open(chemin)).convert("RGB")
    w, h = img.size
    ech = grand_cote / max(w, h)
    w2, h2 = (max(2, int(round(w * ech / 2)) * 2), max(2, int(round(h * ech / 2)) * 2))
    return img.resize((w2, h2), Image.LANCZOS)


def filtre_guide(guide, src, rayon, eps):
    """Filtre guidé (He et al.) : lisse en respectant les contours de la photo."""
    g = guide.astype(np.float32)
    k = (2 * rayon + 1, 2 * rayon + 1)
    moy = lambda x: cv2.boxFilter(x, -1, k)
    mg, ms = moy(g), moy(src)
    a = (moy(g * src) - mg * ms) / (moy(g * g) - mg * mg + eps)
    b = ms - a * mg
    return moy(a) * g + moy(b)


def combler(img_u8, trou, rayon=5):
    """Inpainting Telea du trou, calculé à demi-résolution (le comblement ne se
    voit que sur une fine bande de quelques pixels, un calcul léger suffit)."""
    h, w = trou.shape
    pet = cv2.resize(img_u8, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    mpet = cv2.resize(trou.astype(np.uint8) * 255, (w // 2, h // 2), interpolation=cv2.INTER_NEAREST)
    rempli = cv2.inpaint(pet, mpet, rayon, cv2.INPAINT_TELEA)
    return cv2.resize(rempli, (w, h), interpolation=cv2.INTER_CUBIC)


def ellipse_visage(forme, boite, marge=1.0):
    """Ellipse un peu plus large que le visage (cheveux, menton, oreilles)."""
    x, y, bw, bh = boite
    m = np.zeros(forme, np.uint8)
    cv2.ellipse(m, (int(x + bw / 2), int(y + bh / 2)),
                (max(1, int(bw * 0.62 * marge)), max(1, int(bh * 0.7 * marge))), 0, 0, 360, 255, -1)
    return m.astype(np.float32) / 255


def elargir(a):
    """Élargit un peu le calque (2 px, bord doux) : les mèches de cheveux et le
    liseré du contour partent avec la personne au lieu de rester sur le décor."""
    coeur = cv2.dilate((a > 0.5).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    return np.maximum(a, cv2.GaussianBlur(coeur.astype(np.float32), (0, 0), 1.0))


def analyser(img, modeles, args):
    """Calcule le décor (image + profondeur comblées) et les calques rigides."""
    w, h = img.size
    src = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
    gris = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    t0 = time.time()

    # profondeur lissée sur les contours de la photo
    prof = modeles.carte_profondeur(img)
    r = max(4, int(max(w, h) * args.lissage))
    prof = filtre_guide(gris, prof, r, 1e-3)
    prof = np.clip(cv2.GaussianBlur(prof, (0, 0), r * 0.5), 0, 1)
    t_prof = time.time() - t0

    # personnes : segmentation affinée par filtre guidé, plus visages détectés
    t0 = time.time()
    p = modeles.proba_personne(img)
    p = np.clip(filtre_guide(gris, p, max(3, int(w * 0.006)), 1e-3), 0, 1)
    alpha = np.clip((p - 0.35) / 0.3, 0, 1)
    visages = modeles.boites_visages(img)
    for b in visages:  # sécurité : tout visage est dans un calque
        alpha = np.maximum(alpha, ellipse_visage((h, w), b))
    t_seg = time.time() - t0

    # regroupement en calques : une composante connexe = un bloc rigide
    k = max(3, int(w * 0.012)) | 1
    solide = cv2.morphologyEx((alpha > 0.5).astype(np.uint8), cv2.MORPH_CLOSE,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    n, lab = cv2.connectedComponents(cv2.dilate(solide, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))))
    centres_visages = [(int(x + bw / 2), int(y + bh / 2)) for x, y, bw, bh in visages]
    calques = []
    for i in range(1, n):
        zone = (lab == i) & (alpha > 0.02)
        aire = float((zone & (alpha > 0.5)).sum())
        a_visage = any(lab[min(cy, h - 1), min(cx, w - 1)] == i for cx, cy in centres_visages)
        if aire < 0.002 * w * h and not a_visage:
            continue
        a_i = elargir(np.where(zone, alpha, 0).astype(np.float32))
        dur = a_i > 0.5
        cible = cv2.erode(dur.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        calques.append({
            "alpha": a_i, "prof": float(np.median(prof[cible if cible.any() else dur])),
            "centre": tuple(np.argwhere(dur).mean(0)[::-1]),  # (x, y)
            "aire": aire, "visage": a_visage,
        })
    calques.sort(key=lambda c: c["prof"])  # du plus loin au plus proche

    # décor : photo sans les personnes (inpainting) et profondeur comblée
    union = np.zeros((h, w), np.float32)
    for c in calques:
        union = np.maximum(union, c["alpha"])
    trou = cv2.dilate((union > 0.02).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    fond = src
    prof_fond = prof
    if trou.any():
        remplissage = combler(src, trou)
        doux = cv2.GaussianBlur(trou.astype(np.float32), (0, 0), 1.2)[..., None]
        fond = (src * (1 - doux) + remplissage * doux).astype(np.uint8)
        trou_p = cv2.dilate(trou.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        p16 = (prof * 65535).astype(np.uint16)
        prof_fond = (combler(p16, trou_p).astype(np.float32) / 65535)
        prof_fond = np.where(trou_p, cv2.GaussianBlur(prof_fond, (0, 0), 3), prof)

    # échelle des déplacements : le décor médian reste immobile, les personnes
    # (plus proches) bougent le plus ; sans personne, la profondeur médiane
    hors = union < 0.02
    foyer = float(np.median(prof[hors])) if hors.mean() > 0.2 and union.max() > 0 else float(np.median(prof))
    echelle = max(float(np.percentile(np.abs(prof - foyer), 95)), 0.25)
    rel = lambda d: np.clip((d - foyer) / echelle, -1, 1)
    for c in calques:
        c["rel"] = float(rel(c["prof"]))
    rel_fond = rel(prof_fond)
    if calques:
        # le décor voisin d'une personne suit son mouvement, puis s'en détache
        # progressivement : on étire un peu le décor plutôt que de découvrir
        # une bande comblée, bien plus visible
        R = np.zeros((h, w), np.float32)
        for c in calques:
            R = np.where(c["alpha"] > 0.5, c["rel"], R)
        dur = (union > 0.5).astype(np.float32)
        sg = max(2.0, w * args.raccord)
        den = cv2.GaussianBlur(dur, (0, 0), sg)
        Rn = cv2.GaussianBlur(R * dur, (0, 0), sg) / np.maximum(den, 1e-3)
        wb = np.clip(den * 2, 0, 1)
        rel_fond = rel_fond * (1 - wb) + Rn * wb

    # occulteurs : objets (non personnes) plus proches que le calque, dessinés par-dessus
    pers = cv2.dilate((union > 0.1).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    for c in calques:
        proche = (~pers) & (prof > c["prof"] + 0.15)
        bb = cv2.boundingRect((c["alpha"] > 0.1).astype(np.uint8))
        zone = np.zeros_like(proche)
        mx, my = int(bb[2] * 0.15), int(bb[3] * 0.15)
        zone[max(0, bb[1] - my):bb[1] + bb[3] + my, max(0, bb[0] - mx):bb[0] + bb[2] + mx] = True
        o = cv2.morphologyEx((proche & zone).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        c["occulteur"] = cv2.GaussianBlur(o.astype(np.float32), (0, 0), 1.2) if o.any() else None

    return {"src": src, "fond": fond, "rel_fond": rel_fond, "calques": calques,
            "visages": visages, "rel_img": rel(prof), "prof": prof,
            "t_prof": t_prof, "t_seg": t_seg}


# ---------------------------------------------------------------- rendu

def parametres_image(args, i, n):
    """Position de la caméra (cx, cy), avancée (dolly) et zoom à l'image i.
    Un tour complet de phase = une boucle : première et dernière image se suivent."""
    phase = 2 * math.pi * i / n
    s, c = math.sin(phase), math.cos(phase)
    if args.mouvement == "horizontal":
        cx, cy, dolly = s, 0.0, 0.0
    elif args.mouvement == "vertical":
        cx, cy, dolly = 0.0, s, 0.0
    elif args.mouvement == "zoom":
        cx, cy, dolly = 0.0, 0.0, 0.5 - 0.5 * c
    else:  # ellipse
        cx, cy, dolly = s, 0.5 * c, 0.0
    z = 1 + args.zoom * (0.8 + 0.2 * (0.5 - 0.5 * c))
    return cx, cy, dolly, z


def rendre(args, an, ecrire):
    src, fond = an["src"], an["fond"]
    h, w = src.shape[:2]
    n = int(round(args.duree * args.fps))
    ax = args.amplitude * w  # déplacement maximal en pixels
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    nx, ny = (xs - w / 2) / (w / 2), (ys - h / 2) / (h / 2)
    rel_fond = an["rel_fond"]
    for i in range(n):
        cx, cy, dolly, z = parametres_image(args, i, n)

        def decalage(r, px, py):
            """Déplacement (en pixels) d'un point de profondeur relative r."""
            return (r * ax * (cx + 0.8 * dolly * px), r * ax * (cy + 0.8 * dolly * py))

        # décor : carte inverse, avec une 2e passe pour que le décalage suive les objets
        dx, dy = decalage(rel_fond, nx, ny)
        mx = (xs - w / 2) / z + w / 2 - dx
        my = (ys - h / 2) / z + h / 2 - dy
        if args.passes > 1:
            r2 = cv2.remap(rel_fond, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            dx, dy = decalage(r2, nx, ny)
            mx = (xs - w / 2) / z + w / 2 - dx
            my = (ys - h / 2) / z + h / 2 - dy
        decor = cv2.remap(fond, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        sortie = decor.astype(np.float32)

        # calques rigides, du plus loin au plus proche : translation pure + zoom global
        for c in an["calques"]:
            px, py = (c["centre"][0] - w / 2) / (w / 2), (c["centre"][1] - h / 2) / (h / 2)
            sx, sy = decalage(c["rel"], px, py)
            M = np.float32([[z, 0, w / 2 * (1 - z) + z * sx], [0, z, h / 2 * (1 - z) + z * sy]])
            rgb = cv2.warpAffine(src, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            a = cv2.warpAffine(c["alpha"], M, (w, h), flags=cv2.INTER_LINEAR)[..., None]
            sortie = sortie * (1 - a) + rgb.astype(np.float32) * a
            if c["occulteur"] is not None:  # objet plus proche : repasse devant la personne
                o = cv2.remap(c["occulteur"], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)[..., None]
                sortie = sortie * (1 - o) + decor.astype(np.float32) * o
        ecrire(np.clip(sortie, 0, 255).astype(np.uint8))


# ---------------------------------------------------------------- contrôle

def ssim(a, b):
    a, b = a.astype(np.float32), b.astype(np.float32)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    f = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5)
    ma, mb = f(a), f(b)
    va, vb, cab = f(a * a) - ma * ma, f(b * b) - mb * mb, f(a * b) - ma * mb
    return float((((2 * ma * mb + c1) * (2 * cab + c2)) / ((ma ** 2 + mb ** 2 + c1) * (va + vb + c2))).mean())


def lire_images(mp4, instants):
    cap = cv2.VideoCapture(str(mp4))
    fps = cap.get(cv2.CAP_PROP_FPS)
    ims = []
    for t in instants:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps)))
        ok, im = cap.read()
        ims.append(im if ok else None)
    cap.release()
    return ims


def controle_visages(mp4, modeles, zoom=0.03, extremes=(1, 3)):
    """Pour chaque visage : SSIM entre t=0 et l'extrême du mouvement, après
    recalage par simple translation (et compensation du zoom global connu).
    Un visage rigide donne un SSIM proche de 1 (reste : bruit de compression)."""
    im0, *exts = lire_images(mp4, (0, *extremes))
    h, w = im0.shape[:2]
    pil0 = Image.fromarray(cv2.cvtColor(im0, cv2.COLOR_BGR2RGB))
    boites = sorted(modeles.boites_visages(pil0), key=lambda b: -b[2] * b[3])[:4]
    z0 = 1 + zoom * 0.8
    res = []
    g0 = cv2.cvtColor(im0, cv2.COLOR_BGR2GRAY)
    for (x, y, bw, bh) in boites:
        x0, y0, x1, y1 = int(max(0, x)), int(max(0, y)), int(min(w, x + bw)), int(min(h, y + bh))
        pas = []
        for t, im in zip(extremes, exts):
            zt = 1 + zoom * (0.8 + 0.2 * (0.5 - 0.5 * math.cos(2 * math.pi * t / 4)))
            r = z0 / zt
            M = np.float32([[r, 0, w / 2 * (1 - r)], [0, r, h / 2 * (1 - r)]])
            g = cv2.warpAffine(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), M, (w, h), flags=cv2.INTER_CUBIC)
            marge = int(bw * 0.4)
            a0, a1, b0, b1 = max(0, y0 - marge), min(h, y1 + marge), max(0, x0 - marge), min(w, x1 + marge)
            win = cv2.createHanningWindow((b1 - b0, a1 - a0), cv2.CV_32F)
            (dx, dy), _ = cv2.phaseCorrelate(g0[a0:a1, b0:b1].astype(np.float32),
                                             g[a0:a1, b0:b1].astype(np.float32), win)
            T = np.float32([[1, 0, -dx], [0, 1, -dy]])
            ga = cv2.warpAffine(g, T, (w, h), flags=cv2.INTER_CUBIC)
            pas.append({"t": t, "decalage_px": round(math.hypot(dx, dy), 2),
                        "ssim": round(ssim(g0[y0:y1, x0:x1], ga[y0:y1, x0:x1]), 4)})
        res.append({"visage": [x0, y0, x1 - x0, y1 - y0], "mesures": pas})
    return res


def planche(mp4, an, destination, modeles, instants=(0, 1, 2, 3)):
    """Planche : images aux instants donnés + calques, puis visages agrandis à t=0
    et aux extrêmes (1 s et 3 s) côte à côte."""
    ims = lire_images(mp4, instants)
    h, w = ims[0].shape[:2]
    for t, im in zip(instants, ims):
        cv2.putText(im, f"{t} s", (12, 36), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 3)
    # panneau des calques : profondeur du décor, personnes (vert), visages (rouge)
    carte = cv2.applyColorMap((np.clip(an["rel_img"] * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8),
                              cv2.COLORMAP_INFERNO)
    carte = cv2.resize(carte, (w, h))
    for c in an["calques"]:
        a = cv2.resize(c["alpha"], (w, h))[..., None] * 0.45
        carte = (carte * (1 - a) + np.float32([0, 255, 0]) * a).astype(np.uint8)
    ech = w / an["src"].shape[1]
    for (x, y, bw, bh) in an["visages"]:
        cv2.rectangle(carte, (int(x * ech), int(y * ech)), (int((x + bw) * ech), int((y + bh) * ech)), (0, 0, 255), 2)
    ligne1 = np.hstack([i for i in ims if i is not None] + [carte])
    # visages agrandis : t=0 | 1 s | 3 s, pour chaque visage détecté sur l'image 0
    pil0 = Image.fromarray(cv2.cvtColor(ims[0], cv2.COLOR_BGR2RGB))
    boites = sorted(modeles.boites_visages(pil0), key=lambda b: -b[2] * b[3])[:4]
    H = 340
    cases = []
    for (x, y, bw, bh) in boites:
        m = int(bw * 0.5)
        a0, a1, b0, b1 = max(0, int(y) - m), min(h, int(y + bh) + m), max(0, int(x) - m), min(w, int(x + bw) + m)
        trio = [cv2.resize(ims[k][a0:a1, b0:b1], (int((b1 - b0) * H / (a1 - a0)), H),
                           interpolation=cv2.INTER_CUBIC) for k in (0, 1, 3)]
        cases.append(np.hstack([t_ for pair in zip(trio, [np.full((H, 4, 3), 255, np.uint8)] * 3)
                                for t_ in pair]))
        cases.append(np.full((H, 18, 3), 40, np.uint8))
    ligne2 = np.full((H, ligne1.shape[1], 3), 40, np.uint8)
    if cases:
        bande = np.hstack(cases)[:, :ligne1.shape[1]]
        ligne2[:, :bande.shape[1]] = bande
    destination.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(destination), np.vstack([ligne1, ligne2]))


# ---------------------------------------------------------------- programme

def verifier_sous_prive(chemin):
    try:
        chemin.resolve().relative_to(PRIVE.resolve())
    except ValueError:
        sys.exit(f"la sortie doit rester sous prive/ : {chemin}")


def traiter(photo, args, modeles):
    photo = Path(photo)
    nom = photo.stem + (f"-{args.suffixe}" if args.suffixe else "")
    sortie = Path(args.sortie) if args.sortie else SORTIE / f"{nom}.mp4"
    verifier_sous_prive(sortie)
    sortie.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    img = charger_photo(photo, args.grand_cote)
    an = analyser(img, modeles, args)
    w, h = img.size
    ff = subprocess.Popen(
        [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{w}x{h}", "-r", str(args.fps), "-i", "-",
         "-c:v", "libx264", "-crf", str(args.crf), "-preset", "slow", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(sortie)],
        stdin=subprocess.PIPE)
    rendre(args, an, lambda im: ff.stdin.write(np.ascontiguousarray(im).tobytes()))
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg a échoué")
    total = time.time() - t0
    resume = {"fichier": sortie.name, "taille": f"{w}x{h}", "octets": sortie.stat().st_size,
              "calques": len(an["calques"]), "visages": len(an["visages"]),
              "profondeur_s": round(an["t_prof"], 1), "segmentation_s": round(an["t_seg"], 1),
              "total_s": round(total, 1)}
    if args.planche:
        planche(sortie, an, APERCUS / f"parallaxe-{nom}.png", modeles)
    if args.controle:
        resume["controle_visages"] = controle_visages(sortie, modeles, args.zoom)
    print(json.dumps(resume, ensure_ascii=False))
    return resume


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photo", nargs="?")
    ap.add_argument("--dossier", help="traite toutes les photos du dossier (modèles chargés une seule fois)")
    ap.add_argument("--refaire", action="store_true", help="en mode dossier, refait les MP4 déjà présents")
    ap.add_argument("--sortie", help="MP4 de sortie (défaut : prive/baked/parallaxe/<nom>[-suffixe].mp4)")
    ap.add_argument("--suffixe", default="", help="ajouté au nom du fichier de sortie")
    ap.add_argument("--mouvement", choices=MOUVEMENTS, default="ellipse")
    ap.add_argument("--amplitude", type=float, default=0.016, help="déplacement max, fraction de la largeur")
    ap.add_argument("--zoom", type=float, default=0.03, help="zoom fixe, fraction (0.03 = 3 %%)")
    ap.add_argument("--duree", type=float, default=4.0)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--grand-cote", type=int, default=720)
    ap.add_argument("--crf", type=int, default=24)
    ap.add_argument("--modele", choices=list(MODELES_PROFONDEUR), default="base")
    ap.add_argument("--lissage", type=float, default=0.008, help="rayon du filtre guidé, fraction du grand côté")
    ap.add_argument("--raccord", type=float, default=0.02,
                    help="largeur (fraction de la largeur) où le décor suit la personne voisine ; 0 = aucune")
    ap.add_argument("--passes", type=int, default=2, choices=(1, 2))
    ap.add_argument("--planche", action="store_true",
                    help="écrit une planche de contrôle dans prive/baked/apercus/parallaxe-<nom>.png")
    ap.add_argument("--controle", action="store_true", help="mesure la rigidité des visages (SSIM recalé)")
    args = ap.parse_args()
    if bool(args.photo) == bool(args.dossier):
        ap.error("donner une photo OU --dossier")

    modeles = Modeles(args.modele)
    if args.dossier:
        dossier = Path(args.dossier)
        photos = sorted(p for p in dossier.iterdir() if p.suffix.lower() in EXTENSIONS)
        for i, p in enumerate(photos, 1):
            cible = SORTIE / f"{p.stem}{'-' + args.suffixe if args.suffixe else ''}.mp4"
            if cible.exists() and not args.refaire:
                print(f"[{i}/{len(photos)}] {p.name} : déjà fait")
                continue
            print(f"[{i}/{len(photos)}] {p.name}", flush=True)
            try:
                traiter(p, args, modeles)
            except Exception as e:  # une photo ratée ne bloque pas les suivantes
                print(f"  échec : {e}", file=sys.stderr)
    else:
        traiter(args.photo, args, modeles)


if __name__ == "__main__":
    main()
