// Client minimal pour l'envoi d'emails transactionnels via Resend
// (https://resend.com). Aucun SDK necessaire, un simple appel a leur API REST.
//
// Variables d'environnement attendues (voir .env.example) :
//   RESEND_API_KEY            Cle API Resend (onglet "API Keys" du dashboard)
//   EMAIL_FROM                Adresse d'expedition, ex: "Sonora <commandes@tondomaine.com>"
//                              (en test, tu peux utiliser "onboarding@resend.dev")
//   ADMIN_NOTIFICATION_EMAILS Liste d'emails admin separes par des virgules,
//                              ex: "aziz@example.com,fadel@example.com"

const RESEND_API_BASE = "https://api.resend.com";

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (to.length === 0) return;

  const config = getEmailConfig();
  if (!config) {
    // Pas de config email : on ne bloque jamais le parcours client/admin pour
    // autant, on se contente de logger (comme avant), utile en dev.
    console.info("Email (non envoye, RESEND_API_KEY/EMAIL_FROM manquants):", { to, subject });
    return;
  }

  try {
    const response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: config.from, to, subject, html }),
    });
    if (!response.ok) {
      console.error("Erreur envoi email Resend:", response.status, await response.text().catch(() => ""));
    }
  } catch (error) {
    // On avale l'erreur : un email qui echoue ne doit jamais faire planter
    // la creation de commande ou la livraison.
    console.error("Erreur envoi email Resend:", error);
  }
}

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAILS ?? "";
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

type OrderForEmail = {
  id: string;
  userEmail: string;
  userName?: string;
  offerName: string;
  price: number;
  occasionName?: string;
};

export async function notifyAdminsNewOrder(order: OrderForEmail, formatPrice: (cents: number) => string) {
  const admins = getAdminEmails();
  if (admins.length === 0) {
    console.info("Aucun ADMIN_NOTIFICATION_EMAILS configure, notification admin ignoree.");
    return;
  }

  const html = `
    <h2>Nouvelle commande Sonora</h2>
    <p><strong>Commande :</strong> ${order.id}</p>
    <p><strong>Client :</strong> ${order.userName ?? "(non renseigne)"} - ${order.userEmail}</p>
    <p><strong>Offre :</strong> ${order.offerName} (${formatPrice(order.price)})</p>
    ${order.occasionName ? `<p><strong>Occasion :</strong> ${order.occasionName}</p>` : ""}
    <p>Voir dans l'admin : <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/${order.id}">${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/${order.id}</a></p>
  `;

  await sendEmail(admins, `Nouvelle commande Sonora - ${order.id}`, html);
}


export async function notifyClientOrderCreated(order: OrderForEmail, formatPrice: (cents: number) => string) {
  const html = `
    <h2>Commande Sonora recue</h2>
    <p>Bonjour ${order.userName ?? ""},</p>
    <p>Ta commande <strong>${order.id}</strong> a bien ete creee.</p>
    <p><strong>Offre :</strong> ${order.offerName} - ${formatPrice(order.price)}</p>
    <p>Prochaine etape : envoie le paiement Mobile Money puis ajoute la reference de transaction dans ton espace Sonora.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/commande/${order.id}/paiement">Finaliser le paiement</a></p>
  `;

  await sendEmail([order.userEmail], `Commande recue - ${order.id}`, html);
}

export async function notifyClientPaymentConfirmed(order: OrderForEmail) {
  const html = `
    <h2>Paiement confirme</h2>
    <p>Bonjour ${order.userName ?? ""},</p>
    <p>Le paiement de ta commande <strong>${order.id}</strong> est confirme. La production peut commencer.</p>
    <p>Tu peux suivre l'avancement ici : <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/commande/${order.id}/suivi">Suivre ma commande</a></p>
  `;

  await sendEmail([order.userEmail], `Paiement confirme - ${order.id}`, html);
}
export async function notifyClientDelivery(order: OrderForEmail, fileUrl: string, format: string) {
  const html = `
    <h2>Ta chanson Sonora est prete !</h2>
    <p>Bonjour ${order.userName ?? ""},</p>
    <p>Ta commande <strong>${order.id}</strong> (${order.offerName}) vient d'etre livree au format ${format.toUpperCase()}.</p>
    <p><a href="${fileUrl}">Telecharger ta chanson</a></p>
    <p>Tu peux aussi la retrouver a tout moment depuis ton espace "Compte" sur Sonora.</p>
  `;

  await sendEmail([order.userEmail], `Ta chanson Sonora est prete - ${order.id}`, html);
}

export async function notifyAdminsPaymentVerification(
  order: OrderForEmail & { transactionReference?: string; whatsappClient?: string },
  formatPrice: (cents: number) => string,
) {
  const admins = getAdminEmails();
  if (admins.length === 0) {
    console.info("Aucun ADMIN_NOTIFICATION_EMAILS configure, notification paiement ignoree.");
    return;
  }

  const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/${order.id}`;
  const html = `
    <h2>Paiement Sonora a verifier</h2>
    <p><strong>Commande :</strong> ${order.id}</p>
    <p><strong>Client :</strong> ${order.userName ?? "(non renseigne)"} - ${order.userEmail}</p>
    <p><strong>WhatsApp :</strong> ${order.whatsappClient ?? "(non renseigne)"}</p>
    <p><strong>Offre :</strong> ${order.offerName} (${formatPrice(order.price)})</p>
    <p><strong>Reference transaction :</strong> ${order.transactionReference ?? "(non renseignee)"}</p>
    <p>Confirmer dans l'admin : <a href="${adminUrl}">${adminUrl}</a></p>
  `;

  await sendEmail(admins, `Paiement a verifier - ${order.id}`, html);
}