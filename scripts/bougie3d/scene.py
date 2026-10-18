"""Bougie du carnet en 3D (v5, retour « la bougie doit être verticale, vue du haut, légèrement inclinée,
avec de la cire à ses pieds, et la cire qui coule ») : une bougie de cire crème à moitié consumée, posée
sur la table à gauche du livre, modélisée et rendue dans Blender (Cycles) avec la caméra de la scène.

La scène du carnet est une table vue d'en haut : une caméra au-dessus du livre, qui regarde droit vers le
bas. Une bougie posée dans le coin bas gauche est donc vue presque d'en haut : on voit le dessus (le puits
de cire liquide, la mèche), son flanc tourné vers le centre de l'image, un peu en fuite, et la flaque de
cire figée à son pied. Ce script construit cette bougie et rend, dans le repère de la scène 1920 × 1080 :

  - la bougie seule (flamme basse, flamme haute), avec son ombre portée par la cheminée (à gauche, hors
    champ) sur la table ;
  - le relevé des coulures où la cire liquide coule pendant l'animation (reperes.json, « coulures ») : le
    profil de leur crête le long du flanc, la lèvre de l'encoche d'où elles partent et la flaque où elles
    finissent. La goutte elle-même est rendue en temps réel (src/components/Bougie/cire.ts), posée sur
    ces coulures figées.

Retour v8 (« la cire qui coule pas encore réaliste ») :
  - le puits est une vraie nappe de cire liquide : transparente (réfraction seule, son reflet de la flamme
    est rendu en direct par la toile de la flamme), sur un fond de cire plus profond, mouillé, sans reflet ;
  - le bord est une paroi mince, encochée là où la cire a débordé : la flamme la traverse (diffusion sous
    la surface), elle luit ;
  - les coulures figées partent de ces encoches : un col étroit sur la lèvre, une langue qui s'élargit et
    s'épaissit en descendant, des bourrelets là où une coulée plus ancienne s'est arrêtée, une goutte
    bombée au bout ; plus lisses et plus brillantes que le flanc (cire satinée).

Lancement (Blender en module Python, hors dépôt) :

  uv venv -p 3.11 <dossier>/.venv && uv pip install -p <dossier>/.venv/bin/python "bpy==4.2.*"
  <dossier>/.venv/bin/python scripts/bougie3d/scene.py <sortie> [--apercu] [--seulement bougie,ombre,profil]

`--apercu` : maillage et échantillonnage grossiers (réglages) ; `profil` : une vue de trois quarts de la
bougie (vérification des coulures, hors cuisson).

Unités : 1 unité Blender = 1 cm. La table est le plan z = 0. Repère de la scène : x vers la droite, y vers
le bas, en px de scène ; PXCM px de scène par cm de table (le livre ouvert, 2 × 17 cm, fait ≈ 1325 px).
"""
from __future__ import annotations

import json
import math
import os
import random
import sys

import bpy
import mathutils
from mathutils.bvhtree import BVHTree

PXCM = 39.0                 # px de scène par cm de table
SCENE_W, SCENE_H = 1920, 1080
MARGE = 160                 # px de scène rendus autour de l'écran (débord de la table)
CUISSON = 1.25              # px cuits par px de scène
HCAM = 80.0                 # hauteur de la caméra au-dessus de la table (cm) : règle l'inclinaison

# La bougie : pied (centre de la base) en px de scène, rayon et hauteur en cm (à moitié consumée).
PIED = (196.0, 846.0)
RAYON = 2.3
HAUTEUR = 5.2
NIVEAU_PUITS = HAUTEUR - 0.38   # surface de la cire liquide, sous la crête du bord
PROFONDEUR = 0.55               # le fond du puits sous la surface liquide, au milieu
FLAMME_Z = NIVEAU_PUITS + 1.75  # milieu de la flamme
LEVRE = 0.07                    # la lèvre d'une encoche de débordement, au-dessus de la cire liquide
RAYON_LIQUIDE = 2.12            # la nappe liquide (son bord est noyé dans la paroi, sauf aux encoches)


PIED_MONDE = ((PIED[0] - SCENE_W / 2) / PXCM, -(PIED[1] - SCENE_H / 2) / PXCM)


def scene_vers_monde(px: float, py: float) -> mathutils.Vector:
    return mathutils.Vector(((px - SCENE_W / 2) / PXCM, -(py - SCENE_H / 2) / PXCM, 0.0))


def monde_vers_scene(p) -> tuple[float, float]:
    """Projection (caméra au-dessus du centre de la scène, regard vers le bas)."""
    k = HCAM / (HCAM - p[2])
    return (SCENE_W / 2 + p[0] * k * PXCM, SCENE_H / 2 - p[1] * k * PXCM)


def bruit(rng: random.Random, n: int = 5):
    """Une fonction périodique douce de l'angle (somme de sinus), pour les irrégularités."""
    termes = [(k, rng.uniform(0.3, 1.0) / k, rng.uniform(0, 2 * math.pi)) for k in range(1, n + 1)]
    norme = sum(a for _, a, _ in termes)
    return lambda phi: sum(a * math.sin(k * phi + p) for k, a, p in termes) / norme


