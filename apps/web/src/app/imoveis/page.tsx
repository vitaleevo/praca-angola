import type { Metadata } from "next";
import { VerticalMarketplacePage, verticalMetadata } from "../../components/vertical-marketplace";
import { verticalMarketplaces } from "../../lib/marketplaces";

export const metadata: Metadata = verticalMetadata("imoveis");

export default function ImoveisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <VerticalMarketplacePage config={verticalMarketplaces.imoveis} searchParams={searchParams} />;
}
