"""Éclairage tracé du carnet (retour « l'ombrage et l'éclairage du livre, couverture et pages, ne sont pas
fidèles : je veux quelque chose du type ray tracing, où l'on voit la lumière de la bougie et du reste se
refléter fidèlement »).

La table, le livre (fermé ou ouvert, pour chaque cran de distance) et les trois lumières de la scène sont
modélisés dans Blender et rendus par Cycles (lancer de rayons : ombres douces, lumière renvoyée par la
table, pli des pages, épaisseur des cartons) :

  - la bougie posée dans le coin bas gauche (la même que scripts/bake-bougie.py : pied, taille) ;
  - la cheminée hors champ à gauche (la même que scripts/bougie3d/scene.py) ;
  - la pénombre bleutée de la pièce (le ciel du monde).

Chaque lumière est un groupe de lumières à part, débruité, puis divisé par la couleur propre des surfaces
(passe DiffCol) : il reste, par px de scène, la lumière seule qu'elle apporte. scripts/lumiere3d/composer.py
en tire les calques posés au-dessus du livre.

Caméra orthographique droit au-dessus de la table : un px de rendu = un px de scène, sans fuite, pour que le
livre rendu tombe exactement sur le livre dessiné (géométrie de src/styles/tokens.css et de
src/lib/geometrie.ts ; mesurée par verification/out/lumiere/geo.mjs).

  <bpy>/python scripts/lumiere3d/scene.py <sortie> [--echantillons N] [--seulement vide,loin-ouvert,…]

Sortie : <sortie>/<etat>/{bougie,feu,ambiance,albedo}.npy (float16, lignes de haut en bas, 1 px pour 2 px de
scène, MARGE px de scène de table autour de l'écran).
"""
from __future__ import annotations

import glob
import math
import os
import sys

import bpy
import mathutils
import numpy as np

PXCM = 39.0                 # px de scène par cm de table (comme scripts/bougie3d/scene.py)
SCENE_W, SCENE_H = 1920, 1080
MARGE = 400                 # px de scène rendus autour de l'écran (débord de la table : téléphone, tablette)
RW, RH = SCENE_W + 2 * MARGE, SCENE_H + 2 * MARGE

# Le livre à chaque cran de distance (px de scène, tokens.css) : coin haut gauche du bloc de pages gauche
# ouvert, largeur et hauteur d'une page. Le pli est à x = 960.
LIVRES = {
    'proche': (252, 40, 708, 1000),
    'moyenne': (280, 60, 680, 960),
    'loin': (331, 96, 629, 888),
}
OUT, HAUT, BAS = 28, 12, 26          # débord des cartons (geometrie.ts CARTON)
EP = 0.26                            # épaisseur d'un carton (cm, 10 px)
BLOC_OUVERT = 0.42                   # épaisseur d'un demi-bloc de pages, livre ouvert (cm)
BLOC_FERME = 0.85                    # bloc de pages, livre fermé (cm)

# La bougie de bake-bougie.py : pied (196, 846) décalé de (-88, -20), taille 0,6 ; milieu de la flamme à
# 6,57 cm de la table pour la bougie entière (scripts/bougie3d/scene.py FLAMME_Z).
BOUGIE_PIED = (108.0, 826.0)
BOUGIE_Z = 6.57 * 0.6

# Albédos (linéaires) : les couleurs moyennes de ce que le site dessine à ces endroits.
PAPIER = (0.822, 0.701, 0.477)       # design-system/baked/pages/1x/papier/*.webp
TOILE = (0.181, 0.267, 0.170)        # design-system/baked/couverture/a/plat.webp, et le repli des cartons
TRANCHE = (0.647, 0.527, 0.313)      # design-system/baked/couverture/a/tranche.webp
BOIS = (0.139, 0.042, 0.010)         # design-system/textures/wood.webp

ETATS = ['vide'] + [f'{c}-{e}' for c in LIVRES for e in ('couverture', 'ouvert', 'arriere')]


def sx(px: float) -> float:
    return (px - SCENE_W / 2) / PXCM


def sy(py: float) -> float:
    return -(py - SCENE_H / 2) / PXCM


def materiau(nom: str, couleur, rugosite: float, speculaire: float = 0.5, lustre: float = 0.0):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*couleur, 1)
    b.inputs['Roughness'].default_value = rugosite
    b.inputs['Specular IOR Level'].default_value = speculaire
    if lustre:
        b.inputs['Sheen Weight'].default_value = lustre
        b.inputs['Sheen Roughness'].default_value = 0.4
    return m


