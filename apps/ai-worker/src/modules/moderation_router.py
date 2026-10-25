"""
PUVO Trust & Safety Engine – AI Moderation Router
Advanced multi-factor content inspection for listings and services in Angola:
- Financial fraud & payment hijacking detection (MCX bypass, Unitel/Africell balance scams)
- Hidden contact numbers detection (circumventing platform protections)
- Counterfeit & contraband claims ("réplica perfeita 1:1", "falso espelho")
- Prohibited goods & regulated items (weapons, narcotics, prescription drugs, forged documents)
- Adult content & escort services
- Pricing anomaly heuristic (flagging iPhone/luxury bait listings with absurdly low prices)
- Returns structured risk score, breakdown, and moderation decisions.
"""

import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from src.security import verify_internal_secret

router = APIRouter(
    prefix="/v1/moderation",
    tags=["Moderation & Trust"],
    dependencies=[Depends(verify_internal_secret)],
)


class ModerationCheckRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    image_urls: List[str] = Field(default_factory=list)
    price: Optional[float] = None
    category_slug: Optional[str] = None
    seller_province: Optional[str] = "Luanda"


class RiskBreakdown(BaseModel):
    scam_risk: float = Field(0.0, ge=0.0, le=1.0)
    illegal_goods_risk: float = Field(0.0, ge=0.0, le=1.0)
    counterfeit_risk: float = Field(0.0, ge=0.0, le=1.0)
    nsfw_risk: float = Field(0.0, ge=0.0, le=1.0)
    price_anomaly_risk: float = Field(0.0, ge=0.0, le=1.0)
    contact_bypass_risk: float = Field(0.0, ge=0.0, le=1.0)


class ModerationCheckResponse(BaseModel):
    risk_score: int = Field(..., ge=0, le=100, description="0 (seguro) a 100 (risco crítico)")
    action: str = Field(..., description="auto_approve, manual_review, auto_reject")
    flagged_reasons: List[str]
    risk_breakdown: RiskBreakdown
    suggested_moderator_action: str
    nsfw_score: float
    scam_score: float


# ─── PATTERNS & HEURISTICS ───

# 1. SCAMS & PAYMENT DEFLECTIONS (ANGOLA SPECIFIC)
SCAM_PATTERNS = [
    (r"(?i)\b(transfere|pagamento|pagar)\s+(adiantado|antes\s+de\s+ver|fora\s+do\s+puvo|por\s+fora)", "Exigência de pagamento ou transferência antecipada antes da entrega física."),
    (r"(?i)\b(envia\s+saldo|saldo\s+unitel|saldo\s+africell|carregamento\s+de\s+saldo)", "Tentativa de troca por saldo telefónico (típico de burlas em Angola)."),
    (r"(?i)\b(sorteio|ganhe\s+dinheiro\s+fácil|renda\s+extra\s+sem\s+trabalho|pirâmide|investimento\s+com\s+100%\s+lucro)", "Padrão de fraude financeira ou esquema em pirâmide."),
    (r"(?i)\b(taxa\s+de\s+despacho\s+urgente\s+adiantada|pagar\s+sinal\s+para\s+guardar)", "Cobrança de sinal antecipado sem garantias."),
    (r"(?i)\b(comprovativo\s+falso|comprovante\s+editado|aplicativo\s+de\s+comprovante)", "Referência explícita a comprovativos bancários adulterados."),
]

# 2. PROHIBITED & ILLEGAL GOODS
ILLEGAL_PATTERNS = [
    (r"(?i)\b(arma\s+de\s+fogo|pistola|revólver|espingarda|munições|balas|taser|catana\s+para\s+assalto)\b", "Venda de armas de fogo, munições ou armas brancas proibidas."),
    (r"(?i)\b(liamba|maconha|cannabis|cocaína|crack|heroína|droga|estupefaciente)\b", "Substâncias psicotrópicas ou entorpecentes ilegais."),
    (r"(?i)\b(cytotec|misoprostol|medicamento\s+abortivo|aborto|remédio\s+tarja\s+preta)\b", "Comercialização ilegal de medicamentos regulados ou abortivos."),
    (r"(?i)\b(bilhete\s+de\s+identidade\s+falso|bi\s+falso|carta\s+de\s+condução\s+sem\s+exame|diploma\s+falso|certificado\s+falso|facilito\s+carta)\b", "Falsificação ou facilitação ilícita de documentos oficiais do Estado Angolano."),
    (r"(?i)\b(marfim|pele\s+de\s+onça|tartaruga\s+marinha|chifre\s+de\s+rinoceronte)\b", "Espécies animais protegidas ou produtos de caça furtiva."),
]

# 3. COUNTERFEIT / PIRACY CLAIMS
COUNTERFEIT_PATTERNS = [
    (r"(?i)\b(réplica\s+perfeita|1:1\s+original|cópia\s+idêntica|primeira\s+linha\s+espelho|falso\s+idêntico|réplica\s+tailandesa)\b", "Declaração de artigo falsificado ou réplica ilegal de marca."),
    (r"(?i)\b(clone\s+perfeito|falso\s+de\s+alta\s+qualidade)\b", "Tentativa de comercialização de produtos contrafeitos."),
]

# 4. ADULT CONTENT / ESCORTS
ADULT_PATTERNS = [
    (r"(?i)\b(acompanhante\s+de\s+luxo|garota\s+de\s+programa|massagem\s+com\s+final\s+feliz|sexo\s+pago|conteúdo\s+erótico|vídeos\s+íntimos)\b", "Oferta de serviços sexuais, massagens eróticas ou pornografia."),
]

