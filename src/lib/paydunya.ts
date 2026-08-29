// Client minimal pour l'API PayDunya (agregateur de paiement local
// Senegal / Afrique de l'Ouest : Orange Money, Wave, Free Money, Wizall, carte).
// Documentation : https://developers.paydunya.com
//
// Variables d'environnement attendues (voir .env.example) :
//   PD_MASTER_KEY     Master Key de l'application PayDunya
//   PD_PRIVATE_KEY    Private Key (signature)
//   PD_TOKEN          Token d'API
//   PD_MODE           "test" ou "prod" (defaut: "test")
//   PD_WEBHOOK_SECRET Secret partage pour verifier la signature HMAC des IPN
//   NEXT_PUBLIC_APP_URL URL publique de l'app (return_url / cancel_url)
//
// Flux : on cree une "checkout invoice" (page hebergee PayDunya multi-methode),
// on redirige le client vers invoice_url, puis PayDunya nous notifie via IPN
// (webhook signe SHA512) ou le client revient sur return_url?token=...

import crypto from "node:crypto";

const PD_API_BASE =
  process.env.PD_MODE === "prod"
    ? "https://app.paydunya.com/api/v1"
    : "https://app.paydunya.com/sandbox-api/v1";

export type CreateInvoiceInput = {
  /** Montant total en XOF (FCFA), entier. */
  totalAmount: number;
  /** Reference metier (on utilise l'id de commande Sonora). */
  reference: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: { name: string; quantity: number; unitPrice: number; totalPrice: number }[];
};

export type PaydunyaInvoice = {
  token: string;
  url: string;
  responseCode: string;
};

class PaydunyaConfigError extends Error {}

function getConfig() {
  const masterKey = process.env.PD_MASTER_KEY;
  const privateKey = process.env.PD_PRIVATE_KEY;
  const token = process.env.PD_TOKEN;

  if (!masterKey || !privateKey || !token) {
    throw new PaydunyaConfigError(
      "Configuration PayDunya manquante : definis PD_MASTER_KEY, PD_PRIVATE_KEY et PD_TOKEN dans .env (voir .env.example).",
    );
  }
  return { masterKey, privateKey, token };
}

/**
 * Cree une checkout invoice PayDunya et retourne l'URL vers laquelle rediriger
 * le client pour finaliser le paiement (Orange Money, Wave, carte...).
 * Le champ `channels` n'est pas necessaire : PayDunya affiche tous les moyens
 * actifs sur le compte marchand.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<PaydunyaInvoice> {
  const { masterKey, privateKey, token } = getConfig();

  const body = {
    invoice: {
      total_amount: input.totalAmount,
      description: input.description,
      customer: input.customerName || input.customerEmail || input.customerPhone
        ? {
            name: input.customerName ?? "",
            email: input.customerEmail ?? "",
            phone: input.customerPhone ?? "",
          }
        : undefined,
      items: input.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
      })),
    },
    store: {
      name: "Sonora",
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/commande/${input.reference}/suivi`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/commande/${input.reference}/paiement`,
    },
    // On repere la commande dans l'IPN / au retour via ce champ personnalise.
    custom_data: { order_id: input.reference },
  };

  const response = await fetch(`${PD_API_BASE}/checkout-invoice/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYDUNYA-MASTER-KEY": masterKey,
      "PAYDUNYA-PRIVATE-KEY": privateKey,
      "PAYDUNYA-TOKEN": token,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as {
    response_code?: string;
    response_text?: string;
    invoice_token?: string;
    invoice_url?: string;
  };

  if (data.response_code !== "00" || !data.invoice_token || !data.invoice_url) {
    throw new PaydunyaConfigError(
      `PayDunya a refuse la creation de la facture (code ${data.response_code ?? "?"}): ${data.response_text ?? "reponse vide"}`,
    );
  }

  return {
    token: data.invoice_token,
    url: data.invoice_url,
    responseCode: data.response_code,
  };
}

/**
 * Verifie la signature HMAC-SHA512 d'une notification IPN PayDunya.
 * PayDunya envoie `hash = sha512(MASTER_KEY + invoice_token)`. On compare
 * avec notre propre calcul. Echec ferme si le secret n'est pas configure.
 */
export function verifyWebhook(body: Record<string, unknown>): boolean {
  const expectedSecret = process.env.PD_WEBHOOK_SECRET;
  const masterKey = process.env.PD_MASTER_KEY;
  if (!expectedSecret || !masterKey) {
    // Pas de secret : on refuse (fail-closed), comme pour YengaPay.
    return false;
  }

  const token = String(body.invoice_token ?? "");
  const receivedHash = String(body.hash ?? "");

  // Signature PayDunya (mode checkout) : sha512(MASTER_KEY + invoice_token).
  const computed = crypto
    .createHash("sha512")
    .update(masterKey + token)
    .digest("hex");

  // Compare en temps constant pour eviter les attaques par timing.
  const a = Buffer.from(computed);
  const b = Buffer.from(receivedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function getInvoiceTokenFromCallback(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}
