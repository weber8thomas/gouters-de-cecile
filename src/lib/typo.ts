// Typographie française : espaces insécables là où le français les demande, pour éviter
// qu'un « ! » ou un « 180 °C » se retrouve seul en début de ligne sur la TV.
const NBSP = ' '; // espace insécable
const NNBSP = ' '; // espace fine insécable

export function frTypo(s: string): string {
  return s
    .replace(/ ([;!?])/g, `${NNBSP}$1`) // fine insécable avant ; ! ?
    .replace(/ :/g, `${NBSP}:`) // insécable avant :
    .replace(/« /g, `«${NBSP}`)
    .replace(/ »/g, `${NBSP}»`)
    .replace(/([0-9½¼¾]) /g, `$1${NBSP}`) // une quantité reste avec son unité : « 200 g », « 3 œufs », « 180 °C »
    .replace(/\bth\. /g, `th.${NBSP}`)
    .replace(/\bc\. à ([sc])\./g, `c.${NBSP}à${NBSP}$1.`); // « 1 c. à s. »
}
