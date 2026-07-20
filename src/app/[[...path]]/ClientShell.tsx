"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EXPRESS_SURCHARGE, formatPrice, getOccasion, getOffer, occasions, offers, statusLabels, type Order, type RequestForm } from "@/lib/sonora";

type Props = {
  path: string[];
};

const steps = ["Occasion", "Style", "Contenu", "Références", "Pratique", "Récapitulatif"];

const stepHelp = [
  "Commencez par le contexte : pour qui, pourquoi, et quel moment la chanson doit marquer.",
  "Définissez la couleur musicale : genre, énergie et type de voix pour guider la création.",
  "Ajoutez les souvenirs, les phrases et les détails qui rendront la chanson vraiment personnelle.",
  "Partagez des références utiles si vous avez une idée précise du rendu attendu.",
  "Précisez la durée et la date souhaitée pour aider l'équipe à prioriser la production.",
  "Relisez votre brief, choisissez l'offre, puis confirmez la commande avant le paiement.",
];

const statusFlow = ["PAYEE", "EN_PRODUCTION", "EN_REVISION", "LIVREE", "ANNULEE"] as const;
const adminStatusOptions = ["EN_ATTENTE", ...statusFlow] as const;

type AuthUser = { id: string; email: string; name?: string };

export default function ClientShell({ path }: Props) {
  const route = `/${path.join("/")}`;
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState("offer-standard");
  const [selectedOccasion, setSelectedOccasion] = useState("occ-anniversaire");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<RequestForm>({
    whatsappClient: "",
    destinataire: "",
    occasionDetail: "",
    langueChanson: "Français",
    genreMusical: "Afro pop",
    ambiance: "joyeuse et emouvante",
    paroles: "",
    anecdotes: "",
    voixSouhaitee: "voix chaleureuse",
    typeVoix: "Femme",
    reference: "",
    dureeSouhaitee: 120,
    deadline: "",
    commandeExpress: false,
  });
  const [message, setMessage] = useState("");
  const [activeOrderId, setActiveOrderId] = useState(path[1] ?? "");
  const whatsappUrl =
    process.env.NEXT_PUBLIC_WHATSAPP_URL ??
    "https://wa.me/22671062285?text=Bonjour%20Sonora%2C%20je%20veux%20commander%20une%20chanson%20personnalis%C3%A9e.";

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  async function bootstrap() {
    const me = await fetchAuthUser();
    setAuthUser(me);
    setAuthChecked(true);

    if (route.startsWith("/admin")) {
      await refreshOrders("/api/admin/orders");
    } else if (me) {
      await refreshOrders("/api/orders");
    } else {
      setOrders([]);
    }
  }

  async function fetchAuthUser(): Promise<AuthUser | null> {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { user: AuthUser | null };
    return data.user;
  }

  async function refreshOrders(endpoint: string) {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { orders: Order[] };
      setOrders(data.orders);
    }
  }

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === activeOrderId) ?? orders[0],
    [activeOrderId, orders],
  );

  const currentOffer = getOffer(selectedOffer) ?? offers[0];
  const currentOccasion = getOccasion(selectedOccasion) ?? occasions[0];

  async function login(email: string, password: string) {
    setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await response.json()) as { user?: AuthUser; error?: string };
    if (!response.ok || !data.user) {
      setMessage(data.error ?? "Connexion impossible.");
      return;
    }
    setAuthUser(data.user);
    setMessage(`Bienvenue ${data.user.name ?? data.user.email} !`);
    router.push("/compte");
  }

  async function signup(name: string, email: string, password: string) {
    setMessage("");
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = (await response.json()) as { user?: AuthUser; error?: string };
    if (!response.ok || !data.user) {
      setMessage(data.error ?? "Inscription impossible.");
      return;
    }
    setAuthUser(data.user);
    setMessage(`Compte créé, bienvenue ${data.user.name ?? data.user.email} !`);
    router.push("/compte");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setOrders([]);
    setMessage("Déconnexion réussie.");
    router.push("/");
  }

  async function createOrder() {
    setMessage("");
    if (!authUser) {
      setMessage("Connecte-toi ou crée un compte pour passer commande.");
      router.push("/connexion");
      return;
    }
    if (!form.destinataire || !form.whatsappClient || !form.genreMusical) {
      setMessage("Renseigne au minimum le destinataire, le WhatsApp client et le style musical.");
      return;
    }
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: currentOffer.id,
        occasionId: currentOccasion.id,
        requestForm: form,
      }),
    });
    const data = (await response.json()) as { order?: Order; error?: string };
    if (!response.ok || !data.order) {
      setMessage(data.error ?? "Impossible de créer la commande.");
      return;
    }
    setActiveOrderId(data.order.id);
    setOrders((current) => [data.order as Order, ...current]);
    setMessage(`Commande ${data.order.id} créée. Redirection vers le paiement...`);
    router.push(`/commande/${data.order.id}/paiement`);
  }

  async function checkout(orderId: string) {
    setMessage("Initialisation du paiement YengaPay...");
    const response = await fetch(`/api/orders/${orderId}/checkout`, { method: "POST" });
    const data = (await response.json()) as { paymentUrl?: string; error?: string };
    if (!response.ok || !data.paymentUrl) {
      setMessage(data.error ?? "Impossible d'initialiser le paiement YengaPay.");
      return;
    }
    // Redirection vers la vraie page de checkout YengaPay (Orange Money, Moov
    // Money, carte...). Le retour se fait vers l'URL configuree dans la
    // console YengaPay pour ce projet.
    window.location.href = data.paymentUrl;
  }

  // Outil de développement uniquement : simule le webhook YengaPay pour
  // tester le flux sans effectuer un vrai paiement mobile money. A retirer
  // (ou a proteger) avant mise en production.
  async function simulatePaymentWebhook(orderId: string) {
    const response = await fetch("/api/webhooks/yengapay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: orderId, status: "SUCCESS", paymentSource: "orange_money" }),
    });
    const data = (await response.json()) as { order?: Order };
    if (data.order) setActiveOrderId(data.order.id);
    await refreshOrders(route.startsWith("/admin") ? "/api/admin/orders" : "/api/orders");
    setMessage("Paiement confirmé (webhook simulé). La commande est dans la file de production.");
  }

  async function updateStatus(orderId: string, status: string) {
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refreshOrders("/api/admin/orders");
  }

  async function addDeliverable(orderId: string, fileUrl: string, format: "mp3" | "wav") {
    await fetch(`/api/orders/${orderId}/deliverable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl, format }),
    });
    await refreshOrders("/api/admin/orders");
    setMessage("Livrable ajouté et email de livraison prêt à être déclenché.");
  }

  async function requestRevision(orderId: string, note: string) {
    if (!note.trim()) {
      setMessage("Décris la modification souhaitée avant d'envoyer la demande.");
      return;
    }
    await fetch(`/api/orders/${orderId}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() }),
    });
    await refreshOrders("/api/orders");
    setMessage("Demande de révision envoyée.");
  }

  return (
    <main>
      <Navigation authUser={authUser} logout={logout} />
      {message ? <div className="notice">{message}</div> : null}
      <a className="whatsapp-float" href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
      {route === "/" && <Home />}
      {route === "/exemples" && <Examples />}
      {route === "/occasions" && <Occasions />}
      {path[0] === "occasions" && path[1] && <OccasionDetail slug={path[1]} setSelectedOccasion={setSelectedOccasion} />}
      {route === "/offres" && <Offers selectedOffer={selectedOffer} setSelectedOffer={setSelectedOffer} />}
      {route === "/connexion" && authChecked && !authUser && <AuthForm login={login} signup={signup} />}
      {route === "/connexion" && authUser && <StaticPage title="Déjà connecté" body={`Tu es connecté en tant que ${authUser.email}.`} />}
      {route === "/commande/nouvelle" && authChecked && !authUser && (
        <AuthForm login={login} signup={signup} intro="Crée un compte ou connecte-toi pour commander : cela permet de lier ta commande à ton suivi personnel." />
      )}
      {route === "/commande/nouvelle" && authUser && (
        <OrderWizard
          step={step}
          setStep={setStep}
          form={form}
          setForm={setForm}
          selectedOffer={selectedOffer}
          selectedOccasion={selectedOccasion}
          setSelectedOffer={setSelectedOffer}
          setSelectedOccasion={setSelectedOccasion}
          createOrder={createOrder}
        />
      )}
      {path[0] === "commande" && path[2] === "paiement" && activeOrder && (
        <Payment order={activeOrder} checkout={checkout} simulatePaymentWebhook={simulatePaymentWebhook} />
      )}
      {path[0] === "commande" && path[2] === "suivi" && activeOrder && <Tracking order={activeOrder} />}
      {route === "/premium" && <Premium />}
      {route === "/compte" && authChecked && !authUser && (
        <AuthForm login={login} signup={signup} intro="Connecte-toi pour retrouver tes commandes." />
      )}
      {route === "/compte" && authUser && <ClientDashboard orders={orders} setActiveOrderId={setActiveOrderId} />}
      {path[0] === "compte" && path[1] === "commandes" && activeOrder && (
        <OrderDetail order={activeOrder} requestRevision={requestRevision} />
      )}
      {route === "/admin" && (
        <Admin orders={orders} updateStatus={updateStatus} addDeliverable={addDeliverable} setActiveOrderId={setActiveOrderId} />
      )}
      {route === "/faq" && <StaticPage title="FAQ" body="Paiement Mobile Money, carte, livraison MP3/WAV et révisions sont suivis depuis votre compte." />}
      {route === "/a-propos" && <StaticPage title="À propos" body="Sonora transforme les histoires personnelles en chansons créées manuellement avec Suno, puis contrôlées et livrées par un humain." />}
      {route === "/contact" && <StaticPage title="Contact" body="Pour les demandes urgentes, contactez l'équipe Sonora après commande avec votre numéro et votre deadline." />}
    </main>
  );
}

