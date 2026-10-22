#!/usr/bin/env python3
"""Photos de Cécile de la VERSION LOCALE : les vraies photos de prive/cecile/ (jamais publiées).

  tools/ecriture/.venv/bin/python -I scripts/bake-local-cecile.py cuire [--force]
  tools/ecriture/.venv/bin/python -I scripts/bake-local-cecile.py planche
  tools/ecriture/.venv/bin/python -I scripts/bake-local-cecile.py normaliser <entrée> <sortie.jpg> [--max 4000]

Normalement lancé par scripts/medias-local.mjs (npm run medias:local, npm run medias:planche), qui choisit
le Python (GC_PYTHON, sinon tools/ecriture/.venv, sinon python3 : il faut Pillow et NumPy).

  GC_PRIVE=<dossier>   remplace prive/ (essais avec un faux dossier)

cuire — Entrées
  prive/cecile/photos/<fichier>   photos candidates (jpg, png, webp, tif, heic : converties par `sips`)
  prive/cecile/videos/<fichier>   vidéos (traitées par scripts/medias-local.mjs, pas par ce script)
  prive/cecile/choix.json         { "cecile-1": { "fichier": "petite.jpeg", "video": "VID_0001.mp4" }, … }
                                  Emplacements : cecile-1 … cecile-N (N ≈ 28 ; jusqu'à cecile-40).
                                  `fichier` : la photo du tirage, GARDÉE À SON RATIO D'ORIGINE (EXIF appliqué) : aucun
                                  rognage, un paysage reste paysage, un carré reste carré, 3:4 ou 9:16 restent tels quels.
                                  `angle` et `coins` (« noir » ou « kraft ») facultatifs. `video` : vidéo de l'emplacement,
                                  cuite par scripts/medias-local.mjs ; sans `fichier`, la 1re image de la vidéo sert de
                                  tirage (alors rien n'est cuit ici). Un emplacement absent garde le placeholder du site.
Sorties (dans prive/baked/, jamais dans design-system/baked ni src/content)
  photos/cecile-N/couleur.webp              la photo en couleurs, sans bord ni voile (grand côté 1600 px au plus) : la photo ouverte
                                            y passe en fondu (réglage « Photos ouvertes : couleur / sépia »)
  photos/cecile-N/tirage.webp, coins.webp   mêmes fonctions de rendu que scripts/bake-photos-cecile.py
                                            (tirage couleur passé, coins arrondis, ombre, coins photo) ; le grand côté de la photo
                                            fait 1080 px, l'autre suit le ratio d'origine (image = photo + 320 px)
  photos-cecile.json                        [{ id, orientation, taille, ratio, tirage, coins, angle }] pour les emplacements avec `fichier`
                                            (`taille` : [largeur, hauteur] de la photo ; `ratio` : largeur / hauteur de l'image du tirage, marge comprise)
                                            (medias-local.mjs y ajoute `video` et les emplacements vidéo seule)
  .cache-cecile.json                        cache : sha256 de la photo + paramètres + code de rendu

planche — prive/baked/planche-cecile.png : vignettes numérotées + nom de fichier de toutes les photos de
          prive/cecile/photos (puis la 1re image de chaque vidéo de prive/cecile/videos), pour choisir
          (au-delà de 30 vignettes : planche-cecile-2.png, etc.).
"""
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIVE = os.path.abspath(os.environ.get('GC_PRIVE') or os.path.join(ROOT, 'prive'))
DOSSIER_PHOTOS = os.path.join(PRIVE, 'cecile', 'photos')
DOSSIER_VIDEOS = os.path.join(PRIVE, 'cecile', 'videos')
CHOIX = os.path.join(PRIVE, 'cecile', 'choix.json')
BAKED = os.path.join(PRIVE, 'baked')
CONVERTIES = os.path.join(BAKED, '.convertis')
CACHE = os.path.join(BAKED, '.cache-cecile.json')
CONTENU = os.path.join(BAKED, 'photos-cecile.json')
PLACEHOLDERS = os.path.join(ROOT, 'src/content/photos-cecile.json')
CREDITS = os.path.join(ROOT, 'design-system/sources/photos-cecile/credits.json')
EXTENSIONS = ('.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tif', '.tiff')
EXT_VIDEOS = ('.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi')
MAX_EMPLACEMENT = 40
PAR_PLANCHE = 30
# Inclinaisons et coins des emplacements sans placeholder (cecile-11 et suivants)
ANGLES = [-3, 2, -1.5, 2.5, -2.5, 1.2, 3, -1, 2, -3]


