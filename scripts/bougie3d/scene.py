"""Bougie du carnet en 3D (v5, retour « la bougie doit être verticale, vue du haut, légèrement inclinée,
avec de la cire à ses pieds, et la cire qui coule ») : une bougie de cire crème à moitié consumée, posée
sur la table à gauche du livre, modélisée et rendue dans Blender (Cycles) avec la caméra de la scène.

La scène du carnet est une table vue d'en haut : une caméra au-dessus du livre, qui regarde droit vers le
bas. Une bougie posée dans le coin bas gauche est donc vue presque d'en haut : on voit le dessus (le puits
de cire liquide, la mèche), son flanc tourné vers le centre de l'image, un peu en fuite, et la flaque de
cire figée à son pied. Ce script construit cette bougie et rend, dans le repère de la scène 1920 × 1080 :

  - la bougie seule, avec son ombre portée par la cheminée (à gauche, hors champ) sur la table ;
  - une suite d'images d'une goutte de cire liquide qui coule le long d'une coulure (animation).

Lancement (Blender en module Python, hors dépôt) :

  uv venv -p 3.11 <dossier>/.venv && uv pip install -p <dossier>/.venv/bin/python "bpy==4.2.*"
  <dossier>/.venv/bin/python scripts/bougie3d/scene.py <sortie> [--apercu] [--goutte]

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
FLAMME_Z = NIVEAU_PUITS + 1.75  # milieu de la flamme


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


def vider():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def materiau_cire(nom: str, couleur, rugosite: float, liquide: bool = False):
    m = bpy.data.materials.new(nom)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rugosite
    b.inputs['Subsurface Weight'].default_value = 1.0
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.5, 0.22)
    b.inputs['Subsurface Scale'].default_value = 1.5 if liquide else 1.1
    b.inputs['IOR'].default_value = 1.44
    if liquide:       # une nappe mince, dorée, qui reflète la flamme (pas de volume : pas de diffusion)
        b.inputs['Base Color'].default_value = (*couleur, 1.0)
        b.inputs['Subsurface Weight'].default_value = 0.0
        b.inputs['Coat Weight'].default_value = 1.0
        b.inputs['Coat Roughness'].default_value = 0.02
        b.inputs['Emission Color'].default_value = (1.0, 0.6, 0.25, 1)
        b.inputs['Emission Strength'].default_value = 0.25     # la lumière qui traverse la cire fondue
        return m
    # la cire n'est pas uniforme : nuances de teinte et micro-relief (coordonnées de l'objet, en cm)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    bn = nt.nodes.new('ShaderNodeTexNoise')
    bn.inputs['Scale'].default_value = 0.9
    bn.inputs['Detail'].default_value = 4.0
    nt.links.new(tc.outputs['Object'], bn.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*couleur, 1.0)
    mix.inputs['B'].default_value = (couleur[0] * 0.96, couleur[1] * 0.9, couleur[2] * 0.78, 1.0)
    nt.links.new(bn.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    fin = nt.nodes.new('ShaderNodeTexNoise')
    fin.inputs['Scale'].default_value = 28.0
    fin.inputs['Detail'].default_value = 6.0
    nt.links.new(tc.outputs['Object'], fin.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.01
    nt.links.new(fin.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    rug = nt.nodes.new('ShaderNodeMapRange')
    rug.inputs['To Min'].default_value = rugosite - 0.12
    rug.inputs['To Max'].default_value = rugosite + 0.12
    nt.links.new(bn.outputs['Fac'], rug.inputs['Value'])
    nt.links.new(rug.outputs['Result'], b.inputs['Roughness'])
    # la flaque est mince : peu de diffusion près de la table, sinon la lumière la traverse et elle grisaille
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    sss = nt.nodes.new('ShaderNodeMapRange')
    sss.inputs['From Min'].default_value = 0.05
    sss.inputs['From Max'].default_value = 0.5
    sss.inputs['To Min'].default_value = 0.06
    sss.inputs['To Max'].default_value = 1.1
    nt.links.new(sep.outputs['Z'], sss.inputs['Value'])
    nt.links.new(sss.outputs['Result'], b.inputs['Subsurface Scale'])
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
    """Le corps : un cylindre tourné (profil r, z) avec un cratère au sommet, bord irrégulier, encoché là
    où la cire a débordé (encoches : angles des coulures)."""
    profil = [
        (0.0, NIVEAU_PUITS - 0.2), (1.5, NIVEAU_PUITS - 0.18), (1.82, NIVEAU_PUITS - 0.04),
        (1.98, NIVEAU_PUITS + 0.12), (2.07, HAUTEUR - 0.1), (2.14, HAUTEUR - 0.01), (2.2, HAUTEUR),
        (2.26, HAUTEUR - 0.05), (RAYON, HAUTEUR - 0.18), (RAYON, HAUTEUR - 0.5),
    ]
    z = HAUTEUR - 0.9
    while z > 0.3:
        profil.append((RAYON, z))
        z -= 0.45
    profil += [(RAYON, 0.2), (RAYON - 0.03, 0.05), (RAYON - 0.1, 0.0), (0.0, 0.0)]
    n = 180
    crete = bruit(rng, 6)
    gonfle = bruit(rng, 4)

    def encoche(phi):
        e = 0.0
        for a, prof in encoches:
            d = math.atan2(math.sin(phi - a), math.cos(phi - a))
            e = max(e, prof * math.exp(-(d / 0.09) ** 2))
        return e

    verts, faces = [], []
    for i in range(n):
        phi = 2 * math.pi * i / n
        for r, z in profil:
            hz = max(0.0, (z - (HAUTEUR - 0.8)) / 0.8)       # 0 en dessous, 1 à la crête
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
    return ob, lambda phi: HAUTEUR + 0.16 * crete(phi) - encoche(phi)


def chemin_coulure(phi0: float, z0: float, longueur: float, rng: random.Random, pas: float = 0.05):
    """Le trajet d'une coulure le long du flanc : (x, y, z, phi, u) depuis le bord vers le bas."""
    pts = []
    s = 0.0
    errance = rng.uniform(-1, 1)
    while s <= longueur:
        u = s / max(longueur, 1e-3)
        phi = phi0 + 0.03 * errance * math.sin(s * 1.3) + 0.012 * s * errance
        pts.append((phi, z0 - s, u))
        s += pas
    return pts


