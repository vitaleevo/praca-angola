"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kwanza } from "../lib/api";

type Listing = { id: string; slug: string; title: string; description: string; price: string; condition: string; province: string; municipality: string; category: string; store_name: string; images: { url: string; alt: string }[] };
type Report = { id: string; reason: string; details: string; status: string; created_at: string; reporter: string; listing_id: string; listing_slug: string; listing_title: string; store_name: string };

export function ModerationDashboard() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");
  const readDashboard = useCallback(async () => {
    const me = await fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" });
    const meData = await me.json().catch(() => ({})) as { user?: { id: string } | null };
    if (me.status === 401 || (me.ok && !meData.user)) return null;
    if (!me.ok) throw new Error("Não foi possível verificar a tua sessão. Tenta novamente.");
    const [listingResponse, reportResponse] = await Promise.all([fetch("/api/v1/admin/listings", { credentials: "include" }), fetch("/api/v1/admin/reports", { credentials: "include" })]);
    const listingData = await listingResponse.json().catch(() => ({})) as { items?: Listing[]; message?: string };
    const reportData = await reportResponse.json().catch(() => ({})) as { items?: Report[]; message?: string };
    if (!listingResponse.ok || !reportResponse.ok) throw new Error(listingData.message ?? reportData.message ?? "Acesso de moderação não permitido.");
    return { listings: listingData.items ?? [], reports: reportData.items ?? [] };
  }, []);
  useEffect(() => {
    let active = true;
    readDashboard()
      .then((dashboard) => {
        if (!active) return;
        if (!dashboard) { router.replace("/entrar?next=/admin/moderacao"); return; }
        setListings(dashboard.listings);
        setReports(dashboard.reports);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor."); });
    return () => { active = false; };
  }, [readDashboard, router]);
  async function load() {
    try {
      const dashboard = await readDashboard();
      if (!dashboard) { router.replace("/entrar?next=/admin/moderacao"); return; }
      setListings(dashboard.listings);
      setReports(dashboard.reports);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sem ligação ao servidor. Tenta novamente.");
    }
  }
  async function review(id: string, action: string) {
    const reason = action === "rejected" ? window.prompt("Motivo da rejeição (obrigatório)") : "";
    if (action === "rejected" && !reason) return;
    const response = await fetch(`/api/v1/admin/listings/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
    if (!response.ok) { setError("Não foi possível rever o anúncio."); return; }
    await load();
  }
  async function resolve(id: string, status: string) {
    const response = await fetch(`/api/v1/admin/reports/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) { setError("Não foi possível atualizar a denúncia."); return; }
    await load();
  }
  return <div className="moderation-dashboard">{error && <p className="form-error" role="alert">{error}</p>}<section className="panel"><div className="section-heading"><div><h2>Anúncios pendentes</h2><p>Confirma que a informação e as imagens seguem as regras da PUVO.</p></div><span className="subtle-chip">{listings.length} pendentes</span></div>{listings.length ? listings.map((listing) => <article className="moderation-item" key={listing.id}><div>{listing.images?.[0] && <Image src={listing.images[0].url} alt={listing.images[0].alt || listing.title} width={115} height={115} unoptimized />}<div><span className="product-category">{listing.category} · {listing.store_name}</span><h3>{listing.title}</h3><p>{listing.description}</p><b>{kwanza(listing.price)}</b><small>{listing.condition} · {listing.province} · {listing.municipality}</small></div></div><div className="button-row"><button className="button button-primary" onClick={() => void review(listing.id, "approved")}>Aprovar e publicar</button><button className="button button-secondary" onClick={() => void review(listing.id, "rejected")}>Rejeitar</button></div></article>) : <div className="empty-state"><b>Sem anúncios pendentes.</b></div>}</section><section className="panel"><div className="section-heading"><div><h2>Denúncias</h2><p>Revê anúncios reportados pela comunidade.</p></div><span className="subtle-chip">{reports.length} abertas</span></div>{reports.length ? reports.map((report) => <article className="report-item" key={report.id}><div><b>{report.listing_title}</b><small>{report.reason.replaceAll("_", " ")} · {report.store_name} · reportado por {report.reporter}</small><p>{report.details || "Sem detalhes adicionais."}</p><Link href={`/produtos/${report.listing_slug}`}>Abrir produto →</Link></div><div className="button-row"><button className="button button-secondary" onClick={() => void resolve(report.id, "investigating")}>Investigar</button><button className="button button-primary" onClick={() => void resolve(report.id, "resolved")}>Resolver</button><button className="text-button" onClick={() => void resolve(report.id, "dismissed")}>Ignorar</button></div></article>) : <div className="empty-state"><b>Sem denúncias abertas.</b></div>}</section></div>;
}
