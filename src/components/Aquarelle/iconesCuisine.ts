/** Petits tracés à l'encre, communs au carnet et au mode cuisine. */
export type IconeCuisine = 'precedent'|'suivant'|'auto'|'etapes'|'rejouer'|'fermer'|'agrandir'|'ingredients';
const TRACES:Record<IconeCuisine,string>={
 precedent:'M28 8 Q19 17 10 23 Q18 29 28 38 M11 23 Q25 21 39 23',
 suivant:'M18 8 Q27 17 36 23 Q28 29 18 38 M35 23 Q21 21 7 23',
 auto:'M17 9 Q28 16 37 23 Q28 31 17 37 Q19 23 17 9Z',
 etapes:'M15 10 L15 36 M29 10 L29 36 M8 40 Q22 38 37 40',
 rejouer:'M12 15 C24 2 43 15 36 30 C30 44 9 39 9 25 M10 7 L11 17 L22 15',
 fermer:'M12 11 Q23 23 34 35 M34 11 Q23 24 12 35',
 agrandir:'M8 19 L9 8 L20 9 M28 9 L39 8 L38 20 M38 28 L39 39 L28 38 M20 38 L8 39 L9 28',
 ingredients:'M8 11 L12 15 L18 7 M23 12 L39 11 M8 26 L12 30 L18 22 M23 27 L39 26 M8 40 L18 39 M23 40 L39 39',
};
export const iconeCuisine=(nom:IconeCuisine)=>`<svg viewBox="0 0 46 46" aria-hidden="true" focusable="false"><path d="${TRACES[nom]}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
