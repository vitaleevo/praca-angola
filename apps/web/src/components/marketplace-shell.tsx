import Image from 'next/image';
import { CategoryCarousel } from './category-carousel';
import { MarketIcon } from './market-icons';
export function MarketplaceHero({services=false,q='',province='',categories}:{services?:boolean;q?:string;province?:string;categories:{slug:string;name:string}[]}){
 const path=services?'/servicos':'/produtos';
 return <section className={`market-hero ${services?'services-hero':'products-hero'}`}><Image className="market-hero-photo" src={services?'/images/services-hero.png':'/images/products-hero.png'} alt="" fill sizes="100vw" priority/><div className="market-hero-inner"><p className="market-kicker">{services?'PUVO SERVIÇOS':'PUVO PRODUTOS'} · ANGOLA</p><h1>{services?<>Encontra profissionais e<br/>empresas <em>de confiança</em></>:'Produtos em Angola'}</h1><p>{services?'Talento para a tua casa, negócio e dia a dia.':'Compra e vende produtos novos e usados em toda Angola.'}</p>
 <form action={path} className="market-search" role="search"><label><MarketIcon name="search"/><span className="sr-only">{services?'Que serviço procuras?':'Pesquisar produtos'}</span><input name="q" maxLength={140} defaultValue={q} placeholder={services?'Que serviço procuras? Ex.: design, obras, consultoria…':'O que estás à procura? Ex.: telemóvel, sofá, computador…'}/></label><label><MarketIcon name="pin"/><span className="sr-only">Localização</span><select name="province" defaultValue={province}><option value="">Toda Angola</option>{['Luanda','Benguela','Huambo','Huíla','Cabinda','Namibe'].map(p=><option key={p}>{p}</option>)}</select></label><button type="submit">Pesquisar <span aria-hidden="true">→</span></button></form>
 <CategoryCarousel categories={categories} path={path} services={services}/></div></section>;
}

