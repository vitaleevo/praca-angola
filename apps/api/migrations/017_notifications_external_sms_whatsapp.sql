-- Migration 017: Notification Outbox & External SMS/WhatsApp Drivers
CREATE TABLE IF NOT EXISTS notification_templates (
  slug TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'all')),
  title TEXT NOT NULL,
  content_template TEXT NOT NULL,
  whatsapp_template_name TEXT,
  variables TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Essential Angolan E-commerce & Services Templates
INSERT INTO notification_templates (slug, channel, title, content_template, whatsapp_template_name, variables)
VALUES
  (
    'order_created_seller',
    'all',
    'Nova Encomenda Recebida',
    'Olá {{store_name}}! Recebeste uma nova encomenda #{{order_ref}} no valor de {{amount}} Kz. Confirma o pagamento e prepara o envio.',
    'puvo_new_order_seller',
    ARRAY['store_name', 'order_ref', 'amount']
  ),
  (
    'payment_confirmed_buyer',
    'all',
    'Pagamento Confirmado',
    'Olá {{customer_name}}, o pagamento da tua encomenda #{{order_ref}} foi confirmado pela loja {{store_name}}. O teu pedido está em preparação!',
    'puvo_payment_confirmed_buyer',
    ARRAY['customer_name', 'order_ref', 'store_name']
  ),
  (
    'order_shipped_buyer',
    'all',
    'Encomenda em Transporte',
    'Boas notícias! A tua encomenda #{{order_ref}} foi despachada para entrega pela loja {{store_name}}. Previsão de chegada rápida.',
    'puvo_order_shipped',
    ARRAY['order_ref', 'store_name']
  ),
  (
    'service_proposal_client',
    'all',
    'Novo Orçamento de Serviço',
    'O profissional {{provider_name}} enviou uma proposta orçamental de {{amount}} Kz para o teu pedido de serviço. Acede à PUVO para aceitar.',
    'puvo_service_quote',
    ARRAY['provider_name', 'amount']
  ),
  (
    'security_code_sms',
    'sms',
    'Código de Segurança PUVO',
    'O teu código de verificação PUVO Angola é {{code}}. Válido por 10 minutos. Não partilhes com ninguém.',
    NULL,
    ARRAY['code']
  )
ON CONFLICT (slug) DO UPDATE
SET
  content_template = EXCLUDED.content_template,
  updated_at = now();

CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_phone TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'twilio', 'whatsapp_cloud', 'angola_sms_gateway')),
  template_slug TEXT REFERENCES notification_templates(slug) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  rendered_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  provider_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_outbox_queue
  ON notification_outbox(next_attempt_at, attempts)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notif_outbox_phone
  ON notification_outbox(recipient_phone);

CREATE INDEX IF NOT EXISTS idx_notif_outbox_provider_msg
  ON notification_outbox(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_webhook_msg
  ON notification_webhook_logs(provider_message_id);
