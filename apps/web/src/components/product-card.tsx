import { Listing, kwanza } from "../lib/api";
import Link from 'next/link';
import Image from 'next/image';

export function ProductCard({ product }: { product: Listing }) {
  const image = product.images?.[0];
  return <article className="product-card">
    <Link className="product-visual" href={`/produtos/${product.slug}`} aria-label={`Ver ${product.title}`}>
      {image ? <Image src={image.url} alt={image.alt || product.title} fill sizes="(max-width:767px) 48vw, 300px" unoptimized={!image.url.startsWith('/api/v1/media/')} /> : <span className="product-placeholder" aria-hidden="true">{product.title.slice(0, 1).toUpperCase()}</span>}
      <span className={`product-badge condition-${product.condition}`}>{product.condition === "new" ? "Novo" : product.condition === "used" ? "Usado" : "Recondicionado"}</span>
    </Link>
    <div className="product-info"><span className="product-category">{product.category}</span><Link className="product-name" href={`/produtos/${product.slug}`}>{product.title}</Link><strong className="product-price">{kwanza(product.price)}</strong><span className="product-location">⌖ {product.province} · {product.municipality}</span><Link className="product-store-link" href={`/lojas/${product.store_slug}`}>{product.store_name}</Link></div>
  </article>;
}
