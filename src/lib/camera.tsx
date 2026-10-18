// Caméra du carnet : cran de distance (proche / moyenne / loin) et zoom fin (pure transformation,
// bornes propres à chaque cran : voir zoomBornes). Cran et zoom fin se règlent dans le menu ⚙ et sont
// mémorisés ; le clavier règle la LOUPE (plan v4, CONTRACT § 13.1, src/lib/loupe.ts).
//
//   <CameraProvider keyboard>          ← fournit l'état et écoute le clavier
//     <Stage distance={camera.distance}> … <Camera> (B1) applique scale(zoom) avec un ressort
//
// Touches (lues sur event.key, compatibles AZERTY et pavé numérique) :
//   + ou =  → loupe : palier suivant (1 · 1,5 · 2 · 3)      - → palier précédent
//   Alt + « + » / « - » → zoom fin ±0,01 ;  0 → loupe à 1× et zoom fin remis à 1
//   (les crans de distance ne se règlent plus que dans le menu ; ↑ / ↓ sont au feuillet volant.)
import React from 'react';
import { motionValue } from './motion';
import { DEFAULT_SETTINGS, DISTANCES, type Distance } from './settings';
import { demanderLoupe, loupeVisee, palierVoisin } from './loupe';

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.15;
export const ZOOM_STEP = 0.01;

/**
 * Bornes du zoom fin pour un cran : en bas (0,6), le livre rétrécit pour laisser voir la table autour
 * de lui ; en haut, le livre entier reste visible dans la scène 1920 × 1080 (maxima inchangés).
 */
export function zoomBornes(d: Distance): [number, number] {
  return d === 'proche' ? [0.6, 1.08] : d === 'moyenne' ? [0.6, 1.12] : [0.6, 1.15];
}
// v2 : le zoom par défaut passe à 0,95 et le plancher à 0,6 ; l'ancien réglage (v1) n'est plus relu.
// v3 : le zoom par défaut revient à 1, l'échelle de l'éclairage tracé (scripts/lumiere3d : le livre y est
// rendu à 1) ; l'ancien réglage (v2, écrit à 0,95 dès la première visite au toucher) n'est plus relu.
const STORAGE_KEY = 'gc:camera:v3';

export interface CameraState {
  distance: Distance;
  zoom: number;
}

export interface CameraApi extends CameraState {
  setDistance: (d: Distance) => void;
  /** +1 = plus proche, −1 = plus loin */
  stepDistance: (dir: 1 | -1) => void;
  setZoom: (z: number) => void;
  stepZoom: (dir: 1 | -1) => void;
  /** Dernier changement (pour afficher le repère qui s'efface) : horodatage ms, 0 au départ. */
  changedAt: number;
}

const clampZoom = (z: number, d?: Distance) => {
  const [lo, hi] = d ? zoomBornes(d) : [ZOOM_MIN, ZOOM_MAX];
  return Math.round(Math.min(hi, Math.max(lo, z)) * 100) / 100;
};
export const CAMERA_DEFAULT: CameraState = { distance: DEFAULT_SETTINGS.distance, zoom: 1 };

/**
 * Zoom fin du livre tel qu'il est à l'écran, ressort compris (tenu à jour par la caméra du livre,
 * src/components/Livre/Camera.tsx) : les calques tracés du livre le suivent (src/components/Lumiere).
 */
export const zoomLivre = motionValue(1);

function load(): CameraState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return CAMERA_DEFAULT;
    const v = JSON.parse(raw);
    return {
      distance: DISTANCES.includes(v.distance) ? v.distance : CAMERA_DEFAULT.distance,
      zoom: typeof v.zoom === 'number' ? clampZoom(v.zoom, DISTANCES.includes(v.distance) ? v.distance : CAMERA_DEFAULT.distance) : CAMERA_DEFAULT.zoom,
    };
  } catch {
    return CAMERA_DEFAULT;
  }
}
function save(s: CameraState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible (aperçu, navigation privée) : le réglage reste en mémoire */
  }
}