function Navigation({ authUser, logout }: { authUser: AuthUser | null; logout: () => void }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <img src="/sonora-icon.png" alt="" />
        <span>Sonora</span>
      </Link>
      <nav>
        <Link href="/occasions">Occasions</Link>
        <Link href="/exemples">Exemples</Link>
        <Link href="/offres">Offres</Link>
        <Link className="nav-cta" href="/commande/nouvelle">Commander</Link>
        <Link href="/premium">Premium</Link>
        {authUser ? (
          <>
            <Link href="/compte">Compte ({authUser.name ?? authUser.email})</Link>
            <button className="button" onClick={logout}>Déconnexion</button>
          </>
        ) : (
          <Link href="/connexion">Connexion</Link>
        )}
      </nav>
    </header>
  );
}

function AuthForm({
  login,
  signup,
  intro,
}: {
  login: (email: string, password: string) => void;
  signup: (name: string, email: string, password: string) => void;
  intro?: string;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit() {
    if (mode === "login") {
      login(email, password);
    } else {
      signup(name, email, password);
    }
  }

  return (
    <section className="section">
      <div className="auth-wrap">
        <div className="auth-copy">
          <p className="eyebrow">Espace client Sonora</p>
          <h1>{mode === "login" ? "Retrouvez vos chansons en création." : "Créez votre espace de commande."}</h1>
          <p>
            {intro ??
              "Un compte permet de sauvegarder votre brief, suivre le paiement, demander une révision et récupérer les fichiers livrés."}
          </p>
          <div className="auth-list">
            <span>Suivi clair après paiement YengaPay</span>
            <span>Historique de commandes centralisé</span>
            <span>Livraison MP3 ou WAV depuis votre espace</span>
          </div>
        </div>
        <div className="auth-panel">
          <h2>{mode === "login" ? "Connexion" : "Inscription"}</h2>
          <p>{mode === "login" ? "Connectez-vous pour continuer votre commande." : "Quelques informations suffisent pour démarrer."}</p>
          <div className="segmented">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Se connecter</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Créer un compte</button>
          </div>
          <div className="form-grid">
            {mode === "signup" && <Input label="Nom" value={name} onChange={setName} />}
            <Input label="Email" value={email} onChange={setEmail} />
            <label>
              <span>Mot de passe</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button className="button primary" onClick={submit}>
              {mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Chansons personnalisees en Afrique de l'Ouest</p>
          <h1>Sonora</h1>
          <p>
            Transformez une histoire, un anniversaire, un mariage ou une marque en chanson originale, avec paiement Mobile Money
            et suivi client jusqu'a la livraison.
          </p>
          <div className="actions">
            <Link className="button primary" href="/commande/nouvelle">Créer une chanson</Link>
            <Link className="button" href="/offres">Voir les offres</Link>
          </div>
          <div className="hero-proof">
            <span>Orange Money et carte</span>
            <span>Production controlee humainement</span>
            <span>MP3 / WAV livrés en ligne</span>
          </div>
        </div>
      </section>
      <section className="band grid three home-strip">
        <Metric label="Commandes" value="Paiement + suivi" />
        <Metric label="Création" value="Suno manuel" />
        <Metric label="Livraison" value="MP3 / WAV" />
      </section>
      <section className="band story-grid">
        <div className="story-panel">
          <p className="eyebrow">Le parcours</p>
          <h2>Une commande claire, une chanson qui sonne personnelle.</h2>
          <p>
            Sonora guide le client avec un brief simple : occasion, style, anecdotes, références et deadline. L'équipe garde
            la main sur la sélection finale pour livrer une version propre, partageable et facile à retrouver.
          </p>
          <div className="actions">
            <Link className="button dark" href="/commande/nouvelle">Lancer le brief</Link>
          </div>
        </div>
        <div className="process-list">
          <ProcessStep index="01" title="Racontez" body="Le client decrit la personne, l'ambiance, les souvenirs et les phrases importantes." />
          <ProcessStep index="02" title="Payez" body="Le checkout YengaPay regroupe Mobile Money et carte pour confirmer la commande." />
          <ProcessStep index="03" title="Suivez" body="Le compte client affiche le statut, les révisions et les fichiers audio livrés." />
        </div>
      </section>
      <section className="band demo-audio">
        <div>
          <p className="eyebrow">Démo audio</p>
          <h2>Écoutez l’ambiance Sonora.</h2>
          <p>Un extrait court pour montrer le ton chaleureux, premium et émotionnel que les clients peuvent attendre.</p>
        </div>
        <audio controls preload="metadata" src="/sonora-ensemble.mp3">
          Votre navigateur ne prend pas en charge la lecture audio.
        </audio>
      </section>
      <section className="band">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Offres populaires</p>
            <h2>Des formats simples pour vendre vite.</h2>
          </div>
          <p>Deux offres simples suffisent pour couvrir le cadeau personnel, la commande urgente et l'usage commercial.</p>
        </div>
        <div className="grid three">
          {offers.map((offer) => (
            <article className={`price ${offer.highlight ? "highlight" : ""}`} key={offer.id}>
              <h3>{offer.name}</h3>
              <strong>{formatPrice(offer.price)}</strong>
              <p>{offer.deliveryDays} jours &bull; {offer.revisions} révisions</p>
              <Link className="button primary" href="/offres">Choisir</Link>
            </article>
          ))}
        </div>
      </section>
      <section className="band">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Avis clients</p>
            <h2>Des chansons qui deviennent des souvenirs.</h2>
          </div>
          <p>Quelques retours types pour rassurer avant la commande et montrer les usages possibles.</p>
        </div>
        <div className="grid three">
          <Testimonial name="Aminata" context="Anniversaire" quote="La chanson a fait pleurer toute la famille. On a reconnu nos mots et notre histoire." />
          <Testimonial name="Marc" context="Mariage" quote="Parfait pour notre vidéo. Le rendu était doux, propre et livré avant la cérémonie." />
          <Testimonial name="Studio K." context="Entreprise" quote="Le jingle est clair, mémorisable et adapté à notre marque. Très bon suivi." />
        </div>
      </section>
      <section className="band faq-grid">
        <div>
          <p className="eyebrow">FAQ rapide</p>
          <h2>Les réponses avant de commander.</h2>
        </div>
        <div className="process-list">
          <FaqItem question="Comment se passe le paiement ?" answer="La commande est créée dans votre compte, puis le paiement se fait via YengaPay avec Mobile Money ou carte." />
          <FaqItem question="Quand vais-je recevoir ma chanson ?" answer="Le délai dépend de l'offre choisie. Le statut reste visible dans votre espace client." />
          <FaqItem question="Puis-je demander une modification ?" answer="Oui. Les révisions incluses sont indiquées dans l'offre et se demandent directement depuis la fiche commande." />
        </div>
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="tile"><span>{label}</span><strong>{value}</strong></article>;
}

function ProcessStep({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <article className="process-item">
      <span>{index}</span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </article>
  );
}

function Examples() {
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Exemples</p>
          <h1>Écoutez ce que Sonora peut créer.</h1>
        </div>
        <p>Des formats de démonstration pour aider le client à se projeter avant de remplir son brief.</p>
      </div>
      <div className="grid three">
        <AudioExample title="Anniversaire" body="Une chanson tendre pour célébrer une personne, ses souvenirs et son année." src="/aujourdhui-pour-toi.mp3" />
        <AudioExample title="Mariage" body="Une ambiance douce et émotionnelle pour une entrée, une vidéo ou une surprise." src="/deux-chemins.mp3" />
        <AudioExample title="Entreprise" body="Un jingle moderne pour une marque, une campagne ou une équipe." src="/sonora-ensemble.mp3" />
      </div>
      <div className="actions">
        <Link className="button primary" href="/commande/nouvelle">Créer ma chanson</Link>
      </div>
    </section>
  );
}

function AudioExample({ title, body, src }: { title: string; body: string; src: string }) {
  return (
    <article className="audio-card">
      <h3>{title}</h3>
      <p>{body}</p>
      <audio controls preload="metadata" src={src}>
        Votre navigateur ne prend pas en charge la lecture audio.
      </audio>
    </article>
  );
}

function Testimonial({ name, context, quote }: { name: string; context: string; quote: string }) {
  return (
    <article className="testimonial">
      <p>“{quote}”</p>
      <strong>{name}</strong>
      <span>{context}</span>
    </article>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <article className="process-item">
      <span>?</span>
      <div>
        <h3>{question}</h3>
        <p>{answer}</p>
      </div>
    </article>
  );
}

function Occasions() {
  return <Section title="Occasions" subtitle="Choisissez le contexte, puis associez une offre.">{occasions.map((occasion) => <article className="card" key={occasion.id}><img src={occasion.imageUrl} alt="" /><h3>{occasion.name}</h3><p>{occasion.description}</p><Link href={`/occasions/${occasion.slug}`}>Voir</Link></article>)}</Section>;
}

function OccasionDetail({ slug, setSelectedOccasion }: { slug: string; setSelectedOccasion: (id: string) => void }) {
  const occasion = getOccasion(slug) ?? occasions[0];
  return <section className="section"><img className="wide-image" src={occasion.imageUrl} alt="" /><h1>{occasion.name}</h1><p>{occasion.description}</p><Link className="button primary" href="/commande/nouvelle" onClick={() => setSelectedOccasion(occasion.id)}>Commander pour cette occasion</Link></section>;
}

function Offers({ selectedOffer, setSelectedOffer }: { selectedOffer: string; setSelectedOffer: (id: string) => void }) {
  return <Section title="Offres" subtitle="Choisissez le bon niveau de soin selon l'urgence, les droits et le nombre de révisions attendues.">{offers.map((offer) => <article className={`price ${offer.highlight ? "highlight" : ""}`} key={offer.id}><h3>{offer.name}</h3><strong>{formatPrice(offer.price)}</strong><p>{offer.deliveryDays} jours • {offer.revisions} révisions</p><ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><button className="button primary" onClick={() => setSelectedOffer(offer.id)}>{selectedOffer === offer.id ? "Sélectionnée" : "Choisir"}</button></article>)}</Section>;
}

function OrderWizard(props: {
  step: number;
  setStep: (step: number) => void;
  form: RequestForm;
  setForm: (form: RequestForm) => void;
  selectedOffer: string;
  selectedOccasion: string;
  setSelectedOffer: (id: string) => void;
  setSelectedOccasion: (id: string) => void;
  createOrder: () => void;
}) {
  const offer = getOffer(props.selectedOffer) ?? offers[0];
  const [wizardMessage, setWizardMessage] = useState("");
  const setField = (key: keyof RequestForm, value: string | number | boolean) => props.setForm({ ...props.form, [key]: value });
  const expressPrice = offer.price + (props.form.commandeExpress ? EXPRESS_SURCHARGE : 0);
  function validateStep() {
    if (props.step === 0 && !props.form.destinataire?.trim()) return "Indiquez le destinataire de la chanson.";
    if (props.step === 0 && !props.form.whatsappClient?.trim()) return "Indiquez le numéro WhatsApp du client.";
    if (props.step === 1 && !props.form.genreMusical?.trim()) return "Indiquez au moins un style musical.";
    if (props.step === 2 && !props.form.anecdotes?.trim() && !props.form.paroles?.trim()) {
      return "Ajoutez au moins une anecdote, un souvenir ou une phrase à inclure.";
    }
    return "";
  }

  function goNext() {
    const error = validateStep();
    if (error) {
      setWizardMessage(error);
      return;
    }
    setWizardMessage("");
    props.setStep(Math.min(5, props.step + 1));
  }

  function goPrevious() {
    setWizardMessage("");
    props.setStep(Math.max(0, props.step - 1));
  }

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Brief guidé</p>
          <h1>Nouvelle commande</h1>
        </div>
        <p>Chaque information aide l'équipe à produire une chanson plus juste. Vous pourrez relire le récapitulatif avant paiement.</p>
      </div>
      <div className="trust-row">
        <span>Paiement sécurisé avec YengaPay</span>
        <span>Suivi depuis votre compte</span>
        <span>Révisions incluses selon l'offre</span>
      </div>
      <div className="steps">{steps.map((item, index) => <button className={index === props.step ? "active" : ""} key={item} onClick={() => props.setStep(index)}>{item}</button>)}</div>
      <article className="step-help">
        <strong>Étape {props.step + 1} sur {steps.length} : {steps[props.step]}</strong>
        <p>{stepHelp[props.step]}</p>
      </article>
      {wizardMessage ? <div className="form-alert">{wizardMessage}</div> : null}
      <div className="form-grid">
        {props.step === 0 && <><Select label="Occasion" value={props.selectedOccasion} onChange={props.setSelectedOccasion} options={occasions.map((item) => [item.id, item.name])} /><Input label="Destinataire" value={props.form.destinataire ?? ""} onChange={(value) => setField("destinataire", value)} /><Input label="WhatsApp du client" value={props.form.whatsappClient ?? ""} onChange={(value) => setField("whatsappClient", value)} /><Input label="Détail de l'occasion" value={props.form.occasionDetail ?? ""} onChange={(value) => setField("occasionDetail", value)} /></>}
        {props.step === 1 && <><Input label="Genre musical" value={props.form.genreMusical ?? ""} onChange={(value) => setField("genreMusical", value)} /><Select label="Langue de la chanson" value={props.form.langueChanson ?? "Français"} onChange={(value) => setField("langueChanson", value)} options={[["Français", "Français"], ["Mooré", "Mooré"], ["Dioula", "Dioula"], ["Anglais", "Anglais"], ["Autre", "Autre"]]} /><Input label="Ambiance" value={props.form.ambiance ?? ""} onChange={(value) => setField("ambiance", value)} /><Select label="Type de voix" value={props.form.typeVoix ?? "Femme"} onChange={(value) => setField("typeVoix", value)} options={[["Femme", "Femme"], ["Homme", "Homme"], ["Duo", "Duo"], ["Chœurs", "Chœurs"], ["Rap", "Rap"]]} /><Input label="Voix souhaitée" value={props.form.voixSouhaitee ?? ""} onChange={(value) => setField("voixSouhaitee", value)} /></>}
        {props.step === 2 && <><Textarea label="Anecdotes et souvenirs" value={props.form.anecdotes ?? ""} onChange={(value) => setField("anecdotes", value)} /><Textarea label="Paroles ou phrases à inclure" value={props.form.paroles ?? ""} onChange={(value) => setField("paroles", value)} /></>}
        {props.step === 3 && <><Input label="Référence YouTube / Spotify" value={props.form.reference ?? ""} onChange={(value) => setField("reference", value)} /><Input label="Fichier audio optionnel" value={props.form.fichierAudio ?? ""} onChange={(value) => setField("fichierAudio", value)} /></>}
        {props.step === 4 && <><Input label="Durée souhaitée en secondes" value={String(props.form.dureeSouhaitee ?? 120)} onChange={(value) => setField("dureeSouhaitee", Number(value))} /><Input label="Date limite souhaitée" value={props.form.deadline ?? ""} onChange={(value) => setField("deadline", value)} /><label className="checkbox-line"><input type="checkbox" checked={Boolean(props.form.commandeExpress)} onChange={(event) => setField("commandeExpress", event.target.checked)} /><span>Commande express (+{formatPrice(EXPRESS_SURCHARGE)})</span></label></>}
        {props.step === 5 && <><Select label="Offre" value={props.selectedOffer} onChange={props.setSelectedOffer} options={offers.map((item) => [item.id, `${item.name} - ${formatPrice(item.price)}`])} /><article className="summary"><h3>Récapitulatif</h3><p>{offer.name} • {formatPrice(expressPrice)} • livraison {offer.deliveryDays} jours • {offer.revisions} révisions</p><p>{props.form.destinataire || "Destinataire à préciser"} • {props.form.genreMusical} • {props.form.langueChanson} • voix {props.form.typeVoix}</p><ul><li>WhatsApp client : {props.form.whatsappClient || "non renseigné"}</li><li>{props.form.commandeExpress ? `Commande express incluse (+${formatPrice(EXPRESS_SURCHARGE)})` : "Commande standard sans supplément express"}</li><li>Le paiement démarre après création de la commande.</li><li>La livraison sera disponible dans votre espace.</li></ul><button className="button primary" onClick={props.createOrder}>Créer la commande</button></article></>}
      </div>
      <div className="actions"><button className="button" onClick={goPrevious}>Précédent</button><button className="button primary" onClick={goNext}>Suivant</button></div>
    </section>
  );
}

function Payment({ order, checkout, simulatePaymentWebhook }: { order: Order; checkout: (id: string) => void; simulatePaymentWebhook: (id: string) => void }) {
  const devTools = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
  return (
    <section className="section">
      <h1>Paiement</h1>
      <p>Commande {order.id} - {formatPrice(order.price)}</p>
      <p>Canaux: Orange Money, Moov Money, Sank Money, Coris Money et carte bancaire via YengaPay.</p>
      <div className="actions">
        <button className="button primary" onClick={() => checkout(order.id)}>Payer avec YengaPay</button>
        {devTools && (
          <button className="button" onClick={() => simulatePaymentWebhook(order.id)}>Simuler webhook payé (dev)</button>
        )}
      </div>
    </section>
  );
}

function Tracking({ order }: { order: Order }) {
  return <section className="section"><h1>Suivi</h1><p className="badge">{statusLabels[order.status]}</p><p>Deadline : {order.deadline ? new Date(order.deadline).toLocaleDateString("fr-FR") : "après paiement"}</p></section>;
}

function Premium() {
  return <section className="section"><h1>Premium</h1><div className="grid two"><article className="tile"><h3>Mensuel</h3><p>Priorité de production, tarifs réduits et révisions étendues pendant 30 jours.</p></article><article className="tile"><h3>Annuel</h3><p>Stockage permanent et traitement prioritaire sur toutes les commandes.</p></article></div></section>;
}

function ClientDashboard({ orders, setActiveOrderId }: { orders: Order[]; setActiveOrderId: (id: string) => void }) {
  const latestOrder = orders[0];
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Espace client</p>
          <h1>Compte client</h1>
        </div>
        <p>Suivez vos commandes, les paiements, la production, les révisions et la livraison depuis un seul endroit.</p>
      </div>
      {latestOrder ? <OrderTimeline order={latestOrder} /> : null}
      <OrderTable orders={orders} setActiveOrderId={setActiveOrderId} base="/compte/commandes" />
    </section>
  );
}

