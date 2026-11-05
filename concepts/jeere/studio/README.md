# Jeere Studio — l’éditeur avancé (prototype)

L’éditeur « pour les gens avancés », façon **Figma / Framer / Webflow**, au-dessus de la même
fiche boutique que l’éditeur simple (`../creer/`). Un plan de travail infini, des aperçus en
direct (téléphone 390 et ordinateur 1200 par défaut, 360 / 768 / 1440 en plus), une **barre
d’outils flottante** en bas façon Figma UI3, une barre contextuelle sur la sélection, un panneau
Calques, un inspecteur Réglages, et les raccourcis clavier qu’on attend de ces outils (Ctrl Z en
tête). Chrome sombre `#1E1E1E` en Inter (11 / 12 / 13 / 15 px), les boutiques en couleur sur le
canevas clair ; sélection en bleu `#3657FF` (magenta quand l’accent du store est ce bleu).

**Le modèle : des sections, pas des pixels.** Le Studio insère, déplace, masque et réécrit des
*sections* responsives (et leurs textes, photos, produits) — comme les sections de Framer ou de
Webflow, pas le dessin libre de Figma — parce qu’une boutique doit rester juste sur chaque
téléphone. C’est présenté comme une promesse, pas comme un manque : la modale d’accueil (« des
sections qui s’adaptent toutes seules à chaque téléphone », « impossible de casser l’affichage
mobile »), la carte « trois gestes » au premier lancement, le bloc « Responsive, de 360 à
1440 px » du groupe Disposition, et les touches de dessin de Figma (F, R, O, P, L, Ctrl G) ou
le glisser d’un sous-élément, qui expliquent le modèle au lieu de ne rien faire.

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
| `index.html` | La coquille : barre du haut (nom, chips « Aperçus », jetons/historique/contrastes, Partager/Publier), barre d’outils flottante dans le plan de travail, panneaux, modales, drawers (Jetons, Historique, Commentaires), palette de commandes, infobulle, le symbole `#cloud`. Charge `../creer/data.js`, `../creer/render.js`, `../creer/store.css`, puis `studio.js`, `studio-power.js` et `studio-toolbar.js`. |
| `studio.css` | Le chrome sombre (scopé `.st-*`), le décor de sélection, les superpositions (mesures, contrastes), les drawers, la palette — jetons d’état (`--ok`, `--warn`, `--err`, `--info`) aux valeurs de la plateforme, sélection `#3657FF`. |
| `studio.js` | Le cœur : état, historique, canevas (zoom/pan/tactile), sélection (simple **et multiple**), édition en place, calques, insertion, inspecteur, artboards dynamiques, raccourcis, autosave, dialogues. Expose `window.JeereStudio._internals` (le pont) et des `hooks`. |
| `studio-power.js` | Les fonctions avancées, greffées sur le pont : palette de commandes, Mes blocs, Jetons, Historique (versions), onglet Code, panneau Images, superpositions mesures/contrastes, export PNG. IIFE classique, chargée après `studio.js`. |
| `studio-design.js`, `studio-design.css` | L’onglet **Design** : l’inspecteur élément par élément (voir plus bas), la barre de style rapide et le recadrage sur le canevas, l’aperçu de la page. Écrit `elementStyles` (`../creer/elstyles.js`) par l’historique unique. Expose `window.JeereStudioDesign` pour les tests. |
| `studio-toolbar.js` | La couche UI3 : barre d’outils flottante, fenêtre d’insertion (S), barre contextuelle de la sélection, infobulles stylées, commentaires locaux (C), carte d’accueil « trois gestes ». Chaîne les `hooks` (ne les remplace jamais). Expose `window.JeereStudioToolbar` pour les tests. |

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
  pour éviter la contamination du canvas sous Chromium). Les **polices web du store** sont
  récupérées (`fontPairs[…].googleUrl`, faces latines) et inlinées en `@font-face` data-URL — sans
  ça, le titre retombait sur une sans-serif générique. Rendu **2x** par défaut (`exportPNG(key,
  scale)`, borné aux limites des canvas), sur l’**aperçu cliqué**. Une photo non embarquable
  (CORS) est laissée de côté avec un toast.
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

