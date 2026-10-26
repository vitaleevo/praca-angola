"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavigationLink = { label: string; href: string; active: boolean };

export function SiteNav({ services = false }: { services?: boolean }) {
  const pathname = usePathname();
  const links: NavigationLink[] = services
    ? [
        { label: "Explorar", href: "/servicos", active: pathname === "/servicos" },
        { label: "Profissionais", href: "/servicos?providerType=individual", active: false },
        { label: "Empresas", href: "/servicos?providerType=company", active: false },
        { label: "Pedidos", href: "/servicos/pedidos", active: pathname.startsWith("/servicos/pedidos") },
      ]
    : [
        { label: "Explorar", href: "/", active: pathname === "/" },
        { label: "Produtos", href: "/produtos", active: pathname === "/produtos" || pathname.startsWith("/produtos/") },
        { label: "Empresas", href: "/empresas", active: pathname === "/empresas" || pathname.startsWith("/empresas/") },
        { label: "Imóveis", href: "/imoveis", active: pathname === "/imoveis" || pathname.startsWith("/imoveis/") },
        { label: "Automóveis", href: "/automoveis", active: pathname === "/automoveis" || pathname.startsWith("/automoveis/") },
        { label: "Lojas", href: "/lojas", active: pathname === "/lojas" || pathname.startsWith("/lojas/") },
        { label: "Serviços", href: "/servicos", active: pathname === "/servicos" || pathname.startsWith("/servicos/") },
      ];

  return (
    <nav className="desktop-nav" aria-label="Navegação principal">
      {links.map(({ label, href, active }) => (
        <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