def lisse(a: float, b: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def vider():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def materiau_cire(couleur=(0.93, 0.855, 0.7)):
    """La cire : crème, translucide (diffusion sous la surface, longue dans le rouge : elle luit où la
    flamme la traverse), satinée. Deux attributs du maillage (posés par attributs_cire) la nuancent :
    « coulure » (les coulures figées, plus lisses et plus brillantes que le flanc) et « fond » (le fond du
    puits, sous la cire liquide : mouillé, il ne renvoie aucun reflet et paraît plus profond, plus doré)."""
    m = bpy.data.materials.new('cire')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.subsurface_method = 'RANDOM_WALK'
    b.inputs['Subsurface Weight'].default_value = 1.0
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.55, 0.26)
    b.inputs['IOR'].default_value = 1.44
    tc = nt.nodes.new('ShaderNodeTexCoord')
    coul = nt.nodes.new('ShaderNodeAttribute')
    coul.attribute_name = 'coulure'
    fond = nt.nodes.new('ShaderNodeAttribute')
    fond.attribute_name = 'fond'

    def melange(a, bb, fac, nom='RGBA'):
        mx = nt.nodes.new('ShaderNodeMix')
        mx.data_type = nom
        if nom == 'RGBA':
            mx.inputs['A'].default_value = a if isinstance(a, tuple) else (0, 0, 0, 1)
            mx.inputs['B'].default_value = bb if isinstance(bb, tuple) else (0, 0, 0, 1)
            entree_a, entree_b, sortie = mx.inputs['A'], mx.inputs['B'], mx.outputs['Result']
        else:
            mx.inputs[2].default_value = a if not hasattr(a, 'is_linked') else 0.0
            mx.inputs[3].default_value = bb if not hasattr(bb, 'is_linked') else 0.0
            entree_a, entree_b, sortie = mx.inputs[2], mx.inputs[3], mx.outputs[0]
        if hasattr(a, 'is_linked'):
            nt.links.new(a, entree_a)
        if hasattr(bb, 'is_linked'):
            nt.links.new(bb, entree_b)
        nt.links.new(fac, mx.inputs['Factor'])
        return sortie

    # la cire n'est pas uniforme : nuances de teinte (coordonnées de l'objet, en cm)
    bn = nt.nodes.new('ShaderNodeTexNoise')
    bn.inputs['Scale'].default_value = 0.9
    bn.inputs['Detail'].default_value = 4.0
    nt.links.new(tc.outputs['Object'], bn.inputs['Vector'])
    teinte = melange((*couleur, 1.0), (couleur[0] * 0.97, couleur[1] * 0.92, couleur[2] * 0.8, 1.0), bn.outputs['Fac'])
    # le fond mouillé : plus doré
    teinte = melange(teinte, (0.78, 0.52, 0.24, 1.0), fond.outputs['Fac'])
    # la flaque, mince, prend la teinte chaude de la table qu'on devine à travers
    sep0 = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep0.inputs[0])
    bas = nt.nodes.new('ShaderNodeMapRange')
    bas.inputs['From Min'].default_value = 0.45
    bas.inputs['From Max'].default_value = 0.1
    nt.links.new(sep0.outputs['Z'], bas.inputs['Value'])
    teinte = melange(teinte, (0.95, 0.74, 0.5, 1.0), bas.outputs['Result'])
    nt.links.new(teinte, b.inputs['Base Color'])
    # rugosité : flanc mat-satiné, coulures plus lisses ; un peu de variation
    rug = nt.nodes.new('ShaderNodeMapRange')
    rug.inputs['To Min'].default_value = -0.05
    rug.inputs['To Max'].default_value = 0.05
    nt.links.new(bn.outputs['Fac'], rug.inputs['Value'])
    base_rug = melange(0.44, 0.24, coul.outputs['Fac'], 'FLOAT')
    somme = nt.nodes.new('ShaderNodeMath')
    somme.operation = 'ADD'
    nt.links.new(base_rug, somme.inputs[0])
    nt.links.new(rug.outputs['Result'], somme.inputs[1])
    nt.links.new(somme.outputs[0], b.inputs['Roughness'])
    # le fond du puits, sous le liquide (même indice), ne renvoie rien
    spec = melange(0.5, 0.0, fond.outputs['Fac'], 'FLOAT')
    nt.links.new(spec, b.inputs['Specular IOR Level'])
    # micro-relief : le flanc a le grain du moulage, les coulures et le fond sont lisses
    fin = nt.nodes.new('ShaderNodeTexNoise')
    fin.inputs['Scale'].default_value = 28.0
    fin.inputs['Detail'].default_value = 6.0
    nt.links.new(tc.outputs['Object'], fin.inputs['Vector'])
    force = nt.nodes.new('ShaderNodeMath')
    force.operation = 'MULTIPLY'
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    maxi = nt.nodes.new('ShaderNodeMath')
    maxi.operation = 'MAXIMUM'
    nt.links.new(coul.outputs['Fac'], maxi.inputs[0])
    nt.links.new(fond.outputs['Fac'], maxi.inputs[1])
    nt.links.new(maxi.outputs[0], inv.inputs[1])
    nt.links.new(inv.outputs[0], force.inputs[0])
    force.inputs[1].default_value = 0.1
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = 0.01
    nt.links.new(force.outputs[0], bump.inputs['Strength'])
    nt.links.new(fin.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    # la flaque est mince : peu de diffusion près de la table, sinon la lumière la traverse et elle grisaille
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    sss = nt.nodes.new('ShaderNodeMapRange')
    sss.inputs['From Min'].default_value = 0.05
    sss.inputs['From Max'].default_value = 0.6
    sss.inputs['To Min'].default_value = 0.08
    sss.inputs['To Max'].default_value = 0.9
    nt.links.new(sep.outputs['Z'], sss.inputs['Value'])
    nt.links.new(sss.outputs['Result'], b.inputs['Subsurface Scale'])
    return m


def materiau_liquide():
    """La nappe de cire liquide : claire, à peine dorée. Réfraction seule : son reflet (la flamme) est
    rendu en direct par la toile de la flamme, qui le fait bouger avec elle."""
    m = bpy.data.materials.new('liquide')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    r = nt.nodes.new('ShaderNodeBsdfRefraction')
    r.inputs['IOR'].default_value = 1.44
    r.inputs['Roughness'].default_value = 0.0
    r.inputs['Color'].default_value = (0.98, 0.91, 0.74, 1)
    nt.links.new(r.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def materiau_meche():
    m = bpy.data.materials.new('meche')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.02, 0.015, 0.012, 1)
    b.inputs['Roughness'].default_value = 0.85
    # la pointe rougeoie : émission selon la hauteur (coordonnées de l'objet)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    rampe = nt.nodes.new('ShaderNodeMapRange')
    rampe.inputs['From Min'].default_value = NIVEAU_PUITS + 0.45
    rampe.inputs['From Max'].default_value = NIVEAU_PUITS + 0.8
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], rampe.inputs['Value'])
    b.inputs['Emission Color'].default_value = (1.0, 0.32, 0.06, 1)
    rampe.inputs['To Max'].default_value = 6.0
    nt.links.new(rampe.outputs['Result'], b.inputs['Emission Strength'])
    return m


