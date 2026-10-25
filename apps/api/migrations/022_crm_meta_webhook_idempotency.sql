-- Meta retries webhook deliveries. Reserve each external event in the same
-- transaction as its CRM changes so a failed delivery remains retryable.
CREATE TABLE IF NOT EXISTS crm_meta_webhook_events (
  event_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_meta_webhook_events_created_at
  ON crm_meta_webhook_events (created_at);
