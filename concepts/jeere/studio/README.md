# Jeere Studio — l’éditeur avancé (prototype)

L’éditeur « pour les gens avancés », façon **Figma / Framer / Webflow**, au-dessus de la même
fiche boutique que l’éditeur simple (`../creer/`). Un plan de travail infini, des aperçus en
direct (téléphone 390 et ordinateur 1200 par défaut, 360 / 768 / 1440 en plus), une **barre
d’outils flottante** en bas façon Figma UI3, une barre contextuelle sur la sélection, un panneau
Calques, un inspecteur Réglages, et les raccourcis clavier qu’on attend de ces outils (Ctrl Z en
tête). Chrome sombre `#1E1E1E` en Inter (11 / 12 / 13 / 15 px), les boutiques en couleur sur le
canevas clair ; sélection en bleu `#3657FF` (magenta quand l’accent du store est ce bleu).

**Le modèle : des sections qui s’adaptent, et le dessin libre quand on le veut.** Le Studio insère,
déplace, masque et réécrit des *sections* responsives (et leurs textes, photos, produits) — comme
les sections de Framer ou de Webflow — parce qu’une boutique doit rester juste sur chaque
téléphone ; « Détacher » (Ctrl Alt B) et les outils Cadre, Rectangle, Ellipse (F, R, O) en font des
nœuds libres DualEngine, placés écran par écran. La modale d’accueil (« des sections qui s’adaptent
toutes seules à chaque téléphone », « Juste sur chaque téléphone ») et la carte « trois gestes » le
disent ; depuis la vague 1 de l’audit, plus de promesse « pas de pixels à placer », démentie par la
barre d’outils.

