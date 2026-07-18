// Client minimal pour l'API YengaPay (agregateur de paiement Mobile Money / carte
// pour l'Afrique de l'Ouest). Documentation officielle :
// https://www.notion.so/kreezus/DOCUMENTATION-API-YENGAPAY-KREEZUS-e9de95e48d504110aa048261a200292a
//
// Variables d'environnement attendues (voir .env.example) :
//   YENGAPAY_GROUP_ID       Identifiant de ton organisation YengaPay
//   YENGAPAY_PROJECT_ID     Identifiant du projet (PayIn) YengaPay
//   YENGAPAY_API_KEY        Cle API (x-api-key), test ou prod selon YENGAPAY_ENV
//   YENGAPAY_ENV            "test" ou "prod" (defaut: "test")
//   YENGAPAY_WEBHOOK_SECRET Secret partage pour valider les notifications webhook
//   NEXT_PUBLIC_APP_URL     URL publique de l'app (pour callback/retour), ex: https://sonora.example.com

const YENGAPAY_API_BASE = "https://api.yengapay.com/api/v1";

export type YengaPayArticle = {
  title: string;
  description?: string;
  price: number;
};

export type CreatePaymentIntentInput = {
  /** Montant total en FCFA (XOF), entier. */
  amount: number;
  /** Identifiant metier de la transaction (on utilise l'id de commande Sonora). */
  reference: string;
  /** Numero mobile money du client, si connu (facilite le pre-remplissage du checkout). */
  customerNumber?: string;
  /** Detail des articles factures (optionnel, mais recommande par YengaPay). */
  articles?: YengaPayArticle[];
};

export type YengaPayPaymentIntent = {
  id: string;
  status: string;
  checkoutPageUrlWithPaymentToken: string;
  paymentAmount: number;
  currency: string;
};

class YengaPayConfigError extends Error {}
class YengaPayApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getConfig() {
  const groupId = process.env.YENGAPAY_GROUP_ID;
  const projectId = process.env.YENGAPAY_PROJECT_ID;
  const apiKey = process.env.YENGAPAY_API_KEY;
  const apiEnv = process.env.YENGAPAY_ENV === "prod" ? "prod" : "test";

  if (!groupId || !projectId || !apiKey) {
    throw new YengaPayConfigError(
      "Configuration YengaPay manquante : definis YENGAPAY_GROUP_ID, YENGAPAY_PROJECT_ID et YENGAPAY_API_KEY dans .env (voir .env.example).",
    );
  }

  return { groupId, projectId, apiKey, apiEnv };
}

/**
 * Cree un paiement entrant (payment intent) aupres de YengaPay et retourne
 * notamment `checkoutPageUrlWithPaymentToken`, l'URL vers laquelle rediriger
 * le client pour finaliser le paiement (Orange Money, Moov Money, carte...).
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<YengaPayPaymentIntent> {
  const { groupId, projectId, apiKey, apiEnv } = getConfig();

  const response = await fetch(`${YENGAPAY_API_BASE}/groups/${groupId}/payment-intent/${projectId}`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paymentAmount: input.amount,
      reference: input.reference,
      apiEnv,
      ...(input.customerNumber ? { customerNumber: input.customerNumber } : {}),
      ...(input.articles ? { articles: input.articles } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new YengaPayApiError(
      `YengaPay a refuse la creation du paiement (HTTP ${response.status}): ${detail || "reponse vide"}`,
      response.status,
    );
  }

  return (await response.json()) as YengaPayPaymentIntent;
}

/**
 * Verifie qu'une notification webhook provient bien de YengaPay.
 *
 * ATTENTION : le schema exact de signature des webhooks YengaPay n'est pas
 * documente publiquement (documentation complete sur Notion, non accessible
 * automatiquement). Le fallback ci-dessous compare un secret partage envoye
 * en en-tete `x-webhook-secret` (a adapter des que tu as le detail exact
 * depuis la console YengaPay / la doc Notion).
 */
export function verifyWebhookSecret(receivedSecret: string | null | undefined) {
  const expected = process.env.YENGAPAY_WEBHOOK_SECRET;
  if (!expected) {
    // Aucun secret configure : on n'exige pas de verification (pratique en dev,
    // a eviter en production).
    return true;
  }
  return receivedSecret === expected;
}
