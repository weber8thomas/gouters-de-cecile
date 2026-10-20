# Audit des recettes v11 — 20 octobre 2026

Référence : `docs/mission-finalisation-2026-10-19.md`. Audit ciblé des sources, sans navigateur ni modification du contenu.

## Fidélité au plan

- Les huit fichiers `src/content/recettes/{lisa,emeline,clemence,pierrette,anatole,lise,julien,laura}.txt` reproduisent leurs sections du plan, espaces de début/fin exclus.
- Les huit JSON conservent les ingrédients et quantités, les **39 étapes**, les **8 mots personnels**, les **6 notes de marge**, l'introduction de Lise et l'option glaçage de Lisa. Comparaison après retrait des marqueurs Markdown et regroupement des lignes : aucun contenu retiré ni quantité modifiée repéré.
- Prénoms, titres, signatures et slugs correspondent au plan. Le roster actif contient exactement les huit proches demandés ; aucun invité ajouté. Julie, Mathis, Rose et Bernard sont absents de ce roster et de l'ordre actif du carnet.

## Structure et illustrations

`carnet.json` contient **17 doubles pages** : titre, deux albums, sommaire, quatre intercalaires, huit recettes et fin. Les quatre chapitres et leur répartition sont conformes au plan. Les folios déclarés dans `pages/recettes.json` correspondent à cet ordre.

| Invité | Chapitre | Folios | Aquarelles associées |
|---|---|---|---|
| Lisa | Gâteaux & cakes | 12–13 | carotte |
| Emeline | Gâteaux & cakes | 14–15 | fondant-chocolat |
| Clémence | Gâteaux & cakes | 16–17 | framboises-speculoos |
| Pierrette | Gâteaux & cakes | 18–19 | citron, citron-2 |
| Anatole | Tartes & confitures | 22–23 | tarte-myrtilles |
| Lise | Tartes & confitures | 24–25 | tarte-pommes, pomme |
| Julien | Biscuits | 28–29 | cookies |
| Laura | Crêpes & gaufres | 32–33 | crepes-banane |

Les dix associations disposent d'un PNG source, d'un WebP cuit et d'une entrée valide dans `assets.json`. Les huit descriptions des intercalaires existent ; toutes leurs aquarelles référencées disposent également d'un fichier cuit. Cela vérifie les associations et fichiers, sans certifier leur rendu animé.

## Lecture visuelle et réserves

Les huit PNG statiques `verification/out/b/pages/{lisa,pierrette,lise,laura}-{gauche,droite}.png` ont été inspectés à leur résolution originale : aucun bloc coupé évident. La quatrième étape de Lise occupe seule le haut de la page droite ; le texte reste complet. Certaines formes manuscrites de chiffres restent ambiguës, notamment les **250 g de farine de Laura** et les **160 g de farine de Pierrette** : les JSON sont exacts, mais ces chiffres méritent une relecture du rendu final.

TrOCR n'étant pas disponible pour cette relecture, aucun contrôle OCR exhaustif des images n'est attesté. La conformité constatée porte sur le plan fourni, sans comparaison avec d'éventuels originaux antérieurs. Les aquarelles vivantes et cartes ne figurent pas dans ces PNG statiques, ce qui est attendu. La cuisson partielle et les pages en cours de recuisson après correction des notes de marge ne sont pas traitées comme un état final ni signalées comme manquantes.

## Corrections de la relecture

Les formes ambiguës repérées ont été retracées avec les surcharges de graines prévues par le moteur,
sans modifier les textes ni les mains : Laura 250 g, Pierrette 160 g, Clémence 450 / 150 / 90 / 2, Anatole 50 g,
et signature Lisa. Les aperçus d’encre retenus ont été inspectés avant la recuisson des pages.
Les candidats moins lisibles ont été rejetés. Cela reste une relecture visuelle ciblée, sans attestation OCR.
Les notes longues ont trouvé leur place en marge basse ; les aquarelles de l’intercalaire Tartes ont été
replacées à l’intérieur du cadre, sans réduire leur taille.

## Perte de texte corrigée dans la pagination

La concordance des mots entre sources et manifestes a trouvé une fin de phrase absente chez Julien :
« ils durcissent en surface tout en restant fondants à cœur. ». Le texte source était complet.
Après une coupure entre deux pages, le paginateur gardait le nombre d’atomes antérieur à la coupure.
Il emploie maintenant la longueur courante et refuse un résultat dont les tranches ne couvrent pas
tous les atomes. La même correction s’applique à la pagination des feuillets et des pages imprimées.
La régression ciblée utilise la recette réelle, sa multiplicité de mots et un cas où la fin demande
un feuillet : `tools/ecriture/.venv/bin/python scripts/tests/test_pagination_split.py`.