function OrderTimeline({ order }: { order: Order }) {
  const timeline = [
    { status: "EN_ATTENTE", label: "Commande créée" },
    { status: "PAYEE", label: "Paiement confirmé" },
    { status: "EN_PRODUCTION", label: "En production" },
    { status: "EN_REVISION", label: "Révision" },
    { status: "LIVREE", label: "Livraison" },
  ] as const;
  const currentIndex = timeline.findIndex((item) => item.status === order.status);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <article className="timeline-card">
      <div>
        <span className="badge">{statusLabels[order.status]}</span>
        <h3>Dernière commande : {order.id}</h3>
        <p>{formatPrice(order.price)} • {order.deadline ? new Date(order.deadline).toLocaleDateString("fr-FR") : "deadline après paiement"}</p>
      </div>
      <div className="timeline">
        {timeline.map((item, index) => (
          <div className={index <= safeIndex ? "timeline-step done" : "timeline-step"} key={item.status}>
            <span>{index + 1}</span>
            <strong>{item.label}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function OrderDetail({ order, requestRevision }: { order: Order; requestRevision: (id: string, note: string) => void }) {
  const [revisionNote, setRevisionNote] = useState("");
  const form = order.requestForm;

  function submitRevision() {
    requestRevision(order.id, revisionNote);
    setRevisionNote("");
  }

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Espace client</p>
          <h1>Commande {order.id}</h1>
        </div>
        <p className="badge">{statusLabels[order.status]}</p>
      </div>

      <div className="order-card">
        <div className="order-card-header">
          <div>
            <span>Montant</span>
            <strong>{formatPrice(order.price)}</strong>
          </div>
          <div>
            <span>Deadline</span>
            <strong>{order.deadline ? new Date(order.deadline).toLocaleDateString("fr-FR") : "Après paiement"}</strong>
          </div>
          <div>
            <span>Révisions utilisées</span>
            <strong>{order.revisionsUsed}</strong>
          </div>
        </div>

        <div className="brief-grid">
          <BriefItem label="Destinataire" value={form.destinataire} />
          <BriefItem label="WhatsApp" value={form.whatsappClient} />
          <BriefItem label="Occasion" value={form.occasionDetail} />
          <BriefItem label="Genre musical" value={form.genreMusical} />
          <BriefItem label="Langue" value={form.langueChanson} />
          <BriefItem label="Type de voix" value={form.typeVoix} />
          <BriefItem label="Ambiance" value={form.ambiance} />
          <BriefItem label="Voix souhaitée" value={form.voixSouhaitee} />
          <BriefItem label="Commande express" value={form.commandeExpress ? "Oui" : "Non"} />
          <BriefItem label="Durée" value={form.dureeSouhaitee ? `${form.dureeSouhaitee} secondes` : undefined} />
          <BriefItem wide label="Anecdotes" value={form.anecdotes} />
          <BriefItem wide label="Paroles ou phrases à inclure" value={form.paroles} />
          <BriefItem wide label="Référence" value={form.reference} />
        </div>
      </div>

      <div className="grid two">
        <article className="tile">
          <h3>Livrables</h3>
          {order.deliverables.length ? (
            <div className="deliverables-list">
              {order.deliverables.map((item) => (
                <a key={item.id} href={item.fileUrl} target="_blank" rel="noreferrer">
                  Télécharger v{item.version} ({item.format})
                </a>
              ))}
            </div>
          ) : (
            <p>Les fichiers apparaîtront ici dès que la commande sera livrée.</p>
          )}
        </article>

        <article className="tile">
          <h3>Demander une révision</h3>
          <p>Expliquez précisément ce qu’il faut ajuster : paroles, voix, ambiance, tempo ou passage spécifique.</p>
          <textarea value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} placeholder="Ex : rendre le refrain plus joyeux et ajouter le prénom dans le premier couplet." />
          <button className="button primary" onClick={submitRevision}>Envoyer la demande</button>
        </article>
      </div>
    </section>
  );
}

function BriefItem({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={wide ? "brief-item wide" : "brief-item"}>
      <span>{label}</span>
      <strong>{value?.trim() || "Non renseigné"}</strong>
    </div>
  );
}

function Admin({ orders, updateStatus, addDeliverable, setActiveOrderId }: { orders: Order[]; updateStatus: (id: string, status: string) => void; addDeliverable: (id: string, fileUrl: string, format: "mp3" | "wav") => void; setActiveOrderId: (id: string) => void }) {
  const [statusFilter, setStatusFilter] = useState<"TOUS" | Order["status"]>("TOUS");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const filteredOrders = orders
    .filter((order) => statusFilter === "TOUS" || order.status === statusFilter)
    .filter((order) => !urgentOnly || isUrgentOrder(order))
    .sort((a, b) => urgencyScore(b) - urgencyScore(a));

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Production</p>
          <h1>Admin</h1>
        </div>
        <p>File triée pour mieux repérer les commandes urgentes, les paiements confirmés et les briefs à produire.</p>
      </div>

      <div className="admin-toolbar">
        <label>
          <span>Statut</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "TOUS" | Order["status"])}>
            <option value="TOUS">Tous les statuts</option>
            {adminStatusOptions.map((status) => (
              <option key={status} value={status}>{statusLabels[status]}</option>
            ))}
          </select>
        </label>
        <button className={urgentOnly ? "button primary" : "button"} onClick={() => setUrgentOnly((value) => !value)}>
          Commandes urgentes
        </button>
      </div>

      <OrderTable orders={filteredOrders} setActiveOrderId={setActiveOrderId} base="/admin" />
      {filteredOrders.map((order) => (
        <AdminOrderRow key={order.id} order={order} updateStatus={updateStatus} addDeliverable={addDeliverable} />
      ))}
    </section>
  );
}

