CREATE TABLE service_notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 email_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE service_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key text NOT NULL CHECK(length(event_key) BETWEEN 8 AND 180),
 kind text NOT NULL CHECK(kind IN ('request','proposal','accepted','message','completed','declined')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
 href text NOT NULL CHECK(href ~ '^/servicos/pedidos/[0-9a-f-]{36}$'),
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 UNIQUE(user_id,event_key)
);
CREATE INDEX service_notifications_user_idx ON service_notifications(user_id,created_at DESC);
CREATE TABLE service_notification_outbox (
 notification_id uuid PRIMARY KEY REFERENCES service_notifications(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_notification_outbox_ready_idx ON service_notification_outbox(next_attempt_at) WHERE status IN ('pending','failed');
CREATE TABLE service_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid NOT NULL REFERENCES users(id),
 profile_id uuid REFERENCES professional_profiles(id),
 request_id uuid REFERENCES service_requests(id),
 message_id uuid REFERENCES service_messages(id),
 reason text NOT NULL CHECK(reason IN ('fraud','abuse','spam','other')),
 details text NOT NULL CHECK(length(btrim(details)) BETWEEN 20 AND 2000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','resolved','dismissed')),
 moderator_id uuid REFERENCES users(id),
 resolution_note text CHECK(length(resolution_note)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 CHECK(num_nonnulls(profile_id,request_id,message_id)=1)
);
CREATE INDEX service_reports_queue_idx ON service_reports(status,created_at);
CREATE INDEX service_reports_reporter_idx ON service_reports(reporter_id,created_at DESC);
CREATE UNIQUE INDEX service_reports_open_profile_idx ON service_reports(reporter_id,profile_id) WHERE profile_id IS NOT NULL AND status IN ('open','investigating');
CREATE UNIQUE INDEX service_reports_open_request_idx ON service_reports(reporter_id,request_id) WHERE request_id IS NOT NULL AND status IN ('open','investigating');
CREATE UNIQUE INDEX service_reports_open_message_idx ON service_reports(reporter_id,message_id) WHERE message_id IS NOT NULL AND status IN ('open','investigating');
