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
