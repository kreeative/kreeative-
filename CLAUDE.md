# Jehre — règles permanentes du projet

Ces règles valent pour chaque session. Elles passent avant toute habitude par défaut.

## Le projet
- La plateforme s'appelle **Jehre** (jamais « Jeere », « Gérer », « Jira »). Site : jehre.com.
- L'application est dans `concepts/jeere/`. Pas d'outil de construction : HTML, CSS et JavaScript écrits à la main, servis tels quels par Vercel. Pas de React, pas de TypeScript, pas de Tailwind.
- Ne pas renommer les clés techniques existantes (`jeere-…` en localStorage, `window.Jeere*`, `JEERE_DATA`, noms de tables et de fonctions, en-tête `x-jeere-cron`).
- Marché : l'Afrique de l'Ouest francophone, pas seulement la Côte d'Ivoire.

## Façon de travailler
- Répondre en français, en langage simple, sans jargon.
- Un gros travail se découpe en chantiers. Chaque chantier : un plan validé, le code complet (jamais de morceau « à finir »), une vérification dans un vrai navigateur, des captures d'écran réelles envoyées avant de passer au suivant.
- Dire ce qui a été vérifié et ce qui ne l'a pas été.
- Agir quand la demande est claire ; ne poser une question que si la décision appartient vraiment à la propriétaire.

## Git et mise en ligne
- Commits au nom de la propriétaire du dépôt, **sans aucune mention de Claude** (ni co-auteur, ni lien de session).
- Pas de pull request sans demande explicite.
- Vercel (offre gratuite) : 100 mises en ligne par 24 h. Regrouper les changements : une publication par chantier.
- The Ivory Sukundu (dépôt TISHE) : aucune mise en production sans accord explicite, à chaque fois.
- Les sites des modèles (branche du portfolio kreeative.xyz) : rien n'y est poussé sans permission.

## Secrets et courriels
- Les clés et jetons sont ajoutés par la propriétaire dans Supabase. Ne jamais en demander dans la conversation.
- Un courriel à une cliente ou à un prospect part d'une adresse Jehre (bonjour@ ou contact@jehre.com), jamais d'une boîte personnelle, et seulement après accord.

## Design : règles générales
- Thème **clair** uniquement, partout (fond blanc ou gris très clair, encre noire). Pas de thème sombre, pas de bouton pour y passer, pas de noir et or.
- Police : **Poppins** partout (site, inscription, tableau de bord, Atlas, Studio, courriels), en 400, 500, 600 ou 700. Ni Inter ni Outfit dans l'interface. Les polices proposées aux boutiques des vendeuses ne sont pas concernées.
- L'arc-en-ciel est toujours l'arc-en-ciel complet du logo.
- Aucun texte souligné : le gras sert à insister.
- Textes courts : les gens ne lisent pas.
- Pas d'encadrés promotionnels ni de pastilles ajoutés sans demande.
- Icônes : Iconly (Curved, Bold quand l'élément est actif).
- Notifications : carte blanche, texte gris clair, aucun bord coloré.
- Affiches : fond blanc, vraies maquettes d'iPhone.
- Pages légales : pas de droit ivoirien cité, pas de texte entre crochets à compléter.

## Design : le Studio (éditeurs)
- Les couleurs viennent de `studio/studio-shell.css` (variables `--st-*`). Les contrôles viennent de `studio/studio-kit.css` (classes `jk-*`) et leur comportement de `studio/studio-kit.js` (`JeereKit` : menu maison des listes, chiffres à glisser, couleur) ; la page `studio/kit/` les montre tous.
- Un panneau se compose avec le kit. Ne pas dessiner un nouveau champ, une nouvelle liste ou un nouveau bouton dans un fichier à part.
- Bordures fines (`--jk-hair`), jamais de bordure épaisse ni grise par défaut.
- Tailles compactes : contrôles de 28 px, libellés de 11 px, valeurs de 12 px, chiffres alignés (`tabular-nums`).
- Le **bleu** (`--st-blue`) ne sert que sur la page en cours d'édition : cadre de sélection, poignées, guides. Tout le reste de l'interface est noir et blanc, y compris le contour d'un champ actif.
- Jamais de liste ou de sélecteur de couleur à l'apparence brute du navigateur.
- La zone centrale reste gris clair (`--st-canvas`) pour que les pages blanches, les cadres et les guides s'en détachent.
- « Modèle par Kreeative » n'est jamais modifiable dans un éditeur.
- Les produits se gèrent dans le tableau de bord ; l'éditeur choisit seulement quel produit va dans quelle case.
