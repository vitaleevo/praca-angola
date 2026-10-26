import type { Metadata } from "next";
import { VerticalDetailPage, verticalDetailMetadata } from "../../../components/vertical-listing-detail";
import { verticalMarketplaces } from "../../../lib/marketplaces";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return verticalDetailMetadata(verticalMarketplaces.automoveis, slug);
}

export default async function AutomovelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <VerticalDetailPage config={verticalMarketplaces.automoveis} slug={slug} />;
}