def boite(nom: str, x0, y0, x1, y1, z0, z1, mat, biseau: float = 0.0):
    """Boîte entre deux coins en px de scène (x0 < x1, y0 < y1 : y vers le bas) et deux hauteurs en cm."""
    me = bpy.data.meshes.new(nom)
    X0, X1, Y0, Y1 = sx(x0), sx(x1), sy(y1), sy(y0)
    v = [(X0, Y0, z0), (X1, Y0, z0), (X1, Y1, z0), (X0, Y1, z0), (X0, Y0, z1), (X1, Y0, z1), (X1, Y1, z1), (X0, Y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(v, [], f)
    o = bpy.data.objects.new(nom, me)
    o.data.materials.append(mat)
    bpy.context.collection.objects.link(o)
    if biseau:
        mod = o.modifiers.new('biseau', 'BEVEL')
        mod.width = biseau
        mod.segments = 4
        mod.limit_method = 'NONE'
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    return o


def profil(u: float) -> float:
    """Hauteur relative du dessus d'un demi-bloc de pages à la distance u (0 au pli, 1 à la tranche) :
    les feuilles plongent dans la reliure, se relèvent vite, puis s'abaissent un peu vers la tranche."""
    return 0.18 + 0.82 * (1 - math.exp(-u / 0.05)) - 0.1 * u + 0.05 * math.sin(math.pi * min(u, 1))


def demi_bloc(nom: str, cote: int, x_pli: float, y0: float, W: float, H: float, mats):
    """Un demi-bloc de pages ouvert (cote -1 : gauche, +1 : droite) : dessus courbe lisse (papier), flancs
    plats (tranche). Plus de colonnes près du pli, où la page plonge."""
    papier, tranche = mats
    n = 140
    us = [(i / n) ** 1.8 for i in range(n + 1)]
    xs = [x_pli + cote * u * W for u in us]
    zs = [EP + BLOC_OUVERT * profil(u) for u in us]
    Yh, Yb = sy(y0), sy(y0 + H)
    # dessus
    me = bpy.data.meshes.new(nom)
    v = [(sx(x), Yh, z) for x, z in zip(xs, zs)] + [(sx(x), Yb, z) for x, z in zip(xs, zs)]
    f = []
    for i in range(n):
        a, b, c, d = i, i + 1, n + 1 + i + 1, n + 1 + i
        f.append((a, d, c, b) if cote > 0 else (a, b, c, d))
    me.from_pydata(v, [], f)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    o = bpy.data.objects.new(nom, me)
    o.data.materials.append(papier)
    bpy.context.collection.objects.link(o)
    # flancs : tête, pied (polygones du profil) et tranche
    me2 = bpy.data.meshes.new(nom + '-flancs')
    v2, f2 = [], []
    for Y in (Yh, Yb):
        base = len(v2)
        v2 += [(sx(x), Y, z) for x, z in zip(xs, zs)] + [(sx(xs[-1]), Y, EP), (sx(xs[0]), Y, EP)]
        f2.append(tuple(range(base, len(v2))))
    base = len(v2)
    X = sx(xs[-1])
    v2 += [(X, Yh, EP), (X, Yb, EP), (X, Yb, zs[-1]), (X, Yh, zs[-1])]
    f2.append((base, base + 1, base + 2, base + 3))
    me2.from_pydata(v2, [], f2)
    me2.validate()
    o2 = bpy.data.objects.new(nom + '-flancs', me2)
    o2.data.materials.append(tranche)
    bpy.context.collection.objects.link(o2)
    return [o, o2]


def livre(cran: str, etat: str, mats) -> list:
    """Le livre d'un cran : ouvert (deux cartons à plat, deux demi-blocs de pages qui plongent au pli) ou
    fermé (« couverture », « arriere » : centré comme à l'écran, les cartons de x = 960 − W/2 à
    960 + W/2 + débord, ou leur miroir)."""
    papier, toile, tranche = mats
    bx, by, W, H = LIVRES[cran]
    y0, y1 = by - HAUT, by + H + BAS
    objs = []
    if etat == 'ouvert':
        objs.append(boite('carton-g', bx - OUT, y0, 960, y1, 0, EP, toile, biseau=0.05))
        objs.append(boite('carton-d', 960, y0, 960 + W + OUT, y1, 0, EP, toile, biseau=0.05))
        objs += demi_bloc('pages-g', -1, 960, by, W, H, (papier, tranche))
        objs += demi_bloc('pages-d', +1, 960, by, W, H, (papier, tranche))
    else:
        # fermé sur le plat avant : le dos à gauche ; refermé sur le plat arrière : le dos à droite
        x0, x1 = (960 - W / 2, 960 + W / 2 + OUT) if etat == 'couverture' else (960 - W / 2 - OUT, 960 + W / 2)
        objs.append(boite('ferme', x0, y0, x1, y1, 0, 2 * EP + BLOC_FERME, toile, biseau=0.32))
    return objs


def lumieres():
    """Les trois lumières, chacune dans son groupe (passes séparées)."""
    vl = bpy.context.view_layer
    for g in ('bougie', 'feu', 'ambiance'):
        vl.lightgroups.add(name=g)
    b = bpy.data.lights.new('bougie', 'POINT')
    b.energy = 40.0
    b.shadow_soft_size = 0.45          # la flamme fait ~1 cm : ombres douces de près, nettes de loin
    b.color = (1.0, 0.62, 0.30)
    ob = bpy.data.objects.new('bougie', b)
    ob.location = (sx(BOUGIE_PIED[0]), sy(BOUGIE_PIED[1]), BOUGIE_Z)
    ob.lightgroup = 'bougie'
    bpy.context.collection.objects.link(ob)
    ch = bpy.data.lights.new('cheminee', 'AREA')     # comme scripts/bougie3d/scene.py
    ch.shape = 'DISK'
    ch.size = 70.0
    ch.energy = 220000.0
    ch.color = (1.0, 0.5, 0.22)
    oc = bpy.data.objects.new('cheminee', ch)
    oc.location = (-150.0, 30.0, 110.0)
    oc.rotation_euler = (mathutils.Vector((0, 0, 0)) - oc.location).to_track_quat('-Z', 'Y').to_euler()
    oc.lightgroup = 'feu'
    bpy.context.collection.objects.link(oc)
    w = bpy.data.worlds.new('piece')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.42, 0.52, 0.85, 1)
    bg.inputs['Strength'].default_value = 0.05
    w.lightgroup = 'ambiance'
    bpy.context.scene.world = w


def reglages(echantillons: int, sortie: str):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = echantillons
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.use_denoising = False      # chaque groupe est débruité dans le compositeur
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 3
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 10.0
    # demi-définition (1 px de rendu = 2 px de scène) : la lumière est douce, les calques sont agrandis ×2
    sc.render.resolution_x, sc.render.resolution_y = RW, RH
    sc.render.resolution_percentage = 50
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.frame_set(1)
    cam = bpy.data.cameras.new('camera')
    cam.type = 'ORTHO'
    cam.ortho_scale = RW / PXCM
    cam.clip_end = 1000
    oc = bpy.data.objects.new('camera', cam)
    oc.location = (0, 0, 200)
    bpy.context.collection.objects.link(oc)
    sc.camera = oc
    vl = bpy.context.view_layer
    vl.use_pass_diffuse_color = True
    vl.cycles.denoising_store_passes = True
    # compositeur : chaque groupe débruité (albédo, normales) → un EXR ; l'albédo tel quel
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new('CompositorNodeRLayers')
    comp = nt.nodes.new('CompositorNodeComposite')
    nt.links.new(rl.outputs['Image'], comp.inputs['Image'])
    fo = nt.nodes.new('CompositorNodeOutputFile')
    fo.base_path = sortie
    fo.format.file_format = 'OPEN_EXR'
    fo.format.color_depth = '32'
    fo.file_slots.clear()
    for g in ('bougie', 'feu', 'ambiance'):
        nom = f'Combined_{g}'
        if nom not in rl.outputs:
            raise SystemExit(f'passe {nom} absente : {[s.name for s in rl.outputs]}')
        dn = nt.nodes.new('CompositorNodeDenoise')
        dn.prefilter = 'ACCURATE'
        dn.use_hdr = True
        nt.links.new(rl.outputs[nom], dn.inputs['Image'])
        nt.links.new(rl.outputs['Denoising Normal'], dn.inputs['Normal'])
        nt.links.new(rl.outputs['Denoising Albedo'], dn.inputs['Albedo'])
        fo.file_slots.new(g)
        nt.links.new(dn.outputs['Image'], fo.inputs[g])
    fo.file_slots.new('albedo')
    nt.links.new(rl.outputs['DiffCol'], fo.inputs['albedo'])


def lire_exr(chemin: str) -> np.ndarray:
    im = bpy.data.images.load(chemin, check_existing=False)
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(h, w, 4)[::-1, :, :3]


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    sortie = os.path.abspath(args[0])
    echantillons = int(args[args.index('--echantillons') + 1]) if '--echantillons' in args else 64
    etats = args[args.index('--seulement') + 1].split(',') if '--seulement' in args else ETATS
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tmp = os.path.join(sortie, '_exr')
    os.makedirs(tmp, exist_ok=True)
    lumieres()
    reglages(echantillons, tmp)
    mats = (materiau('papier', PAPIER, 0.62, 0.35), materiau('toile', TOILE, 0.7, 0.4, lustre=0.6),
            materiau('tranche', TRANCHE, 0.7, 0.3))
    # vieille table de cuisine : bois ciré usé, presque mat (un vernis renverrait toute la pièce)
    table = boite('table', -3000, -3000, 5000, 5000, -1, 0, materiau('bois', BOIS, 0.62, 0.2))
    for etat in etats:
        objs = [] if etat == 'vide' else livre(*etat.split('-'), mats)
        for f in glob.glob(os.path.join(tmp, '*.exr')):
            os.remove(f)
        bpy.ops.render.render(write_still=False)
        dossier = os.path.join(sortie, etat)
        os.makedirs(dossier, exist_ok=True)
        for g in ('bougie', 'feu', 'ambiance', 'albedo'):
            (f,) = glob.glob(os.path.join(tmp, f'{g}*.exr'))
            np.save(os.path.join(dossier, f'{g}.npy'), lire_exr(f).astype(np.float16))
        print(f'{etat} : rendu', flush=True)
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)
    del table


if __name__ == '__main__':
    main()
