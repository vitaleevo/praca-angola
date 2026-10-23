ALTER TABLE service_requests DROP CONSTRAINT service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check CHECK(status IN ('open','awarded','completed','cancelled','declined'));
ALTER TABLE service_requests ADD COLUMN provider_decline_reason text NOT NULL DEFAULT '' CHECK(length(provider_decline_reason)<=1000);