const noop = () => {};
export const CameraContext = React.createContext<CameraApi>({
  ...CAMERA_DEFAULT, setDistance: noop, stepDistance: noop, setZoom: noop, stepZoom: noop, changedAt: 0,
});
export const useCamera = () => React.useContext(CameraContext);

/** Traduit une touche en action : palier de loupe, zoom fin (Alt) ou remise à 1, ou null. Exporté pour les tests. */
export function cameraKey(e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'> & { code?: string }): { kind: 'loupe' | 'zoom' | 'reset'; dir: 1 | -1 } | null {
  if (e.ctrlKey || e.metaKey) return null; // laisser le zoom du navigateur tranquille
  // Avec Alt, macOS change le caractère (≠, –) : la touche physique fait foi.
  const plus = e.key === '+' || e.key === '=' || e.key === 'Add' || (e.altKey && (e.code === 'Equal' || e.code === 'NumpadAdd'));
  const minus = e.key === '-' || e.key === '_' || e.key === 'Subtract' || (e.altKey && (e.code === 'Minus' || e.code === 'NumpadSubtract'));
  if (e.key === '0' && !e.altKey) return { kind: 'reset', dir: 1 };
  if (plus) return { kind: e.altKey ? 'zoom' : 'loupe', dir: 1 };
  if (minus) return { kind: e.altKey ? 'zoom' : 'loupe', dir: -1 };
  return null;
}

export interface CameraProviderProps {
  children?: React.ReactNode;
  /** Écoute le clavier (application de la fête, carte « Carnet »). */
  keyboard?: boolean;
  /** Mémorise le réglage dans le navigateur. */
  persist?: boolean;
  /** État imposé (aperçus figés du design system) : désactive clavier et mémoire. */
  fixed?: Partial<CameraState>;
}

export function CameraProvider({ children, keyboard = false, persist = true, fixed }: CameraProviderProps) {
  const [state, setState] = React.useState<CameraState>(() => (fixed ? { ...CAMERA_DEFAULT, ...fixed } : persist ? load() : CAMERA_DEFAULT));
  const [changedAt, setChangedAt] = React.useState(0);
  const update = React.useCallback((next: (s: CameraState) => CameraState) => {
    setState((s) => {
      const n = next(s);
      if (n.distance === s.distance && n.zoom === s.zoom) return s;
      if (persist && !fixed) save(n);
      return n;
    });
    setChangedAt(Date.now());
  }, [persist, fixed]);

  const api = React.useMemo<CameraApi>(() => ({
    ...(fixed ? { ...CAMERA_DEFAULT, ...fixed } : state),
    changedAt,
    setDistance: (d) => update((s) => ({ distance: d, zoom: clampZoom(s.zoom, d) })),
    stepDistance: (dir) => update((s) => {
      // +1 = plus proche : moyenne → proche ; −1 = plus loin : moyenne → loin
      const i = DISTANCES.indexOf(s.distance) - dir;
      const d = DISTANCES[Math.min(DISTANCES.length - 1, Math.max(0, i))];
      return { distance: d, zoom: clampZoom(s.zoom, d) };
    }),
    setZoom: (z) => update((s) => ({ ...s, zoom: clampZoom(z, s.distance) })),
    stepZoom: (dir) => update((s) => ({ ...s, zoom: clampZoom(s.zoom + dir * ZOOM_STEP, s.distance) })),
  }), [state, changedAt, update, fixed]);

  React.useEffect(() => {
    if (!keyboard || fixed) return;
    const onKey = (e: KeyboardEvent) => {
      const a = cameraKey(e);
      if (!a) return;
      e.preventDefault();
      if (a.kind === 'loupe') demanderLoupe(palierVoisin(loupeVisee(), a.dir));
      else if (a.kind === 'zoom') api.stepZoom(a.dir);
      else {
        api.setZoom(1);
        demanderLoupe(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, fixed, api]);

  return <CameraContext.Provider value={api}>{children}</CameraContext.Provider>;
}
