import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./styles.css";
import "./marketplace-ui.css";
import "./storefront.css";
import "./header-ui.css";
import "./auth-ui.css";
import "./account-access.css";
import './marketplace-v2.css';
import './workspace.css';
import './logistics-ui.css';
import './header-navigation.css';
import './marketplace-focus.css';

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

const poppins = localFont({
  src: [
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/poppins-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://puvo.vitaleevo.ao"),
  applicationName: "P.U.V.O.",
  title: {
    default: "P.U.V.O. — Plataforma Unificada de Vendas Online",
    template: "%s — P.U.V.O.",
  },
  description:
    "Todos os canais. Uma só operação. Descobre produtos, lojas, profissionais e serviços em Angola na P.U.V.O., a Plataforma Unificada de Vendas Online.",
  openGraph: {
    title: "P.U.V.O. — Todos os canais. Uma só operação.",
    description:
      "Produtos, lojas, profissionais e serviços de Angola num só lugar. Uma plataforma para comprar, vender e crescer.",
    url: "/",
    siteName: "P.U.V.O.",
    locale: "pt_AO",
    type: "website",
    images: [
      {
        url: "/brand/puvo-og.png",
        width: 1200,
        height: 630,
        alt: "P.U.V.O. — Plataforma Unificada de Vendas Online",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "P.U.V.O. — Todos os canais. Uma só operação.",
    description:
      "Produtos, lojas, profissionais e serviços de Angola num só lugar.",
    images: ["/brand/puvo-og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#012480",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-AO" data-scroll-behavior="smooth" className={`${inter.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
  );
}
