"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import "../app/crm.css";

type Campaign = { id: string; name: string; objective: string; status: string; budget_amount: string; budget_currency: string; headline: string; primary_text: string };
type Listing = { id: string; title: string; price: string; slug: string; images?: Array<{ url: string }> };
type Overview = { hasMetaMetrics: boolean; hasAttribution: boolean; metrics: { spend: string; impressions: string; reach: string; clicks: string; conversations: string; leads: string; revenue: string; ctr: number | null; costPerLead: number | null; roas: number | null } };
type AdAccount = { id: string; name: string; currency: string; accountStatus: number };
type AdAccounts = { status: string; accounts: AdAccount[]; selected: AdAccount | null };
type MetaInsights = { status: string; account?: AdAccount; insights: null | { spend: string; impressions: string; reach: string; clicks: string; dateStart: string; dateStop: string } };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/crm/meta-ads${path}`, { credentials: "include", cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Não foi possível obter os dados dos anúncios.");
  return body as T;
}

const objectives: Record<string, string> = {
  whatsapp_messages: "Conversas no WhatsApp", instagram_direct: "Mensagens Instagram",
  store_traffic: "Visitas à loja", lead_generation: "Novos leads",
};

export function CrmMetaAds() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingId, setListingId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccounts | null>(null);
  const [adAccountId, setAdAccountId] = useState("");
  const [metaInsights, setMetaInsights] = useState<MetaInsights | null>(null);
  const [adsError, setAdsError] = useState("");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("whatsapp_messages");
  const [headline, setHeadline] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [budget, setBudget] = useState("5000");
  const [location, setLocation] = useState("Luanda");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [gender, setGender] = useState("all");
  const [durationDays, setDurationDays] = useState("7");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [saved, report] = await Promise.all([api<{ items: Campaign[] }>("/campaigns"), api<Overview>("/overview")]);
      setCampaigns(saved.items); setOverview(report);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar anúncios."); }
  }, []);
  const loadAds = useCallback(async () => {
    const [accountsResult, insightsResult] = await Promise.allSettled([api<AdAccounts>("/accounts"), api<MetaInsights>("/insights")]);
    if (accountsResult.status === "fulfilled") {
      setAdAccounts(accountsResult.value);
      setAdAccountId(accountsResult.value.selected?.id ?? "");
      setAdsError("");
    } else setAdsError(accountsResult.reason instanceof Error ? accountsResult.reason.message : "Falha ao verificar acesso Meta Ads.");
    if (insightsResult.status === "fulfilled") setMetaInsights(insightsResult.value);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAds(); }, [loadAds]);
  useEffect(() => {
    void fetch("/api/v1/seller/listings", { credentials: "include", cache: "no-store" })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload: { items?: Listing[] }) => setListings(payload.items ?? []))
      .catch(() => setListings([]));
  }, []);

  const selectedListing = listings.find((listing) => listing.id === listingId);

  function importListing(id: string) {
    setListingId(id);
    const listing = listings.find((item) => item.id === id);
    if (!listing) return;
    const price = Number(listing.price).toLocaleString("pt-AO");
    setHeadline(listing.title.slice(0, 120));
    setPrimaryText(`${listing.title} por ${price} Kz na PUVO.`);
    if (!name.trim()) setName(`Promover ${listing.title}`.slice(0, 120));
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + Number(durationDays) * 86_400_000);
      await api("/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name, objective, headline, primaryText, budgetType: "daily", budgetAmount: Number(budget),
        budgetCurrency: "AOA", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), targetLocations: [location],
        targetAgeMin: Number(ageMin), targetAgeMax: Number(ageMax), targetGender: gender,
        ...(listingId ? { listingId } : {}),
      }) });
      setName(""); setHeadline(""); setPrimaryText(""); setListingId(""); setNotice("Rascunho guardado. A publicação de anúncios aguarda acesso Meta Ads aprovado.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao guardar o rascunho."); }
    finally { setBusy(false); }
  }

  async function selectAdAccount() {
    setBusy(true); setAdsError("");
    try {
      await api("/accounts/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: adAccountId }) });
      await loadAds();
    } catch (cause) { setAdsError(cause instanceof Error ? cause.message : "Falha ao selecionar conta publicitária."); }
    finally { setBusy(false); }
  }

  const metrics = overview?.metrics;
  const cards = metrics ? [
    ["Investimento", `${Number(metrics.spend).toLocaleString("pt-AO")} Kz`],
    ["Impressões", Number(metrics.impressions).toLocaleString("pt-AO")],
    ["Alcance", Number(metrics.reach).toLocaleString("pt-AO")],
    ["Cliques", Number(metrics.clicks).toLocaleString("pt-AO")],
    ["Conversas", Number(metrics.conversations).toLocaleString("pt-AO")],
    ["Leads", Number(metrics.leads).toLocaleString("pt-AO")],
    ["Receita atribuída", `${Number(metrics.revenue).toLocaleString("pt-AO")} Kz`],
    ["ROAS", metrics.roas === null ? "—" : `${metrics.roas.toFixed(2)}×`],
  ] : [];
  return <section className="crm-ads">
    <div className="crm-ads-note" role="status">Podes preparar rascunhos sem cobrança. A leitura das contas e métricas requer <strong>ads_read</strong>; a ativação de anúncios requer <strong>ads_management</strong> e aprovação da Meta. Guardar um rascunho não cria campanhas na Meta.</div>
    <div className="crm-studio-card crm-ads-access"><h2>Conta publicitária Meta</h2>
      {adAccounts?.status === "permission_required" && <p>A app ainda não recebeu <strong>ads_read</strong> nesta autorização. Depois da aprovação da Meta, volta a ligar Facebook e Instagram no <a href="/vendedor/crm/conversas">Live Inbox</a> e autoriza a conta publicitária.</p>}
      {adAccounts?.status === "expired" && <p>O acesso Meta expirou. Volta a ligar a conta no <a href="/vendedor/crm/conversas">Live Inbox</a>.</p>}
      {adAccounts?.status === "connected" && <><p>Seleciona uma conta autorizada para consultar o desempenho de todos os anúncios dessa conta nos últimos 30 dias. Esta operação só lê dados.</p>
        <label>Conta publicitária<select value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)}><option value="">Selecionar conta</option>{adAccounts.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
        <button type="button" disabled={busy || !adAccountId || adAccountId === adAccounts.selected?.id} onClick={() => void selectAdAccount()}>Usar esta conta</button>
        {!adAccounts.accounts.length && <p>Esta autorização não devolveu contas publicitárias acessíveis.</p>}
      </>}
      {adsError && <p role="alert" className="crm-social-error">{adsError}</p>}
      {metaInsights?.status === "connected" && metaInsights.insights && <div className="crm-ads-metrics" aria-label="Desempenho Meta Ads nos últimos 30 dias">
        <div><span>Investimento Meta · {metaInsights.account?.currency}</span><strong>{Number(metaInsights.insights.spend).toLocaleString("pt-AO", { maximumFractionDigits: 2 })}</strong></div>
        <div><span>Impressões</span><strong>{Number(metaInsights.insights.impressions).toLocaleString("pt-AO")}</strong></div>
        <div><span>Alcance</span><strong>{Number(metaInsights.insights.reach).toLocaleString("pt-AO")}</strong></div>
        <div><span>Cliques</span><strong>{Number(metaInsights.insights.clicks).toLocaleString("pt-AO")}</strong></div>
      </div>}
    </div>
    <h2>Desempenho publicitário</h2>
    {overview && !overview.hasMetaMetrics && <p className="crm-ads-empty">Ainda não há métricas de investimento e tráfego sincronizadas da Meta. Leads e receita atribuídos aparecem quando chegam ao CRM com uma referência de campanha conhecida.</p>}
    <div className="crm-ads-metrics">{cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{overview?.hasMetaMetrics || (overview?.hasAttribution && ["Leads", "Receita atribuída"].includes(label)) ? value : "—"}</strong></div>)}</div>
    <div className="crm-ads-layout"><div className="crm-studio-card"><h2>Preparar campanha</h2>
      <label>Nome da campanha<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Coleção de outubro" /></label>
      <label>Objetivo<select value={objective} onChange={(event) => setObjective(event.target.value)}>{Object.entries(objectives).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Produto da loja (opcional)<select value={listingId} onChange={(event) => importListing(event.target.value)}><option value="">Criativo personalizado</option>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {Number(listing.price).toLocaleString("pt-AO")} Kz</option>)}</select></label>
      <label>Título do anúncio<input value={headline} maxLength={120} onChange={(event) => setHeadline(event.target.value)} /></label>
      <label>Texto principal<textarea value={primaryText} maxLength={2200} rows={5} onChange={(event) => setPrimaryText(event.target.value)} /></label>
      <div className="crm-ads-pair"><label>Orçamento diário (Kz)<input type="number" min="1" value={budget} onChange={(event) => setBudget(event.target.value)} /></label><label>Localização<input value={location} onChange={(event) => setLocation(event.target.value)} /></label></div>
      <div className="crm-ads-pair"><label>Idade mínima<input type="number" min="18" max="65" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} /></label><label>Idade máxima<input type="number" min="18" max="65" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} /></label></div>
      <div className="crm-ads-pair"><label>Público<select value={gender} onChange={(event) => setGender(event.target.value)}><option value="all">Todos</option><option value="female">Mulheres</option><option value="male">Homens</option></select></label><label>Duração (dias)<input type="number" min="1" max="365" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} /></label></div>
      <button type="button" disabled={busy || !name.trim() || !headline.trim() || !primaryText.trim() || !location.trim() || Number(budget) <= 0 || Number(ageMin) < 18 || Number(ageMax) > 65 || Number(ageMin) > Number(ageMax) || Number(durationDays) < 1 || Number(durationDays) > 365} onClick={() => void save()}>Guardar rascunho</button>
      {error && <p role="alert" className="crm-social-error">{error}</p>}{notice && <p role="status" className="crm-social-success">{notice}</p>}
    </div><div className="crm-studio-card"><h2>Prévia do anúncio</h2><div className="crm-ads-preview"><small>Patrocinado · Prévia</small>{selectedListing?.images?.[0]?.url && <Image src={selectedListing.images[0].url} alt={selectedListing.title} width={480} height={320} unoptimized className="crm-ads-preview-image" />}<h3>{headline || "O título do teu anúncio"}</h3><p>{primaryText || "O texto da tua campanha aparece aqui."}</p><span>{objectives[objective]}</span></div><h2>Campanhas guardadas</h2>{!campaigns.length && <p>Sem campanhas preparadas.</p>}{campaigns.map((campaign) => <article className="crm-ads-campaign" key={campaign.id}><strong>{campaign.name}</strong><span>{objectives[campaign.objective] ?? campaign.objective} · {campaign.budget_amount} {campaign.budget_currency}/dia</span><small>{campaign.status === "draft" ? "Rascunho — ainda não publicado" : campaign.status}</small></article>)}</div></div>
  </section>;
}
