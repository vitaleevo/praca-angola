import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
  metadataBase: new URL("https://gestao.puvo.vitaleevo.ao"),
  applicationName: "P.U.V.O.",
  title: "P.U.V.O. — Gestão da plataforma",
  description: "Área de operação da P.U.V.O. — Plataforma Unificada de Vendas Online.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#012480",
  colorScheme: "light",
};

export default async function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV === "production") {
    const requestHeaders = await headers();
    const hostname = requestHeaders.get("host")?.split(":")[0].toLowerCase();
    if (hostname !== "gestao.puvo.vitaleevo.ao") notFound();
  }

  return (
    <html lang="pt-AO" className={`${inter.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
  );
}