## La barre d’outils flottante (`studio-toolbar.js`)

En bas au centre du plan de travail, une pilule sombre comme Figma UI3 : boutons de 38 px
(44 px au doigt sur iPad), un jeu d’icônes au trait (1,6 px, bouts ronds), l’outil actif en bleu
`#3657FF`, une **infobulle stylée** après 400 ms (nom + raccourci en `kbd` + une ligne d’aide),
puis « chaude » (immédiate) quand on glisse le long de la barre. Les boutons de la barre du haut
ont la même infobulle (les `title=` natifs sont convertis à la volée).

| Outil | Touche | Ce qu’il fait |
| --- | --- | --- |
| Déplacer | V | Sélectionner ; **glisser une section sur l’aperçu** pour la déplacer (ligne bleue de dépose, une étape d’annulation). Au doigt : glisser la section déjà sélectionnée. |
| Main | H | Déplacer la vue ; le store redevient interactif (navigation entre pages). |
| Section | S | La **fenêtre d’insertion** : les types de section du contrat en cartes, aperçu dans le thème au survol, clic = insérer après la sélection, glisser une carte sur un aperçu = insérer à cet endroit ; flèches + Entrée au clavier ; « Mes blocs et le panneau Insérer → ». |
| Texte | T | Le prochain clic sur un texte (titre, petit titre, paragraphe, bouton, nom ou prix d’un produit) l’édite sur place ; le texte visé s’allume au survol ; l’outil revient ensuite à Déplacer. |
| Image | I | Arme le choix de photo pour la sélection (section avec image ou produit) et ouvre le panneau Images ; sans sélection d’image, ouvre le panneau et explique. |
| Commentaire | C | Un clic sur un aperçu pose une **épingle numérotée** et ouvre la note (Entrée publie). Le drawer « Commentaires » liste les notes (ouverts / résolus, Résoudre, Supprimer, clic = la vue glisse jusqu’à l’épingle). Compteur rouge sur l’outil. **Local** : stocké dans `jeere-studio-ui` (`ui.comments` : `{id, n, ab, x, y, sectionId, text, at, resolved}`), clairement marqué « local — partage avec le backend ». |
| Zoom | − / % / + | Le menu `%` s’ouvre vers le haut : zoom avant/arrière, ajuster (⇧1), sélection (⇧2), 100 % (⇧0), 25/50/75/200 %. |

Les outils V/H et les trois boutons d’appareil ont quitté la barre du haut (doublons) ; `D`
fait toujours le tour téléphone / les deux / ordinateur, et les chips « Aperçus » choisissent les
tailles d’écran. Échap revient à Déplacer depuis Texte ou Commentaire.

**Barre contextuelle.** Une petite barre sombre épinglée 8 px au-dessus de la sélection, sur
l’aperçu **cliqué** (l’« aperçu actif », aussi utilisé par ⇧2 et l’export PNG) : nom + icône du
type, ↑ ↓, « + » (insérer dessous), photo, dupliquer, masquer, supprimer, ⋯ (le menu du clic
droit : verrouiller, renommer, Mes blocs…). Sur un sous-élément : « Modifier » et retour à la
section ; sur un produit : nom, photo, dupliquer, supprimer ; en sélection multiple : les actions
groupées. Taille constante quel que soit le zoom, collée au bord haut quand la section le
dépasse, jamais sur la barre d’outils, masquée pendant un pan, un glisser ou un mouvement de
caméra.

**Sélection dessinée par le Studio.** Les contours ne sont plus des `outline` sur le store (ils
disparaissaient sous les enfants positionnés : pas de contour sur le hero ordinateur) : des
boîtes dans le calque de l’artboard, au-dessus du rendu, 2 px quel que soit le zoom, liseré
blanc, sur **tous** les aperçus, recalculées quand une photo se charge (`ResizeObserver`). Les
classes `st-sel` / `st-hov` restent posées sur les nœuds (tests, outils).