Le Studio fait partie de la **formule Avancée**, avec ses propres abonnements (voir
[Abonnements Studio](#abonnements-studio)) : gratuit en Découverte, 14 jours d’essai de tout le
Studio, puis Solo, Pro ou Agence. Au premier lancement, une modale le présente et propose
« Essayer 14 jours gratuitement » ou « Continuer en Découverte ». En dessous de 1024 px, un écran
« Le Studio se pilote sur ordinateur » renvoie vers l’éditeur simple.

## La même fiche, deux éditeurs

Le Studio lit et écrit **la même fiche boutique** que l’éditeur simple et le dashboard :
`localStorage['jeere-studio-config']` (`JEERE_DATA.STORAGE_KEYS.config`), normalisée par
`JEERE_DATA.normalizeConfig` **au chargement et à chaque enregistrement** — la fiche écrite par le
Studio est acceptée telle quelle par `normalizeConfig` (vérifié par le test). Autosave (600 ms
après la dernière frappe), état « Enregistré / Enregistrement… / Non enregistré » dans la barre ;
un `localStorage` plein ou bloqué donne un toast rouge, jamais un crash. **Rien ne se perd en
partant** : `pagehide`, `beforeunload` et `visibilitychange` (caché) écrivent la fiche aussitôt, et
avant toute navigation interne (Ctrl Alt P, « Éditeur simple », un lien) le champ en cours est validé,
le texte édité sur place aussi, puis la fiche est écrite. « Éditeur simple » dans la barre (et dans le
dialogue Partager) ouvre `../creer/#editeur` sur la même fiche, directement dans l’éditeur (la clé
d’ouverture `JEERE_DATA.STORAGE_KEYS.open`, lue par `creer/editor.js`), plus sur son écran d’accueil. Import / export
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
| `plans.js` | Les abonnements Studio, sans DOM : `window.JeerePlans` (formules, limites, abonnement en cours, essai, droits) et `window.JeereBilling` (le paiement, derrière un adaptateur de fournisseur). Chargé aussi par `../admin/`, `../compte/` et `../abonnements/`. |
| `studio-plans.js`, `studio-plans.css` | Les abonnements dans l’éditeur : la pastille de formule de la barre du haut, la feuille « Avec un abonnement Studio », les cadenas, l’essai, le badge « Fait avec Jeere » du dialogue Publier. Définit `S.can`, `S.limit`, `S.gate` sur le pont. Chargé en dernier. Expose `window.JeereStudioPlans` pour les tests. |
| `studio-toolbar.js` | La couche UI3 : barre d’outils flottante, fenêtre d’insertion (S), barre contextuelle de la sélection, infobulles stylées, commentaires locaux (C), carte d’accueil « trois gestes ». Chaîne les `hooks` (ne les remplace jamais). Expose `window.JeereStudioToolbar` pour les tests. |
| `engine/` | DualEngine (phase A + les ajouts de la phase B : références nominales, piles de polices) : le modèle, l’historique RFC 6902, le solveur Flex / Grid / absolu, le générateur HTML / CSS. Voir `engine/README.md`. |
| `studio-engine.js` | Le pont fiche ↔ document DualEngine, « Détacher » / « Rattacher », un document et un historique DualEngine par section détachée, la mise en page par artboard, l’export HTML / CSS. `window.JeereStudioEngine`. |
| `studio-canvas.js` | Le canevas des nœuds DualEngine : sélection, poignées, déplacement / redimensionnement / rotation, magnétisme, guides, règles, grilles, outils F R O T I, raccourcis, tactile. `window.JeereStudioCanvas`. |
| `studio-inspector.js`, `studio-engine.css` | L’inspecteur des nœuds DualEngine (module 3), leurs calques, les actions Détacher / Rattacher / Exporter, le CSS de l’onglet Code. `window.JeereStudioInspector`. |

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

### Rendu incrémental (vague 1)

Une modification redessinait **tous** les artboards d’un coup : sur la grande boutique de l’audit (36
sections, 54 produits, 5 artboards, 3 sections détachées), 200 à 250 ms de blocage par touche tapée dans
l’inspecteur. Désormais (`studio.js`, `scheduleRender` / `patchRender`) :
- chaque artboard est dessiné dans une copie hors document (`render()` sans style ni mise en page : ~5 ms),
  puis seules les parties et les sections dont le balisage a changé sont **rapprochées** du DOM vivant
  (`morph` : un texte modifié = un nœud texte, 0,3 ms de mise en page, au lieu de 7 à 10 ms pour une
  section remplacée) ; les classes `st-*` du Studio sont gardées ;
- pendant une frappe (commits coalescés), seul l’artboard qu’on regarde suit chaque touche ; les autres
  rattrapent 260 ms après la pause, un par image ; hors frappe, les artboards visibles d’abord, un par
  image, les autres ensuite ; l’arbre des calques se reconstruit à la pause ;
- tout ce que la copie ne peut pas garantir (l’en-tête ordinateur, dont `render()` ajuste les liens à la
  largeur ; une section détachée qui attend le moteur ; une autre page) repasse par le rendu complet de
  l’artboard ; `renderArtboards()` (export PNG, nouvelle page, tests) dessine toujours tout.
Mesure (`scratchpad/wave1/perf13.js`, Chromium headless) : blocage par touche 213 ms → 0,1 ms, plus
aucune tâche longue, pire image 16,8 ms ; `_internals.renderLog()` donne le détail des dernières images.

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
- **Sur le canevas** : barre de **style rapide** près de l’élément (fond, texte, rayon, S/M/L, gras,
  recadrer…), placée là où elle ne couvre rien de cliquable : au-dessus de l’élément, sinon dessous, sur
  le bas d’une photo, à côté de l’artboard ou au-dessus de la barre de sélection — chaque place est notée
  par ce qu’elle cacherait (les textes, boutons et photos de la section, la barre de sélection, les autres
  artboards) et la première qui ne cache rien gagne ; ses valeurs (et les indications des champs) se
  relisent après chaque rendu, donc justes après Ctrl Z / Ctrl ⇧ Z ; padding teinté au survol du champ ou du padding de la sélection ; poignées de rayon aux
  coins ; **recadrage** (double-clic sur l’image ou Entrée) : la photo entière en transparence autour du
  cadre, glisser pour repositionner, molette pour zoomer, formats, « Terminé » / Entrée / Échap.
- **Rien de sélectionné** : l’aperçu de la page — sa structure (sections, en-tête, pied de page),
  ses réglages (fond, couleur des textes, largeur du contenu, polices des titres et des textes, palette),
  référencement (titre et description **pour Google, distincts du nom et du slogan** : `store.seo`, vides =
  le nom et le slogan ; l’adresse par `storeAddress()`, un seul endroit ; un aperçu du résultat Google),
  chiffres. Une page de la vendeuse a son propre référencement (Réglages, `pages[].seo`).
- **Lien d’un bouton** (Contenu, hero et WhatsApp) : aucun, Accueil, Panier, une de ses pages, une section
  de l’accueil (défilement), un produit, WhatsApp, une adresse https:// ; « Nouvel onglet ». Stocké dans
  `sections[].settings.buttonLink` / `buttonNewTab` ; `render.js` fait alors du bouton un `<a href>`.
- **Texte alternatif** : la photo du hero et d’« À propos » (Contenu, `settings.imageAlt`, vide = la
  description de la photo d’exemple ou le titre de la section) ; la photo d’un produit (Réglages,
  `products[].alt`, vide = le nom du produit).
- **Code** : l’onglet Code a un mode **CSS** (le CSS exact de la sélection, sinon de toute la boutique)
  à côté du JSON ; le groupe CSS du panneau le montre aussi, en direct.

## DualEngine dans le Studio (phase B : `studio-engine.js`, `studio-canvas.js`, `studio-inspector.js`)

DualEngine (`engine/`, `SPEC-DUALENGINE.md`) est le cœur de document et de mise en page du dessin libre.
Les sections du modèle restent des **composants** ; « Détacher » en fait des nœuds libres.

- **Le pont** (`JeereStudioEngine.toDocument` / `fromDocument`) : la fiche entière comme document
  DualEngine — un composant par type de section (ses éléments, du registre d’`elstyles.js`, en nœuds
  maîtres), une instance par section sur la page « Accueil » (props = réglages, surcharges d’instance =
  styles d’éléments), les nœuds libres des sections détachées. `fromDocument(toDocument(c))` est
  identique octet pour octet (testé sur les 48 fiches par défaut et avec des styles d’éléments).
- **Détacher** (Réglages « Édition libre », menu contextuel, `Ctrl Alt B`) : la section rendue hors
  écran à 1200, 768 et 390 px devient des nœuds — piles (Auto Layout) là où le CSS du modèle met en
  flex / en flux, grilles en `fr`, positions libres avec contraintes ailleurs (« proportionnelle »
  quand une colonne garde la même part à 1200 et 768), textes (pile de polices, runs), images
  (photos d’exemple ou data-URL, point focal), boutons, `::before` / `::after` (voiles, traits, cadres),
  et des surcharges Tablette / Téléphone mesurées. Une étape d’annulation ; les styles d’éléments de la
  section passent dans ses nœuds. « Rattacher au modèle » retire la clé. Stocké dans
  `sections[].engine` (voir `../creer/README.md`, « Detached sections »).
- **Les artboards sont les points de rupture** : 1200 / 1440 = Ordinateur (base), 768 = Tablette,
  390 / 360 = Téléphone (l’étiquette de l’artboard le dit, l’écran en cours d’édition est en bleu). Une
  modification faite sur un artboard (ou avec le sélecteur de l’inspecteur) s’écrit à son point de
  rupture : valeur exacte, pastille bleue, clic = retour à la valeur plus large. La mise en page de
  chaque artboard est celle du solveur (références nominales : un 1440 ou un 360 donnent le même
  résultat que le CSS exporté).
- **Canevas** : zoom 10 % – 25 600 % (molette + Ctrl / ⌘, pincement, `⇧ 0 / 1 / 2`, `Ctrl ±`) ;
  sélection façon Figma (clic : le niveau suivant, `Ctrl` + clic : le plus profond, double-clic :
  entrer / éditer un texte, `Maj` + clic : plusieurs, `Échap` : le parent, `Entrée` : les enfants ;
  une forme sans remplissage ne se prend que par son contour) ; déplacer (guides intelligents rouges
  sur les frères, le cadre et les guides, cotes, snap pixel ; dans une pile, insertion par la règle
  du point médian avec la ligne bleue, `Ctrl` = absolu), redimensionner (8 poignées, `Maj` ratio,
  `Alt` depuis le centre), pivoter (hors d’un coin, `Maj` par 15°), flèches (`Maj` = 10 px ; dans une
  pile, elles réordonnent), `Ctrl G` / `Ctrl ⇧ G`, `Ctrl ]` / `[` (`⇧` : premier / arrière-plan),
  `Ctrl C` / `V` / `D` / `X`, `Suppr`, `⇧ A` (Auto Layout ↔ positions libres, déduit des boîtes),
  règles (`⇧ R`) avec guides à tirer, grille de mise en page (`⇧ G`), grille de pixels dès 800 %
  (`Ctrl ⇧ '`). Le rendu est le HTML/CSS de DualEngine dans chaque artboard ; pendant un geste seul
  l’élément tiré bouge (transform), puis **une** transaction RFC 6902.
- **Outils** : Cadre (F), Rectangle (R), Ellipse (O) dans la barre flottante, Texte (T : sur un texte
  du modèle, l’édition sur place d’avant ; ailleurs, un texte DualEngine édité sur place), Image (I,
  quand la sélection est dans une section détachée), Main (H). Dessiner sur une section du modèle la
  détache d’abord (une étape d’annulation de plus).
- **Inspecteur** (Réglages, aux contrôles et au chrome de l’onglet Design) : écran modifié,
  position / contraintes, dimensions (fixe / contenu / remplir, min / max), Auto Layout (libre / pile
  / grille, direction, gap ou Auto, marges, alignement 3 × 3, retour à la ligne, colonnes, clip),
  apparence (opacité, rayons par coin, lissage squircle), remplissages (uni, dégradés, image —
  `jcolor.js`), bordure, effets (ombres, flous), texte (contenu, police de la boutique ou du
  catalogue, graisse, taille, interligne, espacement, alignement, casse, couleur), image (photos
  d’exemple, « Mettre ma photo »), web (balise, lien), CSS exact. Un élément d’une section **non
  détachée** garde l’onglet Design et `elementStyles` comme avant.
- **Calques** : les nœuds de la section détachée sous sa ligne (œil, double-clic = renommer).
- **Historique** : chaque geste est une transaction de l’historique DualEngine, poussée sur la pile
  unique du Studio (`_internals.pushEntry`) : `Ctrl Z` / `Ctrl ⇧ Z` passent de l’une à l’autre.
- **Code / export** : l’onglet Code (CSS) montre le CSS de DualEngine du nœud ou de la section ;
  « Exporter en HTML / CSS » télécharge le document de `DualEngine.exportDocument`.

**Vague 1 de l’audit (6 novembre 2026)** :
- **Le geste suit** : pendant un déplacement ou un redimensionnement, le cadre de sélection, l’étiquette
  de taille et les champs X / Y / L / H de l’inspecteur suivent l’élément tiré, en direct.
- **Sélection multiple de nœuds** : l’inspecteur montre « Mixte » quand les valeurs diffèrent (champs,
  segments, menus, couleurs) et une valeur tapée s’écrit sur tous ; le contenu d’un texte ne se modifie
  qu’un par un. Les 8 poignées redimensionnent la **boîte du groupe** (chaque nœud garde sa place et sa
  part, `Maj` = ratio, `Alt` = depuis le centre), en une transaction ; le glisser déplace le groupe.
- **Aligner / répartir** : une rangée de 6 + 2 boutons en tête de l’inspecteur des nœuds, et les
  raccourcis de Figma (Alt A D W S H V ; répartir : Alt ⇧ H / V, Ctrl ⌥ H / V sur Mac). Ctrl Alt C / V copie et colle aussi le style d’un nœud (remplissages, bordures, effets, coins, opacité, style du texte).
- **Raccourcis des nœuds** : Ctrl ⇧ H (masquer), Ctrl ⇧ L (verrouiller : le nœud ne se tire plus),
  Ctrl R / F2 (renommer dans les calques), Tab / ⇧ Tab (frères), Entrée / ⇧ Entrée (enfants / parent).
  Sélectionner un nœud sur le canevas déplie sa section dans les calques et y fait défiler sa ligne.
- **Recadrer une photo détachée** comme une photo du modèle : double-clic (ou Entrée) → la photo entière
  en transparence autour du cadre, glisser pour la placer, molette ou curseur pour zoomer (100–400 %),
  formats Libre / Orig. / 1:1 / 4:5 / 3:4 / 16:9, Entrée / Échap / Terminé. L’inspecteur a le zoom, le
  point focal (X / Y) et 6 filtres (lumière, contraste, saturation, N & B, sépia, teinte). Modèle :
  `fit: 'crop'`, `crop { x, y, w, h, fx, fy }` (fenêtre visible, `w = 1 / zoom`, point focal) et
  `adjust { brightness, contrast, saturate, grayscale, sepia, hue }` ; `engine/css.js` les écrit en
  `object-position`, `scale()` autour du point focal rogné par `clip-path: inset()` (la mise en page ne
  bouge jamais, la rotation se compose) et `filter`. Un ancien recadrage (sans `fx`) garde son rendu.
- **Ce que garde une section détachée** : les comportements de la boutique (`data-jst-action` : « Ajouter »
  ajoute toujours au panier, une carte ouvre son produit, un lien sa page ; leurs `aria-label` ; les
  `href`), et **les liaisons au catalogue** : dans une carte produit, le nom, le prix et la photo
  deviennent des nœuds liés (`node.bind = { product, field: 'name' | 'price' | 'image' }`). Le rendu
  (`engine-sections.js` `boundSection`, appelé par `render.js` avec son modèle) y met le nom, le prix et
  la photo actuels du produit : renommer un produit ou changer son prix se voit dans la section
  détachée. Sur le canevas, modifier le texte d’un nom ou d’un prix lié modifie **le produit** ;
  l’inspecteur dit « Lié à Produit · nom » avec « Ouvrir le produit » et « Délier ».
- **Export HTML / CSS** : la racine est une `<section>`, les classes sont nommées d’après les calques
  (`nos-soins__nom`, `-2` en cas de doublon ; les classes `de-xxxxxxxx` restent internes au Studio), les
  photos d’exemple pointent vers leur copie publique (`https://jeere.kreeative.xyz/creer/img/…`), jamais
  vers l’adresse locale du Studio ; les photos de la vendeuse sont embarquées.

Points d’accroche ajoutés à `studio.js` (petits, localisés) : `ZOOM_MIN / ZOOM_MAX`, `pushEntry` et
les entrées qui s’annulent elles-mêmes dans `undo` / `redo`, `hooks.customInspector`,
`hooks.validateSelection`, `hooks.treeSection`, `hooks.treeRowSelected`, les outils `frame`, `rect`,
`ellipse`, `image`, et `afterChange`, `zoomRange`, `isSpaceHeld` dans `_internals`.

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
| F, R, O · I | Cadre, Rectangle, Ellipse · Image (dans une section détachée) : dessiner des nœuds DualEngine (une section du modèle est d’abord détachée). P, L, K : un toast explique le modèle |
| Ctrl G · Ctrl ⇧ G · ⇧ A · ⇧ R · ⇧ G · Ctrl Alt B | Grouper · dissocier · Auto Layout · règles · grille de mise en page · détacher / rattacher (sections détachées) |
| Ctrl S | Enregistrer maintenant (« Enregistré ») |
| Ctrl E | Exporter la fiche (JSON) |
| Espace + glisser | Déplacer la vue |
| Ctrl molette, + / − | Zoom (vers le curseur à la molette ; + / − marchent avec ou sans Ctrl) |
| Ctrl 0, ⇧ 1 | Ajuster à l’écran (le cadrage d’ouverture : largeurs des artboards, haut de page) |
| ⇧ 2 | Zoomer sur la sélection (comme Figma) |
| Ctrl 1, ⇧ 0 | Zoom 100 % |
| 1 … 9, 0 | Opacité de la sélection : 10 % … 100 % (Figma) ; deux chiffres tapés vite donnent la valeur exacte (« 4 » « 5 » = 45 %). Sections, éléments du modèle (`elementStyles`, au point de rupture et à l’état affichés), nœuds DualEngine. Par position de touche (`e.code`) : « ( » de l’AZERTY = 5 |
| Alt 1 … 5 | Accueil · Fiche produit · Panier · Paiement · Confirmation (les chiffres seuls servaient aux pages jusqu’à la vague 1 de l’audit) |
| Alt A · D · W · S · H · V | Nœuds d’une section détachée : aligner à gauche · à droite · en haut · en bas · centrer horizontalement · verticalement (un nœud : dans son cadre ; plusieurs : sur leur boîte commune ; dans une pile : `align-self`, ou l’alignement de la pile sur son axe principal). La lettre est lue sur `e.key` quand c’est une lettre (AZERTY), sinon sur `e.code` (Option de Mac) |
| Alt ⇧ H / V (Mac : Ctrl ⌥ H / V ; Ctrl Alt H aussi) | Répartir l’espacement horizontal / vertical (3 éléments libres ou plus), le mapping de Figma : sous Windows Ctrl Alt V reste « coller le style » (⌘ ⌥ V sur Mac) |
| Ctrl ⇧ H · Ctrl ⇧ L · Ctrl R, F2 | Sur des nœuds : masquer / afficher · verrouiller · renommer (le calque devient un champ) |
| Tab / ⇧ Tab · Entrée / ⇧ Entrée | Sur des nœuds : frère suivant / précédent · les enfants (une photo : le recadrage ; un texte : l’édition) / le parent |
| Ctrl Alt [ / ] | Replier / afficher le panneau de gauche / de droite |
| Ctrl Alt P | Passer à l’éditeur simple, sur la même fiche : ce qui vient d’être tapé est validé et enregistré avant de partir |
| D | Téléphone seul · les deux · ordinateur seul |
| Clic droit | Menu contextuel : copier · coller · dupliquer · masquer · supprimer |
| Double-clic sur un texte sans champ | Sélectionne le sous-élément et met le curseur dans le champ de l’inspecteur |
| ? | Le panneau des raccourcis (groupés comme Figma) |
| Échap | Menu contextuel → fenêtre d’insertion / note → dialogues → outil Texte/Commentaire → sous-élément → section → rien ; sort d’un champ |

**Ctrl Z depuis un champ de l’inspecteur** (Design, Réglages, nœuds, barre rapide) : tant qu’on tape,
c’est l’annulation du texte du champ ; une fois la valeur validée (Entrée, un changement, un glisser,
ou le champ juste focalisé), c’est l’annulation du document, et le champ rend la main (« 20, Entrée,
Ctrl Z » comme dans Figma).

Un dialogue ouvert (`aria-modal`) **bloque les raccourcis d’édition** : Suppr, Ctrl D, les
flèches et les chiffres ne touchent plus le canevas derrière lui (Ctrl S / Ctrl E restent permis, Échap
ferme). Les calques se pilotent aussi au clavier : Tab entre dans l’arborescence (`role="tree"`,
focus itinérant), ↑/↓ passent de ligne en ligne, Entrée ou Espace sélectionne.

## Publier, partager

« Publier » **valide la fiche** (`JEERE_DATA.validate`) et ouvre le dialogue : statut
(APPROUVÉ / À CORRIGER), score sur 100, les premiers points à corriger, l’adresse
`<boutique>.jeere.shop` (`subdomainFor`), et la vérité du prototype : *la mise en ligne arrive
avec le backend, rien n’est publié pour l’instant*. « Partager » ouvre un dialogue distinct,
tourné vers la fiche-fichier : adresse, télécharger (action principale) / copier / importer le
JSON, ouvrir l’éditeur simple. Dans chaque dialogue, une seule action est primaire.

## Abonnements Studio

La demande de la fondatrice : un Studio **pleinement utilisable avec un abonnement qui le débloque
entièrement**, à des prix compétitifs face à Framer et Webflow. Tout est en place de bout en bout,
en local : tarifs (accueil et page dédiée), essai, paiement (mode démo), déblocage immédiat,
gestion de l’abonnement, factures, places d’équipe.

### Ce que font Framer et Webflow (relevé du 5 novembre 2026)

Conversion : 1 $ ≈ 575 FCFA (indicatif, fin octobre 2026 : 560 à 586 selon les sources) ;
1 € = 655,957 FCFA (parité fixe).

| Offre | Annuel (par mois) | Mensuel | En FCFA (annuel / mensuel) | Ce qu’on a |
| --- | --- | --- | --- | --- |
| Framer Free | 0 | 0 | 0 | domaine framer, 1 Go, bannière « Made in Framer » |
| Framer Basic | 10 $ | 15 $ ¹ | 5 750 / 8 625 | 1 site, 30 pages, 50 Go, domaine perso |
| Framer Pro | 30 $ | 45 $ ¹ | 17 250 / 25 875 | 1 site, 150 pages, 100 Go |
| Framer, éditeur en plus | 20 $ / éditeur | — | 11 500 | lecteurs gratuits, éditeur contenu 10 $ |
| Webflow Starter | 0 | 0 | 0 | webflow.io, 2 pages, 1 Go, badge « Made in Webflow » |
| Webflow Basic (site) | 15 $ | 25 $ | 8 625 / 14 375 | domaine perso, 300 pages, 10 Go |
| Webflow Premium (site) | 25 $ | 39 $ | 14 375 / 22 425 | CMS, 50 Go (ex-CMS + Business, mai 2026) |
| Webflow E-commerce Standard | 29 $ | — | 16 675 | 500 articles, 2 % de frais |
| Webflow Workspace Core / Growth | 19 $ / 49 $ | — | 10 925 / 28 175 | espaces d’équipe internes |
| Webflow Workspace Freelancer / Agency | 16 $ / 35 $ | — | 9 200 / 20 125 | pour les clients d’agence |
| Webflow, place en plus | Full 39 $ · Limited 15 $ | — | 22 425 / 8 625 | relecteurs gratuits |

¹ Le prix mensuel de Framer est derrière un interrupteur de sa page ; le chiffre vient d’un relevé
tiers d’octobre 2026.

Sources :
- Framer : https://www.framer.com/pricing (page officielle, lue le 5 novembre 2026 : Basic 10 $,
  Pro 30 $ en facturation annuelle, « Additional editors are $20 / month, and viewers are free ») ;
  https://siter.io/framer-pricing (relevé du 27 octobre 2026 : limites, badge, places) ;
  https://saascrmreview.com/?p=14254 (prix mensuels 15 $ / 45 $).
- Webflow : https://webflow.com/pricing (page officielle, lue le 5 novembre 2026 : Basic 15 $,
  Premium 25 $ en annuel, Workspace Core 19 $, Growth 49 $, Freelancer 16 $, Agency 35 $, places Full
  39 $ et Limited 15 $) ; https://webflow.com/blog/simplified-plans-and-updated-pricing-2026 (13 mai
  2026 : Basic 15 $ / 25 $, Premium 25 $ / 39 $).
