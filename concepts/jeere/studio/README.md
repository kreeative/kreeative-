# Jeere Studio — l’éditeur avancé (prototype)

L’éditeur « pour les gens avancés », façon **Figma / Framer / Webflow**, au-dessus de la même
fiche boutique que l’éditeur simple (`../creer/`). Un plan de travail infini, deux aperçus en
direct (téléphone 390 et ordinateur 1200), un panneau Calques, un inspecteur Réglages, et les
raccourcis clavier qu’on attend de ces outils (Ctrl Z en tête). Chrome sombre `#1E1E1E` comme
Figma, les boutiques en couleur sur le canevas clair ; sélection en bleu `#3657FF`.

Le Studio fait partie de la **formule Avancée** : au premier lancement, une modale le dit et
propose « Essayer gratuitement » (prototype : pas de facturation, copy honnête — « Bientôt payant
à l’ouverture des abonnements »). En dessous de 1024 px, un écran « Le Studio se pilote sur
ordinateur » renvoie vers l’éditeur simple.

## La même fiche, deux éditeurs

Le Studio lit et écrit **la même fiche boutique** que l’éditeur simple et le dashboard :
`localStorage['jeere-studio-config']` (`JEERE_DATA.STORAGE_KEYS.config`), normalisée par
`JEERE_DATA.normalizeConfig` **au chargement et à chaque enregistrement** — la fiche écrite par le
Studio est acceptée telle quelle par `normalizeConfig` (vérifié par le test). Autosave (600 ms
après la dernière frappe), état « Enregistré / Enregistrement… / Non enregistré » dans la barre ;
un `localStorage` plein ou bloqué donne un toast rouge, jamais un crash. « Éditeur simple » dans
la barre (et dans le dialogue Partager) ouvre `../creer/` sur la même fiche. Import / export
JSON de la fiche : Ctrl E, le dialogue Partager/Publier, ou le groupe « Fiche boutique » de
l’inspecteur. Fiche absente ou illisible → `defaultConfig('plateau', 'beauty')`.

L’état propre au Studio (drapeau « formule Avancée » vu, sections verrouillées, artboards
affichés, blocs enregistrés, commandes récentes) vit dans sa propre clé
`localStorage['jeere-studio-ui']` et ne touche jamais la fiche. Les versions nommées vivent
dans `localStorage['jeere-studio-versions']` (à part, avec garde de quota) ; le compteur
d’enregistrements de l’instantané automatique a sa propre petite clé
`jeere-studio-versions-saves`, pour qu’un enregistrement ordinaire ne réécrive jamais les
instantanés.

## Fichiers

Statique, sans build, sans librairie, comme le reste de Jeere. Un seul script, une IIFE,
un global `window.JeereStudio` (exposé aussi pour les tests : `getConfig`, `getState`, `select`,
`showPage`, `undo`, `redo`, `fit`, `setZoom`, `save`, `exportJSON`, `SHORTCUTS`).

| Fichier | Rôle |
| --- | --- |
| `index.html` | La coquille : barre du haut (outils, chips d’artboards, jetons/historique/contrastes), panneaux, modales, drawers, palette de commandes, le symbole `#cloud`. Charge `../creer/data.js`, `../creer/render.js`, `../creer/store.css`, puis `studio.js` et `studio-power.js`. |
| `studio.css` | Le chrome sombre (scopé `.st-*`), le décor de sélection, les superpositions (mesures, contrastes), les drawers, la palette — jetons d’état (`--ok`, `--warn`, `--err`, `--info`) aux valeurs de la plateforme, sélection `#3657FF`. |
| `studio.js` | Le cœur : état, historique, canevas (zoom/pan/tactile), sélection (simple **et multiple**), édition en place, calques, insertion, inspecteur, artboards dynamiques, raccourcis, autosave, dialogues. Expose `window.JeereStudio._internals` (le pont) et des `hooks`. |
| `studio-power.js` | Les fonctions avancées, greffées sur le pont : palette de commandes, Mes blocs, Jetons, Historique (versions), onglet Code, panneau Images, superpositions mesures/contrastes, export PNG. IIFE classique, chargée après `studio.js`. |

## Les fonctions avancées (`studio-power.js`)

Toutes construites sur le même contrat, feature-détectées, et testées par `power-test.js` :

