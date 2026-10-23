import { notFound } from "next/navigation";
import { publicApi, Listing } from "../../../lib/api";
import { ProductCard } from "../../../components/product-card";
import { SiteFooter, SiteHeader } from "../../../components/site-header";

type Category = { name: string; slug: string; description: string | null };

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const categories = await publicApi<Category[]>("/catalog/categories", []);
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  const results = await publicApi<{ items: Listing[] }>(`/catalog/listings?category=${encodeURIComponent(slug)}&limit=48`, { items: [] });
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><a href="/">Início</a><span>/</span><a href="/produtos">Produtos</a><span>/</span><span>{category.name}</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Categoria</p><h1>{category.name}</h1><p>{category.description || `Explora anúncios de ${category.name.toLowerCase()} em Angola.`}</p></div><a className="button button-secondary" href="/produtos">Todas as categorias</a></div>{results.items.length ? <div className="product-grid">{results.items.map((product) => <ProductCard product={product} key={product.id}/>)}</div> : <div className="empty-state empty-state-large"><b>Ainda não há produtos nesta categoria.</b><span>Explora outras categorias ou volta mais tarde.</span><a className="button button-secondary" href="/produtos">Ver todos os produtos</a></div>}</div><SiteFooter/></main>;
}