- Taux : https://www.currencybeacon.com/rates/USD/XOF (≈ 585,6 au 30 octobre 2026) et
  https://www.mexc.co/price/USD/XOF (≈ 560,1) : d’où 575 retenu, à mettre à jour avant le lancement.

### Les formules Jeere Studio

| | Découverte | Solo | Pro (le plus choisi) | Agence |
| --- | --- | --- | --- | --- |
| Annuel, par mois | 0 | **5 400 FCFA** | **16 900 FCFA** | **54 900 FCFA** |
| Facturé par an | — | 64 800 FCFA | 202 800 FCFA | 658 800 FCFA |
| Mensuel | 0 | 7 900 FCFA | 24 900 FCFA | 79 900 FCFA |
| ≈ € / mois (annuel · mensuel) | — | 8,23 · 12,04 | 25,76 · 37,96 | 83,69 · 121,81 |
| ≈ $ / mois (annuel · mensuel) | — | 9,39 · 13,74 | 29,39 · 43,30 | 95,48 · 138,96 |
| Boutiques dans le Studio | 1 | 1 | 3 | 10 |
| Places | 1 | 1 | 2 | 5, puis 10 900 FCFA par place et par mois (9 900 en annuel), jusqu’à 25 |
| Studio | tout l’éditeur, avec les verrous ci-dessous | **tout débloqué** | **tout débloqué** | **tout débloqué** |
| Support | WhatsApp | WhatsApp | prioritaire (< 2 h ouvrées) | interlocuteur dédié |

