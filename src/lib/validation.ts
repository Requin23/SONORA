import { getOccasion, getOffer, type RequestForm } from "./sonora";

const WHATSAPP_MIN_DIGITS = 8;

export function normalizePhone(value?: string) {
  return (value ?? "").replace(/\D/g, "");
}

export function validateOrderRequest(input: {
  offerId?: string;
  occasionId?: string;
  requestForm?: RequestForm;
}) {
  const errors: string[] = [];
  const form = input.requestForm ?? {};
  const phoneDigits = normalizePhone(form.whatsapp);

  if (!input.offerId || !getOffer(input.offerId)) {
    errors.push("Choisis une offre valide.");
  }
  if (!input.occasionId || !getOccasion(input.occasionId)) {
    errors.push("Choisis une occasion valide.");
  }
  if (!form.destinataire?.trim()) {
    errors.push("Indique le destinataire de la chanson.");
  }
  if (!phoneDigits || phoneDigits.length < WHATSAPP_MIN_DIGITS) {
    errors.push("Indique un numero WhatsApp valide.");
  }
  if (!form.voixSouhaitee?.trim()) {
    errors.push("Choisis le type de voix.");
  }
  if (!form.genreMusical?.trim()) {
    errors.push("Indique au moins un style musical.");
  }
  if (!form.anecdotes?.trim() && !form.paroles?.trim()) {
    errors.push("Ajoute au moins une anecdote, un souvenir ou une phrase a inclure.");
  }
  if (form.dureeSouhaitee !== undefined && (!Number.isFinite(form.dureeSouhaitee) || form.dureeSouhaitee < 30)) {
    errors.push("Indique une duree souhaitee d'au moins 30 secondes.");
  }
  return errors;
}