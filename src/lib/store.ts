import type { Order as PrismaOrder } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, formatPrice, getOccasion, getOffer, type Deliverable, type Order, type OrderStatus, type RequestForm } from "./sonora";
import { createPaymentIntent } from "./yengapay";
import { createInvoice as createPaydunyaInvoice } from "./paydunya";
import { notifyAdminsNewOrder, notifyClientDelivery } from "./email";

const publicId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function toOrder(row: PrismaOrder): Order {
  return {
    id: row.id,
    userEmail: row.userEmail,
    userName: row.userName ?? undefined,
    offerId: row.offerId,
    occasionId: row.occasionId ?? undefined,
    status: row.status as OrderStatus,
    requestForm: (row.requestForm as RequestForm | null) ?? {},
    price: row.price,
    yengapayPaymentIntentId: row.yengapayPaymentIntentId ?? undefined,
    yengapayCheckoutUrl: row.yengapayCheckoutUrl ?? undefined,
    paymentMethod: row.paymentMethod ?? undefined,
    deliverables: (row.deliverables as unknown as Deliverable[] | null) ?? [],
    revisionsUsed: row.revisionsUsed,
    deadline: row.deadline ? row.deadline.toISOString() : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sortByDeadline(orders: Order[]) {
  return orders.sort((a, b) => {
    const left = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const right = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

// Reservee a l'admin (toutes les commandes, tous clients confondus). Protegee
// en amont par le middleware (Basic Auth sur /api/admin/*).
export async function listOrders() {
  const rows = await prisma.order.findMany();
  return sortByDeadline(rows.map(toOrder));
}

// Cote client : ne retourne que les commandes du compte connecte (filtrage
// par email de session, verifie en amont dans la route API).
export async function listOrdersForUser(email: string) {
  const rows = await prisma.order.findMany({ where: { userEmail: email } });
  return sortByDeadline(rows.map(toOrder));
}

export async function getOrder(id: string) {
  const row = await prisma.order.findUnique({ where: { id } });
  return row ? toOrder(row) : undefined;
}

export async function createOrder(input: {
  offerId: string;
  occasionId?: string;
  userEmail: string;
  userName?: string;
  requestForm?: RequestForm;
}) {
  const offer = getOffer(input.offerId);
  if (!offer) throw new Error("Offre introuvable");

  const row = await prisma.order.create({
    data: {
      id: publicId("cmd"),
      userEmail: input.userEmail,
      userName: input.userName,
      offerId: offer.id,
      occasionId: input.occasionId,
      status: "EN_ATTENTE",
      requestForm: (input.requestForm ?? {}) as object,
      price: offer.price,
      deliverables: [],
      revisionsUsed: 0,
    },
  });

  const order = toOrder(row);

  // Notification email aux admins : ne doit jamais faire echouer la creation
  // de commande si l'envoi rate (config manquante, API down...).
  void notifyAdminsNewOrder(
    {
      id: order.id,
      userEmail: order.userEmail,
      userName: order.userName,
      offerName: offer.name,
      price: order.price,
      occasionName: getOccasion(input.occasionId)?.name,
      whatsapp: input.requestForm?.whatsapp,
    },
    formatPrice,
  ).catch((error) => console.error("Notification admin echouee:", error));

  return order;
}

export async function updateOrderForm(id: string, requestForm: RequestForm) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new Error("Commande introuvable");
  const merged = { ...(existing.requestForm as RequestForm | null), ...requestForm };
  const row = await prisma.order.update({
    where: { id },
    data: { requestForm: merged as object },
  });
  return toOrder(row);
}

export async function markCheckoutStarted(
  id: string,
  paymentMethod = "mobile_money",
  customerNumber?: string,
  provider: "yengapay" | "paydunya" = "yengapay",
) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new Error("Commande introuvable");

  const offer = getOffer(existing.offerId);

  // Reutilise un checkout deja cree pour cette commande s'il existe, sinon on
  // en cree un nouveau (selon le provider choisi par le client).
  if (existing.status !== "EN_ATTENTE" && existing.yengapayCheckoutUrl) {
    return { order: toOrder(existing), paymentUrl: existing.yengapayCheckoutUrl };
  }

  // Montant interne Sonora en centimes de FCFA -> XOF entier pour les API.
  const amountXof = Math.round(existing.price / 100);

  if (provider === "paydunya") {
    const invoice = await createPaydunyaInvoice({
      totalAmount: amountXof,
      reference: existing.id,
      description: `Sonora - ${offer?.name ?? "Chanson personnalisee"}`,
      customerName: existing.userName ?? undefined,
      customerEmail: existing.userEmail,
      customerPhone: customerNumber ?? (existing.requestForm as RequestForm | null)?.whatsapp ?? undefined,
      items: [
        {
          name: `Sonora - ${offer?.name ?? "Chanson personnalisee"}`,
          quantity: 1,
          unitPrice: amountXof,
          totalPrice: amountXof,
        },
      ],
    });

    const row = await prisma.order.update({
      where: { id },
      data: {
        provider: "paydunya",
        paymentMethod,
        yengapayPaymentIntentId: invoice.token,
        yengapayCheckoutUrl: invoice.url,
      },
    });
    return { order: toOrder(row), paymentUrl: invoice.url };
  }

  // Provider par defaut : YengaPay.
  const intent = await createPaymentIntent({
    amount: amountXof,
    reference: existing.id,
    customerNumber,
    articles: [
      {
        title: `Sonora - ${offer?.name ?? "Chanson personnalisee"}`,
        description: `Commande ${existing.id}`,
        price: amountXof,
      },
    ],
  });

  const row = await prisma.order.update({
    where: { id },
    data: {
      provider: "yengapay",
      yengapayPaymentIntentId: intent.id,
      yengapayCheckoutUrl: intent.checkoutPageUrlWithPaymentToken,
      paymentMethod,
    },
  });

  return {
    order: toOrder(row),
    paymentUrl: intent.checkoutPageUrlWithPaymentToken,
  };
}

export async function confirmPayment(id: string, transactionId?: string, paymentMethod = "mobile_money") {
  const existing = id
    ? await prisma.order.findUnique({ where: { id } })
    : await prisma.order.findFirst({ where: { yengapayPaymentIntentId: transactionId } });

  if (!existing) throw new Error("Commande introuvable");

  if (existing.status !== "EN_ATTENTE") {
    return toOrder(existing);
  }

  const offer = getOffer(existing.offerId);
  const row = await prisma.order.update({
    where: { id: existing.id },
    data: {
      status: "PAYEE",
      paymentMethod,
      yengapayPaymentIntentId: transactionId ?? existing.yengapayPaymentIntentId,
      deadline: addDays(new Date(), offer?.deliveryDays ?? 7),
    },
  });
  return toOrder(row);
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const row = await prisma.order.update({ where: { id }, data: { status } }).catch(() => null);
  if (!row) throw new Error("Commande introuvable");
  return toOrder(row);
}

export async function addDeliverable(id: string, input: Pick<Deliverable, "fileUrl" | "format">) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new Error("Commande introuvable");

  const current = (existing.deliverables as unknown as Deliverable[] | null) ?? [];
  const deliverable: Deliverable = {
    id: publicId("livrable"),
    fileUrl: input.fileUrl,
    format: input.format,
    version: current.length + 1,
    createdAt: new Date().toISOString(),
  };
  const updated = [...current, deliverable];

  const row = await prisma.order.update({
    where: { id },
    data: { deliverables: updated as unknown as object, status: "LIVREE" },
  });

  const order = toOrder(row);
  const offer = getOffer(order.offerId);

  void notifyClientDelivery(
    { id: order.id, userEmail: order.userEmail, userName: order.userName, offerName: offer?.name ?? order.offerId, price: order.price },
    deliverable.fileUrl,
    deliverable.format,
  ).catch((error) => console.error("Notification client (livraison) echouee:", error));

  return order;
}

export async function requestRevision(id: string, note?: string) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new Error("Commande introuvable");

  const offer = getOffer(existing.offerId);
  if (offer && existing.revisionsUsed >= offer.revisions) {
    throw new Error("Limite de revisions atteinte");
  }

  const form = (existing.requestForm as RequestForm | null) ?? {};
  const anecdotes = [form.anecdotes, note ? `Revision: ${note}` : undefined].filter(Boolean).join("\n\n");

  const row = await prisma.order.update({
    where: { id },
    data: {
      revisionsUsed: existing.revisionsUsed + 1,
      status: "EN_REVISION",
      requestForm: { ...form, anecdotes } as object,
    },
  });
  return toOrder(row);
}
