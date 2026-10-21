# Navigation du carnet

Deux signets dans le calque des contrôles de l’écran : **Sommaire** (`T`) et **Rechercher** (`/`). `S` reste réservé aux notes en marge, `M` aux réglages.

La recherche combine les mots saisis, ignore la casse et les accents, et parcourt les auteurs, titres et textes cuits, y compris les ingrédients des feuilles de suite. Les résultats suivent les doubles pages effectivement disponibles ; auteurs et folios viennent du contenu et du manifeste.

Dans la fiche : `↑` / `↓` choisissent un résultat, `Entrée` l’ouvre, `Tab` reste dans la fiche, `Échap` la referme et rend le focus au contrôle précédent. Les touches de la fiche ne tournent pas les pages.

```tsx
<NavigationCarnet spreads={spreads} onAller={aller} />
```

`onAller` reçoit l’index dans `spreads`. Le sommaire est identifié par son type ou son id, sans numéro de folio imposé.