def corps(rng: random.Random, encoches):
    """Le corps : un cylindre tourné (profil r, z) creusé d'un puits en cuvette, avec une paroi mince au
    sommet, au bord irrégulier, encoché là où la cire a débordé. encoches : (angle, profondeur) ; une
    profondeur None abaisse la lèvre jusqu'à LEVRE au-dessus de la cire liquide (la cire y déborde)."""
    N, H = NIVEAU_PUITS, HAUTEUR
    profil = [
        (0.0, N - PROFONDEUR), (0.7, N - PROFONDEUR + 0.02), (1.25, N - PROFONDEUR + 0.1),
        (1.6, N - 0.31), (1.82, N - 0.15), (1.95, N - 0.02), (2.02, N + 0.12), (2.08, H - 0.12),
        (2.14, H - 0.03), (2.2, H), (2.26, H - 0.05), (RAYON, H - 0.18), (RAYON, H - 0.5),
    ]
    z = H - 0.9
    while z > 0.3:
        profil.append((RAYON, z))
        z -= 0.45
    profil += [(RAYON, 0.2), (RAYON - 0.03, 0.05), (RAYON - 0.1, 0.0), (0.0, 0.0)]
    n = 240
    crete = bruit(rng, 6)
    gonfle = bruit(rng, 4)
    prof = [(a, p if p is not None else H + 0.16 * crete(a) - (N + LEVRE), lg) for a, p, lg in encoches]

    def encoche(phi):
        e = 0.0
        for a, p, lg in prof:
            d = math.atan2(math.sin(phi - a), math.cos(phi - a))
            e = max(e, p * math.exp(-(d / lg) ** 2))
        return e

    verts, faces = [], []
    for i in range(n):
        phi = 2 * math.pi * i / n
        for r, z in profil:
            hz = max(0.0, (z - (H - 0.8)) / 0.8)       # 0 en dessous, 1 à la crête
            dz = (0.16 * crete(phi) - encoche(phi)) * hz ** 1.5
            rr = r * (1 + 0.01 * gonfle(phi + z * 0.4)) if r > 0 else 0.0
            verts.append((rr * math.cos(phi), rr * math.sin(phi), z + dz))
    m = len(profil)
    for i in range(n):
        j = (i + 1) % n
        for k in range(m - 1):
            faces.append((i * m + k, j * m + k, j * m + k + 1, i * m + k + 1))
    me = bpy.data.meshes.new('corps')
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new('corps', me)
    bpy.context.collection.objects.link(ob)
    return ob, lambda phi: H + 0.16 * crete(phi) - encoche(phi)