**Mouvement.** Un seul jeu de jetons (`--dur-1` 90 ms, `--dur-2` 160 ms, `--ease`) : survol et
appui (`:active`) de chaque contrôle, menus / palette / dialogues en fondu + échelle 0,975 → 1,
drawers qui glissent de 8 px, caméra (ajuster, zoom sur la sélection, suivi) qui glisse en
200 ms — l’état est final tout de suite, seule l’image s’anime. Tout s’éteint sous
`prefers-reduced-motion`. Les toasts : **un seul à la fois**, en haut au centre du plan de
travail, le dernier remplace le précédent.

## Le plan de travail (canevas)

- **Deux artboards en direct**, « Téléphone 390 » et « Ordinateur 1200 », rendus par
  `JeereRender.render` dans des cadres à taille réelle, transformés en CSS (translate + scale).
  Même page sur les deux, sélection synchronisée. Fond à points qui suit le zoom et le pan.
- **Zoom** : Ctrl/Cmd + molette (et pincement du pavé tactile) vers le curseur, `+` / `−`,
  Ctrl 0 ajuster, Ctrl 1 100 %, menu `%` de la barre (25/50/75/200, Ajuster, 100 %).
- **Pan** : Espace + glisser (curseur main), clic molette, ou molette seule (Maj = horizontal) ;
  l’outil Main (H) rend en plus le store interactif : les clics naviguent dedans (la page suivie
  via `jst:navigate`, annulé pour éviter le saut de défilement, les deux artboards suivent).
- **Sélection (V)** : clic sur une section = sélection (contour bleu sur tous les aperçus, barre
  contextuelle sur l’aperçu cliqué) ; second clic à l’intérieur = sous-élément quand il correspond à un champ de la
  fiche (titre du hero, bouton, petit titre, une carte produit → le produit) ; survol = contour
  léger ; Échap remonte (champ → section → rien). Le panneau Calques et le canevas se suivent
  (`scrollIntoView` d’un côté, recentrage du canevas de l’autre). Une section verrouillée ignore
  les clics du canevas.
- **Appareils** : `D` fait le tour téléphone / les deux / ordinateur (aussi dans la palette) ;
  les chips « Aperçus » ajoutent ou retirent 360 / 390 / 768 / 1200 / 1440.
- **Caméra** : la vue ne bouge que si la sélection est (presque) hors de vue, et juste assez pour
  la ramener ; plus de recentrage qui sortait l’autre aperçu de l’écran.

## Calques (panneau gauche)

L’arbre du store : **Parcours d’achat** (Accueil, Fiche produit, Panier, Paiement, Confirmation
— cliquer rend la page sur les deux artboards, touches 1…5) ; sous Accueil, les **sections**
dans l’ordre de la fiche (icône du type + nom, œil pour masquer (`enabled`), cadenas pour
verrouiller (état Studio, pas la fiche), glisser-déposer pour réordonner avec indicateur de
dépôt) ; sous la première section Produits, les **produits** (pastille de couleur + nom).
**Vos pages** liste les pages du store (`config.pages`) : cliquer l’affiche (`page: 'page'`),
l’inspecteur édite titre, texte, menu/pied de page ; « + Ajouter une page ». Double-clic renomme
là où la fiche le permet : le titre d’une section qui en a un, le nom d’un produit, le titre
d’une page (le slug suit via `uniqueSlug`). Le double-clic marche vraiment (un changement de
sélection ne reconstruit plus l’arbre entre les deux clics : il re-marque les lignes) ; `F2` ou
`Ctrl R` renomme la sélection. Sur iPad, cadenas et œil n’apparaissent que sur la ligne
sélectionnée (ils tronquaient tous les noms).

L’onglet **Insérer** est le panneau d’insertion (la fenêtre de l’outil Section en est la version
rapide) : la galerie des types de section du contrat,
aperçu vivant au survol (la section rendue seule, dans le thème courant), **glisser sur un
artboard pour insérer à cet endroit précis** (ligne d’insertion bleue), ou clic pour ajouter
après la sélection. Les réglages de la nouvelle section viennent de
`JEERE_DATA.sectionSettings(type, niche, nom)` : le contenu d’exemple de la niche.