Plus un **essai de 14 jours** de tout le Studio (au niveau Pro), une fois par compte, **sans moyen
de paiement** : à la fin, retour en Découverte, rien n’est effacé, rien n’est prélevé.

**Pourquoi ces prix (6 novembre 2026, à la demande de la fondatrice : « juste en dessous » de Framer, Webflow et
Figma, parce que la vue avancée vaut ces outils).** Références (en dollars, par mois) : Framer Basic 10 $ à l’année /
15 $ au mois, Framer Pro 30 $ / 45 $, éditeur en plus 20 $ ; Figma Professional, place complète 16 $ / 20 $ ; Webflow
Basic 15 $, Premium 25 $. Sources : https://siter.io/framer-pricing, https://saascrmreview.com/?p=14254,
https://saascrmreview.com/figma-pricing/, https://webflow.com/pricing.
- **Solo** (≈ 9,39 $ à l’année, 13,74 $ au mois) : juste sous Framer Basic (10 $ / 15 $) et sous Figma Professional
  (16 $ / 20 $).
- **Pro** (≈ 29,39 $ / 43,30 $) : juste sous Framer Pro (30 $ / 45 $).
- **Agence** (≈ 95,48 $ / 138,96 $, 5 places et 10 boutiques comprises) : sous ce que coûtent 5 éditeurs chez Framer
  (Pro + 4 × 20 $ = 110 $ à l’année) et sous un espace Agency Webflow avec ses places. La place en plus
  (9 900 FCFA ≈ 17 $) reste sous les 20 $ de Framer.
