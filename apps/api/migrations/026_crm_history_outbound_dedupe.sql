-- The Conversations API may assign a different ID to a reply already sent by
-- the CRM. Remove only imported outbound copies that match an original reply
-- in the same conversation, with the same text, within three seconds.
DELETE FROM crm_messages AS imported
WHERE imported.metadata->>'imported' = 'true'
  AND imported.direction = 'outbound'
  AND EXISTS (
    SELECT 1 FROM crm_messages AS original
    WHERE original.conversation_id = imported.conversation_id
      AND original.id <> imported.id
      AND original.direction = 'outbound'
      AND original.metadata->>'imported' IS DISTINCT FROM 'true'
      AND original.content = imported.content
      AND original.created_at BETWEEN imported.created_at - interval '3 seconds'
                                  AND imported.created_at + interval '3 seconds'
  );
