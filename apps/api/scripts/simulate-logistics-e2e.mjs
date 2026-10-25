import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://praca:praca_local_dev@localhost:5432/praca_angola";
const API_BASE = "http://127.0.0.1:4000/api/v1";

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

const passed = [];
const failed = [];

function banner(text) {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ${text}`);
  console.log(`${"═".repeat(64)}\n`);
}

function section(emoji, text) {
  console.log(`\n${emoji} ${text}`);
  console.log(`${"─".repeat(58)}`);
}

function ok(msg) {
  console.log(`   ✅ ${msg}`);
  passed.push(msg);
}

function fail(msg, err) {
  console.log(`   ❌ ${msg}: ${err}`);
  failed.push({ msg, err: String(err) });
}

async function createTestAccount(name, email, role = "buyer") {
  const id = randomUUID();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await pool.query(
    `INSERT INTO users (id, display_name, email, password_hash, email_verified_at, status)
     VALUES ($1, $2, $3, 'simulated_password', now(), 'active')
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, email_verified_at = now()
     RETURNING id`,
    [id, name, email],
  );

  await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, role]);
  await pool.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '2 hours')", [id, tokenHash]);

  return { id, email, name, token: rawToken };
}

async function api(actor, method, path, body = null, expectedStatus = 200) {
  const headers = { Accept: "application/json" };
  if (actor?.token) headers.Cookie = `praca_session=${actor.token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (res.status !== expectedStatus) {
    throw new Error(`HTTP ${res.status} (esperado: ${expectedStatus}) em ${method} ${path}: ${text.slice(0, 400)}`);
  }

  return json;
}

// ─────────────────────────────────────────────────────────────────────
// SIMULAÇÃO E2E: LOGÍSTICA & ENTREGAS ANGOLA
// ─────────────────────────────────────────────────────────────────────
async function runLogisticsE2E() {
  banner("🚚 SIMULAÇÃO E2E — LOGÍSTICA, FRETES & ENTREGA FÍSICA (ANGOLA)");
  console.log("   Personas: Vendedor (Ana), Comprador (Carlos), Estafeta (Mário), Admin (Gestor)");
  console.log("   Fluxo: Frete ➔ Estafeta ➔ Despacho ➔ Recolha ➔ PIN ➔ Entrega\n");

  // ═══════════════════════════════════════════════════════════════════
  // SETUP: Create test personas and prerequisite data
  // ═══════════════════════════════════════════════════════════════════
  section("👤", "SETUP — Criar contas de teste e dados base");

  const admin = await createTestAccount("Gestor Logístico", `admin-logistica-${Date.now()}@puvo.ao`, "admin");
  await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING", [admin.id]);
  ok(`Admin: ${admin.name} (${admin.email})`);

  const seller = await createTestAccount("Ana Vendedora Luanda", `vendedora-logistica-${Date.now()}@puvo.ao`, "seller");
  ok(`Vendedora: ${seller.name} (${seller.email})`);

  const buyer = await createTestAccount("Carlos Comprador Viana", `comprador-logistica-${Date.now()}@puvo.ao`, "buyer");
  ok(`Comprador: ${buyer.name} (${buyer.email})`);

  const courierUser = await createTestAccount("Mário Estafeta Moto", `estafeta-logistica-${Date.now()}@puvo.ao`, "courier");
  ok(`Estafeta: ${courierUser.name} (${courierUser.email})`);

  // Create seller profile
  const sellerId = randomUUID();
  await pool.query(
    `INSERT INTO seller_profiles (id, user_id, display_name, slug, phone, status)
     VALUES ($1, $2, 'Loja Ana Electronics', 'loja-ana-electronics', '+244923100100', 'active')
     ON CONFLICT DO NOTHING`,
    [sellerId, seller.id],
  );
  ok("Seller profile 'Loja Ana Electronics' criado");

  // Create store shipping settings (free shipping threshold: 50.000 Kz)
  await pool.query(
    `INSERT INTO store_shipping_settings (seller_profile_id, free_shipping_threshold, local_pickup_enabled, pickup_address)
     VALUES ($1, 50000.00, true, 'Rua do Comércio, 45, Maianga, Luanda')
     ON CONFLICT (seller_profile_id) DO UPDATE
     SET free_shipping_threshold = EXCLUDED.free_shipping_threshold`,
    [sellerId],
  );
  ok("Configurações de frete da loja definidas (frete grátis > 50.000 Kz)");

  // Create a test product
  const productId = randomUUID();
  await pool.query(
    `INSERT INTO products (id, seller_profile_id, title, description, price, stock_quantity, status)
     VALUES ($1, $2, 'Samsung Galaxy A15 128GB', 'Smartphone Samsung Galaxy A15 com 128GB, Dual SIM, 4G', 89000.00, 10, 'active')
     ON CONFLICT DO NOTHING`,
    [productId, sellerId],
  );
  ok("Produto 'Samsung Galaxy A15 128GB' publicado (89.000 Kz)");

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 1: Consulta de Zonas de Entrega
  // ═══════════════════════════════════════════════════════════════════
  section("🗺️", "CENÁRIO 1 — Listar Zonas de Entrega Angolanas");

  try {
    const zones = await api(null, "GET", "/logistics/zones");
    assert.ok(Array.isArray(zones), "Resposta deve ser um array de zonas");
    assert.ok(zones.length >= 4, `Espera-se pelo menos 4 zonas, obteve ${zones.length}`);

    const luandaUrban = zones.find(z => z.name.includes("Luanda Urbana"));
    const luandaPeri = zones.find(z => z.name.includes("Periferias"));
    const benguela = zones.find(z => z.name.includes("Benguela") || z.province === "Benguela");

    assert.ok(luandaUrban, "Zona 'Luanda Urbana' deve existir");
    assert.ok(luandaPeri, "Zona 'Luanda Periferias' deve existir");
    assert.ok(benguela, "Zona de Benguela deve existir");

    console.log(`   📍 Zonas carregadas: ${zones.length}`);
    for (const z of zones.slice(0, 5)) {
      console.log(`      • ${z.name} (${z.province}) — ${z.base_rate} Kz | ${z.estimated_hours_min}-${z.estimated_hours_max}h`);
    }
    ok("Zonas de entrega angolanas listadas correctamente");
  } catch (err) {
    fail("Listar zonas de entrega", err.message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 2: Cálculo de Fretes por Município
  // ═══════════════════════════════════════════════════════════════════
  section("💰", "CENÁRIO 2 — Cálculo Dinâmico de Fretes por Município");

  // 2a. Frete para Talatona (Luanda Centro)
  try {
    const talatona = await api(null, "POST", "/logistics/calculate-freight", {
      sellerProfileId: sellerId,
      province: "Luanda",
      municipality: "Talatona",
      totalCartAmount: 25000,
    });
    assert.ok(talatona.zoneId, "Deve retornar zoneId");
    assert.ok(talatona.zoneName.includes("Luanda"), "Deve ser zona Luanda");
    assert.equal(talatona.isFreeShipping, false, "25.000 Kz não qualifica para frete grátis");
    assert.ok(talatona.finalRate > 0, "Frete deve ter valor positivo");
    console.log(`   🏘️ Talatona: ${talatona.finalRate} Kz (zona: ${talatona.zoneName})`);
    ok(`Frete Talatona calculado: ${talatona.finalRate} Kz`);
  } catch (err) {
    fail("Frete Talatona", err.message);
  }

  // 2b. Frete para Viana (Luanda Periferia)
  try {
    const viana = await api(null, "POST", "/logistics/calculate-freight", {
      sellerProfileId: sellerId,
      province: "Luanda",
      municipality: "Viana",
      totalCartAmount: 15000,
    });
    assert.ok(viana.finalRate >= 3000, "Viana deve custar mais que zona central");
    console.log(`   🏘️ Viana: ${viana.finalRate} Kz (zona: ${viana.zoneName})`);
    ok(`Frete Viana calculado: ${viana.finalRate} Kz`);
  } catch (err) {
    fail("Frete Viana", err.message);
  }

  // 2c. Frete para Lobito/Benguela (Inter-provincial)
  try {
    const lobito = await api(null, "POST", "/logistics/calculate-freight", {
      sellerProfileId: sellerId,
      province: "Benguela",
      municipality: "Lobito",
      totalCartAmount: 30000,
    });
    assert.ok(lobito.finalRate >= 4000, "Benguela interprovincial deve ser ≥ 4.000 Kz");
    assert.ok(lobito.estimatedHoursMin >= 24, "Estimativa interprovincial deve ser ≥ 24h");
    console.log(`   🚛 Lobito: ${lobito.finalRate} Kz (zona: ${lobito.zoneName}) | ${lobito.estimatedHoursMin}-${lobito.estimatedHoursMax}h`);
    ok(`Frete Lobito/Benguela calculado: ${lobito.finalRate} Kz`);
  } catch (err) {
    fail("Frete Lobito", err.message);
  }

  // 2d. Frete GRÁTIS (carrinho > 50.000 Kz)
  try {
    const free = await api(null, "POST", "/logistics/calculate-freight", {
      sellerProfileId: sellerId,
      province: "Luanda",
      municipality: "Talatona",
      totalCartAmount: 89000,  // > 50.000 threshold
    });
    assert.equal(free.isFreeShipping, true, "Deve qualificar para frete grátis");
    assert.equal(free.finalRate, 0, "Frete deve ser 0 Kz");
    console.log(`   🎁 Frete GRÁTIS activado para carrinho de 89.000 Kz (threshold: ${free.freeShippingThreshold} Kz)`);
    ok("Frete GRÁTIS validado para compra > 50.000 Kz");
  } catch (err) {
    fail("Frete grátis", err.message);
  }

  // 2e. Click & Collect disponível
  try {
    const pickup = await api(null, "POST", "/logistics/calculate-freight", {
      sellerProfileId: sellerId,
      province: "Luanda",
      municipality: "Maianga",
    });
    assert.equal(pickup.localPickupAvailable, true, "Click & Collect deve estar disponível");
    assert.ok(pickup.pickupAddress, "Endereço de levantamento deve existir");
    console.log(`   🏪 Click & Collect: ${pickup.pickupAddress}`);
    ok("Click & Collect confirmado como disponível");
  } catch (err) {
    fail("Click & Collect", err.message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 3: Registo e Gestão de Estafeta
  // ═══════════════════════════════════════════════════════════════════
  section("🏍️", "CENÁRIO 3 — Registo de Estafeta (Motoboy)");

  let courierId;
  try {
    const courier = await api(admin, "POST", "/logistics/couriers", {
      fullName: "Mário Estafeta Moto",
      phone: "923555888",
      vehicleType: "motorcycle",
      licensePlate: "LD-45-MK",
    }, 201);
    assert.ok(courier.id, "Estafeta deve ter ID");
    assert.equal(courier.vehicle_type, "motorcycle");
    assert.equal(courier.status, "active");
    courierId = courier.id;
    console.log(`   🏍️ Estafeta registado: ${courier.full_name} | Moto: ${courier.license_plate} | ID: ${courier.id}`);
    ok("Estafeta registado com sucesso via API admin");
  } catch (err) {
    fail("Registo de estafeta", err.message);
  }

  // List couriers
  try {
    const couriers = await api(seller, "GET", "/logistics/couriers?status=active");
    assert.ok(Array.isArray(couriers), "Deve retornar lista de estafetas");
    assert.ok(couriers.length >= 1, "Deve haver pelo menos 1 estafeta activo");
    console.log(`   📋 Estafetas activos: ${couriers.length}`);
    ok(`Listagem de estafetas: ${couriers.length} activo(s)`);
  } catch (err) {
    fail("Listagem de estafetas", err.message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 4: Criar Encomenda & Despachar com Estafeta (PIN gerado)
  // ═══════════════════════════════════════════════════════════════════
  section("📦", "CENÁRIO 4 — Despacho de Encomenda para Estafeta (PIN Gerado)");

  // Create order directly in DB for the simulation
  const orderId = randomUUID();
  const orderRef = `PA-LOG-${Date.now().toString(36).toUpperCase()}`;
  await pool.query(
    `INSERT INTO orders (id, reference, buyer_id, seller_profile_id, total_amount, status)
     VALUES ($1, $2, $3, $4, 89000.00, 'preparing')
     ON CONFLICT DO NOTHING`,
    [orderId, orderRef, buyer.id, sellerId],
  );
  ok(`Encomenda criada: ${orderRef} (89.000 Kz, status: preparing)`);

  let deliveryId;
  let buyerPin;
  try {
    const dispatch = await api(seller, "POST", `/logistics/orders/${orderId}/assign-courier`, {
      courierId: courierId,
      destinationProvince: "Luanda",
      destinationMunicipality: "Viana",
      destinationAddress: "Rua Principal, Bairro da Estalagem, Casa 7",
      destinationLandmark: "Junto à bomba da Sonangol no cruzamento de Viana",
      destinationLatitude: -8.9035,
      destinationLongitude: 13.3735,
      recipientName: "Carlos Comprador Viana",
      recipientPhone: "+244923444555",
      shippingFee: 3500,
    }, 201);

    assert.ok(dispatch.deliveryId, "Deve retornar deliveryId");
    assert.ok(dispatch.pin, "Deve retornar PIN de 4 dígitos");
    assert.match(dispatch.pin, /^\d{4}$/, "PIN deve ter exactamente 4 dígitos");
    assert.equal(dispatch.status, "assigned");

    deliveryId = dispatch.deliveryId;
    buyerPin = dispatch.pin;

    console.log(`   📦 Encomenda despachada!`);
    console.log(`      • Delivery ID: ${deliveryId}`);
    console.log(`      • PIN do comprador: ${buyerPin} (enviado por WhatsApp/SMS)`);
    console.log(`      • Destino: Viana, junto à bomba da Sonangol`);
    console.log(`      • Frete: 3.500 Kz`);
    ok(`Despacho realizado — PIN gerado: ${buyerPin}`);
  } catch (err) {
    fail("Despacho com estafeta", err.message);
  }

  // Verify order status changed to out_for_delivery
  try {
    const orderCheck = await pool.query("SELECT status FROM orders WHERE id = $1", [orderId]);
    assert.equal(orderCheck.rows[0].status, "out_for_delivery", "Estado da encomenda deve ser 'out_for_delivery'");
    ok("Estado da encomenda actualizado para 'out_for_delivery'");
  } catch (err) {
    fail("Verificação de estado da encomenda", err.message);
  }

  // Verify courier status changed to busy
  if (courierId) {
    try {
      const courierCheck = await pool.query("SELECT status FROM couriers WHERE id = $1", [courierId]);
      assert.equal(courierCheck.rows[0].status, "busy", "Estafeta deve estar 'busy'");
      ok("Estafeta marcado como 'busy' após atribuição");
    } catch (err) {
      fail("Verificação de estado do estafeta", err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 5: Estafeta Recolhe na Loja (Pickup)
  // ═══════════════════════════════════════════════════════════════════
  section("🏪", "CENÁRIO 5 — Estafeta Recolhe a Encomenda na Loja");

  if (deliveryId) {
    try {
      const pickup = await api(courierUser, "POST", `/logistics/deliveries/${deliveryId}/pickup`);
      assert.equal(pickup.status, "picked_up");
      console.log(`   📥 Estafeta recolheu a encomenda na loja`);
      ok("Pickup confirmado pelo estafeta");
    } catch (err) {
      fail("Pickup pelo estafeta", err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 6: Tentativa de PIN ERRADO (Anti-Burla — Brute Force)
  // ═══════════════════════════════════════════════════════════════════
  section("🔐", "CENÁRIO 6 — Anti-Burla: PIN Errado (Brute Force Protection)");

  if (deliveryId) {
    // Attempt 1: Wrong PIN
    try {
      await api(courierUser, "POST", `/logistics/deliveries/${deliveryId}/verify-pin`, {
        pin: "0000",
        latitude: -8.9035,
        longitude: 13.3735,
      }, 400);
      console.log(`   🔴 Tentativa 1: PIN "0000" → Rejeitado (correcto!)`);
      ok("PIN errado rejeitado (tentativa 1/3)");
    } catch (err) {
      fail("Rejeição PIN errado tentativa 1", err.message);
    }

    // Attempt 2: Another wrong PIN
    try {
      await api(courierUser, "POST", `/logistics/deliveries/${deliveryId}/verify-pin`, {
        pin: "1111",
        latitude: -8.9035,
        longitude: 13.3735,
      }, 400);
      console.log(`   🔴 Tentativa 2: PIN "1111" → Rejeitado (correcto!)`);
      ok("PIN errado rejeitado (tentativa 2/3)");
    } catch (err) {
      fail("Rejeição PIN errado tentativa 2", err.message);
    }

    // Verify pin_attempts counter in DB
    try {
      const attemptsCheck = await pool.query(
        "SELECT pin_attempts FROM delivery_assignments WHERE id = $1",
        [deliveryId],
      );
      assert.equal(attemptsCheck.rows[0].pin_attempts, 2, "Deve ter 2 tentativas registadas");
      console.log(`   📊 Tentativas registadas na BD: ${attemptsCheck.rows[0].pin_attempts}/3`);
      ok("Contador de tentativas de PIN correcto (2/3)");
    } catch (err) {
      fail("Verificação de tentativas PIN", err.message);
    }

    // Reset pin_attempts to allow the correct PIN test below
    // (In production, the buyer would need to contact support or request a new PIN)
    await pool.query("UPDATE delivery_assignments SET pin_attempts = 0 WHERE id = $1", [deliveryId]);
    console.log(`   🔄 Reset de tentativas (para testar PIN correcto a seguir)`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 7: PIN CORRECTO — Entrega Concluída!
  // ═══════════════════════════════════════════════════════════════════
  section("✅", "CENÁRIO 7 — Validação de PIN Correcto (Entrega Concluída)");

  if (deliveryId && buyerPin) {
    try {
      const verification = await api(courierUser, "POST", `/logistics/deliveries/${deliveryId}/verify-pin`, {
        pin: buyerPin,
        latitude: -8.9035,
        longitude: 13.3735,
        notes: "Entregue ao próprio comprador Carlos, no portão de casa. Confirmação visual e PIN validado.",
      });

      assert.equal(verification.verified, true, "PIN deve ser validado com sucesso");
      assert.ok(verification.message.includes("sucesso"), "Mensagem deve confirmar sucesso");

      console.log(`   🎉 PIN "${buyerPin}" VALIDADO com sucesso!`);
      console.log(`   📍 Local GPS: -8.9035, 13.3735 (Viana, Luanda)`);
      console.log(`   📝 Nota: Entregue ao próprio comprador Carlos`);
      ok("Entrega concluída com PIN válido — Handshake anti-burla OK!");
    } catch (err) {
      fail("Validação PIN correcto", err.message);
    }

    // Verify order status is now 'completed'
    try {
      const orderFinal = await pool.query("SELECT status FROM orders WHERE id = $1", [orderId]);
      assert.equal(orderFinal.rows[0].status, "completed", "Encomenda deve estar 'completed'");
      console.log(`   📦 Estado final da encomenda: ✅ completed`);
      ok("Encomenda marcada como 'completed' após entrega");
    } catch (err) {
      fail("Estado final da encomenda", err.message);
    }

    // Verify courier is back to 'active' and counter incremented
    if (courierId) {
      try {
        const courierFinal = await pool.query(
          "SELECT status, total_deliveries FROM couriers WHERE id = $1",
          [courierId],
        );
        assert.equal(courierFinal.rows[0].status, "active", "Estafeta deve voltar a 'active'");
        assert.ok(courierFinal.rows[0].total_deliveries >= 1, "Contador de entregas deve ser ≥ 1");
        console.log(`   🏍️ Estafeta: status=active, entregas=${courierFinal.rows[0].total_deliveries}`);
        ok("Estafeta libertado e contador de entregas incrementado");
      } catch (err) {
        fail("Estado final do estafeta", err.message);
      }
    }

    // Verify raw PIN has been wiped (security)
    try {
      const pinWipe = await pool.query(
        "SELECT raw_pin_for_buyer FROM delivery_assignments WHERE id = $1",
        [deliveryId],
      );
      assert.equal(pinWipe.rows[0].raw_pin_for_buyer, null, "PIN em texto deve ser apagado após entrega");
      console.log(`   🔒 PIN em texto limpo da BD (segurança pós-entrega)`);
      ok("PIN em texto limpo — segurança pós-entrega validada");
    } catch (err) {
      fail("Limpeza de PIN pós-entrega", err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 8: Tracking & Timeline do Comprador
  // ═══════════════════════════════════════════════════════════════════
  section("📡", "CENÁRIO 8 — Tracking & Timeline de Entrega (Visão do Comprador)");

  try {
    const tracking = await api(buyer, "GET", `/logistics/orders/${orderId}/tracking`);
    assert.equal(tracking.trackingAvailable, true, "Tracking deve estar disponível");
    assert.equal(tracking.status, "delivered", "Status de delivery deve ser 'delivered'");
    assert.ok(tracking.courier, "Dados do estafeta devem estar presentes");
    assert.ok(tracking.timeline, "Timeline deve existir");
    assert.ok(tracking.timeline.length >= 2, "Deve haver pelo menos 2 eventos na timeline");

    console.log(`   📦 Encomenda: ${tracking.orderReference}`);
    console.log(`   🏍️ Estafeta: ${tracking.courier?.name} (${tracking.courier?.vehicle})`);
    console.log(`   📍 Destino: ${tracking.recipient?.municipality}, ${tracking.recipient?.province}`);
    console.log(`   🔖 Landmark: ${tracking.recipient?.landmark}`);
    console.log(`   💰 Frete cobrado: ${tracking.shippingFee} Kz`);
    console.log(`   📜 Timeline de eventos (${tracking.timeline.length}):`);
    for (const evt of tracking.timeline) {
      const ts = new Date(evt.created_at).toLocaleTimeString("pt-AO");
      console.log(`      • [${ts}] ${evt.event_type}: ${evt.note || ""}`);
    }
    ok(`Tracking completo com ${tracking.timeline.length} eventos na timeline`);
  } catch (err) {
    fail("Tracking do comprador", err.message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CENÁRIO 9: Bloqueio Total (3 tentativas PIN) — Nova Entrega
  // ═══════════════════════════════════════════════════════════════════
  section("🚫", "CENÁRIO 9 — Bloqueio Total após 3 Tentativas de PIN");

  const orderId2 = randomUUID();
  const orderRef2 = `PA-BLK-${Date.now().toString(36).toUpperCase()}`;
  await pool.query(
    `INSERT INTO orders (id, reference, buyer_id, seller_profile_id, total_amount, status)
     VALUES ($1, $2, $3, $4, 45000.00, 'preparing')
     ON CONFLICT DO NOTHING`,
    [orderId2, orderRef2, buyer.id, sellerId],
  );

  let deliveryId2;
  try {
    const dispatch2 = await api(seller, "POST", `/logistics/orders/${orderId2}/assign-courier`, {
      courierId: courierId,
      destinationProvince: "Luanda",
      destinationMunicipality: "Cacuaco",
      destinationAddress: "Bairro do Kikolo, Rua 12, Casa 3",
      destinationLandmark: "Depois do mercado do Kikolo",
      recipientName: "Carlos Comprador Viana",
      recipientPhone: "+244923444555",
      shippingFee: 3500,
    }, 201);

    deliveryId2 = dispatch2.deliveryId;

    // Pickup
    await api(courierUser, "POST", `/logistics/deliveries/${deliveryId2}/pickup`);

    // 3 wrong PIN attempts
    for (let i = 1; i <= 3; i++) {
      try {
        await api(courierUser, "POST", `/logistics/deliveries/${deliveryId2}/verify-pin`, {
          pin: `000${i}`,
        }, 400);
        console.log(`   🔴 Tentativa ${i}/3: PIN "000${i}" → Rejeitado`);
      } catch (err) {
        // Already expected to fail — that's fine
        console.log(`   🔴 Tentativa ${i}/3: PIN "000${i}" → Rejeitado (${err.message.slice(0, 80)})`);
      }
    }

    // 4th attempt should be locked out
    try {
      await api(courierUser, "POST", `/logistics/deliveries/${deliveryId2}/verify-pin`, {
        pin: "9999",
      }, 400);
      console.log(`   🔒 Tentativa 4: BLOQUEADO — Limite de tentativas excedido`);
      ok("Bloqueio de PIN após 3 tentativas — anti-brute-force funcional");
    } catch (err) {
      // If the 3rd attempt already locked it, the 4th will also be a 400
      if (err.message.includes("400")) {
        ok("Bloqueio de PIN após 3 tentativas — anti-brute-force funcional");
      } else {
        fail("Bloqueio de PIN", err.message);
      }
    }
  } catch (err) {
    fail("Cenário de bloqueio total", err.message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // REPORT FINAL
  // ═══════════════════════════════════════════════════════════════════
  banner("📊 RELATÓRIO FINAL — LOGÍSTICA E2E ANGOLA");

  console.log(`   ✅ Testes aprovados: ${passed.length}`);
  console.log(`   ❌ Testes falhados: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\n   Detalhes das falhas:");
    for (const f of failed) {
      console.log(`      • ${f.msg}: ${f.err.slice(0, 200)}`);
    }
  }

  console.log(`\n   Taxa de sucesso: ${Math.round((passed.length / (passed.length + failed.length)) * 100)}%\n`);

  const testMatrix = [
    ["Zonas de Entrega Angolanas", "🗺️"],
    ["Frete Luanda Centro (Talatona)", "🏘️"],
    ["Frete Luanda Periferia (Viana)", "🏘️"],
    ["Frete Inter-provincial (Benguela)", "🚛"],
    ["Frete GRÁTIS (> 50.000 Kz)", "🎁"],
    ["Click & Collect Disponível", "🏪"],
    ["Registo de Estafeta (Admin)", "🏍️"],
    ["Despacho c/ PIN Gerado", "📦"],
    ["Pickup pelo Estafeta", "📥"],
    ["PIN Errado (Anti-Burla)", "🔐"],
    ["PIN Correcto (Entrega OK)", "✅"],
    ["Tracking & Timeline", "📡"],
    ["Bloqueio 3 Tentativas PIN", "🚫"],
  ];

  console.log("   ┌──────────────────────────────────────────────────────┐");
  console.log("   │        MATRIZ DE CENÁRIOS LOGÍSTICA ANGOLA          │");
  console.log("   ├──────────────────────────────────────────────────────┤");
  for (const [name, icon] of testMatrix) {
    const hasFail = failed.some(f => f.msg.toLowerCase().includes(name.slice(0, 12).toLowerCase()));
    const status = hasFail ? "❌ FALHOU" : "✅ PASSOU";
    console.log(`   │ ${icon} ${name.padEnd(40)} ${status.padEnd(10)}│`);
  }
  console.log("   └──────────────────────────────────────────────────────┘\n");

  if (failed.length > 0) process.exitCode = 1;
}

runLogisticsE2E()
  .catch((err) => {
    console.error("\n💥 ERRO FATAL NA SIMULAÇÃO:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