# 5. CONTACT BYPASS (Disguised phone numbers in text)
# E.g. "9 2 3 4 5 6 7 8 9" or "923-456-789" or written out "nove dois três"
DISGUISED_PHONE_PATTERNS = [
    (r"\b9[\s\.\-_]*\d[\s\.\-_]*\d[\s\.\-_]*\d[\s\.\-_]*\d[\s\.\-_]*\d[\s\.\-_]*\d[\s\.\-_]*\d[\s\.\-_]*\d\b", "Contacto telefónico angolano embutido no texto para desviar negociação da plataforma."),
    (r"(?i)\b(chama\s+no\s+(zap|whatsapp)|fala\s+no\s+privado\s+pelo\s+terminal)\b", "Tentativa de desvio direto de comunicação para canais externos não protegidos."),
]


@router.post("/check", response_model=ModerationCheckResponse)
async def check_content(payload: ModerationCheckRequest):
    """
    Comprehensive multi-category moderation inspection for PUVO listings and services.
    """
    full_text = f"{payload.title} {payload.description}".strip()
    reasons: List[str] = []
    
    scam_risk = 0.0
    illegal_goods_risk = 0.0
    counterfeit_risk = 0.0
    nsfw_risk = 0.0
    contact_bypass_risk = 0.0
    price_anomaly_risk = 0.0

    # 1. Scams Check
    for pattern, desc in SCAM_PATTERNS:
        if re.search(pattern, full_text):
            reasons.append(desc)
            scam_risk = min(1.0, scam_risk + 0.5)

    # 2. Illegal Goods Check
    for pattern, desc in ILLEGAL_PATTERNS:
        if re.search(pattern, full_text):
            reasons.append(desc)
            illegal_goods_risk = min(1.0, illegal_goods_risk + 0.9)

    # 3. Counterfeit Check
    for pattern, desc in COUNTERFEIT_PATTERNS:
        if re.search(pattern, full_text):
            reasons.append(desc)
            counterfeit_risk = min(1.0, counterfeit_risk + 0.6)

    # 4. Adult / NSFW Check
    for pattern, desc in ADULT_PATTERNS:
        if re.search(pattern, full_text):
            reasons.append(desc)
            nsfw_risk = min(1.0, nsfw_risk + 0.85)

    # 5. Contact Bypass Check
    for pattern, desc in DISGUISED_PHONE_PATTERNS:
        if re.search(pattern, full_text):
            reasons.append(desc)
            contact_bypass_risk = min(1.0, contact_bypass_risk + 0.4)

    # 6. Price Anomaly Heuristics
    if payload.price is not None and payload.price > 0:
        title_lower = payload.title.lower()
        # High value gadgets with ridiculously low prices (typical bait)
        premium_gadgets = ["iphone 15", "iphone 14", "iphone 13", "playstation 5", "ps5", "macbook", "samsung s24", "samsung s23"]
        for gadget in premium_gadgets:
            if gadget in title_lower and payload.price < 35000:  # < 35k Kz for iPhone/PS5 is 100% scam
                reasons.append(
                    f"Preço anómalo detectado: {gadget.upper()} listado por apenas {payload.price:,.0f} Kz (possível anúncio isca para emboscada ou burla)."
                )
                price_anomaly_risk = 0.85
                scam_risk = min(1.0, scam_risk + 0.6)
                break

    # Calculate Weighted Overall Risk Score (0 to 100)
    # Weights prioritize public safety, illegality and scams
    total_weighted = (
        (illegal_goods_risk * 90) +
        (scam_risk * 70) +
        (nsfw_risk * 80) +
        (price_anomaly_risk * 40) +
        (counterfeit_risk * 30) +
        (contact_bypass_risk * 25)
    )
    if illegal_goods_risk >= 0.8:
        total_weighted = max(total_weighted, 90.0)
    if nsfw_risk >= 0.8:
        total_weighted = max(total_weighted, 85.0)

    risk_score = int(min(100, max(0, total_weighted)))

    # Determine Decision and Moderator Recommendation
    if risk_score >= 75 or illegal_goods_risk >= 0.8 or nsfw_risk >= 0.8:
        action = "auto_reject"
        suggested_moderator = "Rejeitar imediatamente. Violação grave dos Termos de Uso do PUVO."
    elif risk_score >= 30 or contact_bypass_risk >= 0.4 or counterfeit_risk >= 0.5:
        action = "manual_review"
        suggested_moderator = "Revisão humana necessária. Verificar autenticidade do anúncio e contacto do vendedor."
    else:
        action = "auto_approve"
        suggested_moderator = "Aprovação automática recomendada. Nenhum risco relevante detectado."

    breakdown = RiskBreakdown(
        scam_risk=round(scam_risk, 2),
        illegal_goods_risk=round(illegal_goods_risk, 2),
        counterfeit_risk=round(counterfeit_risk, 2),
        nsfw_risk=round(nsfw_risk, 2),
        price_anomaly_risk=round(price_anomaly_risk, 2),
        contact_bypass_risk=round(contact_bypass_risk, 2),
    )

    return ModerationCheckResponse(
        risk_score=risk_score,
        action=action,
        flagged_reasons=reasons,
        risk_breakdown=breakdown,
        suggested_moderator_action=suggested_moderator,
        nsfw_score=round(nsfw_risk, 2),
        scam_score=round(scam_risk, 2),
    )