## Réglages (inspecteur droit)

Des groupes repliables, comme Figma :

- **Section sélectionnée** : « Contenu » construit depuis les champs du contrat (text, textarea,
  number, select, image, items — les avis, les zones de livraison, avec ajout/suppression et
  `maxItems`), puis « Disposition » (position n sur N avec ↑ ↓, visible, et le bloc
  « Responsive, de 360 à 1440 px » : la mise en page suit le modèle, « Changer de modèle… »), puis
  « Actions » (Dupliquer, Supprimer — de vrais boutons, plus des pointillés). Le champ image montre l’image de
  la vendeuse, sinon la photo d’exemple **créditée** (photographe / Unsplash), « Mettre ma
  photo » (réduite à 800 px, JPEG), « Retirer » et « Choisir dans Images » (sur sa propre ligne,
  plus jamais rogné). Un sous-élément sélectionné au canevas fait
  défiler et surligne son champ.
- **Produit sélectionné** : nom, prix, catégorie, badge, description, photo, couleur de tuile
  (`PRODUCT_COLORS`), illustration (`ART_KINDS`), dupliquer/supprimer.
- **Page sélectionnée** : titre, adresse `<boutique>.jeere.shop/pages/<slug>`, texte, menu,
  pied de page, supprimer.
- **Rien de sélectionné** : le style du store — modèle (3 cartes), palettes (pastilles),
  intensité Vives/Douces, polices, angles, boutons ; puis Boutique (**Métier** — « Changer de
  métier » remplace textes, produits et photos d’exemple par ceux d’un autre métier sans toucher
  au style ni aux pages, une étape d’annulation ; aussi dans la palette —, nom, slogan, WhatsApp,
  ville), Paiements (6 cases), Fiche boutique (export / import / éditeur simple).
- **Champs numériques façon Figma** : la poignée `◂▸` à gauche se **glisse horizontalement**
  pour changer la valeur (bornée par le min/max du contrat).

## Design (`studio-design.js`) — l’inspecteur élément par élément

Un onglet **Design** entre Réglages et Code, contextuel comme Framer : il montre **seulement ce
qui appartient à l’élément sélectionné**, en détail. Le contrat est `elementStyles` (voir
`../creer/README.md`, « Element styles ») : chaque valeur est exacte (px, %, °), passe par
l’historique unique (`commit`, fusionné par propriété ; chemin rapide `styleOnly` : seul le
`<style>` de chaque artboard change, sans re-rendu, 60 i/s au glisser) et vaut aussi dans l’éditeur
simple, le tableau de bord et la boutique.

- **Sélection** : un seul clic sur un **bouton** ou une **icône** les sélectionne directement ; un
  second clic dans une section choisit son élément le plus profond (titre, petit titre, texte, image,
  bloc texte, zone du bouton, grille, carte, prix, badge…) ; l’en-tête et le pied de page se
  sélectionnent (« chrome ») avec leurs icônes (menu, recherche, panier). Un élément sélectionné ouvre
  **Design** tout seul ; remonter à la section rend l’onglet d’avant.
- **En-tête du panneau** : fil d’Ariane (Accueil › section › élément, chaque niveau remonte), titre
  typé (« Bouton · Découvrir », « Icône · Panier », « Image · Grande bannière », « Section · Catégories »,
  « Carte produit »), menu des éléments du bloc, Copier / Coller le style (`Ctrl Alt C` / `Ctrl Alt V`),
  Réinitialiser (tout, ou seulement l’écran / l’état affiché).
- **Tailles d’écran** : Toutes / Ordinateur / Tablette / Téléphone (cascade SPEC §1.5 : la tablette
  vaut aussi pour le téléphone) ; une valeur propre à un écran porte une **pastille bleue** (clic :
  retour à la valeur plus large), un anneau signale l’héritage de la tablette ; compteurs sur les
  boutons ; les artboards non concernés sont atténués.
