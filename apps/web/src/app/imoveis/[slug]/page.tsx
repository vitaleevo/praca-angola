import type { Metadata } from "next";
import { VerticalDetailPage, verticalDetailMetadata } from "../../../components/vertical-listing-detail";
import { verticalMarketplaces } from "../../../lib/marketplaces";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return verticalDetailMetadata(verticalMarketplaces.imoveis, slug);
}

export default async function ImovelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <VerticalDetailPage config={verticalMarketplaces.imoveis} slug={slug} />;
}
