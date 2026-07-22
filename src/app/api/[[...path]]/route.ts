import { NextRequest, NextResponse } from "next/server";
import { occasions, offers, type OrderStatus } from "@/lib/sonora";
import {
  addDeliverable,
  confirmPayment,
  createOrder,
  getOrder,
  listOrders,
  listOrdersForUser,
  markCheckoutStarted,
  requestRevision,
  updateOrderForm,
  updateOrderStatus,
} from "@/lib/store";
import { verifyWebhookSecret } from "@/lib/yengapay";
import {
  clearSessionCookie,
  createSessionToken,
  createUser,
  getSessionFromCookies,
  setSessionCookie,
  verifyUserCredentials,
} from "@/lib/auth";
import { isValidBasicAuth } from "@/lib/adminAuth";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

const pathOf = async (context: { params: Promise<{ path?: string[] }> }) => {
  const { path = [] } = await context.params;
  return path;
};

// Une commande est visible/modifiable soit par le client qui l'a passee
// (session dont l'email correspond a la commande), soit par un admin
// (identifiants Basic Auth valides, meme si la route n'est pas dans le
// perimetre force par le middleware).
async function isAuthorizedForOrder(request: NextRequest, orderUserEmail: string) {
  const session = await getSessionFromCookies();
  if (session && session.email === orderUserEmail) return true;
  return isValidBasicAuth(request.headers.get("authorization"));
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const path = await pathOf(context);

  if (path.join("/") === "offers") return json({ offers });
  if (path.join("/") === "occasions") return json({ occasions });

  if (path.join("/") === "auth/me") {
    const session = await getSessionFromCookies();
    return json({
      user: session ? { id: session.userId, email: session.email, name: session.name } : null,
    });
  }

  if (path[0] === "admin" && path[1] === "orders") {
    // Deja protege en amont par le middleware (Basic Auth sur /api/admin/*).
    return json({ orders: await listOrders() });
  }

  if (path[0] === "orders" && path[1]) {
    const order = await getOrder(path[1]);
    if (!order) return json({ error: "Commande introuvable" }, 404);
    if (!(await isAuthorizedForOrder(request, order.userEmail))) {
      return json({ error: "Non autorise" }, 403);
    }
    return json({ order });
  }

  if (path[0] === "orders") {
    const session = await getSessionFromCookies();
    if (!session) return json({ error: "Connexion requise" }, 401);
    return json({ orders: await listOrdersForUser(session.email) });
  }

  return json({ error: "Route inconnue" }, 404);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const path = await pathOf(context);
    const body = await request.json().catch(() => ({}));

    if (path.join("/") === "auth/signup") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const name = body.name ? String(body.name).trim() : undefined;

      if (!email || !email.includes("@")) return json({ error: "Email invalide" }, 400);
      if (password.length < 8) return json({ error: "Mot de passe trop court (8 caracteres minimum)" }, 400);

      try {
        const user = await createUser(email, password, name);
        const token = await createSessionToken({ userId: user.id, email: user.email, name: user.name ?? undefined });
        await setSessionCookie(token);
        return json({ user: { id: user.id, email: user.email, name: user.name } }, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "EMAIL_TAKEN") {
          return json({ error: "Un compte existe deja avec cet email" }, 409);
        }
        throw error;
      }
    }

    if (path.join("/") === "auth/login") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const user = await verifyUserCredentials(email, password);
      if (!user) return json({ error: "Email ou mot de passe incorrect" }, 401);
      const token = await createSessionToken({ userId: user.id, email: user.email, name: user.name ?? undefined });
      await setSessionCookie(token);
      return json({ user: { id: user.id, email: user.email, name: user.name } });
    }

    if (path.join("/") === "auth/logout") {
      await clearSessionCookie();
      return json({ ok: true });
    }

    if (path.join("/") === "orders") {
      // L'email/nom vient de la session, jamais du corps de la requete : un
      // client ne peut pas creer une commande au nom de quelqu'un d'autre.
      const session = await getSessionFromCookies();
      if (!session) return json({ error: "Connexion requise" }, 401);
      const order = await createOrder({
        offerId: body.offerId,
        occasionId: body.occasionId,
        userEmail: session.email,
        userName: session.name,
        requestForm: body.requestForm,
      });
      return json({ order }, 201);
    }

    if (path[0] === "orders" && path[2] === "checkout") {
      const existing = await getOrder(path[1]);
      if (!existing) return json({ error: "Commande introuvable" }, 404);
      if (!(await isAuthorizedForOrder(request, existing.userEmail))) {
        return json({ error: "Non autorise" }, 403);
      }
      return json(await markCheckoutStarted(path[1], body.paymentMethod, body.customerNumber));
    }

    if (path.join("/") === "webhooks/yengapay") {
      // NB: le schema exact des notifications webhook YengaPay (en-tetes de
      // signature, structure du payload) n'a pas pu etre recupere depuis la
      // doc publique (elle est hebergee sur Notion, rendue en JS). En
      // attendant confirmation depuis la console YengaPay, on verifie un
      // secret partage transmis en en-tete `x-webhook-secret`, et on accepte
      // plusieurs formes de payload plausibles pour identifier la commande.
      const receivedSecret = request.headers.get("x-webhook-secret") ?? body.secret;
      if (!verifyWebhookSecret(receivedSecret)) {
        return json({ error: "Signature webhook invalide" }, 401);
      }

      const orderId: string | undefined = body.reference ?? body.orderId ?? body.metadata?.reference;
      const paymentIntentId: string | undefined = body.id ?? body.paymentIntentId ?? body.transactionId;
      const status: string | undefined = body.status;

      if (!orderId && !paymentIntentId) {
        return json({ error: "Impossible d'identifier la commande dans la notification" }, 400);
      }

      // On ne confirme que si YengaPay indique un paiement reussi (statuts
      // plausibles selon leur exemple de reponse : SUCCESS / SUCCESSFUL / PAID).
      if (status && !["SUCCESS", "SUCCESSFUL", "PAID", "COMPLETED"].includes(status.toUpperCase())) {
        return json({ ignored: true, status });
      }

      const order = await confirmPayment(orderId ?? "", paymentIntentId, body.paymentSource ?? body.paymentMethod);
      console.info("Notification admin: nouvelle commande payee", order.id);
      return json({ order });
    }

    if (path[0] === "orders" && path[2] === "deliverable") {
      // Deja protege en amont par le middleware (Basic Auth admin).
      const order = await addDeliverable(path[1], body);
      console.info("Email client: livrable disponible", order.id);
      return json({ order });
    }

    if (path[0] === "orders" && path[2] === "revision") {
      const existing = await getOrder(path[1]);
      if (!existing) return json({ error: "Commande introuvable" }, 404);
      if (!(await isAuthorizedForOrder(request, existing.userEmail))) {
        return json({ error: "Non autorise" }, 403);
      }
      return json({ order: await requestRevision(path[1], body.note) });
    }

    if (path.join("/") === "subscriptions/checkout") {
      return json({
        checkoutUrl: "/premium?checkout=demo",
        message: "Abonnement premium pret a brancher sur CinetPay recurrent.",
      });
    }

    return json({ error: "Route inconnue" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur serveur" }, 400);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const path = await pathOf(context);
    const body = await request.json().catch(() => ({}));

    if (path[0] === "orders" && path[2] === "form") {
      const existing = await getOrder(path[1]);
      if (!existing) return json({ error: "Commande introuvable" }, 404);
      if (!(await isAuthorizedForOrder(request, existing.userEmail))) {
        return json({ error: "Non autorise" }, 403);
      }
      return json({ order: await updateOrderForm(path[1], body) });
    }

    if (path[0] === "orders" && path[2] === "status") {
      const existing = await getOrder(path[1]);
      if (!existing) return json({ error: "Commande introuvable" }, 404);

      const nextStatus = body.status as OrderStatus;
      const isAdmin = isValidBasicAuth(request.headers.get("authorization"));

      if (nextStatus === "EN_VERIFICATION") {
        const session = await getSessionFromCookies();
        if (!session || session.email !== existing.userEmail) {
          return json({ error: "Non autorise" }, 403);
        }
        if (existing.status !== "EN_ATTENTE") {
          return json({ error: "Cette commande n'attend plus de paiement" }, 400);
        }

        const transactionReference = String(body.transactionReference ?? "").trim();
        if (!transactionReference) {
          return json({ error: "Reference de transaction requise" }, 400);
        }

        return json({
          order: await updateOrderStatus(path[1], "EN_VERIFICATION", { transactionReference }),
        });
      }

      if (!isAdmin) {
        return json({ error: "Action reservee a l'admin" }, 403);
      }

      if (nextStatus === "PAYEE" && existing.status !== "EN_VERIFICATION") {
        return json({ error: "Le paiement doit d'abord etre en verification" }, 400);
      }

      return json({ order: await updateOrderStatus(path[1], nextStatus) });
    }

    return json({ error: "Route inconnue" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur serveur" }, 400);
  }
}
