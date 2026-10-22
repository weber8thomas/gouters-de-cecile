// En-têtes de la version partagée : une seule source pour dist/partage/_headers (Cloudflare Pages) et pour le service
// worker, qui les pose sur la page du carnet qu'il fabrique lui-même (une réponse de service worker ne reçoit pas
// les en-têtes de l'hébergeur).
//
// CSP : tout vient de la même origine (JS, CSS, polices, images, médias passent par le service worker). « blob: » et
// « data: » pour les images/sons décodés et les canvas ; style en ligne (attributs style de React, <style> du carnet) ;
// aucun script en ligne, aucun eval, aucun domaine tiers.
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

export const PERMISSIONS = 'accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), browsing-topics=()';

/** Pour une page (chargeur ou carnet). */
export const ENTETES_PAGE = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': PERMISSIONS,
};