def chemin_coulure(phi0: float, z0: float, longueur: float, rng: random.Random, pas: float = 0.04):
    """Le trajet d'une coulure le long du flanc : (phi, z, u) depuis le bord vers le bas. La cire descend
    droit (la pesanteur), en déviant à peine."""
    pts = []
    s = 0.0
    errance = rng.uniform(-1, 1)
    while s <= longueur:
        u = s / max(longueur, 1e-3)
        phi = phi0 + 0.02 * errance * math.sin(s * 1.1) + 0.008 * s * errance
        pts.append((phi, z0 - s, u))
        s += pas
    return pts


def coulure_elements(pts, largeur: float, phase: float, bourrelets, au_pied: bool):
    """Éléments de métaballes d'une coulure figée : des ellipsoïdes aplatis contre le flanc. Un col étroit
    sous la lèvre, une langue qui s'élargit et s'épaissit en descendant, des bourrelets (u) là où une coulée
    plus ancienne s'est arrêtée, et une goutte bombée au bout (sauf si elle se fond dans la flaque)."""
    els = []
    longueur = max(1e-3, pts[0][1] - pts[-1][1])
    for phi, z, u in pts:
        col = lisse(0.0, min(0.6, 0.3 * longueur) / longueur, u)
        w = largeur * (0.5 + 0.5 * col) * (1 + 0.22 * u)
        w *= 1 + 0.06 * math.sin(1.4 * u * longueur + phase)
        ep = 0.36 + 0.14 * u
        for ub, force in bourrelets:
            g = math.exp(-(((u - ub) * longueur) / 0.3) ** 2)
            w *= 1 + 0.18 * force * g
            ep += 0.12 * force * g
        if not au_pied:                                   # la goutte bombée au bout
            g = math.exp(-(((1 - u) * longueur) / 0.2) ** 2)
            w *= 1 + 0.38 * g
            ep += 0.32 * g
        d = RAYON + 0.04 * w
        els.append(('ELLIPSOID', (d * math.cos(phi), d * math.sin(phi), z), w,
                    (ep, 1.0, 1.25), mathutils.Quaternion((0, 0, 1), phi)))
    return els


def metaballes(nom: str, elements, resolution: float = 0.035):
    """elements : liste de (type, position, rayon, échelle xyz, rotation)."""
    mb = bpy.data.metaballs.new(nom)
    mb.resolution = resolution          # la conversion en maillage suit la résolution d'affichage
    mb.render_resolution = resolution
    mb.threshold = 0.3
    for typ, pos, r, ech, rot in elements:
        e = mb.elements.new(type=typ)
        e.co = pos
        e.radius = r
        if ech is not None:
            e.size_x, e.size_y, e.size_z = ech
        if rot is not None:
            e.rotation = rot
    ob = bpy.data.objects.new(nom, mb)
    bpy.context.collection.objects.link(ob)
    return ob


def en_maillage(ob):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def bruit2d(rng: random.Random, n: int = 6, echelle: float = 1.0):
    """Bruit 2D doux (somme d'ondes de directions aléatoires), de -1 à 1 environ."""
    ondes = []
    for k in range(n):
        a = rng.uniform(0, 2 * math.pi)
        f = echelle * (1.6 ** k) * rng.uniform(0.8, 1.2)
        ondes.append((math.cos(a) * f, math.sin(a) * f, rng.uniform(0, 2 * math.pi), 0.62 ** k))
    norme = sum(w for *_, w in ondes)
    return lambda x, y: sum(w * math.sin(fx * x + fy * y + p) for fx, fy, p, w in ondes) / norme


def flaque(lobes, rng: random.Random):
    """La flaque de cire figée au pied : une galette fine (1 mm), bord en ménisque, contour irrégulier (un
    anneau autour du pied, un épanchement au bout de chaque coulure arrivée en bas), un bourrelet au pied."""
    pas = 0.04
    etendue = RAYON + 2.8
    n = int(2 * etendue / pas) + 1
    contour = bruit2d(rng, 7, 1.4)
    relief = bruit2d(rng, 5, 2.5)

    def dedans(x, y):
        """Distance signée approchée au contour (positive dedans), en cm."""
        rho = math.hypot(x, y)
        best = RAYON + 0.4 - rho
        for cx, cy, a, b, ang in lobes:
            dx, dy = x - cx, y - cy
            ca, sa = math.cos(-ang), math.sin(-ang)
            lx, ly = dx * ca - dy * sa, dx * sa + dy * ca
            q = math.hypot(lx / a, ly / b)
            best = max(best, (1 - q) * min(a, b))
        return best + 0.22 * contour(x, y)

    verts, faces, idx = [], [], {}
    for i in range(n):
        for j in range(n):
            x, y = -etendue + i * pas, -etendue + j * pas
            d = dedans(x, y)
            if d < -pas:
                continue
            rho = math.hypot(x, y)
            h = (0.09 + 0.02 * relief(x, y)) * min(1.0, max(0.0, d) / 0.12) ** 0.5   # ménisque au bord
            if rho > RAYON - 0.2:
                h += 0.26 * math.exp(-max(0.0, rho - RAYON) / 0.28)       # la cire s'amasse au pied
            if d < 0:
                h = 0.0
            idx[(i, j)] = len(verts)
            verts.append((x, y, h))
    for i in range(n - 1):
        for j in range(n - 1):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            if all(k in idx for k in q) and any(verts[idx[k]][2] > 0 for k in q):
                faces.append(tuple(idx[k] for k in q))
    me = bpy.data.meshes.new('flaque')
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new('flaque', me)
    bpy.context.collection.objects.link(ob)
    # une épaisseur sous la galette, pour un volume fermé (union par remaillage)
    so = ob.modifiers.new('epaisseur', 'SOLIDIFY')
    so.thickness = 0.1
    so.offset = 1.0
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='epaisseur')
    return ob


