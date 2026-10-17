// Traînée d'étincelles dorées de la main invisible (tourne-page au clavier) : un seul canvas posé sur
// l'écran le temps du geste (un calque), des points de lumière qui naissent sous la main, scintillent,
// retombent doucement et s'éteignent. Le canvas disparaît avec la dernière étincelle.

interface Etincelle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ne: number;
  vie: number;
  r: number;
  phase: number;
}

let lueur: HTMLCanvasElement | null = null;
/** Un point de lumière dorée, dessiné une fois (dégradé radial). */
function sprite(): HTMLCanvasElement {
  if (lueur) return lueur;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.18, 'rgba(255,214,120,0.95)');
  g.addColorStop(0.5, 'rgba(240,170,60,0.35)');
  g.addColorStop(1, 'rgba(240,160,40,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  lueur = c;
  return c;
}

export interface Trainee {
  /** La main est en (x, y) (px d'écran) ; force 0..1 : combien d'étincelles naissent. */
  ajouter(x: number, y: number, force: number): void;
  /** Plus rien ne naît ; le canvas s'en va quand la dernière étincelle s'éteint. */
  finir(): void;
}

export function traineeDoree(): Trainee {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:60`;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const pts: Etincelle[] = [];
  let main: { x: number; y: number } | null = null;
  let fini = false;
  let raf = 0;
  let avant = performance.now();

  const image = (now: number) => {
    const dt = Math.min(0.05, (now - avant) / 1000);
    avant = now;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const s = sprite();
    if (main && !fini) {
      // le halo de la main elle-même
      ctx.globalAlpha = 0.32;
      ctx.drawImage(s, main.x - 26, main.y - 26, 52, 52);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      const age = (now - p.ne) / p.vie;
      if (age >= 1) {
        pts.splice(i, 1);
        continue;
      }
      p.vy += 38 * dt; // retombe doucement
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const scintille = 0.65 + 0.35 * Math.sin(p.phase + now / 55);
      ctx.globalAlpha = (1 - age) * (1 - age) * scintille;
      const r = p.r * (1 - 0.4 * age) * 4;
      ctx.drawImage(s, p.x - r, p.y - r, 2 * r, 2 * r);
    }
    if (fini && !pts.length) {
      cv.remove();
      return;
    }
    raf = requestAnimationFrame(image);
  };
  raf = requestAnimationFrame(image);

  return {
    ajouter(x, y, force) {
      if (fini) return;
      main = { x, y };
      const n = Math.round(1 + 3 * force);
      const now = performance.now();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 12 + Math.random() * 34;
        pts.push({
          x: x + (Math.random() - 0.5) * 14,
          y: y + (Math.random() - 0.5) * 14,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 18,
          ne: now,
          vie: 550 + Math.random() * 650,
          r: 1 + Math.random() * 2.2,
          phase: Math.random() * 6.3,
        });
      }
    },
    finir() {
      fini = true;
      if (!pts.length) {
        cancelAnimationFrame(raf);
        cv.remove();
      }
    },
  };
}