- **Palette de commandes** — `Ctrl K` / `Cmd K`. Recherche floue sur **toutes** les actions du
  Studio (ajouter chaque type de section, aller à chaque page, changer modèle/palette/intensité/
  polices/appareil, basculer un panneau ou une superposition, enregistrer/exporter/importer/
  publier/partager, exporter en PNG, ouvrir l’aide…). Récentes d’abord, navigation `↑`/`↓`,
  `Entrée` exécute, le raccourci de chaque commande est affiché à droite (façon Figma / Linear),
  `Échap` ferme (avant tout tiroir ouvert dessous). Classement : le titre qui **contient** la
  requête d’abord (bonus en début de mot), puis tous les mots trouvés, puis la catégorie
  (« aide » → « Raccourcis clavier » avant « Ouvrir l’éditeur simple »), et les sous-séquences
  éparpillées seulement s’il n’y a rien de mieux (« png » → le seul « Exporter en image »).
- **Édition de texte en place** — double-clic sur un texte qui correspond à un champ de la fiche
  (titre / petit titre / texte / bouton du hero, titres de section, nom / prix / description des
  cartes produit, texte d’annonce, « à propos », titre WhatsApp…) : le texte devient
  `contenteditable` **dans l’artboard**, avec un anneau de focus discret. `Entrée` ou le blur
  valident (via le même historique, coalescés) et l’inspecteur se reconstruit aussitôt (son champ
  n’est jamais périmé), `Échap` annule, les `maxlength` du contrat sont respectées, le collage est
  aplati en texte brut. Marche dans tous les artboards.
- **Sélection multiple** — `Maj`+clic (canevas et calques) sélectionne plusieurs sections
  (contours + badge « 3 sections »). Actions groupées : masquer/afficher, dupliquer, supprimer
  (dans les limites de `validate()`), déplacer ensemble aux flèches. L’inspecteur montre
  « 3 sections sélectionnées » avec ces actions ; `Ctrl A` sélectionne toute la page ; le menu
  contextuel s’adapte.
- **Mes blocs** — clic droit sur une section → « Enregistrer dans Mes blocs… » : un préréglage
  nommé (avec ses réglages) dans `jeere-studio-ui` (cap 20, garde de taille — les images data-URL
  de plus de 100 Ko sont retirées avec un avis). La carte du nouveau bloc s’ouvre aussitôt en
  mode nom dans l’onglet Ajouter (nom proposé coupé sur un mot, avec « … » ; `Entrée` valide).
  Aperçu au survol (jamais sous un menu contextuel), insertion comme un type de section ;
  renommer / supprimer au clic droit ; export (grisé tant qu’il n’y a aucun bloc) / import JSON.
- **Jetons** — le bouton `⬡` de la barre (ou la palette) ouvre un drawer listant les jetons vivants
  du store : les 7 couleurs de la palette (pastille + hex), polices, angles, intensité. Cliquer une
  couleur l’édite **si le contrat le permet** (`D.setColorKey` / `theme.colors`, feature-détecté ;
  sinon « Modifiable bientôt » en lecture seule) ; le sélecteur natif s’ouvre à côté du tiroir.
  Les changements passent par l’historique et re-rendent. « Revenir aux couleurs de la palette »
  n’apparaît que si une des 7 couleurs est personnalisée, et ne retire qu’elles : les couleurs
  d’éléments réglées dans l’éditeur simple (bandeau, en-tête, pied, badges) sont gardées.
- **Historique** — le bouton `⟳` ouvre le drawer des versions nommées : bouton Instantané
  (« avant la promo Tabaski » ; sans nom : « Version du 05/11 à 19:24 »), instantané automatique
  tous les 20 enregistrements, liste avec
  dates relatives, aperçu (miniature rendue), restaurer (via l’historique, donc `Ctrl Z` revient),
  cap 15 avec éviction du plus ancien ; dans `jeere-studio-versions`, garde de quota.
- **Artboards** — les chips `360 · 390 · 768 · 1200 · 1440` de la barre ajoutent / retirent des
  artboards (toute combinaison ; au moins un). Disposés de gauche à droite, tous en direct et
  sélectionnables ; l’ajustement se recalcule. Une seule étiquette de sélection (sur le premier
  artboard visible), comme Figma. Retirer le dernier artboard de l’appareil affiché seul repasse
  sur « Les deux aperçus » : le canevas n’est jamais vide.
- **Mesures** — `Alt` maintenu, une section sélectionnée, survol d’une autre → mesure rouge façon
  Figma (l’écart vertical en px de l’échelle réelle de l’artboard), plus le badge de hauteur de la
  section survolée.
