-- 028_crm_inbox_reply_status.sql
-- Add read, replied and directional tracking to CRM conversations

ALTER TABLE crm_conversations
  ADD COLUMN IF NOT EXISTS last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')) DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS is_replied BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ;

-- Reading a message does not mean that it was answered. Derive the initial
-- reply state from the most recent message instead of unread_count.
WITH latest AS (
  SELECT DISTINCT ON (conversation_id) conversation_id, direction
  FROM crm_messages
  ORDER BY conversation_id, created_at DESC, id DESC
), activity AS (
  SELECT conversation_id,
    MAX(created_at) FILTER (WHERE direction = 'inbound') AS last_inbound_at,
    MAX(created_at) FILTER (WHERE direction = 'outbound') AS last_outbound_at
  FROM crm_messages GROUP BY conversation_id
)
UPDATE crm_conversations AS conversation
SET last_message_direction = latest.direction,
    is_replied = latest.direction = 'outbound',
    last_inbound_at = activity.last_inbound_at,
    last_outbound_at = activity.last_outbound_at
FROM latest JOIN activity USING (conversation_id)
WHERE conversation.id = latest.conversation_id;

CREATE INDEX IF NOT EXISTS idx_crm_conversations_filter
  ON crm_conversations (workspace_id, is_replied, unread_count, channel, last_message_at DESC);
