import type { Metadata } from "next";
import "./styles.css";
import "./marketplace-ui.css";
import "./storefront.css";
import "./header-ui.css";
import "./auth-ui.css";
import "./account-access.css";
import './marketplace-v2.css';

export const metadata: Metadata = {
  title: "PUVO — Plataforma Única de Vendas Online",
  description:
    "Descobre produtos, lojas, profissionais e serviços em Angola na PUVO, a Plataforma Única de Vendas Online.",
  openGraph: {
    title: "PUVO — Plataforma Única de Vendas Online",
    description: "Produtos, profissionais e empresas num só lugar em Angola.",
    locale: "pt_AO",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-AO" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
