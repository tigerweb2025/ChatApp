# ChatApp

Messagerie en temps réel. Discussions privées, groupes, stories, notes, vocaux. Dans une conversation, un bouton propose des réponses à partir des derniers messages.

## Stack

- Next.js 16, React 19, Tailwind CSS 4
- Convex : données, temps réel, fichiers, tâches planifiées
- Clerk : authentification
- Groq (`openai/gpt-oss-20b`) : suggestions de réponse

## Lancer en local

```bash
npm install
npx convex dev
npm run dev
```

`.env.local` :

```
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED=1
```

Variables Convex (dashboard → Environment Variables) :

```
CLERK_JWT_ISSUER_DOMAIN=
GROQ_API_KEY=
```

Dans Clerk, créer un JWT template nommé `convex`.

## Fonctionnalités

- Conversations 1:1 et groupes (admins, photo, droit d’écriture)
- Lu / non lu, saisie en cours, présence
- Images, vocaux, sondages, réactions, transfert
- Réponse avec citation, retour au message d’origine
- Stories 24 h (texte, photo, vidéo)
- Notes, likes et commentaires
- Blocage, avec un dernier message de 50 caractères
- Profil, mot de passe, suppression du compte
- 4 suggestions de réponse, à la demande