# Les coulures : (écart à l'axe tourné vers la caméra en rad, longueur en cm, largeur en cm, bourrelets
# (u, force)). Celles du flanc visible (|écart| < 1,4) sont les plus soignées ; quelques-unes derrière
# dessinent la silhouette. Une longueur de 9 cm descend jusqu'à la flaque.
COULURES = [
    (-1.25, 1.7, 0.24, [(0.55, 0.6)]),
    (-0.62, 9.0, 0.34, [(0.42, 0.8), (0.7, 0.5)]),
    (-0.18, 0.8, 0.16, []),
    (0.12, 2.5, 0.28, [(0.5, 0.5)]),
    (0.74, 9.0, 0.3, [(0.55, 0.7)]),
    (1.15, 1.4, 0.2, []),
    (1.5, 3.4, 0.25, [(0.45, 0.6)]),
    (2.4, 9.0, 0.34, [(0.5, 0.6)]),
    (3.3, 2.2, 0.3, []),
    (4.2, 9.0, 0.34, [(0.6, 0.7)]),
    (-1.95, 3.6, 0.28, [(0.5, 0.5)]),
]
# Les coulures où la cire liquide coule pendant l'animation (indices dans COULURES) : deux longues qui
# descendent jusqu'à la flaque, une courte qui s'arrête sur sa goutte figée.
GOUTTES = [1, 4, 3]


