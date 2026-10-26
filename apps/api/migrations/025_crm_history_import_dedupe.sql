-- Keep the original message whenever an imported history row repeats it.
-- This affects only copies created by the CRM history importer.
DELETE FROM crm_messages AS imported
WHERE imported.metadata->>'imported' = 'true'
  AND imported.metadata->>'meta_message_id' IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM crm_messages AS original
    WHERE original.conversation_id = imported.conversation_id
      AND original.id <> imported.id
      AND original.metadata->>'meta_message_id' = imported.metadata->>'meta_message_id'
      AND original.metadata->>'imported' IS DISTINCT FROM 'true'
  );