def rayon_coulure(u: float, largeur: float, phase: float) -> float:
    r = largeur * (0.8 + 0.08 * math.sin(u * 7.0 + phase)) * (0.7 + 0.3 * min(1.0, u * 6))
    if u > 0.82:
        r *= 1 + 0.5 * math.sin(math.pi * min(1.0, (u - 0.82) / 0.18) * 0.5)
    return r


def coulure_elements(pts, largeur: float, phase: float, sur: float = 0.0):
    """Éléments de métaballes d'une coulure : ellipsoïdes aplatis contre le flanc ; goutte figée au bout."""
    els = []
    for phi, z, u in pts:
        r = rayon_coulure(u, largeur, phase)
        d = RAYON + 0.3 * r + sur
        els.append(('ELLIPSOID', (d * math.cos(phi), d * math.sin(phi), z), r,
                    (0.62, 1.0, 1.3), mathutils.Quaternion((0, 0, 1), phi)))
    return els


def metaballes(nom: str, elements, resolution: float = 0.035):
    """elements : liste de (type, position, rayon, échelle xyz, rotation)."""
    mb = bpy.data.metaballs.new(nom)
    mb.resolution = resolution * 1.5
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


# Les coulures : (écart à l'axe tourné vers la caméra en rad, longueur en cm, largeur en cm). Celles du
# flanc visible sont les plus soignées ; quelques-unes derrière dessinent la silhouette.
COULURES = [(-1.15, 1.3, 0.22), (-0.55, 9.0, 0.36), (0.12, 2.4, 0.26), (0.78, 9.0, 0.3), (1.5, 3.2, 0.24),
            (2.4, 9.0, 0.34), (3.3, 2.2, 0.3), (4.2, 9.0, 0.34), (-1.9, 3.6, 0.28), (-0.2, 0.9, 0.17),
            (1.12, 1.7, 0.19)]
# Les coulures où une goutte liquide descend (animation) : indices dans COULURES.
GOUTTES = [1, 3]


