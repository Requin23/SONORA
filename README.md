# Sonora — Commande de chansons personnalisées

Plateforme web où un client commande une chanson personnalisée (occasion +
offre + brief créatif), paie en mobile money local, puis suit la production
jusqu'à la livraison du fichier audio. L'admin reçoit une notification à chaque
commande et livre le lien du fichier final, que le client récupère par email ou
WhatsApp.

Stack : **Next.js 16 (App Router) + React 19 + TypeScript + Prisma/PostgreSQL +
Tailwind 4**. Auth client (JWT cookie) + admin (HTTP Basic). Paiement local via
**PayDunya** (Orange Money / Wave / Free Money / Wizall / carte), avec
**YengaPay** en fallback. Emails transactionnels via **Resend**.

---

## Architecture

```
src/
  app/
    [[...path]]/page.tsx          Route serveur unique -> délègue au ClientShell
    [[...path]]/ClientShell.tsx   Front unique (client component) : routing, auth,
                                  wizard de commande, dashboard, admin, paiement
    api/[[...path]]/route.ts      API catch-all (GET/POST/PATCH) : auth, commandes,
                                  checkout, webhooks YengaPay + PayDunya
    layout.tsx, globals.css
  lib/
    auth.ts        Sessions client signées (jose) + hash mots de passe (bcryptjs)
    adminAuth.ts   Basic Auth admin (Edge-compatible)
    prisma.ts      Client Prisma singleton (pattern globalThis)
    sonora.ts      Données statiques (offres/occasions) + types + helpers
    store.ts       Logique métier des commandes (CRUD Prisma)
    yengapay.ts    Client API YengaPay + vérif webhook
    paydunya.ts    Client API PayDunya + vérif IPN (HMAC-SHA512)
    email.ts       Client Resend (emails admin + client)
prisma/
  schema.prisma    Modèles User + Order
middleware.ts      Protection des routes /admin et /api/admin/* (Basic Auth)
```

### Modèle de données (Prisma / PostgreSQL)

