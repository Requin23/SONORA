# Rapport Sonora

Date : 13 juillet 2026

## Livrable

Une application MVP Sonora a ete creee avec Next.js, TypeScript et Tailwind dans `work/sonora`.

Le ZIP fourni contient le projet source portable, sans `node_modules` ni `.next`. Pour le relancer :

```bash
npm install
npm run dev
```

Puis ouvrir :

```text
http://127.0.0.1:3000
```

## Ce qui a ete fait

- Creation d'une application Next.js App Router avec TypeScript et Tailwind.
- Mise en place de l'identite produit Sonora et d'une interface responsive.
- Creation des pages publiques :
  - accueil ;
  - occasions ;
  - detail d'une occasion ;
  - offres ;
  - premium ;
  - FAQ ;
  - a propos ;
  - contact.
- Creation d'un wizard de commande multi-etapes :
  - occasion et destinataire ;
  - style musical ;
  - contenu et anecdotes ;
  - references ;
  - details pratiques ;
  - recapitulatif.
- Creation des offres :
  - Standard : 2 000 FCFA ;
  - Premium : 5 000 FCFA.
- Creation des occasions :
  - anniversaire ;
  - mariage ;
  - naissance ;
  - entreprise.
- Creation d'une API locale couvrant les endpoints prevus :
  - `GET /api/offers` ;
  - `GET /api/occasions` ;
  - `POST /api/orders` ;
  - `GET /api/orders` ;
  - `GET /api/orders/:id` ;
  - `PATCH /api/orders/:id/form` ;
  - `POST /api/orders/:id/checkout` ;
  - `POST /api/webhooks/cinetpay` ;
  - `PATCH /api/orders/:id/status` ;
  - `POST /api/orders/:id/deliverable` ;
  - `POST /api/orders/:id/revision` ;
  - `POST /api/subscriptions/checkout`.
- Mise en place d'un stockage local JSON pour tester sans base externe.
- Ajout d'ecritures atomiques sur la base JSON pour eviter les pertes pendant les tests.
- Creation d'un dashboard client :
  - liste des commandes ;
  - detail commande ;
  - suivi du statut ;
  - telechargement des livrables ;
  - demande de revision.
- Creation d'un dashboard admin :
  - liste des commandes triees par deadline ;
  - changement manuel de statut ;
  - ajout d'un livrable MP3 de demonstration ;
  - passage automatique en statut `LIVREE`.
- Simulation du flux CinetPay :
  - initialisation checkout ;
  - webhook local ;
  - passage de `EN_ATTENTE` a `PAYEE` ;
  - calcul de deadline selon l'offre ;
  - comportement idempotent si la commande est deja payee.
- Ajout d'un schema Prisma conforme a l'architecture cible :
  - User ;
  - Occasion ;
  - Offer ;
  - Order ;
  - RequestForm ;
  - Deliverable ;
  - Subscription.
- Verification finale :
  - `npm run build` passe correctement ;
  - test manuel API realise sur creation commande, checkout, webhook et livraison.

## Ce qui est simule pour le MVP

- CinetPay est simule localement. Aucun vrai paiement n'est declenche.
- Les notifications admin sont simulees par `console.info`.
- Les emails client sont simules par `console.info`.
- Le stockage audio S3/R2 est represente par des URLs de demonstration.
- L'authentification n'est pas encore branchee a NextAuth ou Clerk.
- La base de donnees reelle PostgreSQL n'est pas encore activee ; le MVP utilise `data/sonora-db.json`.

## Ce qui reste a faire

- Installer et configurer Prisma Client avec une vraie base PostgreSQL Supabase, Neon, Railway ou Render.
- Remplacer le stockage JSON local par Prisma dans les routes API.
- Brancher une authentification reelle :
  - NextAuth.js ;
  - ou Clerk.
- Integrer CinetPay reel :
  - identifiants marchand ;
  - creation de transaction ;
  - redirection vers CinetPay ;
  - verification stricte des webhooks signes ;
  - journalisation des paiements ;
  - gestion des echecs.
- Ajouter un vrai systeme de notification :
  - email via Resend ou Postmark ;
  - option Telegram ou Slack pour les alertes admin.
- Ajouter un vrai stockage de fichiers :
  - AWS S3 ;
  - ou Cloudflare R2.