def construire(rng: random.Random, voxel: float):
    vers_cam = math.atan2(-scene_vers_monde(*PIED).y, -scene_vers_monde(*PIED).x)
    encoches = [(vers_cam + dphi, 0.06 + 0.05 * min(1.0, longueur / 5)) for dphi, longueur, _ in COULURES]
    ob, hauteur_bord = corps(rng, encoches)
    elements, chemins, lobes = [], [], []
    for k, (dphi, longueur, largeur) in enumerate(COULURES):
        phi = vers_cam + dphi
        z0 = hauteur_bord(phi) - 0.03
        pts = chemin_coulure(phi, z0, min(longueur, z0 - 0.12), rng)
        chemins.append(pts)
        elements += coulure_elements(pts, largeur, phase=k * 1.7)
        # le bourrelet du débordement, au bord
        elements.append(('ELLIPSOID', ((RAYON - 0.1) * math.cos(phi), (RAYON - 0.1) * math.sin(phi), z0 - 0.04),
                         largeur * 0.95, (0.6, 1.1, 0.5), mathutils.Quaternion((0, 0, 1), phi)))
        if longueur >= z0:            # arrivée en bas : un lobe de la flaque dans son prolongement
            p = pts[-1][0]
            ext = rng.uniform(0.4, 0.8)
            c = RAYON + ext * 0.5
            lobes.append((c * math.cos(p), c * math.sin(p), ext, rng.uniform(0.6, 0.95), p))
    # le grand épanchement : la cire a coulé d'un côté (la table n'est pas tout à fait plane)
    p = -1.75
    lobes.append(((RAYON + 0.45) * math.cos(p), (RAYON + 0.45) * math.sin(p), 1.35, 0.95, p + 0.5))
    mb = en_maillage(metaballes('coulures', elements))
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
    sm.iterations = 6
    sm.smooth_type = 'LENGTH_WEIGHTED'
    sm.use_only_smooth = True
    tex = bpy.data.textures.new('grain', 'CLOUDS')
    tex.noise_scale = 0.25
    dp = ob.modifiers.new('grain', 'DISPLACE')
    dp.texture = tex
    dp.strength = 0.012
    dp.mid_level = 0.5
    ob.data.materials.append(materiau_cire('cire', (0.95, 0.9, 0.8), 0.42))
    return ob, chemins, vers_cam


