'use client';
import Link from 'next/link';
import { useCallback,useEffect,useRef,useState } from 'react';
import { MarketIcon,categoryIcons } from './market-icons';

export function CategoryCarousel({categories,path,services,ariaLabel,allLabel='Ver todas'}:{categories:{slug:string;name:string}[];path:string;services:boolean;ariaLabel?:string;allLabel?:string}){
 const rail=useRef<HTMLElement>(null),[edges,setEdges]=useState({start:true,end:false});
 const update=useCallback(()=>{const el=rail.current;if(!el)return;setEdges({start:el.scrollLeft<=2,end:el.scrollLeft+el.clientWidth>=el.scrollWidth-2});},[]);
 useEffect(()=>{const el=rail.current;if(!el)return;const observer=new ResizeObserver(update);observer.observe(el);for(const child of el.children)observer.observe(child);update();return()=>observer.disconnect();},[categories,update]);
 const scroll=(direction:-1|1)=>rail.current?.scrollBy({left:direction*Math.max(220,Math.round((rail.current.clientWidth)*.75)),behavior:'smooth'});
 return <div className="category-carousel"><button type="button" className="category-arrow category-arrow-prev" aria-label="Categorias anteriores" disabled={edges.start} onClick={()=>scroll(-1)}>‹</button><nav ref={rail} onScroll={update} className="category-rail" aria-label={ariaLabel ?? (services?'Categorias de serviços':'Categorias de produtos')}>{categories.map(c=><Link href={`${path}?category=${c.slug}`} key={c.slug}><span><MarketIcon name={categoryIcons[c.slug]}/></span>{c.name}</Link>)}<Link href={path}><span>•••</span>{allLabel}</Link></nav><button type="button" className="category-arrow category-arrow-next" aria-label="Categorias seguintes" disabled={edges.end} onClick={()=>scroll(1)}>›</button></div>;
}

