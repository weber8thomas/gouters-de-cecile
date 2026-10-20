import React from 'react';

/** Un peu de farine sur une page : dessin uniquement au montage et sous le doigt, aucune horloge. */
export function FarineCachette({ actif, decouvrir }: { actif: boolean; decouvrir: () => void }) {
  const toile = React.useRef<HTMLCanvasElement>(null);
  const geste = React.useRef<{ id: number; x: number; y: number; bouge: boolean } | null>(null);
  const efface = React.useRef(new Set<number>());
  const termine = React.useRef(false);
  const colonnes = 24, lignes = 18, largeur = 384, hauteur = 288;
  const utiles = React.useMemo(() => {
    const cellules: number[] = [];
    for (let y = 0; y < lignes; y++) for (let x = 0; x < colonnes; x++) {
      if (((x + .5) / colonnes - .5) ** 2 / .48 ** 2 + ((y + .5) / lignes - .5) ** 2 / .45 ** 2 < 1) cellules.push(y * colonnes + x);
    }
    return cellules;
  }, []);
  React.useEffect(() => {
    const ctx = toile.current?.getContext('2d'); if (!ctx) return;
    let graine = 1249;
    const hasard = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    ctx.clearRect(0, 0, largeur, hauteur);
    ctx.fillStyle = '#f3e8cf';
    // Contour irrégulier, sans rectangle numérique ni effet lumineux.
    for (let n = 0; n < 580; n++) {
      const angle = hasard() * Math.PI * 2, distance = Math.sqrt(hasard());
      const x = largeur * (.5 + Math.cos(angle) * distance * .42);
      const y = hauteur * (.5 + Math.sin(angle) * distance * .39);
      ctx.globalAlpha = .09 + hasard() * .26;
      ctx.beginPath(); ctx.arc(x, y, 5 + hasard() * 19, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, []);
  React.useEffect(() => { if (!actif) geste.current = null; }, [actif]);
  const reveler = () => { if (termine.current || !actif || document.hidden) return; termine.current = true; decouvrir(); };
  const balayer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!actif || document.hidden || termine.current) return;
    const canvas = e.currentTarget, r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const precedent = geste.current;
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 76; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo((precedent?.x ?? x) * largeur, (precedent?.y ?? y) * hauteur); ctx.lineTo(x * largeur, y * hauteur); ctx.stroke();
    const debutX = precedent?.x ?? x, debutY = precedent?.y ?? y;
    const pas = Math.max(1, Math.ceil(Math.hypot((x - debutX) * colonnes, (y - debutY) * lignes) * 2));
    for (let n = 0; n <= pas; n++) {
      const px = debutX + (x - debutX) * n / pas, py = debutY + (y - debutY) * n / pas;
      for (const i of utiles) {
        const cx = (i % colonnes + .5) / colonnes, cy = (Math.floor(i / colonnes) + .5) / lignes;
        if (((cx - px) * largeur) ** 2 + ((cy - py) * hauteur) ** 2 < 38 ** 2) efface.current.add(i);
      }
    }
    if (precedent) {
      if (Math.hypot(x - precedent.x, y - precedent.y) > .004) precedent.bouge = true;
      precedent.x = x; precedent.y = y;
    }
    if (efface.current.size / utiles.length >= .38) reveler();
  };
  return <canvas ref={toile} width={largeur} height={hauteur} className="gc-secrets__farine" aria-hidden="true"
    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (!actif || document.hidden) return; e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); geste.current = { id: e.pointerId, x: (e.clientX-r.left)/r.width, y: (e.clientY-r.top)/r.height, bouge: false }; balayer(e); }}
    onPointerMove={(e) => { if (geste.current?.id !== e.pointerId) return; e.stopPropagation(); balayer(e); }}
    onPointerUp={(e) => { e.stopPropagation(); const g = geste.current; if (g?.id !== e.pointerId) return; geste.current = null; if (!g.bouge) reveler(); }}
    onPointerCancel={() => { geste.current = null; }} onClick={(e) => e.stopPropagation()}/>;
}
