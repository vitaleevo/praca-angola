import { Listing, kwanza } from "../lib/api";
import { listingPath, priceSuffix } from "../lib/marketplaces";
import Link from 'next/link';
import Image from 'next/image';

export function ProductCard({ product }: { product: Listing }) {
  const image = product.images?.[0];
  const href = listingPath(product);
  const isProduct = !product.marketplace || product.marketplace === "produtos";
  const suffix = product.marketplace === "imoveis" ? priceSuffix("imoveis", product.attributes) : "";
  return <article className="product-card">
    <Link className="product-visual" href={href}>
      {image ? <Image src={image.url} alt={image.alt || product.title} fill sizes="(max-width:767px) 48vw, 300px" unoptimized={!image.url.startsWith('/api/v1/media/')} /> : <><span className="product-placeholder" aria-hidden="true">{product.title.slice(0, 1).toUpperCase()}</span><span className="sr-only">{product.title}</span></>}
      <span className={`product-badge ${isProduct ? `condition-${product.condition}` : 'product-badge-market'}`}>{isProduct ? (product.condition === "new" ? "Novo" : product.condition === "used" ? "Usado" : "Recondicionado") : product.marketplace_name ?? "Anúncio"}</span>
    </Link>
    <div className="product-info"><span className="product-category">{product.category}</span><Link className="product-name" href={href}>{product.title}</Link><strong className="product-price">{kwanza(product.price)}{suffix && <small>{suffix}</small>}</strong><span className="product-location">⌖ {product.province} · {product.municipality}</span><Link className="product-store-link" href={`/lojas/${product.store_slug}`}>{product.store_name}</Link></div>
  </article>;
}
