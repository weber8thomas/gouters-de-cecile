// Caméra du carnet : cran de distance (proche / moyenne / loin, mises en page validées) et zoom fin
// (0,95–1,05, pure transformation). Réglage au clavier le jour J, mémorisé dans le navigateur.
//
//   <CameraProvider keyboard>          ← fournit l'état et écoute le clavier
//     <Stage distance={camera.distance}> … <Camera> (B1) applique scale(zoom) avec un ressort
//
// Touches (lues sur event.key, compatibles AZERTY et pavé numérique) :
//   + ou =  → cran suivant (plus proche)      - → cran précédent (plus loin)
//   Alt + « + » / « - », ou ↑ / ↓ → zoom fin ±0,01 ;  0 → zoom fin remis à 1
import React from 'react';
import { DEFAULT_SETTINGS, DISTANCES, type Distance } from './settings';

export const ZOOM_MIN = 0.95;
export const ZOOM_MAX = 1.05;
export const ZOOM_STEP = 0.01;
const STORAGE_KEY = 'gc:camera:v1';

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

const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
export const CAMERA_DEFAULT: CameraState = { distance: DEFAULT_SETTINGS.distance, zoom: 1 };

function load(): CameraState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return CAMERA_DEFAULT;
    const v = JSON.parse(raw);
    return {
      distance: DISTANCES.includes(v.distance) ? v.distance : CAMERA_DEFAULT.distance,
      zoom: typeof v.zoom === 'number' ? clampZoom(v.zoom) : 1,
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

/** Traduit une touche en action caméra, ou null. Exporté pour les tests. */
export function cameraKey(e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>): { kind: 'distance' | 'zoom' | 'reset'; dir: 1 | -1 } | null {
  if (e.ctrlKey || e.metaKey) return null; // laisser le zoom du navigateur tranquille
  const plus = e.key === '+' || e.key === '=' || e.key === 'Add';
  const minus = e.key === '-' || e.key === '_' || e.key === 'Subtract';
  if (e.key === 'ArrowUp') return { kind: 'zoom', dir: 1 };
  if (e.key === 'ArrowDown') return { kind: 'zoom', dir: -1 };
  if (e.key === '0') return { kind: 'reset', dir: 1 };
  if (plus) return { kind: e.altKey ? 'zoom' : 'distance', dir: 1 };
  if (minus) return { kind: e.altKey ? 'zoom' : 'distance', dir: -1 };
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
    setDistance: (d) => update((s) => ({ ...s, distance: d })),
    stepDistance: (dir) => update((s) => {
      // +1 = plus proche : moyenne → proche ; −1 = plus loin : moyenne → loin
      const i = DISTANCES.indexOf(s.distance) - dir;
      return { ...s, distance: DISTANCES[Math.min(DISTANCES.length - 1, Math.max(0, i))] };
    }),
    setZoom: (z) => update((s) => ({ ...s, zoom: clampZoom(z) })),
    stepZoom: (dir) => update((s) => ({ ...s, zoom: clampZoom(s.zoom + dir * ZOOM_STEP) })),
  }), [state, changedAt, update, fixed]);

  React.useEffect(() => {
    if (!keyboard || fixed) return;
    const onKey = (e: KeyboardEvent) => {
      const a = cameraKey(e);
      if (!a) return;
      e.preventDefault();
      if (a.kind === 'distance') api.stepDistance(a.dir);
      else if (a.kind === 'zoom') api.stepZoom(a.dir);
      else api.setZoom(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, fixed, api]);

  return <CameraContext.Provider value={api}>{children}</CameraContext.Provider>;
}
