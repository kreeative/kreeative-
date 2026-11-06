# E-mails Jeere (Supabase Auth)

À coller dans Supabase › Authentication › Emails (projet « Jeere »). Chaque modèle montre le code ({{ .Token }}) en grand, avec le logo de Jeere (`/img/brand/email-logo.png`, servi par jeere.kreeative.xyz).

| Modèle Supabase | Fichier | Objet (Subject) |
| --- | --- | --- |
| Confirm signup | confirm-signup.html | Votre code Jeere : {{ .Token }} |
| Magic link or OTP | magic-link.html | Votre code Jeere : {{ .Token }} |
| Change email address | change-email.html | Confirmez votre nouvelle adresse Jeere |
| Reauthentication | reauthentication.html | Votre code de confirmation Jeere |

Le prénom vient des métadonnées de l’inscription (`first_name`) ; sans prénom, l’e-mail dit simplement « Bonjour, ».
La durée « 1 heure » correspond au réglage par défaut « Email OTP Expiration » (3 600 s) : à changer dans le texte si ce réglage change.
