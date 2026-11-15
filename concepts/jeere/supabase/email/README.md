# E-mails Jehre (Supabase Auth)

À coller dans Supabase › Authentication › Emails (projet « Jehre »). Chaque fichier .txt contient le code à copier-coller tel quel dans le champ « Message body ». Chaque modèle montre le code ({{ .Token }}) en grand, avec le logo de Jehre (`/img/brand/email-logo.png`, servi par jeere.kreeative.xyz).

| Modèle Supabase | Fichier | Objet (Subject) |
| --- | --- | --- |
| Confirm signup | confirm-signup.txt | Votre code Jehre : {{ .Token }} |
| Magic link or OTP | magic-link.txt | Votre code Jehre : {{ .Token }} |
| Change email address | change-email.txt | Confirmez votre nouvelle adresse Jehre |
| Reauthentication | reauthentication.txt | Votre code de confirmation Jehre |

Le prénom vient des métadonnées de l’inscription (`first_name`) ; sans prénom, l’e-mail dit simplement « Bonjour, ».
La durée « 1 heure » correspond au réglage par défaut « Email OTP Expiration » (3 600 s) : à changer dans le texte si ce réglage change.
