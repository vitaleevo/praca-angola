"use client";
import { FormEvent,useState } from 'react';
import { serviceApi } from '../lib/services';
import Link from 'next/link';

export function ServiceReportForm({targetType,targetId}:{targetType:'profile'|'request'|'message';targetId:string}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const form=e.currentTarget;const d=new FormData(form);try{await serviceApi('reports','POST',{targetType,targetId,reason:d.get('reason'),details:d.get('details')});setDone(true);setOpen(false);}catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível enviar a denúncia.');}finally{setBusy(false);}}
 return <div className="service-report-form">{done?<p className="success-message" role="status">Denúncia recebida para análise da equipa. <Link href="/servicos/notificacoes">Acompanhar estado</Link></p>:<><button type="button" className="text-button" aria-expanded={open} onClick={()=>{setOpen(!open);setError('');}}>Denunciar {targetType==='profile'?'perfil':targetType==='request'?'pedido':'mensagem'}</button>{open&&<form className="stack-form panel" onSubmit={submit}><p className="legal-note">A denúncia é privada e analisada pela equipa. Descreve os factos sem incluir dados sensíveis.</p><label>Motivo<select name="reason" required><option value="fraud">Possível fraude</option><option value="abuse">Abuso ou assédio</option><option value="spam">Publicidade indesejada</option><option value="other">Outro motivo</option></select></label><label>O que aconteceu?<textarea name="details" minLength={20} maxLength={2000} rows={4} required placeholder="Explica o conteúdo e por que deve ser revisto."/></label><button className="button button-secondary" disabled={busy}>{busy?'A enviar…':'Enviar denúncia'}</button></form>}{error&&<p className="form-error" role="alert">{error}</p>}</>}</div>;
}
