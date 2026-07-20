export type OrderStatus =
  | "EN_ATTENTE"
  | "PAYEE"
  | "EN_PRODUCTION"
  | "EN_REVISION"
  | "LIVREE"
  | "ANNULEE";

export type Offer = {
  id: string;
  name: string;
  slug: string;
  price: number;
  deliveryDays: number;
  revisions: number;
  features: string[];
  highlight?: boolean;
};

export type Occasion = {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
};

export type RequestForm = {
  destinataire?: string;
  occasionDetail?: string;
  genreMusical?: string;
  ambiance?: string;
  paroles?: string;
  anecdotes?: string;
  voixSouhaitee?: string;
  reference?: string;
  dureeSouhaitee?: number;
  deadline?: string;
  fichierAudio?: string;
};

export type Deliverable = {
  id: string;
  fileUrl: string;
  version: number;
  format: "mp3" | "wav";
  createdAt: string;
};

export type Order = {
  id: string;
  userEmail: string;
  userName?: string;
  offerId: string;
  occasionId?: string;
  status: OrderStatus;
  requestForm: RequestForm;
  price: number;
  yengapayPaymentIntentId?: string;
  yengapayCheckoutUrl?: string;
  paymentMethod?: string;
  deliverables: Deliverable[];
  revisionsUsed: number;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
};

export const occasions: Occasion[] = [
  {
    id: "occ-anniversaire",
    slug: "anniversaire",
    name: "Anniversaire",
    description: "Une chanson personnelle pour célébrer une histoire, une année et des souvenirs.",
    imageUrl:
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "occ-mariage",
    slug: "mariage",
    name: "Mariage",
    description: "Un titre romantique pour une entrée, une surprise ou une vidéo de cérémonie.",
    imageUrl:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "occ-naissance",
    slug: "naissance",
    name: "Naissance",
    description: "Une berceuse ou un morceau doux pour accueillir un nouveau-né.",
    imageUrl:
      "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "occ-entreprise",
    slug: "entreprise",
    name: "Entreprise",
    description: "Un jingle, une chanson de marque ou un hymne d’équipe utilisable commercialement.",
    imageUrl:
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
  },
];

export const offers: Offer[] = [
  {
    id: "offer-standard",
    name: "Standard",
    slug: "standard",
    price: 200000,
    deliveryDays: 4,
    revisions: 2,
    highlight: true,
    features: ["Plusieurs générations testées", "MP3 + WAV", "Meilleure prise sélectionnée", "2 révisions"],
  },
  {
    id: "offer-premium",
    name: "Premium",
    slug: "premium",
    price: 500000,
    deliveryDays: 2,
    revisions: 3,
    features: ["Échange avant création", "Versions affinées", "WAV haute qualité", "Usage commercial"],
  },
];

export const statusLabels: Record<OrderStatus, string> = {
  EN_ATTENTE: "En attente de paiement",
  PAYEE: "Payée, à traiter",
  EN_PRODUCTION: "En production",
  EN_REVISION: "En révision",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0,
  }).format(price / 100);

export const getOffer = (idOrSlug: string) =>
  offers.find((offer) => offer.id === idOrSlug || offer.slug === idOrSlug);

export const getOccasion = (idOrSlug?: string) =>
  occasions.find((occasion) => occasion.id === idOrSlug || occasion.slug === idOrSlug);

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
};