- **Contrastes** — bascule (palette + icône pipette de la barre, `Ctrl ⇧ C`) : balaie les textes
  visibles des artboards (couleur calculée vs fond effectif), encadre en rouge les échecs
  (`< 4,5:1`, `3:1` pour le grand texte) avec le ratio ; toast « Aucun problème » quand c’est
  propre. Sous 60 % de zoom, une étiquette par section (« 7 textes · pire 1,50 : 1 ») ; au-delà,
  une par texte ; une étiquette qui en chevaucherait une autre y est fusionnée (« +2 »). Le
  balayage se refait quand le zoom change.
- **Code** — un onglet « Code » dans l’inspecteur montre le JSON de la fiche sous la sélection
  (joli, lecture seule, bouton Copier) et, sans sélection, toute la fiche ; mis à jour en direct.
- **Images** — un onglet « Images » du panneau gauche : la grille de toutes les images de la fiche
  (logo, photos produits, images de section) + la photothèque de démo (`JeereRender.photoInfo`,
  créditée). Cliquez « Choisir dans Images » dans l’inspecteur puis une image pour remplir un
  champ, ou glissez une image sur un élément image d’un artboard ; poids par image, alerte
  au-delà de 300 Ko.
- **Export PNG** — « Exporter en image » (palette + dialogue Partager) rend l’artboard sélectionné
  en PNG : l’artboard est sérialisé dans un `<svg><foreignObject>`, les images embarquées en
  data-URL et la `store.css` incluse, rastérisé via une `Image` + canvas (URL `data:`, pas `blob:`,
  pour éviter la contamination du canvas sous Chromium). Une photo non embarquable (CORS) est
  laissée de côté avec un toast.
- **Tactile / iPad** (1194×834 paysage) — un doigt sélectionne, double-tap édite en place, deux
  doigts défilent, le pincement zoome vers le point médian, appui long = menu contextuel, le
  glisser des calques marche au doigt. Au premier toucher (ou sur un pointeur grossier),
  `html.st-touch` affiche en permanence l’œil et le cadenas des calques et agrandit les cibles
  (lignes de 40 px, boutons de 34 à 38 px) ; « Verrouiller la section » est dans le menu de
  l’appui long.

**Défensif par construction** : un autre agent peut faire évoluer `creer/` pendant que ce dossier
vit sa vie. Le Studio ne modifie **aucun** fichier existant ; il feature-détecte tout
(`JEERE_DATA.sectionSettings`, `uniqueSlug`, `subdomainFor`, `photoInfo`… chacun avec un repli),
construit ses formulaires depuis `JEERE_DATA.sectionTypes[].fields` (un champ ajouté au contrat
— un `bg`/`fg` de section, par exemple — apparaît tout seul ; un type de champ inconnu est
ignoré sans casser), ne touche jamais aux clés de fiche qu’il ne connaît pas (`store.logo`,
`theme.colors`… survivent à ses écritures, et `normalizeConfig` du runtime fait foi), et
enveloppe chaque rendu d’artboard dans un try/catch avec une carte d’erreur douce.

## Le plan de travail (canevas)

- **Deux artboards en direct**, « Téléphone 390 » et « Ordinateur 1200 », rendus par
  `JeereRender.render` dans des cadres à taille réelle, transformés en CSS (translate + scale).
  Même page sur les deux, sélection synchronisée. Fond à points qui suit le zoom et le pan.
- **Zoom** : Ctrl/Cmd + molette (et pincement du pavé tactile) vers le curseur, `+` / `−`,
  Ctrl 0 ajuster, Ctrl 1 100 %, menu `%` de la barre (25/50/75/200, Ajuster, 100 %).
- **Pan** : Espace + glisser (curseur main), clic molette, ou molette seule (Maj = horizontal) ;
  l’outil Main (H) rend en plus le store interactif : les clics naviguent dedans (la page suivie
  via `jst:navigate`, annulé pour éviter le saut de défilement, les deux artboards suivent).
- **Sélection (V)** : clic sur une section = sélection (contour bleu + étiquette de nom, sur les
  deux artboards) ; second clic à l’intérieur = sous-élément quand il correspond à un champ de la
  fiche (titre du hero, bouton, petit titre, une carte produit → le produit) ; survol = contour
  léger ; Échap remonte (champ → section → rien). Le panneau Calques et le canevas se suivent
  (`scrollIntoView` d’un côté, recentrage du canevas de l’autre). Une section verrouillée ignore
  les clics du canevas.
