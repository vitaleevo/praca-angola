"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kwanza } from "../lib/api";
import { StoreSwitcher } from "./store-switcher";
import { StoreTeamManager } from "./store-team-manager";
import { SellerPaymentSettingsFields } from "./seller-payment-settings-fields";

type SellerPaymentMethod = { method: "manual_multicaixa_express_transfer" | "manual_bank_transfer"; enabled: boolean; configured: boolean; recipientName: string | null; providerName: string | null; maskedIdentifier: string };
type Profile = { id: string; profile_type: "individual" | "business"; slug: string; display_name: string; description: string; province: string; municipality: string; status: string; is_verified: boolean; role: "owner" | "editor" | "support"; has_payment_destination: boolean; masked_phone?: string | null; payment_methods?: SellerPaymentMethod[]; logo_media_asset_id?: string | null; cover_media_asset_id?: string | null; contact_email?: string | null; contact_phone?: string | null; contact_email_public?: boolean; contact_phone_public?: boolean; delivery_policy?: string; returns_policy?: string; terms_policy?: string };
type SellerListing = { id: string; slug: string; title: string; price: string; available_quantity: number; status: string; rejection_reason?: string; category: string };

export function SellerDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [mcxEnabled, setMcxEnabled] = useState(false);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [logoImageId, setLogoImageId] = useState<string | null>(null);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const publishedCount = items.filter((item) => item.status === "published").length;
  const reviewCount = items.filter((item) => item.status === "pending_review").length;
  const readDashboard = useCallback(async () => {
    const me = await fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" });
    const meData = await me.json().catch(() => ({})) as { user?: { id: string } | null };
    if (me.status === 401 || (me.ok && !meData.user)) return null;
    if (!me.ok) throw new Error("Não foi possível verificar a tua sessão. Tenta novamente.");
    const [profileResponse, listingResponse] = await Promise.all([fetch("/api/v1/seller/profile", { credentials: "include" }), fetch("/api/v1/seller/listings", { credentials: "include" })]);
    const profileData = await profileResponse.json().catch(() => ({})) as { profile?: Profile | null; message?: string };
    const listingData = await listingResponse.json().catch(() => ({})) as { items?: SellerListing[]; message?: string };
    if (!profileResponse.ok) throw new Error(profileData.message ?? "Não foi possível carregar a tua loja.");
    return { profile: profileData.profile ?? null, items: listingResponse.ok ? listingData.items ?? [] : [] };
  }, []);
  useEffect(() => {
    let active = true;
    readDashboard()
      .then((dashboard) => {
        if (!active) return;
        if (!dashboard) { router.replace("/entrar?next=%2Fvendedor"); return; }
        setProfile(dashboard.profile);
        setItems(dashboard.items);
        setMcxEnabled(Boolean(dashboard.profile?.payment_methods?.some((method) => method.method === "manual_multicaixa_express_transfer" && method.enabled)));
        setBankTransferEnabled(Boolean(dashboard.profile?.payment_methods?.some((method) => method.method === "manual_bank_transfer" && method.enabled)));
        setLogoImageId(dashboard.profile?.logo_media_asset_id ?? null);
        setCoverImageId(dashboard.profile?.cover_media_asset_id ?? null);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [readDashboard, router]);
  async function load() {
    try {
      const dashboard = await readDashboard();
      if (!dashboard) { router.replace("/entrar?next=%2Fvendedor"); return; }
      setProfile(dashboard.profile);
      setItems(dashboard.items);
      setMcxEnabled(Boolean(dashboard.profile?.payment_methods?.some((method) => method.method === "manual_multicaixa_express_transfer" && method.enabled)));
      setBankTransferEnabled(Boolean(dashboard.profile?.payment_methods?.some((method) => method.method === "manual_bank_transfer" && method.enabled)));
      setLogoImageId(dashboard.profile?.logo_media_asset_id ?? null);
      setCoverImageId(dashboard.profile?.cover_media_asset_id ?? null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor.");
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaveStatus(""); setProfileBusy(true);
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries());
    try {
      const response = await fetch("/api/v1/seller/profile", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, mcxRecipientName: formData.has("clearPaymentDestination") ? null : String(formData.get("mcxRecipientName") ?? "").trim() || null, mcxPhone: formData.has("clearPaymentDestination") ? null : String(formData.get("mcxPhone") ?? "").replace(/\s/g, "") || null, mcxEnabled: formData.has("mcxEnabled") && !formData.has("clearPaymentDestination"), clearPaymentDestination: formData.has("clearPaymentDestination"), bankName: formData.has("clearBankTransfer") ? null : String(formData.get("bankName") ?? "").trim() || null, bankAccountHolder: formData.has("clearBankTransfer") ? null : String(formData.get("bankAccountHolder") ?? "").trim() || null, bankAccountIdentifier: formData.has("clearBankTransfer") ? null : String(formData.get("bankAccountIdentifier") ?? "").replace(/\s/g, "").toUpperCase() || null, bankTransferEnabled: formData.has("bankTransferEnabled") && !formData.has("clearBankTransfer"), clearBankTransfer: formData.has("clearBankTransfer"), contactEmail: String(formData.get("contactEmail") ?? "").trim() || null, contactEmailPublic: formData.has("contactEmailPublic"), contactPhone: String(formData.get("contactPhone") ?? "").replace(/\s/g, "") || null, contactPhonePublic: formData.has("contactPhonePublic"), logoImageId, coverImageId }) });
      const data = await response.json().catch(() => ({})) as { profile?: Profile; message?: string | string[] };
      if (!response.ok) { setError(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Não foi possível guardar os dados."); return; }
      setProfile(data.profile ?? null);
      setMcxEnabled(Boolean(data.profile?.payment_methods?.some((method) => method.method === "manual_multicaixa_express_transfer" && method.enabled)));
      setBankTransferEnabled(Boolean(data.profile?.payment_methods?.some((method) => method.method === "manual_bank_transfer" && method.enabled)));
      setLogoImageId(data.profile?.logo_media_asset_id ?? null);
      setCoverImageId(data.profile?.cover_media_asset_id ?? null);
      setSaveStatus("A montra foi guardada.");
    } catch {
      setError("Sem ligação ao servidor. Tenta guardar novamente.");
    } finally {
      setProfileBusy(false);
    }
  }
  async function uploadStoreImage(kind: "logo" | "cover", file?: File) {
    if (!file) return;
    setBrandError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setBrandError("Escolhe uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setBrandError("Cada imagem pode ter no máximo 5 MB.");
      return;
    }
    setBrandBusy(true);
    try {
      const response = await fetch("/api/v1/media", { method: "POST", credentials: "include", headers: { "Content-Type": file.type }, body: file });
      const data = await response.json().catch(() => ({})) as { id?: string; message?: string };
      if (!response.ok || !data.id) {
        setBrandError(response.status >= 500
          ? "O envio de imagens está temporariamente indisponível. Tenta novamente mais tarde."
          : data.message ?? "Não foi possível enviar esta imagem.");
        return;
      }
      if (kind === "logo") setLogoImageId(data.id); else setCoverImageId(data.id);
    } catch {
      setBrandError("Sem ligação ao servidor. Tenta enviar a imagem novamente.");
    } finally {
      setBrandBusy(false);
    }
  }
  async function setListingStatus(id: string, status: string) {
    const response = await fetch(`/api/v1/seller/listings/${id}/status`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) { setError("Não foi possível atualizar o anúncio."); return; }
    await load();
  }
  if (loading) return <div className="loading-state" role="status">A carregar a tua área de vendedor…</div>;
  return <div className="seller-dashboard"><StoreSwitcher onSelected={load}/>{profile && <section className="seller-store-overview"><div className="seller-store-overview-brand">{logoImageId ? <Image className="seller-store-overview-logo" src={`/api/v1/media/${logoImageId}`} alt="Logótipo da loja" width={64} height={64} sizes="64px"/> : <span className="store-mark store-green store-mark-large" aria-hidden="true">{profile.display_name.slice(0, 1).toUpperCase()}</span>}<div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> A tua montra pública</p><h2>{profile.display_name}</h2><p>{profile.province} · {profile.municipality} <span className="seller-store-status">{profile.status === "active" ? "Ativa" : "Em revisão"}</span></p></div></div><div className="seller-store-overview-stats"><div><b>{publishedCount}</b><span>publicados</span></div><div><b>{reviewCount}</b><span>em revisão</span></div><div><b>{items.length}</b><span>anúncios</span></div></div><div className="seller-store-overview-actions"><Link className="button button-primary" href={`/lojas/${profile.slug}`}>Ver a loja <span aria-hidden="true">↗</span></Link>{profile.role !== "support" && <Link className="button button-secondary" href="/vendedor/anuncios/novo">Adicionar produto <span aria-hidden="true">＋</span></Link>}</div></section>}{profile?.role === "owner" || !profile ? <section key={profile?.id ?? "new"} className="panel seller-profile-panel"><div className="section-heading"><div><h2>{profile ? "Dados da loja" : "Cria a tua montra"}</h2><p>Os dados comerciais são públicos quando optas por os mostrar. Os dados dos métodos de recebimento permanecem privados.</p></div>{profile?.has_payment_destination && <span className="subtle-chip">MCX configurado · {profile.masked_phone}</span>}</div><form className="stack-form two-column-form" onSubmit={save}><label>Tipo de vendedor<select name="profileType" defaultValue={profile?.profile_type ?? "business"}><option value="business">Empresa ou loja</option><option value="individual">Vendedor individual</option></select></label><label>Nome público<input name="displayName" defaultValue={profile?.display_name ?? ""} required minLength={2} maxLength={100}/></label><label>Província<input name="province" defaultValue={profile?.province ?? "Luanda"} required minLength={2} maxLength={100}/></label><label>Município<input name="municipality" defaultValue={profile?.municipality ?? "Luanda"} required minLength={2} maxLength={100}/></label><label className="form-span">Descrição da loja<textarea name="description" defaultValue={profile?.description ?? ""} maxLength={2000} rows={3}/></label><div className="store-branding-fields form-span"><h3>Identidade da montra</h3><p>Personaliza a página pública com o logótipo e uma fotografia de capa. JPEG, PNG ou WebP até 5 MB cada.</p><div className="store-branding-grid"><label>Logótipo da loja<span className="store-branding-preview store-branding-logo">{logoImageId ? <Image src={`/api/v1/media/${logoImageId}`} alt="Pré-visualização do logótipo" width={160} height={160} sizes="160px"/> : profile?.display_name.slice(0, 1).toUpperCase()}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={brandBusy} onChange={(event) => void uploadStoreImage("logo", event.target.files?.[0])}/><small>Imagem quadrada recomendada.</small></label><label>Capa da montra<span className="store-branding-preview store-branding-cover">{coverImageId ? <Image src={`/api/v1/media/${coverImageId}`} alt="Pré-visualização da capa" fill sizes="(max-width: 767px) 100vw, 620px"/> : <span>A tua montra, com a tua identidade</span>}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={brandBusy} onChange={(event) => void uploadStoreImage("cover", event.target.files?.[0])}/><small>Uma imagem horizontal fica melhor.</small></label></div>{brandBusy && <p className="form-status" role="status">A enviar imagem…</p>}{brandError && <p className="form-error" role="alert">{brandError}</p>}</div><fieldset className="store-settings-group form-span"><legend>Contactos comerciais públicos</legend><p>Os compradores só verão os canais que ativares. Não uses aqui o número privado de recebimento Multicaixa Express.</p><label>E-mail comercial<input type="email" name="contactEmail" maxLength={254} defaultValue={profile?.contact_email ?? ""} placeholder="contacto@loja.ao"/></label><label className="checkbox-label"><input type="checkbox" name="contactEmailPublic" defaultChecked={profile?.contact_email_public}/> Autorizo publicar este e-mail na montra</label><label>Telefone comercial<input type="tel" name="contactPhone" inputMode="tel" pattern="(\+244)?9[0-9]{8}" defaultValue={profile?.contact_phone ?? ""} placeholder="9xxxxxxxx ou +2449xxxxxxxx"/></label><label className="checkbox-label"><input type="checkbox" name="contactPhonePublic" defaultChecked={profile?.contact_phone_public}/> Autorizo publicar este telefone na montra</label></fieldset><fieldset className="store-settings-group form-span"><legend>Entrega, trocas e condições</legend><label>Informação sobre entrega<textarea name="deliveryPolicy" maxLength={2000} rows={3} defaultValue={profile?.delivery_policy ?? ""} placeholder="Zonas, custos e prazos de entrega…"/></label><label>Trocas e devoluções<textarea name="returnsPolicy" maxLength={2000} rows={3} defaultValue={profile?.returns_policy ?? ""} placeholder="Prazo e condições para solicitar uma troca…"/></label><label>Condições de venda<textarea name="termsPolicy" maxLength={2000} rows={3} defaultValue={profile?.terms_policy ?? ""} placeholder="Condições importantes antes de confirmar uma encomenda…"/></label></fieldset><SellerPaymentSettingsFields paymentMethods={profile?.payment_methods ?? []} hasPaymentDestination={Boolean(profile?.has_payment_destination)} maskedPhone={profile?.masked_phone} mcxEnabled={mcxEnabled} setMcxEnabled={setMcxEnabled} bankTransferEnabled={bankTransferEnabled} setBankTransferEnabled={setBankTransferEnabled} /><div className="form-span"><button className="button button-primary" type="submit" disabled={brandBusy || profileBusy}>{brandBusy ? "A enviar imagem…" : profileBusy ? "A guardar…" : "Guardar dados da loja"}</button>{error && <p className="form-error" role="alert">{error}</p>}{saveStatus && <p className="success-message" role="status">{saveStatus}</p>}</div></form></section> : <section className="panel store-readonly-notice"><b>Permissões da loja</b><span>{profile.role === "editor" ? "Podes gerir anúncios da montra. Só o proprietário altera dados comerciais, contactos e recebimentos." : "Podes responder a conversas e consultar o trabalho da loja. Alterações comerciais ficam reservadas ao proprietário."}</span></section>}{profile?.role === "owner" && <StoreTeamManager key={profile.id}/>}<section className="panel"><div className="section-heading"><div><h2>Os anúncios da loja</h2><p>Os anúncios passam por revisão antes de ficarem públicos.</p></div>{profile?.role !== "support" && <Link className="button button-primary" href="/vendedor/anuncios/novo">Publicar produto</Link>}</div>{items.length ? <div className="seller-listings">{items.map((item) => <article className="seller-listing" key={item.id}><span className="listing-status">{item.status.replaceAll("_", " ")}</span><div><b>{item.title}</b><small>{item.category} · {item.available_quantity} em stock · {kwanza(item.price)}</small>{item.rejection_reason && <small className="form-error">Motivo: {item.rejection_reason}</small>}</div><div className="seller-listing-actions">{item.status === "published" && <Link href={`/produtos/${item.slug}`}>Ver anúncio</Link>}{profile?.role !== "support" && item.status === "published" && <button className="text-button" onClick={() => void setListingStatus(item.id, "paused")}>Pausar</button>}{profile?.role !== "support" && item.status === "paused" && <button className="text-button" onClick={() => void setListingStatus(item.id, "published")}>Retomar</button>}{profile?.role !== "support" && <Link href={`/vendedor/anuncios/${item.id}`}>Editar</Link>}</div></article>)}</div> : <div className="empty-state"><b>Ainda não publicaste produtos.</b><span>Cria o teu primeiro anúncio para aparecer na montra pública.</span></div>}</section></div>;
}

type Category = { id: string; name: string; slug: string };
type UploadedImage = { id: string; url: string; name: string };
type ListingInitial = { title: string; description: string; category_slug: string; price: string; condition: string; price_negotiable: boolean; available_quantity: number; province: string; municipality: string; images: { id: string; url: string; alt: string }[] };

export function ListingForm({ listingId, initial }: { listingId?: string; initial?: ListingInitial }) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<UploadedImage[]>(initial?.images?.flatMap((image) => image.id ? [{ id: image.id, url: image.url, name: image.alt || "Imagem do anúncio" }] : []) ?? []);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/v1/catalog/categories").then((response) => response.json()).then((data: Category[]) => setCategories(data)).catch(() => setError("Não foi possível carregar categorias.")); }, []);
  async function upload(files: FileList | null) {
    if (!files) return;
    setError(""); setBusy(true);
    for (const file of Array.from(files).slice(0, Math.max(0, 8 - images.length))) {
      const response = await fetch("/api/v1/media", { method: "POST", credentials: "include", headers: { "Content-Type": file.type }, body: file });
      const data = await response.json().catch(() => ({})) as { id?: string; url?: string; message?: string };
      if (!response.ok || !data.id || !data.url) { setError(data.message ?? `Não foi possível enviar ${file.name}.`); continue; }
      setImages((current) => [...current, { id: data.id!, url: data.url!, name: file.name }]);
    }
    setBusy(false);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setStatus(""); setBusy(true);
    const formData = new FormData(event.currentTarget);
    const payload = { title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? ""), categorySlug: String(formData.get("categorySlug") ?? ""), price: Number(formData.get("price")), condition: String(formData.get("condition")), priceNegotiable: formData.get("priceNegotiable") === "on", availableQuantity: Number(formData.get("availableQuantity")), province: String(formData.get("province") ?? ""), municipality: String(formData.get("municipality") ?? ""), imageIds: images.map((image) => image.id) };
    const response = await fetch(listingId ? `/api/v1/seller/listings/${listingId}` : "/api/v1/seller/listings", { method: listingId ? "PUT" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({})) as { id?: string; message?: string | string[] };
    if (response.status === 401) { router.replace("/entrar?next=/vendedor/anuncios/novo"); return; }
    if (!response.ok) { setError(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Não foi possível guardar o anúncio."); setBusy(false); return; }
    setStatus("Anúncio enviado para revisão. A equipa vai verificar o conteúdo antes de o publicar.");
    setBusy(false);
    if (!listingId) window.setTimeout(() => router.push("/vendedor"), 1600);
  }
  return <form className="stack-form listing-form" onSubmit={submit}><label>Título<input name="title" defaultValue={initial?.title} required minLength={4} maxLength={140} placeholder="Ex.: Sofá de 3 lugares"/></label><label>Categoria<select name="categorySlug" required defaultValue={initial?.category_slug ?? ""}><option value="" disabled>Escolhe uma categoria</option>{categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></label><label>Descrição<textarea name="description" defaultValue={initial?.description} required minLength={10} maxLength={8000} rows={6} placeholder="Descreve o estado, características e condições de venda."/></label><div className="two-column-fields"><label>Preço em Kz<input name="price" type="number" min="1" step="0.01" defaultValue={initial?.price} required/></label><label>Estado<select name="condition" defaultValue={initial?.condition ?? "new"}><option value="new">Novo</option><option value="used">Usado</option><option value="refurbished">Recondicionado</option></select></label><label>Quantidade disponível<input name="availableQuantity" type="number" min="1" max="100000" defaultValue={initial?.available_quantity ?? 1} required/></label><label>Província<input name="province" defaultValue={initial?.province ?? "Luanda"} required minLength={2} maxLength={100}/></label><label>Município<input name="municipality" defaultValue={initial?.municipality ?? "Luanda"} required minLength={2} maxLength={100}/></label></div><label className="checkbox-label"><input name="priceNegotiable" type="checkbox" defaultChecked={initial?.price_negotiable}/> Aceito negociar o preço</label><div><label htmlFor="listing-images">Fotografias <small>JPEG, PNG ou WebP, até 5 MB por imagem (máximo 8)</small></label><input id="listing-images" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || images.length >= 8} onChange={(event) => void upload(event.target.files)}/><div className="uploaded-images">{images.map((image) => <div key={image.id}><Image src={image.url} alt={image.name} width={96} height={96} sizes="96px"/><button type="button" aria-label={`Remover ${image.name}`} onClick={() => setImages(images.filter((item) => item.id !== image.id))}>×</button></div>)}</div></div>{error && <p className="form-error" role="alert">{error}</p>}{status && <p className="success-message" role="status">{status}</p>}<button className="button button-primary" type="submit" disabled={busy || categories.length === 0}>{busy ? "A guardar…" : listingId ? "Guardar alterações" : "Enviar para revisão"}</button><p className="legal-note">Não publiques artigos proibidos, falsificados ou com informações enganosas. Os anúncios são moderados antes da publicação.</p></form>;
}

export function EditListingForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [listing, setListing] = useState<ListingInitial | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/v1/seller/listings/${listingId}`, { credentials: "include" }).then(async (response) => {
      if (response.status === 401) { router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`); return; }
      const data = await response.json() as ListingInitial & { message?: string };
      if (!response.ok) setError(data.message ?? "Anúncio não encontrado."); else setListing(data);
    }).catch(() => setError("Não foi possível carregar o anúncio."));
  }, [listingId, router]);
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!listing) return <div className="loading-state">A carregar anúncio…</div>;
  return <ListingForm listingId={listingId} initial={listing}/>;
}
