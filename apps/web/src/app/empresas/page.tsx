import type { Metadata } from "next";
import { VerticalMarketplacePage, verticalMetadata } from "../../components/vertical-marketplace";
import { verticalMarketplaces } from "../../lib/marketplaces";

export const metadata: Metadata = verticalMetadata("empresas");

export default function EmpresasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <VerticalMarketplacePage config={verticalMarketplaces.empresas} searchParams={searchParams} />;
}
