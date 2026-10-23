import type { Metadata } from "next";
import "./styles.css";
import "./marketplace-ui.css";
import "./storefront.css";
import "./header-ui.css";
import "./auth-ui.css";
import "./account-access.css";
import './marketplace-v2.css';

export const metadata: Metadata = {
  title: "Praça Angola — O que procuras hoje?",
  description:
    "Descobre produtos, lojas, profissionais e serviços em Angola. Tudo o que procuras, numa só praça.",
  openGraph: {
    title: "Praça Angola — Descobre o que Angola tem para ti",
    description: "Produtos, profissionais e empresas num só lugar.",
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
