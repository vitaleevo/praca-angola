"use client";

import { FormEvent, useEffect, useState } from "react";

type StoreMember = {
  user_id: string;
  display_name: string;
  email: string;
  role: "owner" | "editor" | "support";
};

export function StoreTeamManager() {
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [inviteLink,setInviteLink]=useState('');
  const [inviteVersion,setInviteVersion]=useState(0);

  async function refresh() {
    const response = await fetch("/api/v1/seller/team", { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { items?: StoreMember[]; message?: string };
    if (!response.ok) throw new Error(data.message ?? "Não foi possível carregar a equipa.");
    setMembers(data.items ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/v1/seller/team", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { items?: StoreMember[]; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Não foi possível carregar a equipa.");
        if (active) setMembers(data.items ?? []);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a equipa."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setStatus("");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await fetch("/api/v1/seller/invitations", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.get("email"), role: values.get("role") }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string | string[]; invitationUrl?:string; delivery?:string };
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Não foi possível adicionar o membro.");
      form.reset();
      await refresh();
      setInviteLink(data.invitationUrl?new URL(data.invitationUrl,window.location.origin).toString():'');
      setInviteVersion(v=>v+1);
      setStatus(data.delivery==='failed'?'Convite criado. Falhou o e-mail; partilha a ligação com o destinatário.':'Convite enviado. O acesso será concedido após aceitação.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar o membro.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(event: FormEvent<HTMLFormElement>, memberId: string) {
    event.preventDefault();
    setBusy(true); setError(""); setStatus("");
    const role = new FormData(event.currentTarget).get("role");
    try {
      const response = await fetch(`/api/v1/seller/team/${memberId}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Não foi possível alterar as permissões.");
      await refresh();
      setStatus("As permissões foram atualizadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar as permissões.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: StoreMember) {
    if (!window.confirm(`Remover ${member.display_name} da equipa da loja?`)) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/v1/seller/team/${member.user_id}`, { method: "DELETE", credentials: "include" });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Não foi possível remover o membro.");
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      setStatus("O acesso à loja foi removido.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover o membro.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel store-team-panel">
    <div className="section-heading"><div><h2>Equipa e convites</h2><p>Envia um convite por e-mail. A pessoa precisa de o aceitar com a conta confirmada.</p></div><span className="subtle-chip">{members.length} {members.length === 1 ? "membro" : "membros"}</span></div>
    <form className="store-team-add" onSubmit={addMember}>
      <label>E-mail da conta<input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="pessoa@exemplo.ao"/></label>
      <label>Permissão<select name="role" defaultValue="editor"><option value="editor">Editor — anúncios e encomendas</option><option value="support">Suporte — conversas e consulta</option></select></label>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "A enviar…" : "Enviar convite"}</button>
    </form>
    <p className="store-team-help">O proprietário controla contactos, recebimentos e a equipa. Editores podem gerir anúncios e encomendas; suporte pode responder a conversas e consultar encomendas.</p>
    {loading ? <p className="loading-state" role="status">A carregar a equipa…</p> : members.length ? <div className="store-team-list">{members.map((member) => <article className="store-team-member" key={member.user_id}>
      <div className="store-team-person"><span className="store-team-avatar" aria-hidden="true">{member.display_name.slice(0, 1).toUpperCase()}</span><span><b>{member.display_name}{member.role === "owner" && <span className="verified-badge">Proprietário</span>}</b><small>{member.email}</small></span></div>
      {member.role === "owner" ? <span className="store-team-role">Acesso total</span> : <div className="store-team-actions"><form onSubmit={(event) => void updateRole(event, member.user_id)}><label className="sr-only" htmlFor={`role-${member.user_id}`}>Permissão de {member.display_name}</label><select id={`role-${member.user_id}`} name="role" defaultValue={member.role} disabled={busy}><option value="editor">Editor</option><option value="support">Suporte</option></select><button className="button button-secondary" type="submit" disabled={busy}>Guardar</button></form><button className="text-button store-team-remove" type="button" disabled={busy} onClick={() => void removeMember(member)}>Remover</button></div>}
    </article>)}</div> : <div className="empty-state"><b>A equipa ainda não tem membros adicionais.</b><span>Adiciona uma conta para partilhar o trabalho da loja.</span></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{status && <p className="success-message" role="status">{status}</p>}
    {inviteLink&&<label className="stack-form">Ligação do convite<input readOnly value={inviteLink} onFocus={e=>e.target.select()}/></label>}
    <PendingStoreInvites version={inviteVersion}/>
  </section>;
}

type PendingInvite={id:string;email:string;role:string;expires_at:string;accepted_at:string|null;revoked_at:string|null};
function PendingStoreInvites({version}:{version:number}){
 const [items,setItems]=useState<PendingInvite[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/v1/seller/invitations',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Não foi possível carregar convites.');return r.json();}).then((d:{items:PendingInvite[]})=>{if(active)setItems(d.items);}).catch((e:Error)=>{if(active)setError(e.message);});return()=>{active=false;};},[version]);
 async function revoke(id:string){setError('');try{const r=await fetch(`/api/v1/seller/invitations/${id}`,{method:'DELETE'});if(!r.ok)throw new Error('Não foi possível revogar o convite.');setItems(list=>list.map(i=>i.id===id?{...i,revoked_at:new Date().toISOString()}:i));}catch(e){setError(e instanceof Error?e.message:'Sem ligação.');}}
 return <div><h3>Convites recentes</h3>{items.length?items.map(i=><article className="store-team-member" key={i.id}><div><b>{i.email}</b><p className="legal-note">{i.role} · {i.accepted_at?'Aceite':i.revoked_at?'Revogado':'Pendente · termina em '+new Intl.DateTimeFormat('pt-AO').format(new Date(i.expires_at))}</p></div>{!i.accepted_at&&!i.revoked_at&&<button className="button button-secondary" type="button" onClick={()=>void revoke(i.id)}>Revogar</button>}</article>):<p className="legal-note">Sem convites por enquanto.</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