- **États** : Normal / Survol / Pressé (/ Focus pour les boutons) — l’état édité est montré sur les
  aperçus ; transition : durée + courbe (douce, rapide, symétrique, linéaire, **ressort**, rebond — en
  `linear()` CSS), bouton « rejouer ».
- **Panneaux par type** : bouton (Essentiel : fond, texte, rayon, taille S/M/L, gras, bordure, fond au
  survol ; Contenu : libellé, lien ; Disposition ; Rayon ; Remplissage ; Bordure ; Typographie ; Icône
  du bouton : aucune / gauche / droite, choix, taille, écart ; Ombre ; Effets) · texte (Essentiel,
  Contenu, Typographie : police du catalogue ou de la boutique, taille, graisse, interligne,
  espacement, casse, italique, souligné / barré, couleur, alignement ; Disposition…) · image (Image et
  recadrage : vignette à glisser, zoom, format Libre / Orig. / 1:1 / 4:5 / 3:4 / 16:9, ajustement,
  filtres ; Contenu : remplacer…) · icône (grille d’icônes avec recherche, taille, trait, couleur,
  rotation ; fond : cercle / arrondi / carré, couleur, marge) · carte produit (champs affichés : prix,
  badge, bouton, catégorie ; format des photos ; marges, rayon, ombre, survol) · section (disposition
  du modèle, visibilité par écran, padding, largeur du contenu, fond couleur / dégradé / image avec voile
  et cadrage, couleur des textes).
- **Champs** de 24 px en Inter 11 à chiffres tabulaires : glisser l’étiquette (Maj ×10, Alt ×0,1),
  ↑ ↓ (±1, Maj ±10, Alt ±0,1), calculs (« 24*2 »), Entrée / Échap ; l’indication montre la valeur réelle.
  Liens / déliés pour padding, marges, coins, bordures ; grille d’alignement 3 × 3 ; contrôle de coins
  visuel ; cadran d’angle ; segments à icônes.
- **Couleur** : `../creer/jcolor.js` (jamais le sélecteur natif, aussi dans « Jetons ») — carré
  saturation / luminosité, teinte, alpha sur damier, Hex / RGB / HSL, pipette (EyeDropper), palette de
  la boutique en **jetons vivants** et couleurs récentes, onglet **Dégradé** (arrêts sur une barre,
  linéaire / radial, cadran), tout au clavier.
- **Sur le canevas** : barre de **style rapide** sous l’élément (fond, texte, rayon, S/M/L, gras,
  recadrer…) ; padding teinté au survol du champ ou du padding de la sélection ; poignées de rayon aux
  coins ; **recadrage** (double-clic sur l’image ou Entrée) : la photo entière en transparence autour du
  cadre, glisser pour repositionner, molette pour zoomer, formats, « Terminé » / Entrée / Échap.
- **Rien de sélectionné** : l’aperçu de la page — sa structure (sections, en-tête, pied de page),
  ses réglages (fond, couleur des textes, largeur du contenu, polices des titres et des textes, palette),
  référencement (titre, description, adresse), chiffres.
