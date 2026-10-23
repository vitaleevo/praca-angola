"use client";
import { useEffect, useState } from 'react';
type Choice={id:string;display_name:string;role:string;status:string};
export function StoreSwitcher({onSelected}:{onSelected:()=>Promise<void>}) {
  const [stores,setStores]=useState<Choice[]>([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;fetch('/api/v1/seller/stores',{cache:'no-store'}).then(r=>r.json()).then((data:{items?:Choice[];activeStoreId?:string})=>{if(active){setStores(data.items??[]);setSelected(data.activeStoreId??'');}}).catch(()=>{if(active)setError('Não foi possível carregar as lojas.');});return()=>{active=false;};},[]);
  async function select(id:string){setBusy(true);setError('');try{const r=await fetch('/api/v1/seller/active-store',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId:id})});if(!r.ok)throw new Error('Não foi possível selecionar esta loja.');setSelected(id);await onSelected();}catch(cause){setError(cause instanceof Error?cause.message:'Sem ligação.');}finally{setBusy(false);}}
  return <section className="store-context-bar"><label>Loja em gestão<select aria-label="Loja em gestão" value={selected} disabled={busy || !stores.length} onChange={e=>void select(e.target.value)}><option value="" disabled>Seleciona uma loja</option>{stores.map(s=><option key={s.id} value={s.id}>{s.display_name} · {s.role==='owner'?'Proprietário':s.role==='editor'?'Editor':'Suporte'}{s.status!=='active'?' · Suspensa':''}</option>)}</select></label>{busy&&<span role="status">A mudar de loja…</span>}{error&&<p role="alert" className="form-error">{error}</p>}</section>;
}
