# Secrets du carnet

`<SecretsDuCarnet page="lisa-gauche" />` se pose dans `PageCuite.dessus`, à côté de la toile des
aquarelles. `<CompagnonDuCarnet />` se monte une seule fois sous `Ecran`, à côté du `Livre` ; son
portail vers les contrôles reste hors de la loupe.

Les douze histoires réunissent quatre Jack Russell (clé, jeu avec une étoile, sieste, pistage), un
courrier volant, une poche cachée, une constellation, une plume autonome, une porte miniature,
un grimoire qui tourne ses pages, les trente ans et une piste de pattes menant à une trappe.
Les scènes changent seules après quatorze secondes actives. Cliquer ou focaliser puis presser
Entrée/Espace révèle une surprise ; **S** alterne entre les secrets visibles, hors champ de saisie et
hors menu. Les flèches du carnet restent disponibles.

La boîte entière de chaque vignette est testée contre l'alpha de l'encre, toutes les zones vivantes
et les liens du sommaire, avec marge. Une page trop dense reçoit son compagnon à l'extérieur du
livre : le grand chien préfère la table droite et évite aussi la bougie. Sans place vérifiée,
aucun dessin n'est superposé au texte.

Un observateur partagé et une horloge partagée contrôlent toutes les copies. Les chorégraphies
utilisent transform/opacité et s'arrêtent pendant les gestes, hors page, hors onglet, et avec le
mouvement réduit. Les changements de scénario font un seul rendu React par cycle, aucun par image.
Les poses, accessoires et bulles dessinées sont des images cuites ; aucun service distant au runtime.
Les bulles utilisent le fond aquarelle `bulle-vierge` et les deux phrases françaises validées, en
vraie Caveat : « Une part pour le chien ? » et « Ça sent le beurre d’ici ! ». Les légendes séparées
des chiens restent accessibles aux lecteurs d'écran ; elles ne recouvrent plus leurs silhouettes.
Les cachettes du courrier, de la plume, de la porte et du grimoire portent respectivement les noms
Terrible Cécile, Douce Cécile, Fée du logis et Cordon bleu.

Vérifications : `node scripts/verify-secrets.mjs`, puis après build
`GC_CHROME=/usr/bin/chromium node scripts/verify-secrets.mjs --site dist/site`.
