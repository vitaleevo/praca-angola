import Image from "next/image";
import Link from "next/link";
import type { Listing } from "../lib/api";
import { kwanza } from "../lib/api";
import {
  listingBadge,
  listingPath,
  listingSummary,
  priceSuffix,
  type VerticalSlug,
} from "../lib/marketplaces";

export function VerticalListingCard({ listing, marketplace }: { listing: Listing; marketplace: VerticalSlug }) {
  const image = listing.images?.[0];
  const href = listingPath(listing);
  const summary = listingSummary(marketplace, listing.attributes);
  return (
    <article className={`vertical-listing-card vertical-listing-card-${marketplace}`}>
      <Link className="vertical-listing-visual" href={href} aria-label={`Ver ${listing.title}`}>
        {image ? (
          <Image
            src={image.url}
            alt={image.alt || listing.title}
            fill
            sizes="(max-width: 767px) 92vw, (max-width: 1180px) 44vw, 300px"
            unoptimized={!image.url.startsWith("/api/v1/media/")}
          />
        ) : (
          <span className="vertical-listing-placeholder" aria-hidden="true">{listing.title.slice(0, 1).toUpperCase()}</span>
        )}
        <span className="vertical-listing-badge">{listingBadge(marketplace, listing.attributes)}</span>
      </Link>
      <div className="vertical-listing-body">
        <span className="vertical-listing-category">{listing.category}</span>
        <Link className="vertical-listing-title" href={href}>{listing.title}</Link>
        <strong className="vertical-listing-price">
          {kwanza(listing.price)}
          {priceSuffix(marketplace, listing.attributes) && <small>{priceSuffix(marketplace, listing.attributes)}</small>}
        </strong>
        <span className="vertical-listing-location">⌖ {listing.province} · {listing.municipality}</span>
        {summary.length > 0 && <p className="vertical-listing-summary">{summary.join(" · ")}</p>}
        <Link className="vertical-listing-store" href={`/lojas/${listing.store_slug}`}>{listing.store_name} ↗</Link>
      </div>
    </article>
  );
}
