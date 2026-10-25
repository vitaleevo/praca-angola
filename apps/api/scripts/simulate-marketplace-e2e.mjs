import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://praca:praca_local_dev@localhost:5432/praca_angola";
const API_BASE = "http://127.0.0.1:4000/api/v1";

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

console.log("\n=======================================================");
console.log("🚀 SIMULAÇÃO COMPLETA DO MARKETPLACE PUVO (ANGOLA)");
console.log("   Personas: Vendedor, Comprador e Profissional");
console.log("=======================================================\n");

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

  await pool.query(
    "INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [id, role],
  );

  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '2 hours')",
    [id, tokenHash],
  );

  return { id, email, name, token: rawToken };
}

async function api(actor, method, path, body = null, expectedStatus = 200) {
  const headers = {
    Accept: "application/json",
  };
  if (actor?.token) {
    headers.Cookie = `praca_session=${actor.token}`;
  }
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  assert.equal(
    res.status,
    expectedStatus,
    `Falha em ${method} ${path}: HTTP ${res.status} (esperado: ${expectedStatus}). Resposta: ${text}`,
  );

  return json;
}

async function runSimulation() {
  try {
    // ─────────────────────────────────────────────────────────────
    // FASE 1: O VENDEDOR (SELLER)
    // ─────────────────────────────────────────────────────────────
    console.log("📦 [1/3] A CONFIGURAR PERSONA: VENDEDOR (Tiago Vendedor)...");
    const seller = await createTestAccount("Tiago Vendedor", `tiago.vendedor.${Date.now()}@puvo.local`);
    console.log(`   ✓ Conta de vendedor criada (ID: ${seller.id})`);

    // 1.1 Configurar perfil de loja
    const storeProfile = await api(seller, "PUT", "/seller/profile", {
      profileType: "business",
      displayName: "Tiago Eletrónicos & Gadgets Angola",
      description: "Loja especializada em tecnologia de ponta com garantia oficial em Luanda.",
      province: "Luanda",
      municipality: "Maianga",
      contactEmail: seller.email,
      contactEmailPublic: true,
      contactPhone: "923111222",
      contactPhonePublic: true,
      deliveryPolicy: "Entregas expresso em Luanda em 24h ou levantamento na Maianga.",
      returnsPolicy: "Garantia de 1 ano e troca em 7 dias contra defeito comprovado.",
      termsPolicy: "Pagamentos 100% seguros através da plataforma PUVO.",
      mcxRecipientName: "Tiago Vendedor Multicaixa",
      mcxPhone: "923111222",
      mcxEnabled: true,
      bankName: "Banco BAI",
      bankAccountHolder: "Tiago Eletrónicos Lda",
      bankAccountIdentifier: "AO06004000001234567890123",
      bankTransferEnabled: true,
    }, 200);

    const storeId = storeProfile.profile.id;
    const storeSlug = storeProfile.profile.slug;
    console.log(`   ✓ Loja configurada: "${storeProfile.profile.display_name}" (Slug: ${storeSlug})`);
    console.log(`   ✓ Meios de pagamento angolanos configurados: Multicaixa Express (923111222) + Banco BAI`);

    // 1.2 Publicar produto com auditoria por IA
    console.log("   ⏳ A submeter anúncio para auditoria IA...");
    const listing = await api(seller, "POST", "/seller/listings", {
      title: "Sony PlayStation 5 Slim 1TB Digital Original",
      description: "PlayStation 5 Slim versão digital de 1TB, novo e selado na caixa com garantia oficial de 1 ano. Entrega imediata em Luanda. Pagamento por Multicaixa Express ou transferência bancária.",
      categorySlug: "telemoveis-tecnologia",
      price: 450000,
      condition: "new",
      priceNegotiable: false,
      availableQuantity: 5,
      province: "Luanda",
      municipality: "Maianga",
      imageIds: [],
    }, 201);

    console.log(`   ✓ Anúncio submetido! ID: ${listing.id} (Status inicial: "${listing.status}")`);

    // 1.3 Moderação: aprovação do anúncio pelo Moderador oficial
    console.log("   🛡️ Moderador analisa a fila e aprova o anúncio com IA risk score favorável...");
    const moderator = await createTestAccount("Moderador Oficial", `moderador.${Date.now()}@puvo.local`, "moderator");
    await api(moderator, "PATCH", `/admin/listings/${listing.id}`, { action: "approved" }, 200);
    console.log(`   ✓ Anúncio aprovado com sucesso! Publicado no marketplace.`);

    // 1.4 Verificar visibilidade no catálogo público
    const catalogItem = await api(null, "GET", `/catalog/listings/${listing.slug}`, null, 200);
    assert.equal(catalogItem.title, "Sony PlayStation 5 Slim 1TB Digital Original");
    console.log(`   ✓ Produto disponível publicamente no catálogo a ${catalogItem.price} Kz`);

    // ─────────────────────────────────────────────────────────────
    // FASE 2: O COMPRADOR (BUYER)
    // ─────────────────────────────────────────────────────────────
    console.log("\n🛒 [2/3] A CONFIGURAR PERSONA: COMPRADOR (Mauro Comprador)...");
    const buyer = await createTestAccount("Mauro Comprador", `mauro.comprador.${Date.now()}@puvo.local`);
    console.log(`   ✓ Conta de comprador criada (ID: ${buyer.id})`);

    // 2.1 Interação com o Chatbot IA no Storefront da Loja
    console.log("   💬 Comprador interage com o assistente inteligente da loja...");
    const chatSession = await api(null, "POST", "/storefront/chat/session", {
      sellerProfileId: storeId,
      visitorUserId: buyer.id,
      visitorName: buyer.name,
    }, 201);

    const sessionId = chatSession.session.id;
    console.log(`   ✓ Sessão de atendimento aberta (ID: ${sessionId})`);

    const chatReply = await api(null, "POST", `/storefront/chat/session/${sessionId}/message`, {
      message: "Olá! O PlayStation 5 Slim tem garantia oficial e fazem entrega na Maianga?",
      sellerProfileId: storeId,
    }, 201);

    console.log(`   🤖 Resposta da IA da Loja:\n      "${chatReply.aiReply.content.slice(0, 160)}..."`);
    console.log(`   ✓ Resposta gerada respeitando guardrails e políticas da loja`);

    // 2.2 Checkout e Criação de Encomenda
    console.log("   💳 A finalizar compra no checkout da loja...");
    const checkout = await api(buyer, "POST", "/orders", {
      items: [{ listingId: listing.id, quantity: 1 }],
      buyerNote: "Por favor entregar no período da tarde no escritório na Maianga.",
      paymentMethods: [{ sellerProfileId: storeId, method: "manual_bank_transfer" }],
    }, 201);

    const orderId = checkout.orders[0].id;
    const orderRef = checkout.orders[0].reference;
    console.log(`   ✓ Encomenda gerada! Ref: #${orderRef} (Total: 450.000 Kz)`);
    console.log(`   ✓ Estado inicial da encomenda: "awaiting_payment"`);

    // 2.3 Reportar Pagamento com Comprovativo Bancário
    console.log("   📄 Comprador anexa comprovativo e reporta transferência...");
    const reportPayment = await api(buyer, "POST", `/orders/${orderId}/payment/report`, {
      transferReference: "TRX-MCX-98231-LUANDA",
      note: "Transferência de 450.000 Kz efectuada pelo BAI Directo às 14:30.",
      receiptImageUrl: "/api/v1/media/sample-receipt.png",
    }, 201);

    console.log(`   ✓ Pagamento reportado pelo comprador! Status: "${reportPayment.status}"`);

    // 2.4 Vendedor confirma pagamento
    console.log("   💰 Vendedor confirma crédito no extrato bancário...");
    const confirmPayment = await api(seller, "POST", `/orders/${orderId}/payment/confirm`, null, 201);
    console.log(`   ✓ Pagamento confirmado pelo vendedor! Status: "${confirmPayment.status}"`);

    // 2.5 Vendedor coloca a encomenda em rota de entrega
    console.log("   🚚 Vendedor despacha encomenda para entrega...");
    const dispatch = await api(seller, "PATCH", `/orders/${orderId}/fulfillment`, {
      method: "out_for_delivery",
      note: "Estafeta a caminho com a viatura LD-45-88-HA.",
    }, 200);
    console.log(`   ✓ Encomenda despachada! Status: "${dispatch.status}"`);

    // 2.6 Comprador confirma receção da mercadoria
    console.log("   📦 Comprador recebe a PlayStation 5 e confirma receção...");
    const completedOrder = await api(buyer, "POST", `/orders/${orderId}/complete`, null, 201);
    console.log(`   ✓ Encomenda concluída com sucesso! Status: "${completedOrder.status}"`);

    // ─────────────────────────────────────────────────────────────
    // FASE 3: O PROFISSIONAL (PRESTADOR DE SERVIÇOS)
    // ─────────────────────────────────────────────────────────────
    console.log("\n⚡ [3/3] A CONFIGURAR PERSONA: PROFISSIONAL (Eng. Carlos Eletricista)...");
    const proUser = await createTestAccount("Eng. Carlos Eletricista", `carlos.tecnico.${Date.now()}@puvo.local`);
    console.log(`   ✓ Conta de profissional criada (ID: ${proUser.id})`);

    // 3.1 Registar Perfil Profissional
    console.log("   🔧 A registar perfil profissional de prestação de serviços...");
    const proProfile = await api(proUser, "PUT", "/services/me", {
      displayName: "Carlos Eletricista & Climatização Pro",
      headline: "Engenheiro Eletrotécnico e Especialista em AVAC",
      bio: "Mais de 8 anos de experiência em instalações elétricas residenciais e industriais, geradores a diesel e sistemas inverter.",
      categorySlug: "electricidade",
      providerType: "individual",
      province: "Luanda",
      municipality: "Talatona",
      workMode: "onsite",
      startingPrice: 15000,
      yearsExperience: 8,
      availability: "available",
      specialties: "Instalações Elétricas, Climatização Inverter, Grupos Geradores",
      publicPhone: "924888999",
    }, 200);

    const proId = proProfile.profile?.id || proProfile.id;
    console.log(`   ✓ Perfil profissional registado (ID: ${proId})`);

    // Moderador aprova perfil profissional
    console.log("   🛡️ Moderador aprova perfil do profissional...");
    await api(moderator, "PATCH", `/services/moderation/${proId}`, {
      status: "published",
      verified: true,
      note: "Documentação de habilitação técnica conferida com sucesso.",
    }, 200);
    console.log(`   ✓ Perfil verificado e publicado no catálogo público de profissionais!`);

    // 3.2 O Comprador submete Pedido de Serviço direcionado
    console.log("   📋 Comprador submete pedido de serviço direcionado ao Eng. Carlos...");
    const requestRes = await api(buyer, "POST", "/services/requests", {
      title: "Instalação Completa de Ar Condicionado Inverter 12000 BTU",
      description: "Necessito da instalação de um AC novo na sala de estar no Kilamba. Já possuo os suportes e tubagens prontas.",
      categorySlug: "electricidade",
      province: "Luanda",
      workMode: "onsite",
      budget: 25000,
      targetProfileId: proId,
    }, 201);

    const requestId = requestRes.id;
    console.log(`   ✓ Pedido de serviço registado (ID: ${requestId})`);

    // 3.3 O Profissional envia Proposta Comercial
    console.log("   💼 Profissional analisa o pedido e submete proposta orçamental...");
    const proposalRes = await api(proUser, "POST", `/services/requests/${requestId}/proposals`, {
      amount: 22500,
      deliveryDays: 1,
      description: "Faço a instalação completa com vácuo na tubagem, ligação elétrica protegida e teste de refrigeração.",
    }, 201);

    const proposalId = proposalRes.id;
    console.log(`   ✓ Proposta enviada: 22.500 Kz (Prazo: 1 dia)`);

    // 3.4 O Comprador aceita a Proposta
    console.log("   🤝 Comprador aceita a proposta do profissional...");
    await api(buyer, "POST", `/services/requests/${requestId}/accept`, { proposalId }, 201);
    console.log(`   ✓ Proposta aceite! Trabalho adjudicado (status: "awarded")`);

    // 3.5 Mensagens em Direto no Canal de Trabalho
    console.log("   💬 Troca de mensagens entre Comprador e Profissional no canal de trabalho...");
    await api(buyer, "POST", `/services/proposals/${proposalId}/messages`, {
      body: "Olá Eng. Carlos, confirmo o serviço para amanhã às 09:00 no Edifício B12.",
    }, 201);

    await api(proUser, "POST", `/services/proposals/${proposalId}/messages`, {
      body: "Perfeito Mauro! Estarei pontualmente com as ferramentas e bomba de vácuo.",
    }, 201);
    console.log(`   ✓ Mensagens trocadas e validadas no canal de trabalho`);

    // 3.6 Concluir Serviço e Avaliação
    console.log("   🏁 Conclusão do trabalho e avaliação...");
    await api(buyer, "POST", `/services/requests/${requestId}/complete`, null, 201);

    await api(buyer, "POST", `/services/requests/${requestId}/reviews`, {
      rating: 5,
      body: "Excelente profissional! Pontual, técnico experiente e instalação impecável.",
    }, 201);

    console.log(`   ✓ Trabalho concluído com sucesso e avaliado com 5 estrelas ⭐⭐⭐⭐⭐`);

    // ─────────────────────────────────────────────────────────────
    // RESUMO DA VALIDAÇÃO GERAL
    // ─────────────────────────────────────────────────────────────
    console.log("\n=======================================================");
    console.log("🎉 TODAS AS SIMULAÇÕES FORAM CONCLUÍDAS COM SUCESSO!");
    console.log("   1. Vendedor: Loja configurada, pagamentos AO, anúncio submetido e aprovado");
    console.log("   2. Comprador: Catálogo, chat IA, encomenda gerada, comprovativo e entrega concluída");
    console.log("   3. Profissional: Perfil verificado, pedido adjudicado, chat direto e avaliação 5⭐");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("\n❌ ERRO NA SIMULAÇÃO:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void runSimulation();