- **Code** : l’onglet Code a un mode **CSS** (le CSS exact de la sélection, sinon de toute la boutique)
  à côté du JSON ; le groupe CSS du panneau le montre aussi, en direct.

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
| V · H · S · T · I · C | Outils de la barre flottante : Déplacer · Main · Section · Texte · Image · Commentaire |
| Ctrl K, Ctrl / | Palette de commandes (toutes les actions) |
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
| ↑ / ↓, Ctrl ] / Ctrl [ | Déplacer la section (Alt : sans faire défiler) |
| Glisser une section | La déplacer sur l’aperçu (ligne bleue) |
| Ctrl X | Couper la section |
| F2, Ctrl R | Renommer la sélection (dans les calques) |
| Ctrl ⇧ H / Ctrl ⇧ L | Masquer / verrouiller la sélection |
| Tab / ⇧ Tab | Section suivante / précédente |
| Entrée / ⇧ Entrée | Entrer dans la section (premier texte, puis édition) / revenir à la section |
| Ctrl \ (aussi Ctrl .) | Masquer / afficher les panneaux |
| F, R, O, P, L, Ctrl G | Pas de dessin libre : un toast explique le modèle en sections |
| Ctrl S | Enregistrer maintenant (« Enregistré ») |
| Ctrl E | Exporter la fiche (JSON) |
| Espace + glisser | Déplacer la vue |
| Ctrl molette, + / − | Zoom (vers le curseur à la molette ; + / − marchent avec ou sans Ctrl) |
| Ctrl 0, ⇧ 1 | Ajuster à l’écran (le cadrage d’ouverture : largeurs des artboards, haut de page) |
| ⇧ 2 | Zoomer sur la sélection (comme Figma) |
| Ctrl 1, ⇧ 0 | Zoom 100 % |
| 1 … 5 | Accueil · Fiche produit · Panier · Paiement · Confirmation (aussi par position de touche, pour l’AZERTY ; jamais avec ⇧ — ⇧ 1/2 appartiennent au zoom) |
| D | Téléphone seul · les deux · ordinateur seul |
| Clic droit | Menu contextuel : copier · coller · dupliquer · masquer · supprimer |
| Double-clic sur un texte sans champ | Sélectionne le sous-élément et met le curseur dans le champ de l’inspecteur |
| ? | Le panneau des raccourcis (groupés comme Figma) |
| Échap | Menu contextuel → fenêtre d’insertion / note → dialogues → outil Texte/Commentaire → sous-élément → section → rien ; sort d’un champ |

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
- `verdict/toolbar-test.js` (79 vérifications) : la couche UI3 — modale et carte d’accueil,
  barre flottante (position, tailles, chaque outil au clic et à sa touche, bleu actif),
  infobulles (délai 400 ms, puis chaudes ; plus de `title=` natif), fenêtre Section (clic, glisser
  sur un aperçu, Échap), barre contextuelle (position, ↑, ⋯), glisser une section sur l’aperçu,
  outil Texte + bouton aux espaces conservés + compteur au maximum, outil Image, commentaires
  (épingles, liste, résoudre, **persistance après rechargement**), réflexes Figma (Ctrl ⇧ H, Tab,
  Entrée, ⇧ 0, Ctrl \, R, F2, double-clic de renommage), un seul toast, aide, changer de métier,
  et l’iPad au doigt (barre ≥ 44 px, Texte, Commentaire, Section, barre contextuelle).
- `elstyles/elstyles-test.js` (188 vérifications) : le contrat et l’assainisseur (valeurs hostiles),
  le rendu identique des fiches sans styles, chaque groupe de propriétés (rayon, remplissage, dégradé,
  bordure intérieure / centrée / extérieure / tirets / par côté, ombres, effets, typographie,
  disposition, image), les états, la cascade des écrans + pastille + retour, Ctrl Z / Ctrl ⇧ Z (un geste =
  une étape), copier / coller le style, le recadrage, les icônes, les champs des cartes, la visibilité
  par écran, l’aperçu de la page, la barre rapide, le sélecteur de couleur (dégradé, clavier), le
  rechargement, l’éditeur simple, le tableau de bord, et la feuille de style rapide à 390 px.
- `power-test.js` (110 vérifications) : les fonctions avancées — palette (floue + exécution),
  édition en place (valider / annuler / maxlength / collage brut), sélection multiple et actions
  groupées (dans les limites), blocs (enregistrer / insérer / garde de taille / cap), jetons
  (édition ou lecture seule), versions (instantané / restaurer / éviction / auto), artboards
  (ajout / retrait / un minimum), géométrie des mesures, un contraste signalé, JSON conforme à la
  fiche, remplissage d’un champ image, signature PNG du fichier téléchargé, et les gestes tactiles
  (émulation iPad : tap, double-tap, deux doigts, pincement, appui long, glisser des calques).
