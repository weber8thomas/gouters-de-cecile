# PetitMot

Le petit mot d'un invité pour Cécile, écrit au stylo en bas de la page et signé de son prénom, avec un petit cœur ; trois points roses le séparent de la recette au-dessus.

## Quand l'utiliser

- En bas de la page de droite d'une page vidéo, sous la `Recette`.
- Partout où le mot personnel d'un invité accompagne sa recette (page sans vidéo, double page à deux recettes).
- Pas pour une légende de photo ni pour un texte de navigation : ce rôle revient à `gc-hand-caption`.

## Ce que fournit le consommateur

| Prop | Valeurs | Rôle |
|---|---|---|
| `note` | chaîne, 120 caractères au plus | Le texte du mot, affiché tel quel. |
| `signature` | chaîne, ex. `'Julie'` | Prénom de l'invité, écrit en signature. |
| `ink` | `'night'` (par défaut) ou `'chocolat'` | Encre du stylo : bleu nuit `--gc-ink-night` ou chocolat `--gc-ink`. |
| `className` | chaîne | Classe ajoutée à la racine `.gc-petitmot`, par exemple pour `margin-top: auto`. |

## Règles d'usage

- **Texte** : `gc-hand-note` dans l'encre choisie (`--gc-ink-night` ou `--gc-ink`).
- **Signature** : `gc-hand-signature`, même encre, légèrement inclinée, alignée à droite. Elle flotte à la suite du texte : elle se pose **au bout de la dernière ligne** s'il y reste de la place, sinon elle passe dessous, toujours à droite. Le mot de Julie tient ainsi sur 2 lignes au lieu de 3.
- **Cœur** : tracé à l'encre du mot, avec un lavis `--gc-pink-300` légèrement décalé, comme une aquarelle.
- **Séparation** : trois points dessinés en `--gc-pink-500`, centrés au-dessus du texte, précédés d'une respiration minimale de `--gc-space-2`. Le mot ne colle jamais à la recette, même quand la page est pleine.
- **Placement** : le composant n'impose pas sa position. Le parent est une colonne flex de hauteur fixe, et le consommateur donne `margin-top: auto` au mot (via `className`) pour le poser en bas de page. La remise à zéro des marges de `<figure>` est écrite sans spécificité (`:where(.gc-petitmot)`), donc la classe du consommateur l'emporte toujours.

## À faire

- Garder le mot court, intime et en tutoiement : une ou deux phrases.
- Choisir l'encre de l'invité (`guest.ink`), `night` par défaut.
- Le placer sur `--gc-paper`, `--gc-paper-lace` ou `--gc-linen`.

## À éviter

- Ajouter « — » ou un « Bisous » dans `signature` : le prénom suffit, le cœur est dessiné.
- Mettre le mot sur une couleur de décor ou dans une autre encre que les deux prévues.
- Réduire la taille du texte pour gagner une ligne : on raccourcit le mot.

## Budget de contenu

Mesures réelles sur 760 px de large, la largeur d'une zone de texte de page :

| Mot | Lignes | Hauteur (points, texte et signature) |
|---|---|---|
| Julie, 82 caractères | 2, signature au bout de la 2ᵉ ligne | 141 px |
| 117 caractères | 3 | 194 px |

On compte environ 48 caractères par ligne.

**Viser 90 caractères au plus** pour rester sur 2 lignes avec la signature au bout. Le plafond de 120 caractères de `CONTRACT.md` coûte une ligne de plus (+53 px) sur une page déjà très remplie (voir le budget de `Recette`).
