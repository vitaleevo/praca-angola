"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../app/crm.css";

interface Contact {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  origin_channel: string;
  province: string;
  municipality: string;
  tags: string[];
  notes: string | null;
  deals_count: number;
  total_value_aoa: number;
  created_at: string;
}

export function CrmContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function loadContacts(query?: string) {
    try {
      const url = query ? `/api/v1/crm/contacts?search=${encodeURIComponent(query)}` : "/api/v1/crm/contacts";
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setContacts(json.contacts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContacts();
  }, []);

  return (
    <div className="crm-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Base de Leads e Contactos</h2>
          <p style={{ margin: "2px 0 0 0", fontSize: "0.875rem", color: "#64748b" }}>
            Todos os clientes e oportunidades originadas pelas tuas campanhas e canais.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link href="/vendedor/crm" className="button button-secondary">
            Ver Funil Kanban
          </Link>
          <Link href="/vendedor/crm/conversas" className="button button-primary">
            💬 Live Inbox
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", margin: "12px 0" }}>
        <input
          type="text"
          placeholder="Pesquisar por nome, telefone ou e-mail..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            void loadContacts(e.target.value);
          }}
          style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
        />
      </div>

      {loading ? (
        <div className="loading-state">A carregar contactos…</div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "12px 16px" }}>Nome do Cliente</th>
                <th style={{ padding: "12px 16px" }}>Canal</th>
                <th style={{ padding: "12px 16px" }}>Telefone / E-mail</th>
                <th style={{ padding: "12px 16px" }}>Localização</th>
                <th style={{ padding: "12px 16px" }}>Negócios</th>
                <th style={{ padding: "12px 16px" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 700, color: "#0f172a" }}>
                    {contact.full_name}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span
                      className={`crm-channel-pill ${
                        contact.origin_channel === "whatsapp"
                          ? "channel-whatsapp"
                          : contact.origin_channel === "instagram"
                          ? "channel-instagram"
                          : contact.origin_channel === "facebook_lead"
                          ? "channel-facebook"
                          : "channel-storefront"
                      }`}
                    >
                      {contact.origin_channel}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#475569" }}>
                    {contact.phone || contact.email || "—"}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#64748b" }}>
                    {contact.province} · {contact.municipality}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontWeight: 700, color: "#047857" }}>
                      {contact.deals_count} ({contact.total_value_aoa.toLocaleString("pt-AO")} Kz)
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <Link
                      href="/vendedor/crm/conversas"
                      className="text-button"
                      style={{ color: "#2563eb", fontWeight: 700 }}
                    >
                      Conversar
                    </Link>
                  </td>
                </tr>
              ))}

              {contacts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "#94a3b8" }}>
                    Nenhum contacto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
