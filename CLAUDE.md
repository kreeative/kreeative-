# Jehre — règles permanentes du projet

Ces règles valent pour chaque session. Elles passent avant toute habitude par défaut.

## Le projet
- La plateforme s'appelle **Jehre** (jamais « Jeere », « Gérer », « Jira »). Site : jehre.com.
- Le site en ligne est dans `concepts/jeere/` : HTML, CSS et JavaScript écrits à la main, servis tels quels par Vercel. **Il est gelé** : seulement des corrections critiques, plus de nouveautés.
- Le nouveau front est dans `app-react/` (branche `migration-react`) : **Next.js, React et TypeScript**. Pas de Tailwind : une feuille de styles par composant (`*.module.css`) et les variables de `app-react/src/styles/tokens.css`.
- La migration garde les mêmes services (Vercel, GitHub, Supabase, Stripe, Resend), les mêmes tables et les mêmes fonctions serveur. Aucune donnée n'est modifiée, aucun webhook n'est touché.
- Ordre de migration : 1) socle et compte, 2) tableau de bord, produits, modèles, éditeur normal, 3) boutique publique et paiement. L'éditeur pro vient après.
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

## Le nouveau front (`app-react/`)
- **Migrer, ce n'est pas redessiner.** Chaque page reprend l'aspect de la page actuelle : mêmes éléments, mêmes mots, mêmes dessins (bouton principal en arc-en-ciel, logo arc-en-ciel du tableau de bord, carte de l'offre de lancement, panneau noir aux dessins de la page du compte). Avant de coder une page, faire une capture de l'actuelle et comparer à la fin.
- Les pages gardent les adresses du site actuel (`/compte/`, `/admin/`, `/b/<boutique>/`), avec la barre finale.
- Tout compte a un e-mail vérifié et un mot de passe (8 caractères au moins, lettres et chiffres). La connexion se fait par code reçu par e-mail ou par mot de passe ; un compte sans mot de passe doit en créer un juste après le code, avant le tableau de bord. Mot de passe oublié : « Réinitialiser » envoie un lien qui ouvre son compte sur le champ du nouveau mot de passe. Textes au plus court.
- Après une connexion, `src/lib/account.ts` écrit la copie locale `jeere-account` que lisent encore les pages non migrées. Ne pas changer sa forme.
- Composants dans `src/components/ui/` (Button, Field, CodeInput, Notice, Icon). Une page se compose avec eux ; pas de champ ni de bouton dessiné dans une page.
- Icônes : `Icon` (Iconly), reprises du site actuel dans `icons.ts`.
- **L'éditeur repose uniquement sur les 7 modèles de designer** (SÈVE, SOYEUSE, MICHOU, ANSE, REGARD, VERNIE, MINUIT ; `src/lib/models.ts`). Il affiche le vrai site du modèle et dialogue avec lui (`connect/jeere-connect.js`) : textes, photos, sections masquées (`store.site`), produit de chaque case (`store.slots`). Jamais l'ancien moteur (`creer/data.js`, `render.js`), ses palettes (Sable, Menthe…), ses mises en page (Plateau, Cocody, Treichville) ni une boutique d'exemple. Sans modèle, l'éditeur renvoie vers la page Modèles.
- Panneaux : `Sheet` (à droite sur ordinateur avec « Ouvrir en grand », tiroir du bas sur téléphone).
- Avant chaque envoi : `npm run typecheck`, `npm run build`, puis `npm test` (navigateur réel, Supabase simulé : aucun courriel envoyé, aucun compte créé).

## Design : le Studio (éditeurs)
- Les couleurs viennent de `studio/studio-shell.css` (variables `--st-*`). Les contrôles viennent de `studio/studio-kit.css` (classes `jk-*`) et leur comportement de `studio/studio-kit.js` (`JeereKit` : menu maison des listes, chiffres à glisser, couleur) ; la page `studio/kit/` les montre tous.
- Un panneau se compose avec le kit. Ne pas dessiner un nouveau champ, une nouvelle liste ou un nouveau bouton dans un fichier à part.
- Bordures fines (`--jk-hair`), jamais de bordure épaisse ni grise par défaut.
- Tailles compactes : contrôles de 28 px, libellés de 11 px, valeurs de 12 px, chiffres alignés (`tabular-nums`).
- Le **bleu** (`--st-blue`) ne sert que sur la page en cours d'édition : cadre de sélection, poignées, guides. Tout le reste de l'interface est noir et blanc, y compris le contour d'un champ actif.
- Jamais de liste ou de sélecteur de couleur à l'apparence brute du navigateur. `studio-kit.js` donne automatiquement le menu maison à toute liste (`<select>`) des éditeurs ; `data-jk-native` pour s'en passer.
- Les fenêtres des deux éditeurs (`.sk-modal`, `.st-modal`) ont un seul style, dans `studio-kit.css`.
- La zone centrale reste gris clair (`--st-canvas`) pour que les pages blanches, les cadres et les guides s'en détachent.
- « Modèle par Kreeative » n'est jamais modifiable dans un éditeur.
- Les produits se gèrent dans le tableau de bord ; l'éditeur choisit seulement quel produit va dans quelle case.
