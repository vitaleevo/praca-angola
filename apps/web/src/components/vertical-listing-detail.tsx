import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { kwanza, publicApi, type Listing } from "../lib/api";
import {
  attributeRows,
  listingBadge,
  listingPath,
  priceSuffix,
  verticalMarketplaces,
  type VerticalMarketplace,
  type VerticalSlug,
} from "../lib/marketplaces";
import { ContactSellerForm, FavoriteButton, ReportListingButton } from "./product-actions";
import { SiteFooter, SiteHeader } from "./site-header";

const conditionLabels: Record<string, string> = { new: "Novo", used: "Usado", refurbished: "Recondicionado" };

function contactCopy(slug: VerticalSlug) {
  if (slug === "imoveis") return { title: "Mensagem ao anunciante", placeholder: "Olá, este imóvel ainda está disponível? Gostaria de saber mais.", buttonLabel: "Falar com o anunciante" };
  if (slug === "automoveis") return { title: "Mensagem ao anunciante", placeholder: "Olá, este automóvel ainda está disponível? Gostaria de saber mais.", buttonLabel: "Falar com o anunciante" };
  return { title: "Mensagem à empresa", placeholder: "Olá, gostaria de saber mais sobre esta empresa e os seus serviços.", buttonLabel: "Contactar empresa" };
}

function publishedLabel(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-AO", { day: "numeric", month: "long" }).format(date);
}

export async function verticalDetailMetadata(config: VerticalMarketplace, slug: string): Promise<Metadata> {
  const listing = await publicApi<Listing | null>(`/catalog/listings/${encodeURIComponent(slug)}`, null);
  if (!listing) return { title: `${config.singular[0].toUpperCase()}${config.singular.slice(1)} não encontrado` };
  return {
    title: listing.title,
    description: listing.description?.slice(0, 160),
    alternates: { canonical: listingPath(listing) },
    openGraph: {
      title: listing.title,
      description: listing.description?.slice(0, 160),
      images: listing.images?.[0]?.url ? [listing.images[0].url] : [],
      type: "website",
    },
  };
}

export async function VerticalDetailPage({ config, slug }: { config: VerticalMarketplace; slug: string }) {
  const listing = await publicApi<Listing | null>(`/catalog/listings/${encodeURIComponent(slug)}`, null);
  if (!listing) notFound();
  if (listing.marketplace && listing.marketplace !== config.slug) redirect(listingPath(listing));

  const images = listing.images ?? [];
  const rows = attributeRows(config.slug, listing.attributes);
  const contact = contactCopy(config.slug);
  const published = publishedLabel(listing.published_at);
  const suffix = priceSuffix(config.slug, listing.attributes);
  const badge = listingBadge(config.slug, listing.attributes);

  return (
    <main className={`market-shell vertical-market vertical-market-${config.slug}`}>
      <SiteHeader searchAction={`/${config.slug}`} searchPlaceholder={config.searchPlaceholder} />
      <div className="page-wrap vertical-detail-wrap">
        <div className="breadcrumbs">
          <Link href="/">Início</Link><span>/</span>
          <Link href={`/${config.slug}`}>{config.name}</Link><span>/</span>
          {listing.category_slug
            ? <Link href={`/${config.slug}?category=${listing.category_slug}`}>{listing.category}</Link>
            : <span>{listing.category}</span>}
          <span>/</span><span>{listing.title}</span>
        </div>

        <div className="vertical-detail-layout">
          <div className="vertical-detail-gallery">
            <div className="vertical-detail-main-image">
              {images[0] ? (
                <Image src={images[0].url} alt={images[0].alt || listing.title} fill sizes="(max-width: 900px) 92vw, 720px" priority unoptimized={!images[0].url.startsWith("/api/v1/media/")} />
              ) : (
                <span className="product-placeholder product-placeholder-large" aria-hidden="true">{listing.title.slice(0, 1).toUpperCase()}</span>
              )}
              <span className="vertical-detail-badge">{badge}</span>
            </div>
            {images.length > 1 && (
              <div className="vertical-detail-thumbs">
                {images.slice(1, 5).map((image, index) => (
                  <div key={`${image.url}-${index}`}>
                    <Image src={image.url} alt={image.alt || `${listing.title} — imagem ${index + 2}`} fill sizes="120px" unoptimized={!image.url.startsWith("/api/v1/media/")} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="vertical-detail-summary">
            <p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> {listing.category}</p>
            <h1>{listing.title}</h1>
            <p className="vertical-detail-price">{kwanza(listing.price)}{suffix && <small>{suffix}</small>}</p>
            <p className="detail-location">⌖ {listing.province} · {listing.municipality}{published ? ` · Publicado em ${published}` : ""}</p>
            <div className="vertical-detail-chips">
              <span>{config.name}</span>
              {listing.price_negotiable && <span>Preço negociável</span>}
              {config.slug === "automoveis" && <span>{conditionLabels[listing.condition] ?? listing.condition}</span>}
            </div>

            {rows.length > 0 && (
              <dl className="vertical-attribute-grid">
                {rows.map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>
                      {row.key === "website"
                        ? <a href={row.value} target="_blank" rel="noopener noreferrer">{row.value.replace(/^https?:\/\//, "")} ↗</a>
                        : row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="seller-summary vertical-seller-summary">
              <div><span className="seller-avatar">{listing.store_name.slice(0, 1)}</span></div>
              <div>
                <b>{listing.store_name}{listing.is_verified && <span className="verified-badge">✓ Verificada</span>}</b>
                <Link href={`/lojas/${listing.store_slug}`}>Ver loja e outros anúncios →</Link>
              </div>
            </div>

            <div className="detail-actions">
              <FavoriteButton listingId={listing.id} />
              <a className="button button-primary" href="#contactar">Falar com o anunciante</a>
            </div>

            <div className="vertical-safety-note vertical-safety-note-inline">
              <span className="vertical-safety-icon" aria-hidden="true">✓</span>
              <div><b>Antes de fechar negócio</b><p>{config.safetyNote}</p></div>
            </div>
          </div>
        </div>

        <div className="vertical-detail-lower">
          <section className="vertical-detail-description">
            <p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Sobre este anúncio</p>
            <h2>Descrição</h2>
            <p>{listing.description}</p>
          </section>

          <aside className="vertical-detail-contact" id="contactar">
            <p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> Contacto direto</p>
            <h2>Fala com {listing.store_name}</h2>
            <p>Envia uma mensagem pela PUVO. Combina os detalhes, a visita ou a entrega diretamente com o anunciante.</p>
            <ContactSellerForm listingId={listing.id} title={contact.title} placeholder={contact.placeholder} buttonLabel={contact.buttonLabel} />
            <ReportListingButton listingId={listing.id} />
          </aside>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

export { verticalMarketplaces };
