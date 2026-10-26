import Image from "next/image";
import Link from "next/link";

type BrandLockupProps = {
  href?: string;
  subtitle?: string;
  className?: string;
  inverse?: boolean;
  compact?: boolean;
  label?: string;
};

export function BrandLockup({
  href = "/",
  subtitle,
  className,
  inverse = false,
  compact = false,
  label = "P.U.V.O. — Plataforma Unificada de Vendas Online, início",
}: BrandLockupProps) {
  const classes = [
    "puvo-brand",
    inverse ? "puvo-brand-inverse" : "",
    compact ? "puvo-brand-compact" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <Link className={classes} href={href} aria-label={label}>
      <Image className="puvo-brand-mark" src="/brand/puvo-mark-192.png" alt="" width={40} height={40} />
      <span className="puvo-brand-copy">
        <span className="puvo-brand-name">P.U.V.O.</span>
        {subtitle ? <span className="puvo-brand-subtitle">{subtitle}</span> : null}
      </span>
    </Link>
  );
}
