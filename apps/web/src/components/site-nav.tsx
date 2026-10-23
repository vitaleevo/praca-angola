"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function SiteNav({services=false}:{services?:boolean}){const pathname=usePathname();const links=services?[['Explorar','/servicos'],['Profissionais','/servicos?providerType=individual'],['Empresas','/servicos?providerType=company'],['Pedidos','/servicos/pedidos']]:[['Explorar','/'],['Produtos','/produtos'],['Lojas','/lojas'],['Serviços','/servicos']];return <nav className="desktop-nav" aria-label="Navegação principal">{links.map(([label,href],i)=><Link key={href} href={href} className={(services?i===0&&pathname==='/servicos':pathname===href)?'active':''}>{label}</Link>)}</nav>;}
