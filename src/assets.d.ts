// Les SVG sont importés comme texte brut (Vite : plugin svg-raw ; esbuild : loader « text »).
declare module '*.svg' {
  const markup: string;
  export default markup;
}
// Les textures sont importées comme URL (Vite) ou data URI (esbuild).
declare module '*.webp' {
  const url: string;
  export default url;
}
declare module '*.png' {
  const url: string;
  export default url;
}