- **Appareils** : les trois boutons de la barre (téléphone / les deux / ordinateur), ou `D` qui
  fait le tour. L’affichage se réajuste.

## Calques (panneau gauche)

L’arbre du store : **Parcours d’achat** (Accueil, Fiche produit, Panier, Paiement, Confirmation
— cliquer rend la page sur les deux artboards, touches 1…5) ; sous Accueil, les **sections**
dans l’ordre de la fiche (icône du type + nom, œil pour masquer (`enabled`), cadenas pour
verrouiller (état Studio, pas la fiche), glisser-déposer pour réordonner avec indicateur de
dépôt) ; sous la première section Produits, les **produits** (pastille de couleur + nom).
**Vos pages** liste les pages du store (`config.pages`) : cliquer l’affiche (`page: 'page'`),
l’inspecteur édite titre, texte, menu/pied de page ; « + Ajouter une page ». Double-clic renomme
là où la fiche le permet : le titre d’une section qui en a un, le nom d’un produit, le titre
d’une page (le slug suit via `uniqueSlug`).

L’onglet **Ajouter** est le panneau d’insertion : la galerie des types de section du contrat,
aperçu vivant au survol (la section rendue seule, dans le thème courant), **glisser sur un
artboard pour insérer à cet endroit précis** (ligne d’insertion bleue), ou clic pour ajouter
après la sélection. Les réglages de la nouvelle section viennent de
`JEERE_DATA.sectionSettings(type, niche, nom)` : le contenu d’exemple de la niche.

## Réglages (inspecteur droit)

Des groupes repliables, comme Figma :

- **Section sélectionnée** : « Contenu » construit depuis les champs du contrat (text, textarea,
  number, select, image, items — les avis, les zones de livraison, avec ajout/suppression et
  `maxItems`), puis « Section » (visible, dupliquer, supprimer). Le champ image montre l’image de
  la vendeuse, sinon la photo d’exemple **créditée** (photographe / Unsplash), « Mettre ma
  photo » (réduite à 800 px, JPEG) et « Retirer ». Un sous-élément sélectionné au canevas fait
  défiler et surligne son champ.
- **Produit sélectionné** : nom, prix, catégorie, badge, description, photo, couleur de tuile
  (`PRODUCT_COLORS`), illustration (`ART_KINDS`), dupliquer/supprimer.
- **Page sélectionnée** : titre, adresse `<boutique>.jeere.shop/pages/<slug>`, texte, menu,
  pied de page, supprimer.
- **Rien de sélectionné** : le style du store — modèle (3 cartes), palettes (pastilles),
  intensité Vives/Douces, polices, angles, boutons ; puis Boutique (nom, slogan, WhatsApp,
  ville), Paiements (6 cases), Fiche boutique (export / import / éditeur simple).
- **Champs numériques façon Figma** : la poignée `◂▸` à gauche se **glisse horizontalement**
  pour changer la valeur (bornée par le min/max du contrat).

## Historique

**Une seule pile** pour toutes les mutations : contenu, réordonner, ajouter/supprimer/coller,
style, produits, pages, import. La frappe rapide est coalescée (par champ, fenêtre de 1,2 s) :
un Ctrl Z défait toute la saisie, pas une lettre. Annuler/rétablir disent ce qu’ils font par un
toast (« Annulé : déplacement de section »). La suppression respecte les règles de la fiche : le
dernier produit ne se supprime pas (la boutique ne peut pas être vide — `validate()` en ferait
une erreur) ; tout le reste se supprime librement, Ctrl Z ramène tout.

## Raccourcis (tous testés ; `e.key`, donc l’AZERTY marche ; Cmd = Ctrl sur Mac)

