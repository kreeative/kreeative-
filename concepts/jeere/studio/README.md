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

L’état propre au Studio (drapeau « formule Avancée » vu, sections verrouillées) vit dans sa
propre clé `localStorage['jeere-studio-ui']` et ne touche jamais la fiche.

## Fichiers

Statique, sans build, sans librairie, comme le reste de Jeere. Un seul script, une IIFE,
un global `window.JeereStudio` (exposé aussi pour les tests : `getConfig`, `getState`, `select`,
`showPage`, `undo`, `redo`, `fit`, `setZoom`, `save`, `exportJSON`, `SHORTCUTS`).

| Fichier | Rôle |
| --- | --- |
| `index.html` | La coquille : barre du haut, panneaux, artboards, modales, le symbole `#cloud` (copié de `creer/index.html`). Charge `../creer/data.js`, `../creer/render.js`, `../creer/store.css`. |
| `studio.css` | Le chrome sombre (scopé `.st-*`), le décor de sélection sur les stores (`.st-sel`, `.st-hov`), les jetons d’état (`--ok`, `--warn`, `--err`, `--info`) aux mêmes valeurs que le reste de la plateforme. |
| `studio.js` | Tout le Studio : état, historique, canevas (zoom/pan), sélection, calques, insertion, inspecteur, raccourcis, autosave, dialogues. |

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
| Double-clic sur un texte | Sélectionne le sous-élément et met le curseur dans le champ de l’inspecteur, texte sélectionné |
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

Le test Playwright (74 vérifications : ouverture, rendu, sélection canevas/calques, édition,
historique, glisser-déposer, insertion, masquer/verrouiller, chaque raccourci, autosave,
interop `normalizeConfig`, export, garde petit écran, fiche abîmée) vit dans le scratchpad de la
session (`studio-test.js`) ; il se lance avec `node studio-test.js` contre un serveur local.