- **User** : comptes clients (email unique, passwordHash, nom). Auth par JWT.
- **Order** : commande liée à un client par `userEmail` (pas de FK stricte, pour
  rester rétro-compatible avec les commandes créées avant l'ajout des comptes).
  Stocke le `requestForm` et les `deliverables` en JSON, le `provider` de
  paiement, et le statut (`EN_ATTENTE` → `PAYEE` → `EN_PRODUCTION` →
  `EN_REVISION` → `LIVREE` / `ANNULEE`).

### Flux métier

1. Client : choisit occasion + offre → remplit le brief créatif (destinataire,
   style, anecdotes, **WhatsApp optionnel**) → `POST /api/orders`.
2. Paiement : le client choisit son moyen sur la page `/commande/:id/paiement`
   (Orange Money / Wave / Carte via PayDunya, ou YengaPay en fallback) →
   redirection vers la page de paiement du provider.
3. Admin est notifié par **email** (Resend) avec le détail de la commande + n°
   WhatsApp du client.
4. Admin crée la chanson (manuellement, hors app) puis colle le **lien du
   fichier** (Drive/WeTransfer/…) dans l'admin → la commande passe en `LIVREE`.
5. Le client est notifié de deux façons :
   - **Email** de livraison avec le lien de téléchargement.
   - **WhatsApp** : l'admin clique « Envoyer le lien sur WhatsApp » dans l'admin
     → ouvre un lien `wa.me` pré-rempli vers le numéro du client (envoi depuis
     le téléphone de l'admin, zéro coût, zéro config).

### Sécurité

- Sessions client : JWT signé (HS256), cookie `httpOnly`, `secure` en prod.
- L'email du client vient **toujours de la session**, jamais du corps de requête
  (pas d'usurpation de commande).
- Middleware admin : **fail-closed** (500 si aucun admin configuré).
- Webhooks **fail-closed** : en production, sans secret configuré, les webhooks
  YengaPay et PayDunya sont refusés (on ne valide aucun paiement non signé).
- IPN PayDunya : signature HMAC-SHA512 vérifiée, comparaison en temps constant.

---

## Setup (développement)

### 1. Prérequis
- Node 20+
- Une base PostgreSQL (Neon, Supabase, Railway, locale…)

### 2. Installer
```bash
npm install
```

### 3. Configurer l'environnement
Copier `.env.example` vers `.env` et remplir :

| Variable | Usage |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL (ex: `postgresql://user:pass@host:5432/db`) |
| `AUTH_SECRET` | Chaîne aléatoire longue (signe les sessions JWT). Générer : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Compte admin (Basic Auth) |
| `ADMIN_USER_2` / `ADMIN_PASSWORD_2` | 2e admin (optionnel) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Emails transactionnels (sinon loggés en console) |
| `ADMIN_NOTIFICATION_EMAILS` | Emails admin séparés par virgules |
| `YENGAPAY_*` | Paiement fallback (groupe/projet/api key/webhook secret) |
| `PD_MASTER_KEY` / `PD_PRIVATE_KEY` / `PD_TOKEN` | Clés API PayDunya |
| `PD_MODE` | `test` (sandbox) ou `prod` |
| `PD_WEBHOOK_SECRET` | Secret partagé pour vérifier les IPN PayDunya |
| `NEXT_PUBLIC_APP_URL` | URL publique (ex: `http://localhost:3000`) |
| `NEXT_PUBLIC_ENABLE_DEV_TOOLS` | `true` en dev (bouton « simuler webhook »), **`false` en prod** |

### 4. Base de données
```bash
npm run db:migrate     # crée les tables (User, Order + colonne provider)
npm run db:studio      # (optionnel) inspecter la base
```

### 5. Lancer
```bash
npm run dev            # http://localhost:3000
```

---

## Paiement — configuration PayDunya

1. Créer un compte marchand sur https://paydunya.com → **Integration API** →
   *Set up a new application* → récupérer **Master Key**, **Private Key**, **Token**.
2. Remplir `PD_MASTER_KEY`, `PD_PRIVATE_KEY`, `PD_TOKEN`, `PD_MODE=test`.
3. Dans la console PayDunya, renseigner :
   - **URL de notification (IPN)** : `https://TONDOMAINE/api/webhooks/paydunya`
   - **URL de retour** : `https://TONDOMAINE/commande/:id/suivi`
   - Le **secret partagé** → `PD_WEBHOOK_SECRET` côté app.
4. Activer les moyens souhaités (Orange Money, Wave, Free Money, Wizall, carte)
   sur le compte marchand. La page de paiement PayDunya les affiche
   automatiquement.

> YengaPay reste disponible comme 4e bouton « Autres » sur la page de paiement.
> Ses webhooks utilisent le header/secret `YENGAPAY_WEBHOOK_SECRET`.

---

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run start` | Démarre le build de production |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Migration Prisma |
| `npm run db:studio` | Prisma Studio |

---

## Routes API (résumé)

| Méthode | Route | Auth | Rôle |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | public | Création de compte client |
| POST | `/api/auth/login` | public | Connexion client |
| POST | `/api/auth/logout` | public | Déconnexion |
| GET | `/api/auth/me` | public | Session courante |
| GET/POST | `/api/orders` | client | Lister ses commandes / en créer une |
| GET/PATCH | `/api/orders/:id/form` | client ou admin | Lire/modifier le brief |
| POST | `/api/orders/:id/checkout` | client ou admin | Initier le paiement (`provider`) |
| POST | `/api/orders/:id/deliverable` | admin | Ajouter un livrable |
| POST | `/api/orders/:id/revision` | client ou admin | Demander une révision |
| PATCH | `/api/orders/:id/status` | admin | Changer le statut |
| GET | `/api/admin/orders` | admin | Toutes les commandes |
| POST | `/api/webhooks/yengapay` | webhook signé | Confirmation paiement YengaPay |
| POST | `/api/webhooks/paydunya` | webhook signé | Confirmation paiement PayDunya |
| GET | `/api/offers`, `/api/occasions` | public | Catalogue statique |

---

## Déploiement

App Next.js standard → compatible Vercel / Railway / serveur Node.
Points de vigilance en production :
- `NEXT_PUBLIC_ENABLE_DEV_TOOLS=false`
- `PD_WEBHOOK_SECRET` et `YENGAPAY_WEBHOOK_SECRET` définis (sinon webhooks refusés)
- `AUTH_SECRET` spécifique à l'environnement
- `PD_MODE=prod` + clés PayDunya en mode live (KYC complet côté PayDunya)

---

## Limites connues (MVP)

- Livrable = lien externe collé par l'admin (pas d'upload de fichier dans l'app).
- WhatsApp = lien `wa.me` ouvert depuis le téléphone de l'admin (pas d'envoi
  automatique ; une API Twilio/Meta serait nécessaire pour automatiser).
- Webhook YengaPay : format exact de signature non documenté publiquement —
  vérifie le secret partagé `x-webhook-secret` ; à adapter dès réception de la
  spec officielle depuis la console YengaPay.
