# Créer une boutique sur mesure compatible avec Jeere

Fiche technique pour une autre session qui doit construire une boutique (par exemple la maquette ANSE) qui se vend avec Jeere et se modifie dans son éditeur.

## 1. Où vit le code

- **Dépôt GitHub :** `kreeative/kreeative-`
- **Jeere :** dossier `concepts/jeere/`, sur la branche `claude/session-setup-kcwzk4`. C'est cette branche que sert https://jeere.kreeative.xyz.
- **Les sites sur mesure des clientes :** un dossier par site dans `concepts/<nom>/`, sur la branche `claude/kreeative-portfolio-design-n2a770`. Cette branche sert https://kreeative.xyz. Exemples :
  - `concepts/joshua-cooker/`
  - `concepts/sonia-luxury-hair/`

Il n'y a **pas de dossier « themes »** à la Shopify. Jeere offre deux façons de faire une boutique, et pour ANSE il faut la deuxième.

| | A. Boutique Jeere à modèle | B. Site sur mesure + Jeere Connect (**à utiliser pour ANSE**) |
|---|---|---|
| Design | Un des 3 modèles intégrés (`plateau`, `cocody`, `treichville`), réglé par couleurs, polices et sections | Le design de la maquette, en HTML et CSS écrits à la main |
| Où | Un enregistrement « fiche » JSON dans la base Supabase (`public.stores.fiche`), affiché par `concepts/jeere/b/` | Un dossier de fichiers dans `concepts/<nom>/` |
| Produits, prix, panier, commandes | Dans la fiche | **Dans une boutique Jeere (sa fiche)** : le site les lit avec `jeere-connect.js` |
| Éditeur | L'éditeur de boutique (`concepts/jeere/creer/`) et le Studio (`concepts/jeere/studio/`) | Le Studio, rubrique « Mes sites » (`concepts/jeere/studio/sites/`) : n'importe quel texte, image ou style de la page, sans rien déclarer |
| Nouveau modèle de design | Demande du code dans Jeere (`creer/render.js`, `creer/store.css`, `creer/data.js`) | Un nouveau dossier, rien à changer dans Jeere |

Créer un vrai nouveau « modèle » de type A demande de modifier le moteur de Jeere. C'est à demander à la session Jeere : une autre session ne doit pas le faire.

## 2. Structure d'un site sur mesure (méthode B)

```
concepts/anse/
  index.html        la page (HTML écrit à la main, sans framework, sans build)
  style.css         facultatif (le CSS peut aussi être dans <style> dans la page)
  img/              les images du site : .webp de préférence, .jpg ou .png
  fonts/            facultatif
```

- **Pas de React ni de Liquid.** Le site est du HTML statique, servi tel quel par Vercel.
- L'éditeur lit le fichier HTML **comme du texte source** et ne réécrit que les octets touchés (`studio/sites/sites-core.js`). Le formatage et les scripts restent intacts.
- Gardez donc un HTML propre et lisible : un élément par idée, et pas de contenu généré par JavaScript pour ce que la cliente doit pouvoir modifier.

Dans le `<head>`, chargez Jeere Connect :

```html
<script src="https://jeere.kreeative.xyz/connect/jeere-connect.js" data-store="anse" defer></script>
```

`data-store` est l'adresse (le « slug ») de la boutique Jeere qui porte les produits : 3 à 40 caractères, minuscules, chiffres et tirets.

## 3. Ce qui est modifiable dans l'éditeur

### Méthode B (« Mes sites »)

