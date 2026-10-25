export interface AiHealthReport {
  status: "ok" | "degraded" | "offline";
  service?: string;
  version?: string;
  uptime_seconds?: number;
}

export interface AiSuggestionRequest {
  imageUrls?: string[];
  rawPrompt?: string;
  province?: string;
  municipality?: string;
}

export interface AiSuggestionResponse {
  title: string;
  description: string;
  suggestedPriceAoa: number;
  categorySlug: string;
  condition: "new" | "used" | "refurbished";
  confidence: number;
  tags: string[];
}

export interface AiModerationRequest {
  title: string;
  description: string;
  imageUrls?: string[];
  price?: number;
}

export interface AiModerationResponse {
  riskScore: number;
  action: "auto_approve" | "manual_review" | "auto_reject";
  flaggedReasons: string[];
  riskBreakdown?: {
    scamRisk: number;
    illegalGoodsRisk: number;
    counterfeitRisk: number;
    nsfwRisk: number;
    priceAnomalyRisk: number;
    contactBypassRisk: number;
  };
  suggestedModeratorAction?: string;
  nsfwScore: number;
  scamScore: number;
}

export interface AiReceiptInspectionRequest {
  imageUrl?: string;
  expectedAmountAoa?: number;
  expectedRecipientName?: string;
}

export interface AiReceiptInspectionResponse {
  confidenceScore: number;
  extractedAmountAoa?: number;
  extractedTransactionId?: string;
  bankDetected?: string;
  tamperingSigns: boolean;
  verdict: "LOW_RISK" | "SUSPICIOUS" | "HIGH_RISK";
  details: string;
}
