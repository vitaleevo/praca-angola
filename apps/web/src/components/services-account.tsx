"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
export function ServicesAccount({children}:{children:React.ReactNode}){
 const [ready,setReady]=useState(false),[error,setError]=useState('');const router=useRouter();
 useEffect(()=>{let active=true;fetch('/api/v1/auth/me',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('SESSION_UNAVAILABLE');return r.json();}).then(d=>{if(!active)return;if(!d.user)router.replace('/entrar?next='+encodeURIComponent(window.location.pathname+window.location.search));else setReady(true);}).catch(()=>{if(active)setError('Não foi possível verificar a sessão. Atualiza a página para tentar novamente.');});return()=>{active=false;};},[router]);
 return <>{error?<p className="form-error" role="alert">{error}</p>:!ready?<p className="loading-state" role="status">A verificar a conta…</p>:<><nav className="service-account-nav" aria-label="Área de serviços"><Link href="/servicos">Explorar profissionais</Link><Link href="/servicos/pedidos">Os meus pedidos e trabalhos</Link><Link href="/servicos/notificacoes">Notificações</Link><Link href="/profissional">Perfil profissional</Link><Link href="/servicos/pedidos/novo">Publicar pedido</Link></nav>{children}</>}</>;
}
