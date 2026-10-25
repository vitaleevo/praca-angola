-- ─────────────────────────────────────────────────────────────
-- Migração 016: AI Moderation Scores & Order Fraud Inspections
-- Adiciona colunas de auditoria por IA em anúncios e tabela de
-- inspeções forenses de comprovativos Multicaixa Express e Bancários.
-- ─────────────────────────────────────────────────────────────

-- 1. Campos de risco e auditoria IA em listings
ALTER TABLE listings 
  ADD COLUMN IF NOT EXISTS ai_risk_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_flagged_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_suggested_action TEXT;

-- 2. Tabela de inspeções anti-fraude de comprovativos em encomendas
CREATE TABLE IF NOT EXISTS order_fraud_inspections (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  confidence_score         NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  extracted_amount_aoa     NUMERIC(18,2),
  extracted_transaction_id VARCHAR(100),
  bank_detected            VARCHAR(100),
  tampering_signs          BOOLEAN NOT NULL DEFAULT false,
  verdict                  VARCHAR(30) NOT NULL DEFAULT 'LOW_RISK', -- 'LOW_RISK', 'SUSPICIOUS', 'HIGH_RISK'
  details                  TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_order ON order_fraud_inspections(order_id);
CREATE INDEX IF NOT EXISTS idx_listings_ai_risk ON listings(ai_risk_score DESC) WHERE status = 'pending_review';
