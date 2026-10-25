"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { kwanza } from "../lib/api";

type VehicleType = "motorcycle" | "car" | "van" | "on_foot";
type CourierStatus = "active" | "busy" | "offline" | "suspended";

type CourierProfile = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  vehicle_type: VehicleType;
  license_plate: string | null;
  status: CourierStatus;
  approved_at: string | null;
  rating: string;
  total_deliveries: number;
};

type DeliveryRun = {
  id: string;
  order_id: string;
  status: "assigned" | "picked_up" | "in_transit" | "arrived" | "delivered" | "failed";
  shipping_fee: string;
  destination_province: string;
  destination_municipality: string;
  destination_address: string;
  destination_landmark?: string | null;
  recipient_name: string;
  recipient_phone: string;
  pin_attempts: number;
  max_pin_attempts: number;
  assigned_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  order_reference: string;
  order_total: string;
  store_name: string;
  store_pickup_address?: string | null;
};

export function CourierDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [courier, setCourier] = useState<CourierProfile | null>(null);
  const [activeRuns, setActiveRuns] = useState<DeliveryRun[]>([]);
  const [completedRuns, setCompletedRuns] = useState<DeliveryRun[]>([]);
  const [selectedTab, setSelectedTab] = useState<"active" | "completed">("active");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Registration form state
  const [regFullName, setRegFullName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regVehicle, setRegVehicle] = useState<VehicleType>("motorcycle");
  const [regPlate, setRegPlate] = useState("");

  // PIN Modal state
  const [pinModalRun, setPinModalRun] = useState<DeliveryRun | null>(null);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState("");
  const digitInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const loadCourierData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/logistics/courier/me", { credentials: "include" });
      if (res.status === 401) {
        router.replace("/entrar?next=/estafeta");
        return;
      }
      const data = await res.json();
      if (data.isCourier && data.courier) {
        setCourier(data.courier);
        // Load deliveries
        const delivRes = await fetch("/api/v1/logistics/courier/deliveries", { credentials: "include" });
        if (delivRes.ok) {
          const runsData = await delivRes.json();
          setActiveRuns(runsData.active || []);
          setCompletedRuns(runsData.completed || []);
        }
      } else {
        setCourier(null);
      }
    } catch {
      setError("Não foi possível carregar os dados de estafeta.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCourierData();
    const interval = setInterval(loadCourierData, 8000);
    return () => clearInterval(interval);
  }, [loadCourierData]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/logistics/courier/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: regFullName,
          phone: regPhone,
          vehicleType: regVehicle,
          licensePlate: regPlate.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Erro ao registar perfil de estafeta.");
        return;
      }
      await loadCourierData();
    } catch {
      setError("Erro ao contactar o servidor.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!courier) return;
    const nextStatus: CourierStatus = courier.status === "active" ? "offline" : "active";
    setBusy(true);
    try {
      const res = await fetch("/api/v1/logistics/courier/status", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setCourier({ ...courier, status: nextStatus });
      } else {
        const result = await res.json().catch(() => ({}));
        setError(result.message || "Não foi possível alterar a disponibilidade.");
      }
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handlePickup(deliveryId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/logistics/deliveries/${deliveryId}/pickup`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Não foi possível confirmar a recolha na loja.");
        return;
      }
      await loadCourierData();
    } catch {
      setError("Erro ao comunicar recolha.");
    } finally {
      setBusy(false);
    }
  }

  function openPinModal(run: DeliveryRun) {
    setPinModalRun(run);
    setPinDigits(["", "", "", ""]);
    setPinError("");
    setPinSuccess("");
    setTimeout(() => {
      digitInputRefs[0].current?.focus();
    }, 100);
  }

  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "").slice(-1);
    const next = [...pinDigits];
    next[index] = clean;
    setPinDigits(next);
    if (clean && index < 3) {
      digitInputRefs[index + 1].current?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      digitInputRefs[index - 1].current?.focus();
    }
  }

  async function handleVerifyPin() {
    if (!pinModalRun) return;
    const pin = pinDigits.join("");
    if (pin.length !== 4) {
      setPinError("Insere os 4 dígitos do código fornecido pelo cliente.");
      return;
    }
    setBusy(true);
    setPinError("");
    try {
      const res = await fetch(`/api/v1/logistics/deliveries/${pinModalRun.id}/verify-pin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data.message || "Código PIN incorreto.");
        return;
      }
      setPinSuccess("Entrega confirmada com sucesso! Encomenda concluída.");
      setTimeout(() => {
        setPinModalRun(null);
        void loadCourierData();
      }, 1200);
    } catch {
      setPinError("Erro ao contactar o servidor.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="loading-state" role="status">A carregar portal de entregas…</div>;
  }

  // Not registered as courier yet -> Onboarding flow
  if (!courier) {
    return (
      <div className="courier-dashboard-wrap">
        <div className="panel" style={{ maxWidth: 620, margin: "20px auto" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 44 }}>🛵</span>
            <h2>Torna-te Estafeta Parceiro PUVO</h2>
            <p>Entrega encomendas para lojas em Angola com confirmação segura por PIN e ganha por cada corrida.</p>
          </div>

          <form className="stack-form" onSubmit={handleRegister}>
            <label>
              Nome Completo *
              <input
                required
                placeholder="Ex: Mateus Domingos"
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
              />
            </label>

            <label>
              Contacto Telefónico / WhatsApp *
              <input
                required
                placeholder="Ex: 923 111 222"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
              />
            </label>

            <div className="two-column-fields">
              <label>
                Tipo de Veículo *
                <select
                  value={regVehicle}
                  onChange={(e) => setRegVehicle(e.target.value as VehicleType)}
                >
                  <option value="motorcycle">🛵 Moto / Motorizada</option>
                  <option value="car">🚗 Carro Ligeiro</option>
                  <option value="van">🚐 Carrinha de Carga</option>
                  <option value="on_foot">🚶 A Pé / Estafeta Local</option>
                </select>
              </label>

              <label>
                Matrícula do Veículo (Opcional)
                <input
                  placeholder="Ex: LD-45-89-MK"
                  value={regPlate}
                  onChange={(e) => setRegPlate(e.target.value)}
                />
              </label>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="button button-primary button-wide" disabled={busy} type="submit">
              {busy ? "A registar…" : "Enviar pedido de registo"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalEarnings = completedRuns.reduce((acc, r) => acc + Number(r.shipping_fee || 0), 0);

  if (!courier.approved_at) {
    return <div className="courier-dashboard-wrap"><div className="panel" role="status">
      <h2>Pedido de estafeta em análise</h2>
      <p>A equipa PUVO precisa de aprovar o teu perfil antes de poderes receber entregas.</p>
    </div></div>;
  }

  return (
    <div className="courier-dashboard-wrap">
      {/* Header Banner */}
      <div className="courier-status-banner">
        <div className="courier-summary-info">
          <h2>Olá, {courier.full_name}</h2>
          <p>
            <span className="vehicle-badge">
              {courier.vehicle_type === "motorcycle" ? "🛵 Moto" : courier.vehicle_type === "car" ? "🚗 Carro" : "🚐 Carrinha"}
              {courier.license_plate ? ` (${courier.license_plate})` : ""}
            </span>
            <span>⭐ {courier.rating} estrelas</span>
            <span>📞 {courier.phone}</span>
          </p>
        </div>

        <button
          type="button"
          className={`courier-switch-button ${courier.status === "active" ? "is-active" : "is-offline"}`}
          onClick={toggleStatus}
          disabled={busy}
        >
          <span>{courier.status === "active" ? "● ONLINE" : "○ OFFLINE"}</span>
          <small>{courier.status === "active" ? "A receber corridas" : "Clique para ativar"}</small>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="courier-stats-row">
        <div className="courier-stat-card">
          <span>Corridas Ativas</span>
          <strong>{activeRuns.length}</strong>
        </div>
        <div className="courier-stat-card">
          <span>Entregas Concluídas</span>
          <strong>{courier.total_deliveries}</strong>
        </div>
        <div className="courier-stat-card">
          <span>Ganhos Estimados</span>
          <strong>{kwanza(totalEarnings)}</strong>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, margin: "10px 0" }}>
        <button
          type="button"
          className={`button ${selectedTab === "active" ? "button-primary" : "button-secondary"}`}
          onClick={() => setSelectedTab("active")}
        >
          Minhas Corridas ({activeRuns.length})
        </button>
        <button
          type="button"
          className={`button ${selectedTab === "completed" ? "button-primary" : "button-secondary"}`}
          onClick={() => setSelectedTab("completed")}
        >
          Histórico Concluído ({completedRuns.length})
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* Active Runs Tab */}
      {selectedTab === "active" && (
        <section>
          {activeRuns.length === 0 ? (
            <div className="empty-state">
              <b>Nenhuma entrega atribuída no momento.</b>
              <span>
                {courier.status === "active"
                  ? "O teu perfil está online! Assim que uma loja despachar uma encomenda, ela aparecerá aqui automaticamente."
                  : "Estás offline. Ativa o botão 'ONLINE' no topo para receberes notificações de corridas."}
              </span>
            </div>
          ) : (
            activeRuns.map((run) => (
              <article key={run.id} className="run-card">
                <div className="run-header">
                  <div>
                    <span className="eyebrow eyebrow-dark">Encomenda #{run.order_reference}</span>
                    <span className="run-reference">{run.store_name}</span>
                  </div>
                  <span className="run-fee-badge">
                    Frete: {kwanza(run.shipping_fee)}
                  </span>
                </div>

                <div className="run-points">
                  {/* Point A: Store Pickup */}
                  <div className="run-point point-pickup">
                    <div className="point-icon">A</div>
                    <div className="point-content">
                      <b>1. Ponto de Recolha (Loja)</b>
                      <span>{run.store_pickup_address || "Loja física do vendedor"}</span>
                    </div>
                  </div>

                  {/* Point B: Customer Dropoff */}
                  <div className="run-point point-dropoff">
                    <div className="point-icon">B</div>
                    <div className="point-content">
                      <b>2. Destino do Cliente</b>
                      <span>{run.destination_address}, {run.destination_municipality} ({run.destination_province})</span>
                      {run.destination_landmark && (
                        <span className="point-landmark">
                          📍 Ponto de Referência: {run.destination_landmark}
                        </span>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <b>Contacto do Cliente:</b> {run.recipient_name} ({run.recipient_phone})
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick actions: Call & WhatsApp */}
                <div className="courier-actions-row">
                  <a className="call-button" href={`tel:${run.recipient_phone}`}>
                    📞 Ligar Cliente
                  </a>
                  <a
                    className="whatsapp-button"
                    href={`https://wa.me/${run.recipient_phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    💬 WhatsApp Cliente
                  </a>
                </div>

                {/* Main Action Buttons */}
                <div className="run-actions">
                  {run.status === "assigned" && (
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busy}
                      onClick={() => handlePickup(run.id)}
                    >
                      📦 Confirmar Recolha na Loja
                    </button>
                  )}

                  {["picked_up", "in_transit", "arrived"].includes(run.status) && (
                    <button
                      className="button button-primary"
                      type="button"
                      style={{ background: "#f5b82e", color: "#17251e" }}
                      disabled={busy}
                      onClick={() => openPinModal(run)}
                    >
                      🔐 Entregar & Validar PIN do Cliente
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {/* Completed Runs Tab */}
      {selectedTab === "completed" && (
        <section>
          {completedRuns.length === 0 ? (
            <div className="empty-state">
              <b>Ainda não tens entregas concluídas.</b>
              <span>Quando validares os PINs dos clientes, o teu histórico aparecerá aqui.</span>
            </div>
          ) : (
            completedRuns.map((run) => (
              <div key={run.id} className="panel" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <b>#{run.order_reference} · {run.store_name}</b>
                  <div style={{ fontSize: 11, color: "#6e7d73" }}>
                    Entregue a {run.recipient_name} em {run.destination_municipality}
                  </div>
                  {run.delivered_at && (
                    <time style={{ fontSize: 10, color: "#929f96" }}>
                      {new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short" }).format(new Date(run.delivered_at))}
                    </time>
                  )}
                </div>
                <strong>{kwanza(run.shipping_fee)}</strong>
              </div>
            ))
          )}
        </section>
      )}

      {/* PIN Verification Modal */}
      {pinModalRun && (
        <div className="pin-verify-modal-backdrop">
          <div className="pin-verify-modal">
            <span style={{ fontSize: 36 }}>🔐</span>
            <h3>Validar PIN de Entrega</h3>
            <p>
              Pede o código de 4 dígitos ao cliente <b>{pinModalRun.recipient_name}</b> para confirmar que o pacote está em mãos.
            </p>

            <div className="pin-input-group">
              {pinDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={digitInputRefs[idx]}
                  className="pin-input-box"
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  autoComplete="off"
                />
              ))}
            </div>

            {pinError && <div className="pin-attempts-alert">{pinError}</div>}
            {pinSuccess && <div style={{ color: "#137a4b", fontWeight: 700, margin: "10px 0" }}>{pinSuccess}</div>}

            <div className="button-row" style={{ marginTop: 14 }}>
              <button
                className="button button-primary"
                type="button"
                disabled={busy}
                onClick={handleVerifyPin}
                style={{ flex: 1 }}
              >
                {busy ? "A verificar…" : "Confirmar Entrega"}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setPinModalRun(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