| Touches | Action |
| --- | --- |
| Ctrl K | Palette de commandes (toutes les actions) |
| Ctrl A | Sélectionner toutes les sections de la page |
| Maj + clic | Ajouter / retirer une section (sélection multiple) |
| Ctrl ⇧ C | Vérification des contrastes |
| Alt + survol | Mesures entre sections (et hauteur survolée) |
| Double-clic sur un texte | Modifier le texte directement dans l’aperçu |
| Ctrl Z | Annuler |
| Ctrl ⇧ Z, Ctrl Y | Rétablir |
| Ctrl C / Ctrl V | Copier la section / coller après la sélection (presse-papiers interne JSON) |
| Ctrl D | Dupliquer la section ou le produit |
| Suppr, ⌫ | Supprimer la sélection (jamais sous les limites de `validate()`) |
| ↑ / ↓ | Déplacer la section (Alt : sans faire défiler) |
| Ctrl S | Enregistrer maintenant (« Enregistré ») |
| Ctrl E | Exporter la fiche (JSON) |
| V / H | Outil sélection / outil main |
| Espace + glisser | Déplacer la vue |
| Ctrl molette, + / − | Zoom (vers le curseur à la molette ; + / − marchent avec ou sans Ctrl) |
| Ctrl 0, ⇧ 1 | Ajuster à l’écran (le cadrage d’ouverture : largeurs des artboards, haut de page) |
| ⇧ 2 | Zoomer sur la sélection (comme Figma) |
| Ctrl 1 | Zoom 100 % |
| 1 … 5 | Accueil · Fiche produit · Panier · Paiement · Confirmation (aussi par position de touche, pour l’AZERTY ; jamais avec ⇧ — ⇧ 1/2 appartiennent au zoom) |
| D | Téléphone seul · les deux · ordinateur seul |
| Clic droit | Menu contextuel : copier · coller · dupliquer · masquer · supprimer |
| Double-clic sur un texte sans champ | Sélectionne le sous-élément et met le curseur dans le champ de l’inspecteur |
| ? | Le panneau des raccourcis (groupés comme Figma) |
| Échap | Menu contextuel → dialogues → sous-élément → section → rien ; sort d’un champ |

Un dialogue ouvert (`aria-modal`) **bloque les raccourcis d’édition** : Suppr, Ctrl D, les
flèches et 1…5 ne touchent plus le canevas derrière lui (Ctrl S / Ctrl E restent permis, Échap
ferme). Les calques se pilotent aussi au clavier : Tab entre dans l’arborescence (`role="tree"`,
focus itinérant), ↑/↓ passent de ligne en ligne, Entrée ou Espace sélectionne.

## Publier, partager

« Publier » **valide la fiche** (`JEERE_DATA.validate`) et ouvre le dialogue : statut
(APPROUVÉ / À CORRIGER), score sur 100, les premiers points à corriger, l’adresse
`<boutique>.jeere.shop` (`subdomainFor`), et la vérité du prototype : *la mise en ligne arrive
avec le backend, rien n’est publié pour l’instant*. « Partager » ouvre un dialogue distinct,
tourné vers la fiche-fichier : adresse, télécharger (action principale) / copier / importer le
JSON, ouvrir l’éditeur simple. Dans chaque dialogue, une seule action est primaire.

## Ouvrir et tester

```sh
python3 -m http.server 8000 --directory /path/to/kreeative-
# http://localhost:8000/concepts/jeere/studio/
```

Des suites Playwright dans le scratchpad de la session, contre un serveur local :

- `verify-final.js` (41 vérifications, dans `studio2/`) : les correctifs de la revue — classement
  de la palette, ordre de `Échap`, inspecteur après édition en place, mesures à l’écran, étape de
  nommage des blocs, remise à zéro des jetons, nom des versions, écritures `localStorage`,
  étiquettes de contraste sans chevauchement à 12 / 26 / 100 %, iPad (cibles, barre du haut) ;
  `topbar-probe.js` vérifie la barre du haut de 1920 à 1194 px (aucun chevauchement).
- `studio-test.js` (74 vérifications) : le socle — ouverture, rendu, sélection canevas/calques,
  édition, historique, glisser-déposer, insertion, masquer/verrouiller, chaque raccourci,
  autosave, interop `normalizeConfig`, export, garde petit écran, fiche abîmée.
- `power-test.js` (109 vérifications) : les fonctions avancées — palette (floue + exécution),
  édition en place (valider / annuler / maxlength / collage brut), sélection multiple et actions
  groupées (dans les limites), blocs (enregistrer / insérer / garde de taille / cap), jetons
  (édition ou lecture seule), versions (instantané / restaurer / éviction / auto), artboards
  (ajout / retrait / un minimum), géométrie des mesures, un contraste signalé, JSON conforme à la
  fiche, remplissage d’un champ image, signature PNG du fichier téléchargé, et les gestes tactiles
  (émulation iPad : tap, double-tap, deux doigts, pincement, appui long, glisser des calques).
