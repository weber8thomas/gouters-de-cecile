#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Interprétations numériques reproductibles, sans enregistrement commercial.
Python3 + libfluidsynth3 + numpy + ffmpeg ; partition et banque sonores dans sources/musique.
La Gymnopédie joue les 39 premières mesures de la source Mutopia domaine public.
La fantaisie Casse-Noisette est un arrangement court pour célesta/piano du thème de la fée Dragée.
"""
import ctypes as C
import ctypes.util
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'design-system/sources/musique/interpretations'
OUT=ROOT/'design-system/baked/musique'
SR=44100
F=C.CDLL(ctypes.util.find_library('fluidsynth'))
def bind(name, restype, args):
 fn=getattr(F,name); fn.restype=restype; fn.argtypes=args; return fn
ptr=C.c_void_p; I=C.c_int; S=C.c_char_p
newsettings=bind('new_fluid_settings',ptr,[])
setnum=bind('fluid_settings_setnum',I,[ptr,S,C.c_double])
setint=bind('fluid_settings_setint',I,[ptr,S,I])
newsynth=bind('new_fluid_synth',ptr,[ptr])
loadfont=bind('fluid_synth_sfload',I,[ptr,S,I])
program=bind('fluid_synth_program_change',I,[ptr,I,I])
on=bind('fluid_synth_noteon',I,[ptr,I,I,I]); off=bind('fluid_synth_noteoff',I,[ptr,I,I]); cc=bind('fluid_synth_cc',I,[ptr,I,I,I])
write=bind('fluid_synth_write_float',I,[ptr,I,ptr,I,I,ptr,I,I])
deletesynth=bind('delete_fluid_synth',None,[ptr]); deletesettings=bind('delete_fluid_settings',None,[ptr])
# Le corps commun de la partition, puis sa première terminaison : mélodie complète de ce volet.
TOP=['r2.']*4+['r4 fis a','g fis cis','b cis d','a2.','fis2.~','fis2.~','fis2.~','fis2.','r4 fis\' a','g fis cis','b cis d','a2.','cis2.','fis2.','e,2.~','e2.~','e2.','a4 b c','e d b','d c b','d2.~','d2 d4','e f g','a c, d','e d b','d2.~','d2 d4','g2.','fis2.','b,4 a b','cis d e','cis d e','fis,2.','<c\' a e c>2.','<d a fis d>2.']
MID=['r4 <fis d b>2','r4 <fis cis a>2']*8+['r4 <fis cis a>2','r4 <fis d b>2','r4 <b, g>2','r4 <g\' d b>2','r4 <d a f>2','r4 <e c a>2','r4 <e b g>2','r4 <e b g d>2','r4 <d a e c>2','r4 <d a fis c>2','r4 <f c a>2','r4 <e c a>2','r4 <e b g d>2','r4 <d a e c>2','r4 <d a fis c>2','r4 <g e b>2','r4 <fis cis a>2','r4 <fis d b>2','r4 <a\' e cis>2','r4 <a fis cis a>2','r4 <d a>4 <g d b>','r2.','r2.']
BASS=['g2.','d2.']*8+['fis2.','b,2.','e2.','e2.','d2.','a2.']+['d2.']*9+['e2.','fis2.','b,2.','e2.','e2.','e2.','<g\' a,>2.','<d a d,>2.']
LETTERS='cdefgab'; SEMI=[0,2,4,5,7,9,11]
def pitch(s,previous):
 m=re.fullmatch(r'([a-g])(is|es)?([,\']*)',s); letter,acc,marks=m.groups(); d=LETTERS.index(letter)
 octave=round((previous-d)/7); pos=octave*7+d
 while pos-previous>3: pos-=7
 while previous-pos>3: pos+=7
 pos+=7*(marks.count("'")-marks.count(','))
 return 12*(pos//7+1)+SEMI[d]+(1 if acc=='is' else -1 if acc=='es' else 0),pos

def voice(bars,anchor,channel,velocity):
 out=[]; prev=anchor; duration=1.; beat=0.; tied=None
 for bi,bar in enumerate(bars):
  tokens=re.findall(r'<[^>]+>(?:\d+\.?|)(?:~|)|[a-grs](?:is|es)?[,\']*(?:\d+\.?|)(?:~|)',bar)
  startbar=beat
  for token in tokens:
   tie=token.endswith('~'); token=token.rstrip('~'); d=re.search(r'(\d+)(\.)?$',token)
   if d: duration=4/int(d[1])*(1.5 if d[2] else 1); token=token[:d.start()]
   if token[0] in 'rs': beat+=duration; continue
   notes=token[1:-1].split() if token.startswith('<') else [token]
   pitches=[]; cursor=prev
   for n in notes:
    p,cursor=pitch(n,cursor); pitches.append(p)
   _,prev=pitch(notes[0],prev)
   for p in pitches:
    if tied is not None and out[tied][2]==p: out[tied][1]+=duration
    else: out.append([beat,duration,p,channel,velocity+int(3*math.sin(bi*.65))]); tied=len(out)-1
   if not tie: tied=None
   beat+=duration
  if abs(beat-startbar-3)>.001: raise ValueError(f'mesure {bi+1} durée {beat-startbar}: {bar}')
 return out

def gymnopedie():
 assert len(TOP)==len(MID)==len(BASS)==39,(len(TOP),len(MID),len(BASS))
 events=voice(TOP,7*5,0,61)+voice(MID,7*4,1,43)+voice(BASS,7*3,2,47)
 # Temps respiré ; une légère retenue aux cadences, sans casser les trois temps de danse.
 def seconds(beat):
  s=0.
  for i in range(int(beat)):
   bar=i//3; s+=1.015+0.018*math.sin(bar*.58)+(0.08 if bar in [7,15,30,37,38] else 0)
  bar=int(beat)//3
  return .3+s+(beat-int(beat))*(1.015+0.018*math.sin(bar*.58)+(0.08 if bar in [7,15,30,37,38] else 0))
 return events,seconds,117,[(0,0),(1,0),(2,0)],True

# Thème original de l'œuvre de1892, avec développement et réponses au piano.
# Vérification des hauteurs/rythmes de la mélodie uniquement (éléments de l'œuvre originale) :
# https://github.com/Johnxjp/sugar-plum-fairy-rendition/score/Dance_of_the_sugar_plum_fairy.mxl
# Aucun fichier MusicXML, accompagnement ou enregistrement de ce dépôt n'est redistribué.
# Hauteurs explicites, durées en noires : aucune banque MIDI sans provenance n'est utilisée.
def casse_noisette():
 # Mélodie originale (mesures5–20), hauteurs de concert. Les silences et les doubles
 # croches sont conservés ; l'accompagnement et les réponses sont ceux de cette fantaisie.
 A=[(None,.5),(91,.25),(88,.25),(91,.5),(90,.5),(87,.5),(88,.5),(86,.25),(86,.25),(86,.5),(85,.25),(85,.25),(85,.5),(84,.25),(84,.25),(84,.5),(83,.25),(88,.25),(84,.25),(88,.25),(83,.5),(None,.5)]
 B=[(None,.5),(79,.25),(76,.25),(79,.5),(78,.5),(84,.5),(83,.5),(91,.25),(91,.25),(91,.5),(90,.25),(90,.25),(90,.5),(88,.25),(88,.25),(88,.5),(87,.25),(90,.25),(88,.25),(90,.25),(87,.5),(None,.5)]
 Ctheme=[(None,.5),(76,.25),(73,.25),(76,.5),(75,.5),(None,.5),(74,.25),(71,.25),(74,.5),(73,.5),(None,.5),(72,.25),(69,.25),(72,.5),(71,.5),(None,.5),(71,.125),(75,.125),(78,.125),(83,.125),(76,.5),(59,.5)]
 events=[]; beat=0
 # Intro pizzicato, puis 3 volets et une petite coda : ~2 minutes, pas une boucle de quatre notes.
 sections=[None,None,A,B,A,Ctheme,A,B,A,Ctheme,B,A,A,B]
 for si,theme in enumerate(sections):
  for k in range(8):
   harmonie=[(40,[55,59,64]),(47,[54,57,63]),(49,[55,58,64]),(40,[55,59,64])]
   if theme is Ctheme: harmonie=[(42,[58,61,64]),(40,[56,59,62]),(38,[54,57,60]),(47,[54,57,63])]
   root,chord=harmonie[k//2]
   events.append([beat+k,.23,root,2,42+(k%2)*5]); events.append([beat+k+.5,.23,root+12,2,39])
   if si>=2:
    if k%2==1:
     for p in chord: events.append([beat+k,.52,p,1,34+(si%3)*2])
  if theme:
   cursor=beat
   for j,(p,d) in enumerate(theme):
    # Célesta principal, réponses de piano une octave plus bas au deuxième volet.
    ch=0 if si%4!=3 else 1
    if p is not None: events.append([cursor,d*.8,p if ch==0 else p-12,ch,60+int(7*math.sin(j*.45+si*.3))])
    cursor+=d
  beat+=8
 for p in [40,52,59,64,76]: events.append([beat,4,p,1 if p<70 else 0,44])
 def seconds(t): return .25+t*60/62+0.012*math.sin(t*math.pi/4)
 return events,seconds,beat+4,[(0,8),(1,0),(2,45)],False

def render(name,data):
 events,seconds,end,programs,pedal=data
 settings=newsettings(); setnum(settings,b'synth.sample-rate',SR); setnum(settings,b'synth.gain',.35)
 setnum(settings,b'synth.reverb.room-size',.65); setnum(settings,b'synth.reverb.damp',.45); setnum(settings,b'synth.reverb.level',.2)
 setint(settings,b'synth.chorus.active',0); synth=newsynth(settings)
 if loadfont(synth,str(SRC/'TimGM6mb.sf2').encode(),1)<0: raise RuntimeError('soundfont')
 for ch,prg in programs: program(synth,ch,prg)
 schedule=[]
 for i,(beat,duration,note,ch,vel) in enumerate(events):
  # Infime désynchronisation des mains : 5 ms, hauteur et rythme de la partition conservés.
  t=seconds(beat)+(0.005 if ch==1 else 0)
  schedule.append((round(t*SR),'on',ch,int(note),int(vel)))
  schedule.append((round((seconds(beat+duration)-(.025 if pedal else 0))*SR),'off',ch,int(note),0))
 if pedal:
  for bar in range(39):
   for ch in [0,1,2]:
    schedule.append((round(seconds(bar*3)*SR),'cc',ch,64,0))
    schedule.append((round((seconds(bar*3)+.04)*SR),'cc',ch,64,100))
  for ch in [0,1,2]: schedule.append((round(seconds(end)*SR),'cc',ch,64,0))
 schedule.sort(key=lambda e:e[0]); total=round((seconds(end)+4)*SR); audio=np.zeros((total,2),np.float32); cursor=0
 def fill(stop):
  nonlocal cursor
  while cursor<stop:
   n=min(8192,stop-cursor); left=np.empty(n,np.float32); right=np.empty(n,np.float32)
   write(synth,n,left.ctypes.data,0,1,right.ctypes.data,0,1); audio[cursor:cursor+n,0]=left; audio[cursor:cursor+n,1]=right; cursor+=n
 for frame,kind,ch,note,vel in schedule:
  fill(min(total,max(0,frame)))
  if kind=='on': on(synth,ch,note,vel)
  elif kind=='off': off(synth,ch,note)
  else: cc(synth,ch,note,vel)
 fill(total); deletesynth(synth); deletesettings(settings)
 OUT.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='gc-classique-') as temp:
  raw=Path(temp)/'source.f32'; audio.tofile(raw)
  cmd=['ffmpeg','-hide_banner','-nostdin','-y','-loglevel','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw),'-af',f'loudnorm=I=-26:LRA=20:TP=-3,afade=t=in:d=0.25,afade=t=out:st={total/SR-2}:d=2','-ar',str(SR),'-c:a','libmp3lame','-b:a','96k',str(OUT/f'{name}.mp3')]
  subprocess.run(cmd,check=True)
 return round(total/SR,2)
if __name__=='__main__':
 for name,data in [('gymnopedie-piano',gymnopedie()),('casse-noisette-celesta',casse_noisette())]:
  d=render(name,data); print(name,d,hashlib.sha256((OUT/f'{name}.mp3').read_bytes()).hexdigest(),flush=True)
 metadata=json.loads((SRC/'banque.json').read_text())
 bank=json.loads((OUT/'banque.json').read_text())
 ids={m['id'] for m in metadata['morceaux']}
 bank['morceaux']=[m for m in bank['morceaux'] if m['id'] not in ids]+metadata['morceaux']
 ordre=['path-of-the-goblin-king','gymnopedie-piano','melodie-victoria','casse-noisette-celesta','frozen-star']
 bank['morceaux'].sort(key=lambda m:ordre.index(m['id']) if m['id'] in ordre else 100)
 (OUT/'banque.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n')