- **L’annuel** coûte environ 30 % de moins (−32 %, −32 %, −31 %), comme Framer (−33 %).
- Les montants restent en « 900 », lisibles et faciles à payer par mobile money.

**Le principe des formules** est celui des formules boutique de Jeere : on monte quand on
grandit, pas pour débloquer une fonction. **N’importe quel abonnement payant, et l’essai,
débloquent tout le Studio.** Solo, Pro et Agence ne diffèrent que par le nombre de boutiques, de
places et le niveau de support.

### Ce que Découverte garde verrouillé (visible, jamais caché)

`JeerePlans.FEATURES` ; chaque verrou ouvre la feuille « Avec un abonnement Studio » (la fonction
expliquée, l’essai ou le compte, les trois formules avec mensuel / annuel, « Comparer toutes les
formules », « Mode démo · aucun paiement réel ») :

| id | Où | Découverte |
| --- | --- | --- |
| `code` | onglet Code de l’inspecteur (CSS et JSON de la sélection), aussi par la palette | cadenas sur l’onglet ; le clic ouvre la feuille |
| `png` | « Exporter en image » (palette, dialogue Partager / Publier) | cadenas sur le bouton ; la feuille au lieu de l’export |
| `blocks` | Mes blocs (enregistrer, importer) | 3 blocs (« Mes blocs · 2 / 3 ») ; le 4ᵉ ouvre la feuille ; un import s’arrête à 3 |
| `versions` | Historique (versions nommées) | 3 versions (« 2 / 3 ») ; le 4ᵉ instantané ouvre la feuille, l’instantané automatique attend, jamais une version à elle effacée pour faire de la place |
| `comments` | outil Commentaire (C, bouton, palette) | cadenas sur l’outil ; l’outil revient à Déplacer et la feuille s’ouvre ; les épingles déjà posées restent visibles |
| `fonts` | Design › Typographie : les 33 polices du catalogue par élément | cadenas sur chaque police du catalogue ; les polices du modèle restent libres |
| `badge` | dialogue Publier : « Badge « Fait avec Jeere » » | interrupteur verrouillé ; avec un abonnement, il est retiré par défaut (`hideBadge`) |

