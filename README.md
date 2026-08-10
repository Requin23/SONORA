# SONORA

Plateforme Next.js pour vendre des chansons personnalisees : vitrine, commande client, paiement Mobile Money manuel, espace client et dashboard admin.

## Demarrage local

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3000.

## Variables importantes sur Vercel

Copier les valeurs de `.env.example`, puis definir au minimum :

```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_APP_URL=https://ton-site.vercel.app
NEXT_PUBLIC_WHATSAPP_URL=https://wa.me/226...
NEXT_PUBLIC_MANUAL_PAYMENT_NUMBER=+22606387575
NEXT_PUBLIC_MANUAL_PAYMENT_NAME=Sonora
ADMIN_USER=admin
ADMIN_PASSWORD=mot-de-passe-fort
RESEND_API_KEY=...
EMAIL_FROM="Sonora <commandes@tondomaine.com>"
ADMIN_NOTIFICATION_EMAILS=admin@example.com
NEXT_PUBLIC_ENABLE_DEV_TOOLS=false
```

## Base de donnees

Le projet utilise Prisma + PostgreSQL. En production, utiliser Neon, Supabase, Railway ou une base Postgres equivalente.

Apres configuration de `DATABASE_URL` :

```bash
npx prisma generate
npx prisma migrate deploy
```

Sur Vercel, garde `postinstall=prisma generate` et lance les migrations depuis ton terminal ou ton provider DB avant d'ouvrir le site au public.

## Flux paiement manuel

1. Le client cree une commande.
2. Il paie par Mobile Money au numero configure.
3. Il ajoute la reference de transaction.
4. La commande passe en `EN_VERIFICATION`.
5. L'admin verifie le paiement, puis clique sur `Confirmer paiement recu`.
6. La commande passe en `PAYEE`, une deadline est calculee, et le client recoit un email si Resend est configure.

## Admin

L'espace `/admin` est protege par Basic Auth via `ADMIN_USER` et `ADMIN_PASSWORD`.

Le changement de statut est recontrole cote API : le client peut seulement passer sa propre commande de `EN_ATTENTE` a `EN_VERIFICATION`; les autres changements sont reserves a l'admin.
## Notifications email Resend

Le fichier CSV fourni contient des cles Resend. Utilise la cle nommee `SONORA` dans Vercel :

```env
RESEND_API_KEY=coller-la-cle-sonora-ici
EMAIL_FROM="Sonora <onboarding@resend.dev>"
ADMIN_NOTIFICATION_EMAILS=ton-email-admin@example.com
```

Pour une vraie adresse d'expedition comme `commandes@sonora...`, il faudra verifier le domaine dans Resend. En attendant, `onboarding@resend.dev` permet de tester.

## Notifications realtime admin

Le dashboard `/admin` se rafraichit automatiquement toutes les 12 secondes. Quand une commande change ou qu'un paiement passe en verification, l'admin voit :

- un message dans le site
- le titre de l'onglet modifie
- une notification navigateur si le bouton `Activer alertes navigateur` a ete clique

Cela fonctionne sur Vercel sans WebSocket. Pour du vrai push instantane multi-admin, l'etape suivante serait Supabase Realtime, Pusher ou Ably.