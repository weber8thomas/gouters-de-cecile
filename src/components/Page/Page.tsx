import React from 'react';
import './Page.css';

export interface PageProps {
  /** Côté de la double page : fixe de quel côté se trouve la marge de reliure. */
  side: 'left' | 'right';
  children?: React.ReactNode;
  /** 'normal' (par défaut) : marges du carnet, zone utile 760×888. 'none' : pleine page. */
  pad?: 'normal' | 'none';
  className?: string;
}

// Boîte de contenu d'une page du carnet : marges des tokens (extérieur, reliure, haut, bas),
// colonne flex. Si le contenu déborde, data-gc-fit="overflow" + classe gc-page--overflow
// (contour pointillé confiture) : on raccourcit alors le texte, on ne réduit jamais la taille.
export function Page({ side, children, pad = 'normal', className }: PageProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const over = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      setOverflow((prev) => (prev === over ? prev : over));
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    // La page a une taille fixe : on observe aussi ses enfants, dont la taille suit le contenu.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    let alive = true;
    document.fonts?.ready.then(() => alive && check());
    return () => { alive = false; ro.disconnect(); };
  });

  const cls = ['gc-page', `gc-page--${side}`, pad === 'none' && 'gc-page--bleed', overflow && 'gc-page--overflow', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={ref} className={cls} data-gc-fit={overflow ? 'overflow' : 'ok'}>
      {children}
    </div>
  );
}
