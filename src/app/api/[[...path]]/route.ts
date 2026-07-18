import { NextRequest, NextResponse } from "next/server";
import { occasions, offers, type OrderStatus } from "@/lib/sonora";
import {
  addDeliverable,
  confirmPayment,
  createOrder,
  getOrder,
  listOrders,
  markCheckoutStarted,
  requestRevision,
  updateOrderForm,
  updateOrderStatus,
} from "@/lib/store";
import { verifyWebhookSecret } from "@/lib/yengapay";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

const pathOf = async (context: { params: Promise<{ path?: string[] }> }) => {
  const { path = [] } = await context.params;
  return path;
};

export async function GET(_request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const path = await pathOf(context);

  if (path.join("/") === "offers") return json({ offers });
  if (path.join("/") === "occasions") return json({ occasions });
  if (path[0] === "orders" && path[1]) {
    const order = await getOrder(path[1]);
    return order ? json({ order }) : json({ error: "Commande introuvable" }, 404);
  }
  if (path[0] === "orders") return json({ orders: await listOrders() });

  return json({ error: "Route inconnue" }, 404);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const path = await pathOf(context);
    const body = await request.json().catch(() => ({}));

    if (path.join("/") === "orders") {
      const order = await createOrder(body);
      return json({ order }, 201);
    }

    if (path[0] === "orders" && path[2] === "checkout") {
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
      const order = await addDeliverable(path[1], body);
      console.info("Email client: livrable disponible", order.id);
      return json({ order });
    }

    if (path[0] === "orders" && path[2] === "revision") {
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
      return json({ order: await updateOrderForm(path[1], body) });
    }

    if (path[0] === "orders" && path[2] === "status") {
      return json({ order: await updateOrderStatus(path[1], body.status as OrderStatus) });
    }

    return json({ error: "Route inconnue" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur serveur" }, 400);
  }
}