**Rien à déclarer.** Dans le Studio, tout élément de la page est sélectionnable, et on peut :
- modifier ses **textes** sur place ;
- remplacer ses **images** (l'image est enregistrée dans `img/` du site) ;
- changer ses **styles** depuis le panneau Design : couleurs, tailles, espacements, position, etc. Les changements s'écrivent en `style="…"` sur l'élément ;
- dupliquer, supprimer ou réordonner des éléments.

**Pour les réglages du sac** (couleur du cadre, taille, position pour régler le dépassement des anses) : mettez chaque réglage dans une **propriété CSS ordinaire**, sur **son propre élément**, écrite en `style` dans le HTML. La cliente la change alors directement dans le panneau Design, produit par produit :

```html
<figure class="sac" data-jeere-product="p1">
  <div class="sac__cadre" style="background-color:#E9D8BD">                <!-- couleur du cadre -->
    <img class="sac__photo" src="img/sac-1.webp" alt="Sac ANSE Marron"
         style="width:78%; margin-top:-12%">                               <!-- taille, puis position (dépassement des anses) -->
  </div>
  …
</figure>
```

N'utilisez **pas de variables CSS** (`--cadre`) pour ces réglages : le panneau Design règle les propriétés, pas les variables.

### Méthode A (pour information) : les sections de la fiche

Le schéma est dans `creer/data.js`, objet `sectionTypes`. Chaque type a :
- des champs `fields: [{ key, label, type, max, placeholder, options, min, max, itemFields }]`, de types `text`, `textarea`, `number`, `select`, `image`, `photo` ou `items` ;
- des valeurs par défaut `defaults: { … }`.

Les types de section disponibles sont `announcement`, `hero`, `categories`, `products`, `about`, `reviews`, `delivery` et `whatsapp`. **La fiche n'accepte pas de champs inventés** : `normalizeConfig` les supprime.

## 4. Les produits

Ils vivent dans la fiche de la boutique Jeere (`public.stores.fiche.products`). La forme est normalisée par `normalizeConfig` dans `creer/data.js` :

```json
{
  "id": "p1",
  "name": "Sac ANSE Marron",
  "price": 45000,
  "category": "Sacs",
  "badge": "new",
  "description": "Cuir pleine fleur, anses tressées.",
  "image": "https://aezchxfvzfoqlvzchqyk.supabase.co/storage/v1/object/public/store-media/<uuid>/<fichier>.webp",
  "photo": null,
  "art": "bag",
  "color": "#E9D8BD",
  "alt": "Sac ANSE Marron, vue de face"
}
```

- `id` : `p1`, `p2`… Il est donné par Jeere et reste stable. C'est la clé que le site utilise dans `data-jeere-product="p1"`.
- `price` : un entier en **FCFA** (pas de centimes).
- `badge` : `new`, `best`, `promo` ou `null`.
- `image` : seule une photo envoyée dans Jeere (bucket `store-media`) ou une image `data:` est acceptée.
- `art` et `color` : l'illustration utilisée quand le produit n'a pas de photo.
- **Pas de variantes** (taille, couleur…) dans la fiche aujourd'hui. Un sac en deux couleurs = deux produits.
- **Le stock et la disponibilité** sont gérés dans le tableau de bord. Un produit épuisé ou retiré passe en `data-jeere-state="off"` sur le site.

**Sur le site sur mesure**, la photo affichée peut rester celle du site (`img/…`). Jeere Connect ne la remplace que si la fiche a une photo en `https`.

## 5. Médias et styles

- **Site sur mesure :**
  - les images sont des fichiers du dossier `img/` ;
  - les styles sont votre CSS, plus les `style="…"` écrits par l'éditeur ;
  - les polices sont libres (Google Fonts ou fichiers dans `fonts/`).
- **Fiche Jeere :**
  - les photos sont envoyées dans le bucket public `store-media` (`creer/media.js`) ;
  - le thème est dans `fiche.theme` : `palette` (un id de `palettes`), `colors` (surcharges), `fonts` (paire : `editorial`, `moderne`, `doux`, `audacieux`, `classique`, `simple`), `typography`, `radius`, `buttons` et `intensity`.

## 6. Le lien entre le site et Jeere (Jeere Connect)

Le mode d'emploi complet est en tête de `concepts/jeere/connect/jeere-connect.js`. L'essentiel :

| Attribut | Rôle |
|---|---|
| `data-jeere-product="p1"` | Une carte produit. Elle reçoit `data-jeere-state="on"` ou `"off"`. |
| `data-jeere-name`, `data-jeere-desc`, `data-jeere-price`, `data-jeere-photo` | Remplis depuis la fiche, à l'intérieur de la carte. |
| `data-jeere-add` | Bouton « ajouter 1 au panier ». |
| `data-jeere-count`, `data-jeere-total` | Le nombre d'articles et le total du panier. |
| `data-jeere-lines` + `<template data-jeere-line>` | Les lignes du panier. |
| `data-jeere-inc`, `data-jeere-dec`, `data-jeere-remove` | Plus 1, moins 1, retirer. |
| `data-jeere-checkout` | Envoie la cliente au panier Jeere de la boutique, qui gère la commande et le paiement. |

Le site garde toujours son contenu écrit à la main : si Jeere ne répond pas, la page reste lisible et le panier marche avec les prix de la page.

## 7. Dupliquer pour une nouvelle cliente

1. **Copier le dossier** : `concepts/anse/` → `concepts/<cliente>/`. Remplacer textes, images et `data-store`.
2. **Créer sa boutique Jeere**, celle qui porte les produits :
   - soit par « Nouveau projet client » dans le tableau de bord (`/admin/`) ;
   - soit avec une requête SQL comme `concepts/jeere/connect/seed-stores.sql` (fiche JSON complète, `published = true`).
3. **La rendre modifiable dans le Studio** : c'est la session Jeere qui le fait. Elle ajoute le dossier aux dossiers autorisés de `concepts/jeere/supabase/functions/sites-publish/index.ts` (`SITE_FOLDERS_DEFAULT`), puis régénère `studio/sites/sites.json` (`node concepts/jeere/studio/sites/build-manifest.mjs`).

## 8. Exemple minimal complet

**`concepts/anse/index.html` :**

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ANSE · Sacs</title>
  <script src="https://jeere.kreeative.xyz/connect/jeere-connect.js" data-store="anse" defer></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    .sacs { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 24px; padding: 24px; }
    .sac__cadre { aspect-ratio: 4 / 5; display: flex; justify-content: center; align-items: flex-start; overflow: visible; border-radius: 16px; }
    .sac__photo { display: block; height: auto; }
    .sac[data-jeere-state="off"] [data-jeere-add] { opacity: .4; pointer-events: none; }
  </style>
</head>
<body>
  <section class="hero">
    <h1>Des sacs qui tiennent la main</h1>
    <p>Cuir pleine fleur, anses tressées à Abidjan.</p>
  </section>

  <section class="sacs">
    <figure class="sac" data-jeere-product="p1">
      <div class="sac__cadre" style="background-color:#E9D8BD">
        <img class="sac__photo" data-jeere-photo src="img/sac-marron.webp" alt="Sac ANSE Marron" style="width:78%; margin-top:-12%">
      </div>
      <figcaption>
        <h2 data-jeere-name>Sac ANSE Marron</h2>
        <p data-jeere-price>45 000 FCFA</p>
        <button type="button" data-jeere-add>Ajouter au panier</button>
      </figcaption>
    </figure>
  </section>

  <aside class="panier">
    <p><span data-jeere-count>0</span> article(s) · <span data-jeere-total>0 FCFA</span></p>
    <a href="#" data-jeere-checkout>Commander</a>
  </aside>
</body>
</html>
```

**La fiche de la boutique Jeere `anse`** (extrait ; la fiche complète vient de `JEERE_DATA.defaultConfig('plateau', 'fashion')`, puis `normalizeConfig`) :

```json
{
  "version": 1,
  "template": "plateau",
  "store": { "name": "ANSE", "tagline": "Sacs en cuir, anses tressées", "whatsapp": "+2250700000000", "city": "Abidjan" },
  "payments": { "wave": true, "orange": true, "mtn": true, "moov": false, "cod": true, "card": true },
  "products": [
    { "id": "p1", "name": "Sac ANSE Marron", "price": 45000, "category": "Sacs", "badge": "new", "art": "bag", "color": "#E9D8BD", "description": "Cuir pleine fleur.", "image": null, "photo": null }
  ]
}
```

## 9. Ce qu'il faut demander à la session Jeere

- Créer la boutique Jeere `anse` (sa fiche, ses produits), ou la créer depuis le tableau de bord.
- Ajouter `concepts/anse/` aux dossiers modifiables du Studio et à `sites.json`.
- Toute évolution du moteur : variantes de produits, nouveaux champs de produit, nouveau modèle de type A.
