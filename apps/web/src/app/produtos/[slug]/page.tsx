import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicApi, Listing, kwanza } from "../../../lib/api";
import { AddToCartButton, ContactSellerForm, FavoriteButton, ReportListingButton } from "../../../components/product-actions";
import { SiteFooter, SiteHeader } from "../../../components/site-header";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await publicApi<Listing | null>(`/catalog/listings/${encodeURIComponent(slug)}`, null);
  return product ? { title: `${product.title} — Praça Angola`, description: product.description?.slice(0, 160), openGraph: { title: product.title, description: product.description?.slice(0, 160), images: product.images?.[0]?.url ? [product.images[0].url] : [] }, alternates: { canonical: `/produtos/${product.slug}` } } : { title: "Produto não encontrado — Praça Angola" };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await publicApi<Listing | null>(`/catalog/listings/${encodeURIComponent(slug)}`, null);
  if (!product) notFound();
  const image = product.images?.[0];
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><a href="/">Início</a><span>/</span><a href="/produtos">Produtos</a><span>/</span><span>{product.title}</span></div><div className="detail-layout"><div className="detail-image">{image ? <img src={image.url} alt={image.alt || product.title}/> : <div className="product-placeholder product-placeholder-large" aria-hidden="true">{product.title.slice(0,1)}</div>}</div><div className="detail-copy"><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> {product.category}</p><h1>{product.title}</h1><p className="detail-price">{kwanza(product.price)}</p><p className="detail-location">⌖ {product.province} · {product.municipality} · {product.available_quantity} disponíveis</p>{product.price_negotiable && <p className="subtle-chip">Preço negociável</p>}<p className="detail-description">{product.description}</p><div className="seller-summary"><div><span className="seller-avatar">{product.store_name.slice(0,1)}</span></div><div><b>{product.store_name}</b><a href={`/lojas/${product.store_slug}`}>Ver loja e outros produtos →</a></div></div><div className="detail-actions"><AddToCartButton product={{ listingId: product.id, slug: product.slug, title: product.title, price: product.price, image: image?.url }}/><FavoriteButton listingId={product.id}/></div><div className="payment-note"><b>Pagamento</b><span>Transferência Multicaixa Express diretamente para a loja. A loja confirma a receção no seu extrato.</span></div><ContactSellerForm listingId={product.id}/><ReportListingButton listingId={product.id}/></div></div></div><SiteFooter/></main>;
}