Non verrouillé, à dessein :
- **l’export de la fiche (JSON, Ctrl E)** : Jeere promet l’export des données dans chaque formule ;
- **le domaine personnalisé** : il est inclus dans toutes les formules boutique, dans le tableau
  de bord. Le retirer casserait la promesse de la page d’accueil ;
- **les aperçus de 360 à 1440 px** : le responsive est le cœur du Studio.

En Découverte, l’éditeur entier marche : sections, calques, Design, raccourcis, jetons, images,
contrastes, mesures. Avec un abonnement ou l’essai, les limites du module reprennent (20 blocs,
15 versions, gardes de taille) et tout le reste est ouvert. Les suites de tests existantes
tournent avec un abonnement Pro actif (voir plus bas).

### Où vit l’abonnement

Il n’y a pas de clé à part. L’abonnement est `studio` dans le compte, `localStorage['jeere-account']` :
`JEERE_DATA.normalizeAccount` le garde tel quel (un objet de moins de 60 Ko, seulement s’il y en a
un, donc un compte sans abonnement garde exactement sa forme), et `JeerePlans.normalizeSub` le
répare à chaque lecture. La forme est décrite en tête de `plans.js` : `plan`, `period`
(`mois` / `an`), `status`, `startedAt`, `periodEnd`, `cancelAtPeriodEnd`, `pending`, `trialUsed`,
`trialEndsAt`, `extraSeats`, `members`, `invoices`, `method`, `hideBadge`.

