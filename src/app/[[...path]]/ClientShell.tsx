"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatPrice, getOccasion, getOffer, occasions, offers, statusLabels, type Order, type RequestForm } from "@/lib/sonora";

type Props = {
  path: string[];
};

const steps = ["Occasion", "Style", "Contenu", "References", "Pratique", "Recapitulatif"];

const statusFlow = ["PAYEE", "EN_PRODUCTION", "EN_REVISION", "LIVREE", "ANNULEE"] as const;

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
    destinataire: "",
    occasionDetail: "",
    genreMusical: "Afro pop",
    ambiance: "joyeuse et emouvante",
    paroles: "",
    anecdotes: "",
    voixSouhaitee: "voix chaleureuse",
    reference: "",
    dureeSouhaitee: 120,
    deadline: "",
  });
  const [message, setMessage] = useState("");
  const [activeOrderId, setActiveOrderId] = useState(path[1] ?? "");

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

  const currentOffer = getOffer(selectedOffer) ?? offers[1];
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
    setMessage(`Compte cree, bienvenue ${data.user.name ?? data.user.email} !`);
    router.push("/compte");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setOrders([]);
    setMessage("Deconnexion reussie.");
    router.push("/");
  }

  async function createOrder() {
    setMessage("");
    if (!authUser) {
      setMessage("Connecte-toi ou cree un compte pour passer commande.");
      router.push("/connexion");
      return;
    }
    if (!form.destinataire || !form.genreMusical) {
      setMessage("Renseigne au minimum le destinataire et le style musical.");
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
      setMessage(data.error ?? "Impossible de creer la commande.");
      return;
    }
    setActiveOrderId(data.order.id);
    setOrders((current) => [data.order as Order, ...current]);
    setMessage(`Commande ${data.order.id} creee. Redirection vers le paiement...`);
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

  // Outil de developpement uniquement : simule le webhook YengaPay pour
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
    setMessage("Paiement confirme (webhook simule). La commande est dans la file admin.");
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
    setMessage("Livrable ajoute et email de livraison pret a etre declenche.");
  }

  async function requestRevision(orderId: string) {
    const note = window.prompt("Quelle modification souhaitez-vous demander ?") ?? "";
    await fetch(`/api/orders/${orderId}/revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    await refreshOrders("/api/orders");
  }

  return (
    <main>
      <Navigation authUser={authUser} logout={logout} />
      {message ? <div className="notice">{message}</div> : null}
      {route === "/" && <Home />}
      {route === "/occasions" && <Occasions />}
      {path[0] === "occasions" && path[1] && <OccasionDetail slug={path[1]} setSelectedOccasion={setSelectedOccasion} />}
      {route === "/offres" && <Offers selectedOffer={selectedOffer} setSelectedOffer={setSelectedOffer} />}
      {route === "/connexion" && authChecked && !authUser && <AuthForm login={login} signup={signup} />}
      {route === "/connexion" && authUser && <StaticPage title="Deja connecte" body={`Tu es connecte en tant que ${authUser.email}.`} />}
      {route === "/commande/nouvelle" && authChecked && !authUser && (
        <AuthForm login={login} signup={signup} intro="Cree un compte ou connecte-toi pour commander : ca nous permet de lier ta commande a ton suivi personnel." />
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
      {route === "/faq" && <StaticPage title="FAQ" body="Paiement Mobile Money, carte, livraison MP3/WAV et revisions sont suivis depuis votre compte." />}
      {route === "/a-propos" && <StaticPage title="A propos" body="Sonora transforme les histoires personnelles en chansons creees manuellement avec Suno, puis controlees et livrees par un humain." />}
      {route === "/contact" && <StaticPage title="Contact" body="Pour les demandes urgentes, contactez l'equipe Sonora apres commande avec votre numero et votre deadline." />}
    </main>
  );
}

function Navigation({ authUser, logout }: { authUser: AuthUser | null; logout: () => void }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">Sonora</Link>
      <nav>
        <Link href="/occasions">Occasions</Link>
        <Link href="/offres">Offres</Link>
        <Link href="/commande/nouvelle">Commander</Link>
        <Link href="/premium">Premium</Link>
        {authUser ? (
          <>
            <Link href="/compte">Compte ({authUser.name ?? authUser.email})</Link>
            <button className="button" onClick={logout}>Deconnexion</button>
          </>
        ) : (
          <Link href="/connexion">Connexion</Link>
        )}
        <Link href="/admin">Admin</Link>
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
      <h1>{mode === "login" ? "Se connecter" : "Creer un compte"}</h1>
      {intro && <p>{intro}</p>}
      <div className="steps">
        <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Se connecter</button>
        <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Creer un compte</button>
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
          {mode === "login" ? "Se connecter" : "Creer mon compte"}
        </button>
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
            Commandez une chanson unique, payez par Mobile Money ou carte, puis suivez la creation jusqu'a la livraison du fichier.
          </p>
          <div className="actions">
            <Link className="button primary" href="/commande/nouvelle">Creer une chanson</Link>
            <Link className="button" href="/offres">Voir les offres</Link>
          </div>
        </div>
      </section>
      <section className="band grid three">
        <Metric label="Commandes" value="Paiement + suivi" />
        <Metric label="Creation" value="Suno manuel" />
        <Metric label="Livraison" value="MP3 / WAV" />
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="tile"><span>{label}</span><strong>{value}</strong></article>;
}

function Occasions() {
  return <Section title="Occasions" subtitle="Choisissez le contexte, puis associez une offre.">{occasions.map((occasion) => <article className="card" key={occasion.id}><img src={occasion.imageUrl} alt="" /><h3>{occasion.name}</h3><p>{occasion.description}</p><Link href={`/occasions/${occasion.slug}`}>Voir</Link></article>)}</Section>;
}

function OccasionDetail({ slug, setSelectedOccasion }: { slug: string; setSelectedOccasion: (id: string) => void }) {
  const occasion = getOccasion(slug) ?? occasions[0];
  return <section className="section"><img className="wide-image" src={occasion.imageUrl} alt="" /><h1>{occasion.name}</h1><p>{occasion.description}</p><Link className="button primary" href="/commande/nouvelle" onClick={() => setSelectedOccasion(occasion.id)}>Commander pour cette occasion</Link></section>;
}

function Offers({ selectedOffer, setSelectedOffer }: { selectedOffer: string; setSelectedOffer: (id: string) => void }) {
  return <Section title="Offres" subtitle="Le premium vend votre temps, votre priorite et votre soin.">{offers.map((offer) => <article className={`price ${offer.highlight ? "highlight" : ""}`} key={offer.id}><h3>{offer.name}</h3><strong>{formatPrice(offer.price)}</strong><p>{offer.deliveryDays} jours • {offer.revisions} revisions</p><ul>{offer.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><button className="button primary" onClick={() => setSelectedOffer(offer.id)}>{selectedOffer === offer.id ? "Selectionnee" : "Choisir"}</button></article>)}</Section>;
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
  const offer = getOffer(props.selectedOffer) ?? offers[1];
  const setField = (key: keyof RequestForm, value: string | number) => props.setForm({ ...props.form, [key]: value });
  return (
    <section className="section">
      <h1>Nouvelle commande</h1>
      <div className="steps">{steps.map((item, index) => <button className={index === props.step ? "active" : ""} key={item} onClick={() => props.setStep(index)}>{item}</button>)}</div>
      <div className="form-grid">
        {props.step === 0 && <><Select label="Occasion" value={props.selectedOccasion} onChange={props.setSelectedOccasion} options={occasions.map((item) => [item.id, item.name])} /><Input label="Destinataire" value={props.form.destinataire ?? ""} onChange={(value) => setField("destinataire", value)} /><Input label="Detail occasion" value={props.form.occasionDetail ?? ""} onChange={(value) => setField("occasionDetail", value)} /></>}
        {props.step === 1 && <><Input label="Genre musical" value={props.form.genreMusical ?? ""} onChange={(value) => setField("genreMusical", value)} /><Input label="Ambiance" value={props.form.ambiance ?? ""} onChange={(value) => setField("ambiance", value)} /><Input label="Voix souhaitee" value={props.form.voixSouhaitee ?? ""} onChange={(value) => setField("voixSouhaitee", value)} /></>}
        {props.step === 2 && <><Textarea label="Anecdotes" value={props.form.anecdotes ?? ""} onChange={(value) => setField("anecdotes", value)} /><Textarea label="Paroles ou phrases a inclure" value={props.form.paroles ?? ""} onChange={(value) => setField("paroles", value)} /></>}
        {props.step === 3 && <><Input label="Reference YouTube / Spotify" value={props.form.reference ?? ""} onChange={(value) => setField("reference", value)} /><Input label="Fichier audio optionnel" value={props.form.fichierAudio ?? ""} onChange={(value) => setField("fichierAudio", value)} /></>}
        {props.step === 4 && <><Input label="Duree souhaitee en secondes" value={String(props.form.dureeSouhaitee ?? 120)} onChange={(value) => setField("dureeSouhaitee", Number(value))} /><Input label="Deadline souhaitee" value={props.form.deadline ?? ""} onChange={(value) => setField("deadline", value)} /></>}
        {props.step === 5 && <><Select label="Offre" value={props.selectedOffer} onChange={props.setSelectedOffer} options={offers.map((item) => [item.id, `${item.name} - ${formatPrice(item.price)}`])} /><article className="summary"><h3>Recapitulatif</h3><p>{offer.name} • {formatPrice(offer.price)} • livraison {offer.deliveryDays} jours</p><p>{props.form.destinataire} • {props.form.genreMusical} • {props.form.ambiance}</p><button className="button primary" onClick={props.createOrder}>Creer la commande</button></article></>}
      </div>
      <div className="actions"><button className="button" onClick={() => props.setStep(Math.max(0, props.step - 1))}>Precedent</button><button className="button primary" onClick={() => props.setStep(Math.min(5, props.step + 1))}>Suivant</button></div>
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
          <button className="button" onClick={() => simulatePaymentWebhook(order.id)}>Simuler webhook paye (dev)</button>
        )}
      </div>
    </section>
  );
}

function Tracking({ order }: { order: Order }) {
  return <section className="section"><h1>Suivi</h1><p className="badge">{statusLabels[order.status]}</p><p>Deadline: {order.deadline ? new Date(order.deadline).toLocaleDateString("fr-FR") : "apres paiement"}</p></section>;
}

function Premium() {
  return <section className="section"><h1>Premium</h1><div className="grid two"><article className="tile"><h3>Mensuel</h3><p>Priorite admin, tarifs reduits, revisions illimitees pendant 30 jours.</p></article><article className="tile"><h3>Annuel</h3><p>Stockage permanent et traitement prioritaire sur toutes les commandes.</p></article></div></section>;
}

function ClientDashboard({ orders, setActiveOrderId }: { orders: Order[]; setActiveOrderId: (id: string) => void }) {
  return <section className="section"><h1>Compte client</h1><OrderTable orders={orders} setActiveOrderId={setActiveOrderId} base="/compte/commandes" /></section>;
}

function OrderDetail({ order, requestRevision }: { order: Order; requestRevision: (id: string) => void }) {
  return <section className="section"><h1>Commande {order.id}</h1><p className="badge">{statusLabels[order.status]}</p><pre>{JSON.stringify(order.requestForm, null, 2)}</pre>{order.deliverables.map((item) => <p key={item.id}><a href={item.fileUrl}>Telecharger v{item.version} ({item.format})</a></p>)}<button className="button" onClick={() => requestRevision(order.id)}>Demander une revision</button></section>;
}

function Admin({ orders, updateStatus, addDeliverable, setActiveOrderId }: { orders: Order[]; updateStatus: (id: string, status: string) => void; addDeliverable: (id: string, fileUrl: string, format: "mp3" | "wav") => void; setActiveOrderId: (id: string) => void }) {
  return (
    <section className="section">
      <h1>Admin</h1>
      <p>File triee par deadline pour gerer la charge de production manuelle.</p>
      <OrderTable orders={orders} setActiveOrderId={setActiveOrderId} base="/admin" />
      {orders.map((order) => (
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

  function submitDeliverable() {
    if (!fileUrl.trim()) return;
    addDeliverable(order.id, fileUrl.trim(), format);
    setFileUrl("");
  }

  return (
    <article className="admin-row">
      <strong>{order.id}</strong>
      <select value={order.status} onChange={(event) => updateStatus(order.id, event.target.value)}>
        {statusFlow.map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </select>

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
          placeholder="Lien du fichier audio termine (ex: lien Google Drive, WeTransfer...)"
          value={fileUrl}
          onChange={(event) => setFileUrl(event.target.value)}
        />
        <select value={format} onChange={(event) => setFormat(event.target.value as "mp3" | "wav")}>
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
        </select>
        <button className="button" onClick={submitDeliverable}>
          Ajouter l&apos;audio termine
        </button>
      </div>
    </article>
  );
}

function OrderTable({ orders, setActiveOrderId, base }: { orders: Order[]; setActiveOrderId: (id: string) => void; base: string }) {
  if (!orders.length) return <p>Aucune commande pour l'instant. Creez-en une depuis le formulaire.</p>;
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
