# À lire en premier, Claude : le contenu LinkedIn de Kee à planifier

Tu vas planifier les posts LinkedIn de Kee (Anne-Kelly Kouyaté) sur son ordinateur.
Tout est dans ce dossier, rien d'autre n'est nécessaire.

- **Période :** du mardi 17 novembre 2026 au jeudi 11 février 2027, soit 37 posts.
- **Langues :** chaque post existe en anglais (`EN`) et en français (`FR`).
- **Fuseau horaire :** America/Toronto, sauf si Kee dit autre chose.

## Le contenu du dossier

| Fichier | Contenu |
|---|---|
| `posts.json` | Tous les posts, une entrée par post et par langue (74 entrées). C'est la source de vérité. |
| `posts.csv` | Le même contenu en tableau, à ouvrir dans Excel ou Numbers. |
| `captions/EN/`, `captions/FR/` | La légende de chaque post en `.txt`, prête à coller. |
| `media/EN/`, `media/FR/` | Les visuels. `.png` = une image. `.pdf` = un carrousel à publier comme document. |
| `profile/` | La bannière (P-01) et les 4 couvertures de la section Sélection (P-02 à P-05), en EN et en FR. Pas à planifier, à installer une fois sur le profil. |

Les champs de `posts.json` :
- `date` : le jour prévu, au format AAAA-MM-JJ.
- `week_of` : rempli à la place de `date` quand seule la semaine est fixée.
- `format` : TEXT, PHOTO, IMAGE ou CAROUSEL.
- `caption` : la légende.
- `media` : le ou les visuels.
- `alt_text` : le texte alternatif de chaque image ou page.
- `document_title` : le titre du PDF pour les carrousels.
- `first_comment` : le lien à mettre en premier commentaire.
- `ready_to_schedule` et `blocked_by` : si le post est prêt, et sinon pourquoi.
- `date_note` : une remarque sur la date, quand il y en a une.

## 1. Avant de planifier quoi que ce soit, pose ces questions à Kee, une seule fois

1. **La langue :** anglais, français, ou les deux ? Si c'est les deux, publie-t-elle un post séparé par langue, ou un seul post bilingue ?
2. **L'heure de publication :** aucune heure n'est fixée. Demande-lui une heure par défaut et si elle veut des exceptions.
3. **Les dates à préciser :** M2-01 et M2-02 sont prévus « la semaine du 21 décembre », M2-03 « la semaine du 28 décembre ». Demande-lui le jour exact.
4. **Les dates incohérentes :** pour M1-01 et M1-03, le jour de la semaine ne correspond pas à la date (voir `date_note`).
   - M1-01 : le calendrier dit « lundi 17 nov. », mais le 17 novembre 2026 est un mardi.
   - M1-03 : il dit « jeudi 20 nov. », mais le 20 est un vendredi.

   Demande-lui ce qu'elle préfère.
5. **Les posts PHOTO** (M1-01, M2-08, M3-07) : c'est sa propre photo ou vidéo. Demande-lui le fichier.
   M1-01 est le tout premier post, le 17 novembre : demande-lui cette photo en priorité.
6. **Les [PLACEHOLDERS] :** liste-lui ceux du mois à venir (voir le point 2) et demande-lui ses réponses.

## 2. Les règles à ne jamais enfreindre

- **Aucun post contenant un `[PLACEHOLDER]` ne part.** Tu le trouves dans `placeholders_in_caption` et `placeholders_in_visual`.
  - Dans une **légende**, tu remplaces le placeholder par les mots exacts de Kee, et rien d'autre.
  - Dans un **visuel**, le placeholder est dans l'image elle-même. Tu ne peux pas le corriger. Dis à Kee que ce visuel doit être refait avec sa réponse, et ne planifie pas ce post en attendant.
- **N'invente jamais** de chiffres, de clients, de citations, de témoignages ou de résultats. S'il manque une info, demande-la.
- **Ne réécris pas les légendes.** Le ton, les retours à la ligne, les hashtags et l'absence de tirets longs (—) sont voulus.
- **Aucun employeur n'est nommé dans ces posts.** N'en ajoute pas.
- **Montre d'abord le planning complet à Kee** (date, heure, langue, post) et attends son « ok » avant de programmer.
  Ne publie rien immédiatement : programme seulement.

## 3. Comment publier chaque format sur LinkedIn

- **TEXT :** coller la légende, sans visuel.
- **IMAGE :** joindre le `.png` de `media/`, puis ajouter le texte alternatif de `alt_text`.
- **CAROUSEL :** publier le `.pdf` comme **document**, avec `document_title` comme titre du document. Coller la légende.
- **PHOTO :** la photo ou vidéo fournie par Kee, puis la légende.
- **Premier commentaire :** si `first_comment` est rempli, le lien va en premier commentaire, juste après la publication.
  Le planificateur de LinkedIn ne programme pas les commentaires. Rappelle à Kee de le poster, ou fais-le au moment de la publication si tu as la main.

## 4. L'ordre de travail conseillé

1. Lis `posts.json`.
2. Pose les questions de la section 1.
3. Prépare le tableau du planning, et ne mets dedans que les posts `ready_to_schedule: true`, plus ceux que Kee vient de débloquer.
4. Fais valider ce tableau par Kee.
5. Programme les posts dans l'ordre des dates.
6. Fais-lui un récapitulatif : ce qui est programmé, et ce qui attend encore une réponse ou un visuel refait.