- Creer l'upload fichier admin reel pour MP3/WAV.
- Ajouter les emails transactionnels :
  - confirmation de commande ;
  - paiement confirme ;
  - livraison disponible ;
  - relance ;
  - demande de revision.
- Ajouter les abonnements premium recurrents via CinetPay, ou une relance mensuelle manuelle si CinetPay recurrent n'est pas disponible sur le compte marchand.
- Ajouter la validation formulaire avec Zod et react-hook-form.
- Ajouter le rate limiting sur la creation de commandes.
- Ajouter les pages legales :
  - conditions generales ;
  - politique de confidentialite ;
  - politique de remboursement ;
  - mentions liees a Suno et aux droits commerciaux.
- Verifier les conditions commerciales du plan Suno utilise avant de vendre des morceaux en usage commercial.
- Ajouter des tests automatises :
  - tests API ;
  - tests du wizard ;
  - tests webhook idempotent ;
  - tests admin livraison/revision.
- Preparer le deploiement Vercel avec variables d'environnement.

## Integration paiement YengaPay (17 juillet 2026)

Le paiement simule (CinetPay factice) a ete remplace par une vraie integration
YengaPay (agregateur Mobile Money / carte pour l'Afrique de l'Ouest, Orange
Money, Moov Money, Sank Money, Coris Money, PayPal, carte bancaire).

- `src/lib/yengapay.ts` : client API (creation de paiement entrant via
  `POST /groups/{groupId}/payment-intent/{projectId}`, verification basique
  de secret webhook).
- `src/lib/store.ts` (`markCheckoutStarted`) : cree un vrai paiement YengaPay
  et retourne `checkoutPageUrlWithPaymentToken`, l'URL externe de checkout.
- `src/app/api/[[...path]]/route.ts` : route `POST /api/webhooks/yengapay`
  qui confirme la commande a reception d'une notification de paiement reussi.
- `src/app/[[...path]]/ClientShell.tsx` : le bouton de paiement redirige
  desormais vers la vraie page YengaPay. Un bouton "Simuler webhook paye (dev)"
  reste disponible en local si `NEXT_PUBLIC_ENABLE_DEV_TOOLS=true`.
- `.env.example` : variables `YENGAPAY_GROUP_ID`, `YENGAPAY_PROJECT_ID`,
  `YENGAPAY_API_KEY`, `YENGAPAY_ENV`, `YENGAPAY_WEBHOOK_SECRET`.

Points a verifier avant mise en production (non confirmes automatiquement
car la documentation complete est hebergee sur Notion, rendue en JS, donc
non recuperable par recherche web) :

- Le schema exact du payload webhook YengaPay (champs, en-tete de signature).
  Le code actuel accepte plusieurs noms de champs plausibles
  (`reference`/`orderId`, `id`/`paymentIntentId`/`transactionId`,
  `status` parmi `SUCCESS`/`SUCCESSFUL`/`PAID`/`COMPLETED`) et verifie un
  secret partage transmis en en-tete `x-webhook-secret` — a ajuster une fois
  la doc exacte consultee sur la console YengaPay.
- L'URL de retour post-paiement (`return_url`) se configure a priori depuis
  la console YengaPay au niveau du projet, pas via l'API de creation de
  paiement (aucun champ `callback_url`/`return_url` documente dans l'exemple
  officiel). A confirmer dans `app.yengapay.com`.
- Recuperer les cles API test puis prod depuis `app.yengapay.com`.

## Mise en conformite deploiement (17 juillet 2026)

Audit de ce qui manquait avant un vrai deploiement, et corrections apportees :

### Base de donnees (bloquant resolu)

Le stockage JSON local (`data/sonora-db.json`, `fs.writeFile`) ne fonctionne
pas sur un hebergement serverless (systeme de fichiers en lecture seule /
non persistant sur Vercel & co). Remplace par Postgres via Prisma :