function AdminOrderRow({
  order,
  updateStatus,
  addDeliverable,
}: {
  order: Order;
  updateStatus: (id: string, status: string) => void;
  addDeliverable: (id: string, fileUrl: string, format: "mp3" | "wav") => void;
}) {
  const [fileUrl, setFileUrl] = useState("");
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const form = order.requestForm;
  const offer = getOffer(order.offerId);
  const urgent = isUrgentOrder(order);

  function submitDeliverable() {
    if (!fileUrl.trim()) return;
    addDeliverable(order.id, fileUrl.trim(), format);
    setFileUrl("");
  }

  return (
    <article className="admin-row">
      <div className="admin-row-head">
        <div>
          <span className={urgent ? "badge urgent" : "badge"}>{urgent ? "Urgent" : statusLabels[order.status]}</span>
          <h3>{form.destinataire || "Destinataire non renseigné"}</h3>
          <p>{offer?.name ?? order.offerId} • {formatPrice(order.price)} • {order.userEmail}</p>
        </div>
        <label>
          <span>Statut</span>
          <select value={order.status} onChange={(event) => updateStatus(order.id, event.target.value)}>
            {adminStatusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="brief-grid compact">
        <BriefItem label="WhatsApp" value={form.whatsappClient} />
        <BriefItem label="Style" value={form.genreMusical} />
        <BriefItem label="Langue" value={form.langueChanson} />
        <BriefItem label="Type de voix" value={form.typeVoix} />
        <BriefItem label="Ambiance" value={form.ambiance} />
        <BriefItem label="Deadline" value={order.deadline ? new Date(order.deadline).toLocaleDateString("fr-FR") : "Après paiement"} />
        <BriefItem label="Express" value={form.commandeExpress ? "Oui" : "Non"} />
        <BriefItem label="Voix" value={form.voixSouhaitee} />
        <BriefItem wide label="Anecdotes" value={form.anecdotes} />
        <BriefItem wide label="Phrases à inclure" value={form.paroles} />
        <BriefItem wide label="Référence" value={form.reference} />
      </div>

      {order.deliverables.length > 0 && (
        <div className="deliverables-list">
          {order.deliverables.map((item) => (
            <a key={item.id} href={item.fileUrl} target="_blank" rel="noreferrer">
              v{item.version} ({item.format})
            </a>
          ))}
        </div>
      )}

      <div className="deliverable-form">
        <input
          type="url"
          placeholder="Lien du fichier audio terminé (ex: lien Google Drive, WeTransfer...)"
          value={fileUrl}
          onChange={(event) => setFileUrl(event.target.value)}
        />
        <select value={format} onChange={(event) => setFormat(event.target.value as "mp3" | "wav")}>
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
        </select>
        <button className="button" onClick={submitDeliverable}>
          Ajouter l&apos;audio terminé
        </button>
      </div>
    </article>
  );
}

function isUrgentOrder(order: Order) {
  if (order.status === "LIVREE" || order.status === "ANNULEE") return false;
  if (!order.deadline) return false;
  const deadlineTime = new Date(order.deadline).getTime();
  if (Number.isNaN(deadlineTime)) return false;
  const remainingMs = deadlineTime - Date.now();
  return remainingMs <= 1000 * 60 * 60 * 24 * 2;
}

function urgencyScore(order: Order) {
  if (order.status === "LIVREE" || order.status === "ANNULEE") return 0;
  if (!order.deadline) return 1;
  const deadlineTime = new Date(order.deadline).getTime();
  if (Number.isNaN(deadlineTime)) return 1;
  const remainingDays = (deadlineTime - Date.now()) / (1000 * 60 * 60 * 24);
  return Math.max(2, 20 - remainingDays);
}

function OrderTable({ orders, setActiveOrderId, base }: { orders: Order[]; setActiveOrderId: (id: string) => void; base: string }) {
  if (!orders.length) return <p>Aucune commande pour l'instant. Créez-en une depuis le formulaire.</p>;
  return <div className="table">{orders.map((order) => <Link href={`${base}/${order.id}`} onClick={() => setActiveOrderId(order.id)} className="table-row" key={order.id}><span>{order.id}</span><span>{statusLabels[order.status]}</span><span>{formatPrice(order.price)}</span><span>{order.deadline ? new Date(order.deadline).toLocaleDateString("fr-FR") : "-"}</span></Link>)}</div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="section"><h1>{title}</h1><p>{subtitle}</p><div className="grid three">{children}</div></section>;
}

function StaticPage({ title, body }: { title: string; body: string }) {
  return <section className="section"><h1>{title}</h1><p>{body}</p></section>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="wide"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>;
}
