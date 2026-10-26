import { Injectable, Logger } from "@nestjs/common";
import {
  AiHealthReport,
  AiModerationRequest,
  AiModerationResponse,
  AiReceiptInspectionRequest,
  AiReceiptInspectionResponse,
  AiSuggestionRequest,
  AiSuggestionResponse,
} from "./ai.types";

@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly baseUrl = process.env.AI_WORKER_URL ?? "http://ai-worker:8000";
  private readonly secret = process.env.AI_INTERNAL_SECRET ?? "";
  private readonly defaultTimeoutMs = 4000;

  async request<T>(path: string, options: RequestInit = {}): Promise<T | null> {
    if (!this.secret) {
      this.logger.warn("AI worker secret is not configured");
      return null;
    }
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-AI-Internal-Secret": this.secret,
          ...(options.headers ?? {}),
        },
      });

      if (!response.ok) {
        this.logger.warn(`AI worker request to ${path} failed with HTTP ${response.status}`);
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(`AI worker request to ${path} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkHealth(): Promise<AiHealthReport> {
    const result = await this.request<{
      status: string;
      service: string;
      version: string;
      uptime_seconds: number;
    }>("/health");

    if (!result || result.status !== "ok") {
      return { status: "offline" };
    }

    return {
      status: "ok",
      service: result.service,
      version: result.version,
      uptime_seconds: result.uptime_seconds,
    };
  }

  async suggestListing(dto: AiSuggestionRequest): Promise<AiSuggestionResponse> {
    const result = await this.request<{
      title: string;
      description: string;
      suggested_price_aoa: number;
      category_slug: string;
      condition: "new" | "used" | "refurbished";
      confidence: number;
      tags: string[];
    }>("/v1/catalog/suggest", {
      method: "POST",
      body: JSON.stringify({
        image_urls: dto.imageUrls ?? [],
        raw_prompt: dto.rawPrompt ?? "",
        province: dto.province ?? "Luanda",
        municipality: dto.municipality ?? "Luanda",
      }),
    });

    if (result) {
      return {
        title: result.title,
        description: result.description,
        suggestedPriceAoa: result.suggested_price_aoa,
        categorySlug: result.category_slug,
        condition: result.condition,
        confidence: result.confidence,
        tags: result.tags,
      };
    }

    // Fallback gracioso se o worker estiver offline
    return {
      title: dto.rawPrompt?.trim() || "Novo Artigo",
      description: "Artigo de qualidade disponível para venda no marketplace PUVO.",
      suggestedPriceAoa: 50000,
      categorySlug: "outros",
      condition: "new",
      confidence: 0.5,
      tags: ["puvo"],
    };
  }

  async moderateContent(dto: AiModerationRequest): Promise<AiModerationResponse> {
    const result = await this.request<{
      risk_score: number;
      action: "auto_approve" | "manual_review" | "auto_reject";
      flagged_reasons: string[];
      risk_breakdown?: {
        scam_risk: number;
        illegal_goods_risk: number;
        counterfeit_risk: number;
        nsfw_risk: number;
        price_anomaly_risk: number;
        contact_bypass_risk: number;
      };
      suggested_moderator_action?: string;
      nsfw_score: number;
      scam_score: number;
    }>("/v1/moderation/check", {
      method: "POST",
      body: JSON.stringify({
        title: dto.title,
        description: dto.description,
        image_urls: dto.imageUrls ?? [],
        price: dto.price,
      }),
    });

    if (result) {
      return {
        riskScore: result.risk_score,
        action: result.action,
        flaggedReasons: result.flagged_reasons,
        riskBreakdown: result.risk_breakdown
          ? {
              scamRisk: result.risk_breakdown.scam_risk,
              illegalGoodsRisk: result.risk_breakdown.illegal_goods_risk,
              counterfeitRisk: result.risk_breakdown.counterfeit_risk,
              nsfwRisk: result.risk_breakdown.nsfw_risk,
              priceAnomalyRisk: result.risk_breakdown.price_anomaly_risk,
              contactBypassRisk: result.risk_breakdown.contact_bypass_risk,
            }
          : undefined,
        suggestedModeratorAction: result.suggested_moderator_action,
        nsfwScore: result.nsfw_score,
        scamScore: result.scam_score,
      };
    }

    // Fallback gracioso: encaminha para revisão humana padrão se a IA falhar
    return {
      riskScore: 0,
      action: "manual_review",
      flaggedReasons: ["Análise manual recomendada (serviço de IA indisponível)"],
      suggestedModeratorAction: "Serviço de IA temporariamente indisponível. Rever manualmente.",
      nsfwScore: 0,
      scamScore: 0,
    };
  }

  async inspectReceipt(dto: AiReceiptInspectionRequest): Promise<AiReceiptInspectionResponse> {
    const result = await this.request<{
      confidence_score: number;
      extracted_amount_aoa?: number;
      extracted_transaction_id?: string;
      bank_detected?: string;
      tampering_signs: boolean;
      verdict: "LOW_RISK" | "SUSPICIOUS" | "HIGH_RISK";
      details: string;
    }>("/v1/fraud/inspect-receipt", {
      method: "POST",
      body: JSON.stringify({
        image_url: dto.imageUrl,
        expected_amount_aoa: dto.expectedAmountAoa,
        expected_recipient_name: dto.expectedRecipientName,
      }),
    });

    if (result) {
      return {
        confidenceScore: result.confidence_score,
        extractedAmountAoa: result.extracted_amount_aoa,
        extractedTransactionId: result.extracted_transaction_id,
        bankDetected: result.bank_detected,
        tamperingSigns: result.tampering_signs,
        verdict: result.verdict,
        details: result.details,
      };
    }

    return {
      confidenceScore: 0,
      tamperingSigns: false,
      verdict: "LOW_RISK",
      details: "Inspeção manual necessária pelo vendedor.",
    };
  }

  async generateLLMResponse(payload: {
    provider: string;
    modelName: string;
    apiKey?: string;
    customEndpointUrl?: string;
    systemPrompt?: string;
    knowledgeContext?: string;
    messages: { role: string; content: string }[];
    temperature?: number;
  }): Promise<{ generatedText: string; providerUsed: string; modelUsed: string; isFallback: boolean }> {
    const result = await this.request<{
      generated_text: string;
      provider_used: string;
      model_used: string;
      is_fallback: boolean;
      tokens_used?: number;
    }>("/v1/llm/generate", {
      method: "POST",
      body: JSON.stringify({
        provider: payload.provider,
        model_name: payload.modelName,
        api_key: payload.apiKey,
        custom_endpoint_url: payload.customEndpointUrl,
        system_prompt: payload.systemPrompt,
        knowledge_context: payload.knowledgeContext,
        messages: payload.messages,
        temperature: payload.temperature ?? 0.7,
      }),
    });

    if (result) {
      return {
        generatedText: result.generated_text,
        providerUsed: result.provider_used,
        modelUsed: result.model_used,
        isFallback: result.is_fallback,
      };
    }

    return {
      generatedText: "Olá! Agradecemos o contacto. Em breve a nossa equipa irá responder-te com todos os detalhes.",
      providerUsed: `${payload.provider}-offline-fallback`,
      modelUsed: payload.modelName,
      isFallback: true,
    };
  }
}