def charger_rendu():
    """Les fonctions de rendu de scripts/bake-photos-cecile.py (nom avec tirets : import par chemin)."""
    chemin = os.path.join(ROOT, 'scripts', 'bake-photos-cecile.py')
    spec = importlib.util.spec_from_file_location('bake_photos_cecile', chemin)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, chemin


def sha256_fichier(chemin):
    h = hashlib.sha256()
    with open(chemin, 'rb') as f:
        for bloc in iter(lambda: f.read(8 << 20), b''):
            h.update(bloc)
    return h.hexdigest()


def sha256_texte(o):
    return hashlib.sha256(json.dumps(o, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()


def nfc(s):
    """Noms de fichiers macOS : décomposés (NFD) ; on compare en NFC, sans casse."""
    return unicodedata.normalize('NFC', s).casefold()


def lister_photos(dossier=DOSSIER_PHOTOS, extensions=EXTENSIONS):
    if not os.path.isdir(dossier):
        return []
    noms = [n for n in os.listdir(dossier)
            if not n.startswith('.') and n.lower().endswith(extensions)
            and os.path.isfile(os.path.join(dossier, n))]
    return sorted(noms, key=lambda n: [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', nfc(n))])


def ouvrir(chemin):
    """Ouvre une photo en RGB, orientation EXIF appliquée ; HEIC/HEIF converti en JPEG par `sips` (macOS)."""
    if chemin.lower().endswith(('.heic', '.heif')):
        os.makedirs(CONVERTIES, exist_ok=True)
        jpg = os.path.join(CONVERTIES, sha256_fichier(chemin)[:24] + '.jpg')
        if not os.path.exists(jpg):
            r = subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '95', chemin, '--out', jpg],
                               capture_output=True, text=True)
            if r.returncode != 0 or not os.path.exists(jpg):
                sys.exit(f"conversion HEIC impossible (sips) : {chemin}\n{r.stderr.strip()}")
        chemin = jpg
    return ImageOps.exif_transpose(Image.open(chemin)).convert('RGB')


def lire_json(chemin, defaut):
    if not os.path.exists(chemin):
        return defaut
    with open(chemin, encoding='utf-8') as f:
        return json.load(f)


def trouver(demande, noms):
    """Retrouve le fichier demandé (nom exact, ou sans extension) parmi les noms présents."""
    d = nfc(demande)
    for n in noms:
        if nfc(n) == d:
            return n
    candidats = [n for n in noms if nfc(os.path.splitext(n)[0]) == d]
    return candidats[0] if len(candidats) == 1 else None


COTE_COULEUR = 1600                                 # px du grand côté de la photo en couleurs (photo ouverte)
GRAND_COTE = 1080                                   # px du grand côté de la photo d'un tirage (comme les tirages 3:2 d'origine)


def dimensions_photo(largeur, hauteur):
    """(pw, ph) : la photo du tirage, grand côté 1080 px, ratio d'origine (aucun rognage)."""
    if largeur >= hauteur:
        return GRAND_COTE, max(1, round(GRAND_COTE * hauteur / largeur))
    return max(1, round(GRAND_COTE * largeur / hauteur)), GRAND_COTE


def orientation_de(pw, ph):
    return 'carre' if abs(pw - ph) <= 2 else ('portrait' if ph > pw else 'paysage')


def cuire(force=False):
    os.makedirs(BAKED, exist_ok=True)
    choix = lire_json(CHOIX, {})
    if not choix:
        with open(CONTENU, 'w', encoding='utf-8') as f:
            f.write('[]\n')
        print(f"cécile : aucun choix ({'prive/cecile/choix.json vide' if os.path.exists(CHOIX) else 'prive/cecile/choix.json absent'})"
              ' : les placeholders du site restent en place.')
        nettoyer(set())
        return 0
    bp, chemin_rendu = charger_rendu()
    code = sha256_fichier(chemin_rendu) + sha256_fichier(os.path.abspath(__file__))
    base = {p['id']: p for p in lire_json(PLACEHOLDERS, [])}
    coins_base = {p['id']: p.get('coins') for p in lire_json(CREDITS, {}).get('photos', [])}
    cache = lire_json(CACHE, {})
    noms = lister_photos()
    contenu, faits = [], []
    for id_ in sorted(choix, key=lambda k: int(re.sub(r'\D', '', k) or 0)):
        m = re.fullmatch(r'cecile-(\d{1,2})', id_)
        if not m or not 1 <= int(m.group(1)) <= MAX_EMPLACEMENT:
            sys.exit(f"choix.json : emplacement inconnu « {id_} » (attendu : cecile-1 … cecile-{MAX_EMPLACEMENT})")
        n = int(m.group(1))
        i = n - 1                                   # mêmes graines que le placeholder du même emplacement
        c = choix[id_]
        if not c.get('fichier'):
            if not c.get('video'):
                sys.exit(f"choix.json : {id_} n'a ni « fichier » ni « video »")
            continue                                # vidéo seule : la 1re image sert de tirage (medias-local.mjs)
        nom = trouver(c['fichier'], noms)
        if not nom:
            sys.exit(f"choix.json : {id_} → « {c.get('fichier')} » introuvable dans prive/cecile/photos/\n"
                     f"  photos présentes : {', '.join(noms) or '(aucune)'}")
        chemin = os.path.join(DOSSIER_PHOTOS, nom)
        angle = c.get('angle', base.get(id_, {}).get('angle', ANGLES[i % len(ANGLES)]))
        papier_coin = c.get('coins', coins_base.get(id_) or ('noir' if n % 2 else 'kraft'))
        if papier_coin not in ('noir', 'kraft'):
            sys.exit(f"choix.json : {id_} : coins « {papier_coin} » (attendu : noir ou kraft)")
        dossier = os.path.join(BAKED, 'photos', id_)
        f_tirage, f_coins = os.path.join(dossier, 'tirage.webp'), os.path.join(dossier, 'coins.webp')
        f_couleur = os.path.join(dossier, 'couleur.webp')
        sha = sha256_fichier(chemin)
        im = ouvrir(chemin)                         # ratio d'origine, orientation EXIF appliquée
        pw, ph = dimensions_photo(im.width, im.height)
        orientation = orientation_de(pw, ph)
        g = bp.Geometrie(pw, ph)
        cle = sha256_texte({'v': 4, 'photo': sha, 'coins': papier_coin, 'dim': [pw, ph], 'i': i, 'code': code})
        if force or cache.get(id_) != cle or not (os.path.exists(f_tirage) and os.path.exists(f_coins) and os.path.exists(f_couleur)):
            if im.width < pw or im.height < ph:
                print(f"  ! {nom} : {im.width}×{im.height} px, plus petite que le tirage ({pw}×{ph}) : sera agrandie")
            photo = im.resize((pw, ph), Image.LANCZOS)        # tout le cliché, rien n'est rogné
            tirage, coins = bp.composer(id_, bp.virage_passe(photo, 1000 + i, g), papier_coin, 2000 + i, g)
            os.makedirs(dossier, exist_ok=True)
            tirage.save(f_tirage, 'WEBP', quality=86, method=6)
            coins.save(f_coins, 'WEBP', quality=90, method=6)
            couleur = im.copy()                                   # la vraie photo, sans virage : jamais agrandie au-delà de l'original
            couleur.thumbnail((COTE_COULEUR, COTE_COULEUR), Image.LANCZOS)
            couleur.save(f_couleur, 'WEBP', quality=88, method=6)
            cache[id_] = cle
            faits.append(id_)
        contenu.append({'id': id_, 'orientation': orientation, 'taille': [pw, ph], 'ratio': round(g.CW / g.CH, 5), 'tirage': f'local/photos/{id_}/tirage',
                        'coins': f'local/photos/{id_}/coins', 'couleur': f'local/photos/{id_}/couleur', 'angle': angle})
        print(f"{id_:<10} {nom[:44]:<44} {orientation:<9} "
              f"{'cuit' if id_ in faits else 'à jour'} — {os.path.getsize(f_tirage) // 1024} Ko / {os.path.getsize(f_coins) // 1024} Ko")
    with open(CONTENU, 'w', encoding='utf-8') as f:
        json.dump(contenu, f, ensure_ascii=False, indent=2)
        f.write('\n')
    with open(CACHE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2)
        f.write('\n')
    nettoyer(set(choix))
    print(f"cécile : {len(contenu)} photo(s) locale(s), {len(faits)} cuite(s) · {os.path.relpath(CONTENU, PRIVE)}")
    return len(contenu)


def nettoyer(gardes):
    """Supprime les tirages d'emplacements qui ne sont plus dans choix.json (ils sortiraient dans le build local)."""
    racine = os.path.join(BAKED, 'photos')
    if not os.path.isdir(racine):
        return
    for d in os.listdir(racine):
        if re.fullmatch(r'cecile-\d+', d) and d not in gardes:
            shutil.rmtree(os.path.join(racine, d))


# ---------------------------------------------------------------------------------------------
# Planche contact

def police(taille):
    for chemin in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf',
                   '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(chemin):
            try:
                return ImageFont.truetype(chemin, taille)
            except OSError:
                pass
    return ImageFont.load_default(size=taille)


def tronquer(d, texte, fonte, largeur):
    if d.textlength(texte, font=fonte) <= largeur:
        return texte
    while len(texte) > 1 and d.textlength(texte + '…', font=fonte) > largeur:
        texte = texte[:-1]
    return texte + '…'


def premiere_image_video(chemin):
    """1re image d'une vidéo (ffmpeg, orientation d'affichage appliquée) pour la planche ; None si impossible."""
    ff = os.environ.get('GC_FFMPEG') or shutil.which('ffmpeg') or '/usr/bin/ffmpeg'
    r = subprocess.run([ff, '-v', 'error', '-nostdin', '-ss', '0.5', '-i', chemin, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'],
                       capture_output=True)
    if r.returncode != 0 or not r.stdout:
        r = subprocess.run([ff, '-v', 'error', '-nostdin', '-i', chemin, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True)
    if r.returncode != 0 or not r.stdout:
        return None
    import io
    return Image.open(io.BytesIO(r.stdout)).convert('RGB')


def planche():
    noms = lister_photos()
    videos = lister_photos(DOSSIER_VIDEOS, EXT_VIDEOS)
    if not noms and not videos:
        print('planche : prive/cecile/photos et prive/cecile/videos sont vides, rien à montrer.')
        return
    os.makedirs(BAKED, exist_ok=True)
    choix = lire_json(CHOIX, {})
    place = {}
    for id_, c in choix.items():
        if c.get('fichier'):
            n = trouver(c['fichier'], noms)
            if n:
                place.setdefault(('p', n), []).append(id_)
        if c.get('video'):
            n = trouver(c['video'], videos)
            if n:
                place.setdefault(('v', n), []).append(id_)
    # Ordre de l'album (choix.json), puis les médias non choisis, pour que les numéros parlent de l'album.
    elements = []
    for c in choix.values():
        for genre, cle, liste in (('p', 'fichier', noms), ('v', 'video', videos)):
            n = trouver(c[cle], liste) if c.get(cle) else None
            if n and (genre, n) not in elements:
                elements.append((genre, n))
    elements += [e for e in [('p', n) for n in noms] + [('v', n) for n in videos] if e not in elements]
    COLS, LIG = 6, 5
    VW, VH, ML, MH, BAS = 340, 255, 20, 20, 62
    CW, CH = VW + ML, VH + MH + BAS
    f_num, f_nom, f_pet = police(30), police(17), police(15)
    pages = [elements[k:k + PAR_PLANCHE] for k in range(0, len(elements), PAR_PLANCHE)]
    for p, groupe in enumerate(pages):
        lig = (len(groupe) + COLS - 1) // COLS
        feuille = Image.new('RGB', (COLS * CW + ML, lig * CH + MH + 44), (36, 30, 26))
        d = ImageDraw.Draw(feuille)
        d.text((ML, 12), f"Photos de Cécile — planche {p + 1}/{len(pages)} — {len(noms)} photo(s), {len(videos)} vidéo(s)",
               fill=(220, 205, 180), font=f_nom)
        for k, (genre, nom) in enumerate(groupe):
            num = p * PAR_PLANCHE + k + 1
            x0, y0 = ML + (k % COLS) * CW, 44 + (k // COLS) * CH
            chemin = os.path.join(DOSSIER_PHOTOS if genre == 'p' else DOSSIER_VIDEOS, nom)
            try:
                im = ouvrir(chemin) if genre == 'p' else premiere_image_video(chemin)
                if im is None:
                    raise ValueError('1re image illisible')
                dims = f"{im.width}×{im.height}" + ('' if genre == 'p' else ' (vidéo)')
                im.thumbnail((VW, VH), Image.LANCZOS)
            except Exception as e:  # média illisible : on le signale sur la planche
                im, dims = Image.new('RGB', (VW, VH), (90, 40, 40)), 'illisible'
                print(f"  ! {nom} : {e}")
            feuille.paste(im, (x0 + (VW - im.width) // 2, y0 + (VH - im.height) // 2))
            d.rectangle((x0, y0, x0 + 62, y0 + 40), fill=(20, 14, 10) if genre == 'p' else (70, 20, 20))
            d.text((x0 + 8, y0 + 3), f"{num:02d}", fill=(255, 235, 190), font=f_num)
            d.text((x0, y0 + VH + 6), tronquer(d, unicodedata.normalize('NFC', nom), f_nom, VW), fill=(240, 230, 210), font=f_nom)
            notes = [dims] + ([f"choisie pour {', '.join(place[(genre, nom)])}"] if (genre, nom) in place else [])
            d.text((x0, y0 + VH + 32), ' · '.join(notes), fill=(255, 205, 120) if (genre, nom) in place else (170, 155, 135), font=f_pet)
        sortie = os.path.join(BAKED, 'planche-cecile.png' if p == 0 else f'planche-cecile-{p + 1}.png')
        feuille.save(sortie)
        print('planche :', os.path.relpath(sortie, PRIVE))
    for p in range(len(pages) + 1, 20):                   # planches périmées
        vieux = os.path.join(BAKED, f'planche-cecile-{p}.png')
        if os.path.exists(vieux):
            os.remove(vieux)
    for k, (genre, nom) in enumerate(elements):
        print(f"{k + 1:3d}  {'[vidéo] ' if genre == 'v' else ''}{unicodedata.normalize('NFC', nom)}"
              + (f"   → {', '.join(place[(genre, nom)])}" if (genre, nom) in place else ''))


# ---------------------------------------------------------------------------------------------

def normaliser(entree, sortie, maxi=4000):
    """Photo d'invité prête pour ffmpeg : RGB, orientation appliquée, HEIC converti, côté ≤ maxi, JPEG."""
    im = ouvrir(entree)
    im.thumbnail((maxi, maxi), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(sortie)), exist_ok=True)
    im.save(sortie, 'JPEG', quality=93)
    print(f"{im.width}x{im.height}")


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['cuire']:
        cuire(force='--force' in a)
    elif a[:1] == ['planche']:
        planche()
    elif a[:1] == ['normaliser'] and len(a) >= 3:
        normaliser(a[1], a[2], int(a[a.index('--max') + 1]) if '--max' in a else 4000)
    else:
        sys.exit(__doc__)