L’état vivant se calcule à la volée (`JeerePlans.state()`) :
- `free` : Découverte, ou pas de compte, ou un compte déconnecté ;
- `trial` : jusqu’à `trialEndsAt` ;
- `active` ;
- `canceling` : annulé, encore actif jusqu’à `periodEnd` ;
- `due` : la période est finie et rien n’est payé. Le mobile money n’est jamais débité tout seul,
  donc il reste 7 jours (`GRACE_DAYS`) pour renouveler, sans rien perdre ;
- ensuite, retour en Découverte.

Les pages qui suivent l’abonnement :
- **Le Studio** se met à jour sur l’évènement `storage` : un paiement fait dans un autre onglet
  débloque l’éditeur ouvert, avec un toast. Il vérifie aussi chaque minute qu’un essai n’est pas
  arrivé à sa fin.
- **Le tableau de bord** relit le compte après chaque changement, pour que sa copie en mémoire
  n’écrase jamais l’abonnement.
- **`compte/`** garde l’abonnement quand on se réinscrit avec le même numéro.

### Les parcours

- **Essayer** :
  - « Essayer le Studio 14 jours » sur l’accueil (`#studio`) ouvre `studio/?essai=1`. Avec un
    compte connecté, l’essai démarre et l’éditeur se débloque aussitôt.
  - Sans compte, la modale propose « Créer mon compte » / « J’ai déjà un compte », qui ouvrent
    `../compte/?suite=studio`. Après l’inscription, « Démarrer mon essai du Studio » est le premier
    choix ; après la connexion, on revient directement au Studio.
  - L’essai démarre aussi depuis la feuille, la modale de bienvenue, la page des abonnements et le
    tableau de bord.
- **S’abonner** se fait sur la page des abonnements, `../abonnements/` :
  - la page a les cartes, l’interrupteur mensuel / annuel, le tableau comparatif (sur téléphone,
    une colonne à la fois, choisie par des onglets), la FAQ et le paiement en
    quatre étapes : formule (et places en plus pour Agence), période, paiement, confirmation ;
  - les moyens de paiement sont Wave, Orange Money, MTN MoMo, Moov Money (numéro qui paie) et la
    carte (page sécurisée du partenaire) ;
  - le récapitulatif donne le prix, le crédit au prorata quand on monte de formule, « À payer
    aujourd’hui » et la prochaine échéance ;
  - « Mode démo » est affiché à chaque étape ;
  - la feuille du Studio envoie directement à l’étape paiement :
    `?plan=pro&periode=an&retour=studio#paiement`. À la fin, « Retour au Studio » ramène dans
    l’éditeur, déjà débloqué.