- `prisma/schema.prisma` : schema simplifie, un seul modele `Order` avec
  `requestForm` et `deliverables` en JSON (les occasions/offres restent des
  donnees statiques dans `src/lib/sonora.ts`, pas de table dediee pour l'instant).
- `src/lib/prisma.ts` : singleton PrismaClient (pattern standard Next.js).
- `src/lib/store.ts` : entierement reecrit pour lire/ecrire via Prisma au
  lieu du fichier JSON. Signatures de fonctions inchangees, donc
  `src/app/api/[[...path]]/route.ts` n'a pas eu besoin d'etre modifie.
- `data/sonora-db.json` supprime (obsolete).

**A faire cote toi** : provisionner une base Postgres (ex: Neon, Supabase ou
Railway, offres gratuites disponibles), mettre l'URL de connexion dans
`DATABASE_URL` (`.env`), puis lancer :

```bash
npm install          # installe @prisma/client + prisma, lance `prisma generate`
npx prisma migrate dev --name init   # cree la table Order en base
```

> Note environnement de dev Claude : je n'ai pas pu executer
> `prisma generate` / `prisma validate` dans mon sandbox car le domaine de
> telechargement des binaires Prisma (`binaries.prisma.sh`) n'est pas
> autorise par la configuration reseau de mon environnement. Le code
> compile (`tsc --noEmit`) sans erreur en dehors des types generes par
> Prisma (normal tant que `prisma generate` n'a pas tourne) — a verifier
> une fois `npm install` lance chez toi ou en CI/CD avec acces internet complet.

### Protection de /admin (bloquant resolu)

`/admin` et les actions d'administration (changement de statut, ajout de
livrable) etaient accessibles publiquement, sans authentification.

- `middleware.ts` (nouveau, racine du projet) : protege `/admin` et les
  routes `PATCH /api/orders/:id/status` + `POST /api/orders/:id/deliverable`
  avec une authentification HTTP Basic (`ADMIN_USER` / `ADMIN_PASSWORD`).
  Si ces variables ne sont pas definies, l'acces est refuse par defaut
  (fail closed) plutot que laisse ouvert.
- Limite connue : Basic Auth convient pour un admin unique en MVP, mais
  n'offre pas de vraie gestion de session/roles multiples. A remplacer par
  une authentification plus robuste (NextAuth, Clerk...) si plusieurs
  admins ou un usage plus serieux sont prevus.

**A faire cote toi** : definir `ADMIN_USER` et `ADMIN_PASSWORD` (mot de
passe fort) dans `.env` et dans les variables d'environnement de production.

### Restant a faire avant un vrai lancement commercial

- Emails transactionnels reels (confirmation, paiement, livraison, revision) —
  actuellement de simples `console.info`.
- Vrai stockage de fichiers pour les livrables MP3/WAV (S3, Cloudflare R2...).
- Confirmer aupres de YengaPay le format exact des webhooks (signature,
  champs) — la doc complete n'a pas pu etre consultee automatiquement.
- Finaliser le KYC YengaPay (visible dans `app.yengapay.com/team/kyc`) avant
  de pouvoir passer `YENGAPAY_ENV=prod` et encaisser reellement.
- Mettre `NEXT_PUBLIC_ENABLE_DEV_TOOLS=false` en production.
- Pages legales (CGV, confidentialite, remboursement).
- Rate limiting sur la creation de commandes.

## Corrections du 18 juillet 2026

- **`src/lib/store.ts`** : `listOrders()` faisait un `prisma.order.findMany({ include: { requestForm: true, deliverables: true } })`. Or `requestForm` et `deliverables` sont des champs JSON scalaires (pas des relations) : `include` n'est valide que sur des relations. Corrige en un simple `findMany()` sans option, qui renvoie deja tous les champs scalaires. C'est ce qui causait les 500 sur `GET /api/orders` et, par ricochet, l'echec silencieux du chargement de la page (Client Manifest cassé le temps que Turbopack recompile derriere une route qui plante en boucle).
- **`middleware.ts`** : passe de 1 a 2 comptes admin. Variables `ADMIN_USER`/`ADMIN_PASSWORD` (compte 1) et `ADMIN_USER_2`/`ADMIN_PASSWORD_2` (compte 2, optionnel). Toujours fail-closed : si aucun compte n'est configure, `/admin` et les actions admin renvoient une 500 volontaire plutot que de rester ouvertes.
- **`.env`** : `DATABASE_URL` renseignee (Neon), comptes admin definis :
  - Compte 1 : `Aziz` / `2004`
  - Compte 2 : `fadel` / `2006`

  ⚠️ **A savoir** : `2004` et `2006` sont des mots de passe tres faibles (4 chiffres, ressemblent a des annees de naissance). Ca peut suffire pour un test en local entre vous, mais avant toute mise en ligne publique (Vercel, domaine reel), il faut absolument les remplacer par des mots de passe plus longs et moins previsibles - un `/admin` avec un mot de passe a 4 chiffres se devine en quelques minutes par un bot.

## Notifications email + redirection paiement (18 juillet 2026)

- **`src/lib/email.ts`** (nouveau) : client minimal pour Resend (API REST, pas de SDK). Si `RESEND_API_KEY`/`EMAIL_FROM` ne sont pas definis, les emails sont juste loggues en console (comme avant), rien ne casse.
- **`src/lib/store.ts`** :
  - `createOrder()` envoie desormais un email a tous les `ADMIN_NOTIFICATION_EMAILS` avec les details de la commande, des sa creation (avant meme le paiement).
  - `addDeliverable()` envoie un email au client (`userEmail` de la commande) avec le lien de telechargement, des qu'un livrable est ajoute.
  - Les deux envois sont "best effort" : une erreur d'envoi est logguee mais ne fait jamais echouer la creation de commande ou l'ajout du livrable.
- **`.env` / `.env.example`** : ajout de `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAILS`.
- **`src/lib/store.ts` (`listOrders`)** : correction du bug `include` invalide sur des champs JSON scalaires qui faisait planter `GET /api/orders` (500) et cassait par ricochet le chargement de certaines pages.
- **`src/app/[[...path]]/ClientShell.tsx`** : apres creation d'une commande, redirection automatique (`router.push`) vers `/commande/{id}/paiement` au lieu de laisser le client sans lien vers le paiement.
- **`middleware.ts`** : gere desormais 2 comptes admin (`ADMIN_USER`/`ADMIN_PASSWORD` + `ADMIN_USER_2`/`ADMIN_PASSWORD_2`).

**A faire cote toi pour activer les emails** :
1. Cree un compte sur [resend.com](https://resend.com), recupere une cle API.
2. Renseigne `RESEND_API_KEY` dans `.env`.
3. `EMAIL_FROM` : en test, `onboarding@resend.dev` fonctionne sans configuration DNS. Pour un vrai domaine (ex: `commandes@sonora.com`), il faut valider le domaine cote Resend (enregistrements DNS SPF/DKIM).
4. `ADMIN_NOTIFICATION_EMAILS` : mets les adresses email reelles d'Aziz et fadel, separees par une virgule (ex: `aziz@gmail.com,fadel@gmail.com`).

## Formulaire de livraison admin + configuration email (18 juillet 2026, suite)

- **`.env`** : `RESEND_API_KEY` et `ADMIN_NOTIFICATION_EMAILS` renseignes (Aziz/fadel).
- **`src/app/[[...path]]/ClientShell.tsx`** : le bouton "Ajouter MP3 demo" (URL factice `storage.example.com`) est remplace par un vrai petit formulaire dans l'admin : un champ pour coller le lien du fichier audio termine (Google Drive, WeTransfer, ou tout autre lien de partage), un choix de format (MP3/WAV), et un bouton "Ajouter l'audio termine". Les livrables deja ajoutes sont listes juste au-dessus avec un lien de telechargement direct.
- Cote client, la page "Compte > commande" affichait deja les livrables avec un lien de telechargement (`OrderDetail`) - rien a changer la, ca fonctionne automatiquement des qu'un livrable est ajoute cote admin.

**Limite actuelle** : ce n'est pas un vrai upload de fichier (drag-and-drop) - l'admin doit d'abord heberger le fichier audio quelque part (Google Drive avec partage public, WeTransfer, Dropbox...) puis coller le lien ici. Un vrai upload direct depuis l'admin necessiterait de brancher un stockage fichier (Vercel Blob, Cloudflare R2, AWS S3) - possible a ajouter dans un prochain lot si utile.

## Commandes utiles

```bash
npm install
npm run dev
npm run build
```

## Fichiers importants

- `src/lib/sonora.ts` : types, offres, occasions, statuts et helpers.
- `src/lib/store.ts` : stockage local et logique commande/paiement/livraison.
- `src/app/[[...path]]/ClientShell.tsx` : interface utilisateur principale.
- `src/app/api/[[...path]]/route.ts` : API locale.
- `prisma/schema.prisma` : modele de donnees cible.
