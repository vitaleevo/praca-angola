"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HeaderIcon, type HeaderIconName } from "./header-icon";

function IconLink({ href, label, icon, count }: { href: string; label: string; icon: HeaderIconName; count?: number }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const countLabel = count && count > 0 ? `, ${count} ${count === 1 ? "item" : "itens"}` : "";

  return (
    <Link className={`header-icon-link${active ? " active" : ""}`} href={href} aria-label={`${label}${countLabel}`} aria-current={active ? "page" : undefined} title={label}>
      <HeaderIcon name={icon}/>
      {count !== undefined && count > 0 && <span className="header-icon-badge" aria-hidden="true">{count > 9 ? "9+" : count}</span>}
    </Link>
  );
}

export function HeaderQuickLinks({ services = false, showCart = true }: { services?: boolean; showCart?: boolean }) {
  return <div className="header-quick-links" aria-label="Atalhos da conta">
    <IconLink href={services ? "/servicos/pedidos" : "/conta/mensagens"} label="Mensagens" icon="message"/>
    <IconLink href="/servicos/notificacoes" label="Notificações" icon="notifications"/>
    {showCart && <CartIconLink/>}
  </div>;
}

function CartIconLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => {
      try {
        setCount((JSON.parse(localStorage.getItem("praca-cart") || "[]") as { quantity: number }[])
          .reduce((sum, item) => sum + item.quantity, 0));
      } catch {
        setCount(0);
      }
    };
    update();
    window.addEventListener("praca-cart-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("praca-cart-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return <IconLink href="/carrinho" label="Carrinho" icon="cart" count={count}/>;
}
