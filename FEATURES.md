# Fonctionnalités

## Produit

- Auth Clerk (email ou OAuth). Profil obligatoire : nom, pseudo, date de naissance, bio. Mot de passe possible aussi sur un compte OAuth. Suppression du compte (Convex + Clerk).
- Conversations 1:1 : création au clic, lu / non lu, présence, saisie en cours, recherche, images, vocaux, pagination.
- Groupes : création, photo, admins, exclusion, promotion, droit d’écriture (tout le monde ou admins), quitter, supprimer. Sondages.
- Messages : répondre avec citation, modifier, transférer, télécharger, retirer pour tout le monde, supprimer pour soi, masquer une conversation. Clic sur une citation : scroll jusqu’au message d’origine.
- Réactions. Hors blocage, la liste affiche « a réagi avec … » tant que la conversation n’est pas ouverte.
- Vocaux : enregistrement, préécoute, envoi. Citation vocale avec durée.
- Stories 24 h (texte, photo, vidéo), vues, likes, réponses. Visibles pour les gens avec qui une conversation existe déjà. Brouillon de réponse conservé tant que le viewer est ouvert.
- Notes (30 caractères) sur la même ligne que les stories. Likes, commentaires, like sur un commentaire. Une réponse part aussi dans la conversation.
- Blocage depuis le profil ou la liste. Un seul message ensuite, 50 caractères. Dans le fil : « vous a bloqué », puis ce message. Pas de citation dessus. Les réactions ne notifient pas.
- Recherche d’utilisateurs, y compris les comptes bloqués. Notifications navigateur.

## Fichiers Convex

| Fichier | Rôle |
|---|---|
| `schema.ts` | Tables et index |
| `users.ts` | Profil, pseudo, avatar, note, recherche, suppression |
| `conversations.ts` | Liste, DM, groupes, lu, masquer |
| `messages.ts` | Envoi, édition, réactions, pagination, contexte des suggestions |
| `blocks.ts` | Bloquer, débloquer |
| `stories.ts` | Stories, vues, likes, expiration 24 h |
| `notes.ts` | Notes, likes, commentaires |
| `typing.ts` | Saisie en cours |
| `presence.ts` | En ligne |
| `ai.ts` | 4 suggestions Groq, à partir de 5 messages à soi et 10 de l’autre |
| `crons.ts` | Nettoyage de la saisie (1 min) et des stories (15 min) |
| `auth.config.ts` | JWT Clerk, template `convex` |
| `lib.ts` | Auth et helpers partagés |
