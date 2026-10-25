import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import "./styles.css";
import "./marketplace-ui.css";
import "./marketplace-v2.css";
import "./workspace.css";
import "./auth-ui.css";
import "./admin-console.css";
import "./moderation-console.css";
import "./owner-console.css";

export const metadata: Metadata = {
  title: "Gestão da PUVO",
  description: "Área de operação da Plataforma Única de Vendas Online.",
  robots: { index: false, follow: false },
};

export default async function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV === "production") {
    const requestHeaders = await headers();
    const hostname = requestHeaders.get("host")?.split(":")[0].toLowerCase();
    if (hostname !== "gestao.puvo.vitaleevo.ao") notFound();
  }

  return <html lang="pt-AO"><body>{children}</body></html>;
}