def construire(rng: random.Random, voxel: float):
    vers_cam = math.atan2(-scene_vers_monde(*PIED).y, -scene_vers_monde(*PIED).x)
    # une encoche par coulure ; celles des coulures animées descendent jusqu'au niveau du liquide
    encoches = []
    for k, (dphi, longueur, largeur, _) in enumerate(COULURES):
        if k in GOUTTES:
            encoches.append((vers_cam + dphi, None, 0.1))
        else:
            encoches.append((vers_cam + dphi, 0.06 + 0.07 * min(1.0, longueur / 5), 0.09))
    ob, hauteur_bord = corps(rng, encoches)
    elements, chemins, lobes = [], [], []
    for k, (dphi, longueur, largeur, bourrelets) in enumerate(COULURES):
        phi = vers_cam + dphi
        zl = hauteur_bord(phi)
        z0 = zl - 0.12
        au_pied = longueur >= z0
        pts = chemin_coulure(phi, z0, min(longueur, z0 - 0.12), rng)
        chemins.append(pts)
        elements += coulure_elements(pts, largeur, k * 1.7, bourrelets, au_pied)
        # le débordement : la cire passe la lèvre de l'encoche (une langue sur le bord arrondi)
        for rr, dz, kw in ((2.12, 0.05, 0.55), (2.21, 0.06, 0.6), (2.29, 0.1, 0.62)):
            elements.append(('ELLIPSOID', (rr * math.cos(phi), rr * math.sin(phi), zl - dz),
                             largeur * kw, (0.55, 1.0, 0.4), mathutils.Quaternion((0, 0, 1), phi)))
        if au_pied:            # arrivée en bas : un lobe de la flaque dans son prolongement
            p = pts[-1][0]
            ext = rng.uniform(0.4, 0.8)
            c = RAYON + ext * 0.5
            lobes.append((c * math.cos(p), c * math.sin(p), ext, rng.uniform(0.6, 0.95), p))
    # le grand épanchement : la cire a coulé d'un côté (la table n'est pas tout à fait plane)
    p = -1.75
    lobes.append(((RAYON + 0.45) * math.cos(p), (RAYON + 0.45) * math.sin(p), 1.35, 0.95, p + 0.5))
    mb = en_maillage(metaballes('coulures', elements, resolution=0.02 if voxel < 0.04 else 0.035))
    fl = flaque(lobes, rng)
    bpy.ops.object.select_all(action='DESELECT')
    for o in (ob, mb, fl):
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    rm = ob.modifiers.new('voxel', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    rm.use_smooth_shade = True
    sm = ob.modifiers.new('lisse', 'CORRECTIVE_SMOOTH')
    sm.factor = 0.5
    sm.iterations = 8
    sm.smooth_type = 'LENGTH_WEIGHTED'
    sm.use_only_smooth = True
    tex = bpy.data.textures.new('grain', 'CLOUDS')
    tex.noise_scale = 0.25
    dp = ob.modifiers.new('grain', 'DISPLACE')
    dp.texture = tex
    dp.strength = 0.01
    dp.mid_level = 0.5
    bpy.context.view_layer.objects.active = ob
    for mod in ('voxel', 'lisse', 'grain'):
        bpy.ops.object.modifier_apply(modifier=mod)
    attributs_cire(ob)
    ob.data.materials.append(materiau_cire())
    return ob, chemins, vers_cam


def attributs_cire(ob):
    """Attributs du maillage pour le matériau : « coulure » (la cire qui dépasse du cylindre : coulures,
    langues de débordement) et « fond » (le fond et la paroi du puits sous la cire liquide)."""
    me = ob.data
    coul, fond = [], []
    for v in me.vertices:
        x, y, z = v.co
        rho = math.hypot(x, y)
        c = lisse(RAYON + 0.005, RAYON + 0.07, rho) * lisse(0.1, 0.3, z)
        coul.append(c)
        fond.append((1 - lisse(NIVEAU_PUITS - 0.02, NIVEAU_PUITS + 0.03, z)) * (1 - lisse(2.05, 2.2, rho)))
    for nom, val in (('coulure', coul), ('fond', fond)):
        a = me.attributes.new(nom, 'FLOAT', 'POINT')
        a.data.foreach_set('value', val)


def releve_coulures(ob, chemins, vers_cam):
    """Le relevé des coulures animées, sur le maillage final (repère de la bougie, cm) :
      profil : [z, phi, rho, demi_largeur, rho_flanc] tous les 0,04 cm de la lèvre au pied — la crête de
               la coulure (rho à l'angle phi), sa demi-largeur à mi-hauteur de la bosse, et le flanc nu à côté ;
      levre  : [rho, z] le dessus de la cire le long de l'axe de la coulure, du puits au flanc ;
      pied   : [rho, z] le dessus de la flaque dans son prolongement."""
    me = ob.data
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    sortie = []
    for g in GOUTTES:
        dphi, longueur, largeur, _ = COULURES[g]
        phi0 = vers_cam + dphi
        pts = chemins[g]
        profil = []
        suivi = pts[0][0]
        for phi_c, z, _u in pts[1:]:
            if z < 0.3:                   # plus bas, le bourrelet du pied et la flaque
                break
            rhos = []
            centre = 0.5 * (suivi + phi_c)     # la crête suit la coulure sans sauter sur une voisine
            for j in range(-70, 71):
                a = centre + j * 0.004
                o = mathutils.Vector((3.8 * math.cos(a), 3.8 * math.sin(a), z))
                hit = bvh.ray_cast(o, mathutils.Vector((-math.cos(a), -math.sin(a), 0.0)), 3.8)
                rhos.append(3.8 - hit[3] if hit[0] is not None else 0.0)
            flanc = sorted(rhos[:12] + rhos[-12:])[12]
            jm = max(range(25, len(rhos) - 25), key=lambda j: rhos[j] - 0.002 * abs(j - 70))
            # sommet affiné (parabole sur trois points)
            if 0 < jm < len(rhos) - 1:
                a_, b_, c_ = rhos[jm - 1], rhos[jm], rhos[jm + 1]
                den = a_ - 2 * b_ + c_
                dj = 0.5 * (a_ - c_) / den if den < 0 else 0.0
            else:
                dj = 0.0
            crete = rhos[jm]
            mi = flanc + 0.5 * (crete - flanc)
            gauche = next((j for j in range(jm, -1, -1) if rhos[j] < mi), 0)
            droite = next((j for j in range(jm, len(rhos)) if rhos[j] < mi), len(rhos) - 1)
            demi = 0.5 * (droite - gauche) * 0.004 * crete / math.sqrt(0.5)
            suivi = centre + (jm - 70 + dj) * 0.004
            profil.append([round(z, 4), round(suivi, 5), round(crete, 4), round(demi, 4), round(flanc, 4)])
        levre = []
        for j in range(0, 61):
            rho = 1.6 + j * 0.02
            o = mathutils.Vector((rho * math.cos(phi0), rho * math.sin(phi0), HAUTEUR + 2))
            hit = bvh.ray_cast(o, mathutils.Vector((0, 0, -1.0)), HAUTEUR + 2.5)
            if hit[0] is not None:
                levre.append([round(rho, 3), round(hit[0].z, 4)])
        pied = []
        phi_b = pts[-1][0]
        for j in range(1, 41):
            rho = RAYON + j * 0.04
            o = mathutils.Vector((rho * math.cos(phi_b), rho * math.sin(phi_b), 3.0))
            hit = bvh.ray_cast(o, mathutils.Vector((0, 0, -1.0)), 3.5)
            if hit[0] is not None:
                pied.append([round(rho, 3), round(hit[0].z, 4)])
        sortie.append({'coulure': g, 'phi': round(phi0, 5), 'largeur': largeur, 'au_pied': longueur >= pts[0][1],
                       'profil': profil, 'levre': levre, 'pied': pied})
    return sortie


def puits_et_meche():
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=RAYON_LIQUIDE, fill_type='NGON', location=(0, 0, NIVEAU_PUITS))
    puits = bpy.context.active_object
    puits.name = 'puits'
    puits.data.materials.append(materiau_liquide())
    puits.visible_shadow = False          # la lumière de la flamme traverse la nappe jusqu'au fond
    cu = bpy.data.curves.new('meche', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.06
    cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER')
    pts = [(0, 0, NIVEAU_PUITS - PROFONDEUR - 0.05), (0.02, 0.0, NIVEAU_PUITS + 0.3), (0.09, 0.02, NIVEAU_PUITS + 0.62),
           (0.2, 0.05, NIVEAU_PUITS + 0.78)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    meche = bpy.data.objects.new('meche', cu)
    bpy.context.collection.objects.link(meche)
    meche.data.materials.append(materiau_meche())
    return puits, meche


def flamme_lumineuse():
    """La flamme comme source : une goutte émissive, invisible à la caméra (la flamme vue est la toile
    WebGL), qui éclaire la cire, la traverse (le bord luit) et fait luire les coulures. Vue dans un reflet,
    elle n'est qu'une lueur : son reflet net dans la nappe liquide est rendu en direct."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0, location=(0.05, 0.01, FLAMME_Z))
    f = bpy.context.active_object
    f.name = 'flamme'
    for v in f.data.vertices:            # une goutte : pointue en haut
        z = v.co.z
        v.co.x *= 0.26 * (1 - 0.55 * max(0.0, z))
        v.co.y *= 0.26 * (1 - 0.55 * max(0.0, z))
        v.co.z = z * 0.85
    m = bpy.data.materials.new('flamme')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 45.0
    lp = nt.nodes.new('ShaderNodeLightPath')
    teinte = nt.nodes.new('ShaderNodeMix')
    teinte.data_type = 'RGBA'
    teinte.inputs['A'].default_value = (1.0, 0.56, 0.22, 1)
    teinte.inputs['B'].default_value = (0.45, 0.24, 0.09, 1)
    nt.links.new(lp.outputs['Is Glossy Ray'], teinte.inputs['Factor'])
    nt.links.new(teinte.outputs['Result'], em.inputs['Color'])
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    f.data.materials.append(m)
    f.visible_camera = False
    f.visible_shadow = False
    return f


def lumieres():
    # la cheminée, hors champ à gauche, un peu au-dessus du milieu de la scène
    ch = bpy.data.lights.new('cheminee', 'AREA')
    ch.shape = 'DISK'
    ch.size = 70.0
    ch.energy = 220000.0
    ch.color = (1.0, 0.5, 0.22)
    o = bpy.data.objects.new('cheminee', ch)
    o.location = (-150.0, 30.0, 110.0)
    bpy.context.collection.objects.link(o)
    o.rotation_euler = (mathutils.Vector((0, 0, 0)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    # la pièce et le livre renvoient un peu de lumière, douce, depuis la droite
    rb = bpy.data.lights.new('renvoi', 'AREA')
    rb.shape = 'DISK'
    rb.size = 35.0
    rb.energy = 6000.0
    rb.color = (1.0, 0.8, 0.6)
    o = bpy.data.objects.new('renvoi', rb)
    o.location = (PIED_MONDE[0] + 32.0, PIED_MONDE[1] - 27.0, 24.0)
    bpy.context.collection.objects.link(o)
    o.rotation_euler = (mathutils.Vector((0, 0, 0)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    return bpy.data.objects['cheminee'], bpy.data.objects['renvoi']


def table():
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    t = bpy.context.active_object
    t.name = 'table'
    m = bpy.data.materials.new('table')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.22, 0.1, 0.05, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
    t.data.materials.append(m)
    return t


def camera(scene):
    largeur_cm = (SCENE_W + 2 * MARGE) / PXCM
    cam = bpy.data.cameras.new('camera')
    cam.sensor_fit = 'HORIZONTAL'
    cam.sensor_width = 36.0
    cam.lens = 36.0 * HCAM / largeur_cm
    cam.clip_start = 1.0
    cam.clip_end = 500.0
    o = bpy.data.objects.new('camera', cam)
    o.location = (0, 0, HCAM)
    bpy.context.collection.objects.link(o)
    scene.camera = o
    scene.render.resolution_x = round((SCENE_W + 2 * MARGE) * CUISSON)
    scene.render.resolution_y = round((SCENE_H + 2 * MARGE) * CUISSON)
    scene.render.resolution_percentage = 100
    return o


def camera_profil(scene, base, vers_cam):
    """Vérification : la bougie de trois quarts, depuis le centre de la scène, à 30° au-dessus de la table."""
    cam = bpy.data.cameras.new('profil')
    cam.lens = 90.0
    o = bpy.data.objects.new('profil', cam)
    cible = base + mathutils.Vector((0, 0, 2.4))
    d = mathutils.Vector((math.cos(vers_cam), math.sin(vers_cam), 0.62)).normalized()
    o.location = cible + d * 26.0
    o.rotation_euler = (cible - o.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.collection.objects.link(o)
    scene.camera = o
    scene.render.use_border = False
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    return o


def cadre(scene, x0, y0, x1, y1):
    """Ne rendre que la boîte (px de scène, débord compris) : bordure de rendu, image recadrée."""
    W, H = SCENE_W + 2 * MARGE, SCENE_H + 2 * MARGE
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    scene.render.border_min_x = (x0 + MARGE) / W
    scene.render.border_max_x = (x1 + MARGE) / W
    scene.render.border_min_y = 1 - (y1 + MARGE) / H
    scene.render.border_max_y = 1 - (y0 + MARGE) / H


def rendu(scene, chemin, echantillons):
    scene.cycles.samples = echantillons
    scene.render.filepath = chemin
    bpy.ops.render.render(write_still=True)


BOITE = (-160, 600, 440, SCENE_H + MARGE)      # la bougie, sa flaque et son ombre (vers la droite)
BOITE_APERCU = (40, 680, 340, 990)              # la bougie seule (réglages)


def main(argv):
    sortie = argv[0]
    apercu = '--apercu' in argv
    os.makedirs(sortie, exist_ok=True)
    rng = random.Random(11)
    vider()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 16
    scene.cycles.transmission_bounces = 16
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium Contrast'
    scene.world = bpy.data.worlds.new('nuit')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.008, 0.006, 1)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'

    ob, chemins, vers_cam = construire(rng, 0.04 if apercu else 0.02)
    releve = releve_coulures(ob, chemins, vers_cam)
    puits, meche = puits_et_meche()
    fl = flamme_lumineuse()
    base = scene_vers_monde(*PIED)
    for o in (ob, puits, meche, fl):
        o.location += base
    cheminee, renvoi = lumieres()
    t = table()
    cam = camera(scene)
    ech = 64 if apercu else 768
    if '--echantillons' in argv:
        ech = int(argv[argv.index('--echantillons') + 1])
    emission = fl.data.materials[0].node_tree.nodes['Emission'].inputs['Strength']
    fort = emission.default_value
    seulement = argv[argv.index('--seulement') + 1].split(',') if '--seulement' in argv else None
    faire = lambda nom: (seulement is None and nom != 'profil') or (seulement is not None and nom in seulement)

    # 1. la bougie seule, flamme basse puis flamme haute (l'application fond l'une dans l'autre au rythme
    #    de la flamme : la cire s'éclaire et s'assombrit avec elle). La table renvoie la lumière sans être rendue.
    cadre(scene, *(BOITE_APERCU if apercu or '--echantillons' in argv else BOITE))
    t.visible_camera = False
    for nom, k in (('bougie', 0.72), ('bougie-vive', 1.3)):
        if faire(nom):
            emission.default_value = fort * k
            rendu(scene, os.path.join(sortie, f'{nom}.png'), ech)
    emission.default_value = fort

    if faire('profil'):
        camera_profil(scene, base, vers_cam)
        t.visible_camera = True
        rendu(scene, os.path.join(sortie, 'profil.png'), ech)
        t.visible_camera = False
        scene.camera = cam
        camera(scene)

    # 2. l'ombre portée par la cheminée seule : la table attrape l'ombre, la bougie est invisible
    if faire('ombre'):
        cadre(scene, *BOITE)
        t.visible_camera = True
        t.is_shadow_catcher = True
        for o in (ob, puits, meche):
            o.visible_camera = False
        fl.hide_render = True
        renvoi.hide_render = True
        rendu(scene, os.path.join(sortie, 'ombre.png'), 32 if apercu else 128)

    reperes = {'boite': BOITE, 'base': [round(base.x, 5), round(base.y, 5)], 'rayon': RAYON, 'hauteur': HAUTEUR,
               'niveau': NIVEAU_PUITS, 'rayon_liquide': RAYON_LIQUIDE, 'flamme_z': FLAMME_Z,
               'meche_monde': [0.2, 0.05, NIVEAU_PUITS + 0.78], 'coulures': releve}
    meche_haut = base + mathutils.Vector((0.2, 0.05, NIVEAU_PUITS + 0.78))
    reperes['meche'] = monde_vers_scene(meche_haut)
    reperes['flamme'] = monde_vers_scene(base + mathutils.Vector((0.05, 0.01, FLAMME_Z)))
    reperes['flamme_pointe'] = monde_vers_scene(base + mathutils.Vector((0.05, 0.01, FLAMME_Z + 1.2)))
    reperes['pied'] = monde_vers_scene(base)
    reperes['sommet'] = monde_vers_scene(base + mathutils.Vector((0, 0, HAUTEUR)))
    with open(os.path.join(sortie, 'reperes.json'), 'w') as f:
        json.dump(reperes, f, indent=1)
    print(json.dumps({k: v for k, v in reperes.items() if k != 'coulures'}))


if __name__ == '__main__':
    main(sys.argv[1:])