- **Gérer** se fait dans le tableau de bord, Paramètres › **Studio avancé**
  (`../admin/#parametres/studio`, aussi dans le menu du compte) :
  - la formule, l’état, la facturation, l’échéance, le moyen de paiement, les boutiques et les
    places ;
  - « Changer de formule » et « Passer à l’annuel » passent par le paiement, avec un crédit au
    prorata ;
  - « Passer au mensuel » et toute descente de formule sont programmés à la fin de la période,
    sans paiement ;
  - « Annuler l’abonnement » garde tout actif jusqu’à la fin de la période, puis Découverte ;
    « Reprendre » l’annule ;
  - les places : Pro donne 1 invitée, Agence 4, plus des places en plus ;
  - les factures (démo) et ce que l’abonnement débloque.
- **`compte/`** affiche la ligne « Studio » (Découverte, essai, formule et échéance), avec
  « Gérer mon abonnement Studio » et « Ouvrir le Studio ».

Le Studio reste réservé à l’ordinateur et à l’iPad. Sur téléphone, la page des abonnements et le
tableau de bord marchent entièrement ; seul l’éditeur affiche son écran « sur ordinateur ».

### Le paiement : l’adaptateur, et où brancher Paystack et Wave

`JeereBilling.startCheckout(planId, period, method, { phone, extraSeats })` renvoie une promesse :
`{ ok: true, invoice, quote, state }` ou `{ ok: false, reason, message }`. Elle :
1. vérifie le compte, la formule, le moyen de paiement et le numéro ;
2. calcule le devis (`JeerePlans.quote`) ;
3. appelle le fournisseur (`providers[...].charge(intent)`) ;
4. active l’abonnement et ajoute la facture.

Aujourd’hui, seul le fournisseur `demo` marche : il simule la validation en 0,9 s et ne prélève
rien. `ROUTES` dit qui prendra quoi : Wave Checkout pour Wave, Paystack pour Orange Money, MTN
MoMo, Moov Money et la carte. Les fournisseurs `paystack` et `wave` existent déjà et répondent
« pas encore connecté ». Pour les brancher :

1. **Côté serveur** (une Edge Function Supabase `studio-checkout`, avec les clés secrètes, jamais
   dans le navigateur), créer la transaction :
   - **Paystack** : `POST https://api.paystack.co/transaction/initialize` avec
     - `amount` (en FCFA ; vérifier l’unité XOF chez Paystack),
     - `currency: 'XOF'`,
     - `channels: ['mobile_money', 'card']`,
     - `metadata: { account, plan, period, extraSeats }`.
     Le navigateur ouvre ensuite `authorization_url` (ou Paystack Inline).
   - **Wave** : `POST https://api.wave.com/v1/checkout/sessions` avec `amount`, `currency: 'XOF'`,
     `success_url`, `error_url` et `client_reference` (l’id de l’abonnement). Le navigateur va
     ensuite sur `wave_launch_url`.
2. **Le webhook** (`studio-billing-webhook`) est le seul à activer une formule. Il vérifie la
   signature :
   - Paystack : `x-paystack-signature`, HMAC SHA-512 du corps avec la clé secrète ;
   - Wave : `Wave-Signature`, HMAC SHA-256 avec le secret du webhook.
   Puis il écrit l’abonnement dans une table `studio_subscriptions` (et la facture).
3. **Le navigateur** : `providers.paystack.charge` / `providers.wave.charge` appellent
   `studio-checkout`, redirigent, puis relisent l’abonnement au retour.
   - `activate()` (dans `plans.js`) ne doit plus être appelé côté client hors du mode démo.
   - `JeereBilling.useProvider('paystack')` bascule le parcours.

**BCEAO.** Jeere ne détient jamais l’argent des acheteurs des boutiques : il passe par un
partenaire agréé et va directement à la vendeuse. L’abonnement Studio est différent : c’est le
prix d’un logiciel, payé à Jeere elle-même. Encaisser un abonnement SaaS sur le compte marchand de
Jeere est donc permis, sans rien changer à la règle pour l’argent des boutiques.

### Tests

`scratchpad/plans/plans-test.js` (Playwright) couvre :
- les verrous de chaque formule ;
- l’essai (démarrage, unicité, fin) ;
- le paiement avec chacun des cinq moyens en mode démo ;
- le déblocage immédiat, aussi dans un onglet Studio déjà ouvert ;
- l’annulation et la descente de formule ;
- la persistance après rechargement ;
- l’interrupteur et le tableau des tarifs ;
- la page des tarifs sur téléphone.

Captures dans `scratchpad/plans/shots/`. Les suites existantes du Studio (`studio-test.js`,
`power-test.js`, `toolbar-test.js`, `elstyles-test.js`) posent un compte avec un abonnement Pro
actif dans leur préparation : elles vérifient le Studio débloqué, comme avant.

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
