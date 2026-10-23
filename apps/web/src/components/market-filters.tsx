"use client";
import { useState } from 'react';
export function MarketFilters({children}:{children:React.ReactNode}){const [open,setOpen]=useState(false);return <aside className={`market-filters ${open?'filters-open':''}`}><h2 className="filter-desktop-title">Filtros</h2><button className="filter-disclosure" type="button" aria-expanded={open} aria-controls="market-filter-fields" onClick={()=>setOpen(!open)}>Filtros <span>{open?'−':'＋'}</span></button><div className="filter-content" id="market-filter-fields">{children}</div></aside>;}
