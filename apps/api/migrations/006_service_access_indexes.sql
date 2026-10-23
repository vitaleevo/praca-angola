CREATE INDEX sessions_active_store_idx ON sessions(active_store_id) WHERE active_store_id IS NOT NULL;
CREATE INDEX store_invitations_inviter_idx ON store_invitations(invited_by);
CREATE INDEX professional_profiles_photo_idx ON professional_profiles(photo_asset_id) WHERE photo_asset_id IS NOT NULL;
CREATE INDEX service_requests_category_idx ON service_requests(category_id);
CREATE INDEX service_requests_accepted_idx ON service_requests(accepted_proposal_id) WHERE accepted_proposal_id IS NOT NULL;
CREATE INDEX service_messages_sender_rate_idx ON service_messages(sender_id,created_at DESC);
CREATE INDEX service_reviews_author_idx ON service_reviews(author_id);