def puits_et_meche():
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=2.02, fill_type='NGON', location=(0, 0, NIVEAU_PUITS))
    puits = bpy.context.active_object
    puits.name = 'puits'
    puits.data.materials.append(materiau_cire('liquide', (0.9, 0.72, 0.42), 0.05, liquide=True))
    cu = bpy.data.curves.new('meche', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.06
    cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER')
    pts = [(0, 0, NIVEAU_PUITS - 0.3), (0.02, 0.0, NIVEAU_PUITS + 0.3), (0.09, 0.02, NIVEAU_PUITS + 0.62),
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
    """La flamme comme source : une goutte émissive, invisible à la caméra (la flamme vue est un calque
    animé), mais qui éclaire la cire et se reflète dans le puits liquide."""
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
    # vue en reflet (dans le puits liquide), elle n'est qu'une lueur : sinon on croit voir une seconde flamme
    lp = nt.nodes.new('ShaderNodeLightPath')
    teinte = nt.nodes.new('ShaderNodeMix')
    teinte.data_type = 'RGBA'
    teinte.inputs['A'].default_value = (1.0, 0.56, 0.22, 1)
    teinte.inputs['B'].default_value = (0.2, 0.1, 0.035, 1)
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
    o.visible_glossy = False
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


BOITE = (-MARGE, 600, 440, SCENE_H + MARGE)      # la bougie, sa flaque et son ombre (vers la droite)
IMAGES_GOUTTE = 64                                # images par descente d'une goutte (à 16 images/s : 4 s)


ENTREE = 14        # points du trajet de la goutte avant le bord : elle naît dans le puits et le franchit


def trajet_goutte(chemin, largeur: float, phase: float):
    """Le trajet d'une goutte : née dans le puits liquide, elle glisse jusqu'au bord, le franchit par
    l'encoche, puis descend le long de la coulure. Points (x, y, z, phi, flanc) ; flanc : 0 sur le dessus,
    1 sur le flanc (la goutte s'y pose de côté)."""
    phi0, z0, _ = chemin[0]
    pts = []
    for k in range(ENTREE):
        f = k / ENTREE
        r = 1.6 + f * (RAYON - 0.05 - 1.6)
        z = NIVEAU_PUITS + 0.02 + (z0 + 0.06 - NIVEAU_PUITS) * math.sin(f * math.pi / 2)
        pts.append((r * math.cos(phi0), r * math.sin(phi0), z, phi0, 0.0))
    for k, (phi, z, u) in enumerate(chemin):
        d = RAYON + 0.77 * rayon_coulure(u, largeur, phase)
        pts.append((d * math.cos(phi), d * math.sin(phi), z, phi, min(1.0, (k + 1) / 3)))
    return pts


def goutte(chemin, largeur: float, phase: float, t: float, mat):
    """La goutte de cire liquide à l'instant t (0 à 1) : elle se forme dans le puits, glisse et franchit le
    bord, puis descend la coulure, tête luisante et courte traînée, en laissant un film mouillé qui se
    retire. Renvoie l'objet (ou None hors de la descente)."""
    if t <= 0.0 or t >= 1.0:
        return None
    pts = trajet_goutte(chemin, largeur, phase)
    n = len(pts)
    apparait = min(1.0, t / 0.12)                 # elle se forme dans le puits
    fond = max(0.0, (t - 0.88) / 0.12)            # puis se fond dans la goutte figée en bas
    taille = (apparait ** 0.7) * (1 - fond) ** 0.8
    if taille <= 0.02:
        return None
    # lente dans le puits et au bord (elle hésite), puis elle file le long du flanc
    v = max(0.0, (t - 0.08) / 0.92)
    bord = ENTREE / (n - 1)
    if v < 0.4:
        s = bord * (v / 0.4) ** 1.4
    else:
        w = (v - 0.4) / 0.6
        s = bord + (1 - bord) * w * w * (1.6 - 0.6 * w)
    tete = min(n - 1, s * (n - 1))
    rb = 0.3 * taille
    elements = []

    def point(i):
        i0 = int(i)
        i1 = min(n - 1, i0 + 1)
        f = i - i0
        return [pts[i0][j] * (1 - f) + pts[i1][j] * f for j in range(5)]

    def poser(i, r, ech=(0.75, 1.0, 1.2)):
        x, y, z, phi, flanc = point(i)
        # sur le dessus, elle repose sur la cire ; sur le flanc, elle s'y colle de côté
        x += 0.35 * r * flanc * math.cos(phi)
        y += 0.35 * r * flanc * math.sin(phi)
        z += 0.25 * r * (1 - flanc) - 0.04 * flanc
        elements.append(('ELLIPSOID', (x, y, z), r, ech, mathutils.Quaternion((0, 0, 1), phi)))

    poser(tete, rb)
    for k in range(1, 7):                          # la queue de la goutte
        i = tete - k * 1.3
        if i < 0:
            break
        poser(i, rb * 0.72 * (1 - k / 8))
    # le film mouillé laissé derrière : fin, il se retire (s'amincit) peu après le passage de la goutte
    i = tete - 9.0
    while i > 0:
        recul = (tete - i) / (n - 1)
        r = 0.075 * (1 - fond) * max(0.0, 1 - recul / 0.4)
        if r > 0.025:
            poser(i, r, (0.5, 1.0, 1.6))
        i -= 0.5
    ob = metaballes('goutte', elements, resolution=0.012)
    ob.data.materials.append(mat)
    return ob


def boite_goutte(chemin, largeur, phase, base, marge=18.0):
    """Boîte (px de scène) qui contient tout le trajet, arrondie au pixel cuit."""
    xs, ys = [], []
    for x, y, z, phi, flanc in trajet_goutte(chemin, largeur, phase):
        px, py = monde_vers_scene(base + mathutils.Vector((x, y, z)))
        xs.append(px)
        ys.append(py)
    return (math.floor(min(xs) - marge), math.floor(min(ys) - marge), math.ceil(max(xs) + marge),
            math.ceil(max(ys) + marge))


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
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium Contrast'
    scene.world = bpy.data.worlds.new('nuit')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.008, 0.006, 1)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'

    ob, chemins, vers_cam = construire(rng, 0.045 if apercu else 0.025)
    puits, meche = puits_et_meche()
    fl = flamme_lumineuse()
    base = scene_vers_monde(*PIED)
    for o in (ob, puits, meche, fl):
        o.location += base
    cheminee, renvoi = lumieres()
    t = table()
    camera(scene)
    ech = 48 if apercu else 512
    emission = fl.data.materials[0].node_tree.nodes['Emission'].inputs['Strength']
    fort = emission.default_value
    seulement = argv[argv.index('--seulement') + 1].split(',') if '--seulement' in argv else None
    faire = lambda nom: seulement is None or nom in seulement

    # 1. la bougie seule, flamme basse puis flamme haute (l'application fond l'une dans l'autre au rythme
    #    de la flamme : la cire s'éclaire et s'assombrit avec elle). La table renvoie la lumière sans être rendue.
    cadre(scene, *BOITE)
    t.visible_camera = False
    for nom, k in (('bougie', 0.72), ('bougie-vive', 1.3)):
        if faire(nom):
            emission.default_value = fort * k
            rendu(scene, os.path.join(sortie, f'{nom}.png'), ech)
    emission.default_value = fort

    # 2. les gouttes qui coulent : la bougie masque (holdout), seule la goutte est rendue, image par image
    reperes = {'boite': BOITE, 'gouttes': []}
    if faire('gouttes'):
        for o in (ob, puits, meche):
            o.is_holdout = True
        mat = materiau_cire('goutte', (0.8, 0.48, 0.16), 0.03, liquide=True)
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Emission Strength'].default_value = 0.4
        bsdf.inputs['Specular IOR Level'].default_value = 1.0
        # la goutte liquide luit : elle reflète la flamme en plein (une étincelle qui court sur la cire)
        teinte = fl.data.materials[0].node_tree.nodes['Mix']
        teinte.inputs['B'].default_value = teinte.inputs['A'].default_value[:]
        for g in GOUTTES:
            dphi, longueur, largeur = COULURES[g]
            phase = g * 1.7
            bt = boite_goutte(chemins[g], largeur, phase, base)
            cadre(scene, *bt)
            dossier = os.path.join(sortie, f'goutte-{g}')
            os.makedirs(dossier, exist_ok=True)
            for i in range(IMAGES_GOUTTE):
                gt = goutte(chemins[g], largeur, phase, (i + 0.5) / IMAGES_GOUTTE, mat)
                if gt is not None:
                    gt.location += base
                rendu(scene, os.path.join(dossier, f'{i:03d}.png'), 16 if apercu else 96)
                if gt is not None:
                    bpy.data.objects.remove(gt, do_unlink=True)
            reperes['gouttes'].append({'coulure': g, 'boite': bt, 'images': IMAGES_GOUTTE})
        for o in (ob, puits, meche):
            o.is_holdout = False

    # 3. l'ombre portée par la cheminée seule : la table attrape l'ombre, la bougie est invisible
    if faire('ombre'):
        cadre(scene, *BOITE)
        t.visible_camera = True
        t.is_shadow_catcher = True
        for o in (ob, puits, meche):
            o.visible_camera = False
        fl.hide_render = True
        renvoi.hide_render = True
        rendu(scene, os.path.join(sortie, 'ombre.png'), 32 if apercu else 128)

    meche_haut = base + mathutils.Vector((0.2, 0.05, NIVEAU_PUITS + 0.78))
    reperes['meche'] = monde_vers_scene(meche_haut)
    reperes['flamme'] = monde_vers_scene(base + mathutils.Vector((0.05, 0.01, FLAMME_Z)))
    reperes['flamme_pointe'] = monde_vers_scene(base + mathutils.Vector((0.05, 0.01, FLAMME_Z + 1.2)))
    reperes['pied'] = monde_vers_scene(base)
    reperes['sommet'] = monde_vers_scene(base + mathutils.Vector((0, 0, HAUTEUR)))
    with open(os.path.join(sortie, 'reperes.json'), 'w') as f:
        json.dump(reperes, f, indent=1)
    print(json.dumps(reperes))


if __name__ == '__main__':
    main(sys.argv[1:])
