export interface CrmWorkspace {
  id: string;
  owner_user_id: string;
  seller_profile_id: string | null;
  professional_profile_id: string | null;
  name: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface CrmPipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
}

export interface CrmDeal {
  id: string;
  workspace_id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  stage_id: string;
  title: string;
  value_aoa: number;
  status: "open" | "won" | "lost";
  origin_channel: string;
  created_at: string;
}

export interface CrmConversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string | null;
  meta_ad_ref?: string | null;
  meta_ad_name?: string | null;
  channel: "whatsapp" | "instagram_dm" | "facebook_messenger" | "puvo_chat";
  last_message_preview: string | null;
  last_message_at: string;
  unread_count: number;
  last_message_direction?: "inbound" | "outbound";
  is_replied?: boolean;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
}

export interface CrmConversationFilterCounts {
  all: number;
  unread: number;
  pending: number;
  replied: number;
  read: number;
}

export interface CrmScheduledPost {
  id: string;
  workspace_id: string;
  channel_ids: string[];
  post_type: "post" | "reel" | "story";
  content: string;
  media_urls: string[];
  listing_id?: string | null;
  scheduled_for?: string | null;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  published_at?: string | null;
  meta_post_ids?: Record<string, unknown>;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmMetaAdCampaign {
  id: string;
  workspace_id: string;
  name: string;
  objective: "whatsapp_messages" | "instagram_direct" | "store_traffic" | "lead_generation";
  status: "draft" | "active" | "paused" | "completed" | "archived";
  budget_type: "daily" | "lifetime";
  budget_amount: number;
  budget_currency: "AOA" | "USD" | "EUR";
  starts_at: string;
  ends_at?: string | null;
  target_locations: string[];
  target_interests: string[];
  target_age_min: number;
  target_age_max: number;
  target_gender: "all" | "male" | "female";
  headline: string;
  primary_text: string;
  call_to_action: string;
  destination_url?: string | null;
  media_urls: string[];
  listing_id?: string | null;
  meta_ad_account_id?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  created_at: string;
  updated_at: string;
  // Computed analytics
  metrics?: {
    impressions: number;
    reach: number;
    clicks: number;
    spend_amount: number;
    conversations_started: number;
    leads_count: number;
    deals_won_count: number;
    revenue_generated_aoa: number;
    ctr: number;
    cpc_aoa: number;
    roas: number;
  };
}


export interface CrmMessage {
  id: string;
  conversation_id: string;
  workspace_id: string;
  direction: "inbound" | "outbound";
  message_type: "text" | "image" | "audio" | "document" | "catalog_product" | "payment_request";
  content: string;
  media_url?: string | null;
  metadata?: Record<string, unknown>;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  sent_by_user_id?: string | null;
  sent_by_ai: boolean;
  created_at: string;
}

export interface CreateContactDto {
  fullName: string;
  phone?: string;
  email?: string;
  originChannel: "facebook_lead" | "instagram" | "whatsapp" | "puvo_storefront" | "service_request" | "manual";
  province?: string;
  municipality?: string;
  notes?: string;
  tags?: string[];
  initialDealTitle?: string;
  initialDealValueAoa?: number;
}

export interface SendMessageDto {
  content: string;
  messageType?: "text" | "image" | "audio" | "document" | "catalog_product" | "payment_request";
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface StoreAiConfig {
  id: string;
  workspace_id: string;
  provider: "gemini" | "openai" | "claude" | "openrouter" | "custom";
  model_name: string;
  has_api_key: boolean;
  masked_api_key?: string;
  custom_endpoint_url?: string | null;
  system_instructions: string;
  temperature: number;
  auto_reply_enabled: boolean;
  is_active: boolean;
  updated_at: string;
}

export interface StoreAiKnowledge {
  id: string;
  workspace_id: string;
  title: string;
  category: "about_store" | "delivery_policy" | "payment_policy" | "faq" | "custom_doc";
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveStoreAiConfigDto {
  provider: "gemini" | "openai" | "claude" | "openrouter" | "custom";
  modelName: string;
  apiKey?: string;
  customEndpointUrl?: string;
  systemInstructions?: string;
  temperature?: number;
  autoReplyEnabled?: boolean;
}

export interface CreateKnowledgeDto {
  title: string;
  category: "about_store" | "delivery_policy" | "payment_policy" | "faq" | "custom_doc";
  content: string;
  isActive?: boolean;
}

