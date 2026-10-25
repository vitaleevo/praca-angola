"""
Public Storefront Chatbot Router – PUVO AI Worker
Handles AI-powered chat for store visitors (no auth required for visitors).
NestJS acts as the auth/session proxy and forwards requests here.
"""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import time

from src.config import settings

from src.modules.guardrails import StorefrontGuardrails

router = APIRouter(prefix="/v1/storefront-chat", tags=["storefront-chatbot"])


def _verify_secret(secret: Optional[str]):
    if secret != settings.ai_internal_secret:
        raise HTTPException(status_code=403, detail="Forbidden")


class ChatRequest(BaseModel):
    visitor_message: str
    conversation_history: list[dict] = []   # [{role: 'visitor'|'ai', content: str}]
    store_name: str = "Loja PUVO"
    store_description: str = ""
    store_categories: list[str] = []
    catalog_summary: list[dict] = []        # [{title, price, category, slug}]
    knowledge_context: str = ""             # Store knowledge base content
    ai_config: dict = {}                    # {provider, model_name, api_key, system_instructions, temperature}
    visitor_province: str = "Luanda"


class ChatResponse(BaseModel):
    ai_reply: str
    suggested_products: list[dict] = []
    should_convert_to_lead: bool = False
    conversion_reason: str = ""
    provider_used: str = ""
    response_time_ms: int = 0
    guardrail_tripped: bool = False
    guardrail_action: str = "allow"
    guardrail_violations: list[dict] = []


@router.post("/reply", response_model=ChatResponse)
async def chatbot_reply(
    req: ChatRequest,
    x_ai_internal_secret: Optional[str] = Header(None),
):
    """Generate AI reply for a public storefront visitor chat with strong guardrails."""
    _verify_secret(x_ai_internal_secret)
    start = time.time()

    # 1. Input Guardrails Inspection
    input_guard = StorefrontGuardrails.inspect_input(
        visitor_message=req.visitor_message,
        store_name=req.store_name,
        visitor_province=req.visitor_province,
    )

    if input_guard.action == "block":
        elapsed_ms = int((time.time() - start) * 1000)
        return ChatResponse(
            ai_reply=input_guard.safe_response or "Mensagem não permitida pelas regras de segurança da loja.",
            suggested_products=[],
            should_convert_to_lead=False,
            conversion_reason="Guardrail de segurança activado",
            provider_used="guardrail-defense",
            response_time_ms=elapsed_ms,
            guardrail_tripped=True,
            guardrail_action="block",
            guardrail_violations=[v.model_dump() for v in input_guard.violations],
        )

    clean_visitor_message = (
        input_guard.sanitized_message if input_guard.action == "sanitize" else req.visitor_message
    )

    # Build system prompt with store context
    system_prompt = _build_system_prompt(req)

    # Build conversation messages
    messages = []
    for msg in req.conversation_history[-10:]:
        role = "assistant" if msg.get("role") == "ai" else "user"
        messages.append({"role": role, "content": msg.get("content", "")})
    messages.append({"role": "user", "content": clean_visitor_message})

    # Extract AI config
    provider = req.ai_config.get("provider", "gemini")
    model_name = req.ai_config.get("model_name", "gemini-1.5-flash")
    api_key = req.ai_config.get("api_key")
    custom_endpoint = req.ai_config.get("custom_endpoint_url")
    temperature = req.ai_config.get("temperature", 0.7)

    # Generate reply via LLM gateway
    ai_reply = ""
    provider_used = provider

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "http://localhost:8000/v1/llm/generate",
                json={
                    "provider": provider,
                    "model_name": model_name,
                    "api_key": api_key,
                    "custom_endpoint_url": custom_endpoint,
                    "system_prompt": system_prompt,
                    "knowledge_context": req.knowledge_context,
                    "messages": messages,
                    "temperature": temperature,
                },
                headers={"X-AI-Internal-Secret": settings.ai_internal_secret},
            )

            if resp.status_code == 200:
                data = resp.json()
                ai_reply = data.get("generated_text", "")
                provider_used = data.get("provider_used", provider)
            else:
                ai_reply = _fallback_reply(req)
                provider_used = f"{provider}-fallback"
    except Exception:
        ai_reply = _fallback_reply(req)
        provider_used = f"{provider}-fallback"

    # 2. Output Guardrails Inspection
    output_guard = StorefrontGuardrails.inspect_output(
        ai_reply=ai_reply,
        store_name=req.store_name,
        catalog_summary=req.catalog_summary,
    )
    final_reply = output_guard.sanitized_reply

    all_violations = [v.model_dump() for v in input_guard.violations] + [
        v.model_dump() for v in output_guard.violations
    ]
    tripped = len(all_violations) > 0
    final_guardrail_action = (
        "block" if output_guard.action == "block" else ("sanitize" if tripped else "allow")
    )

    # Detect lead conversion opportunity
    should_convert, conversion_reason = _detect_lead_conversion(
        clean_visitor_message, req.conversation_history
    )

    # Find relevant products to suggest
    suggested = _find_relevant_products(clean_visitor_message, req.catalog_summary)

    elapsed_ms = int((time.time() - start) * 1000)

    return ChatResponse(
        ai_reply=final_reply,
        suggested_products=suggested,
        should_convert_to_lead=should_convert,
        conversion_reason=conversion_reason,
        provider_used=provider_used,
        response_time_ms=elapsed_ms,
        guardrail_tripped=tripped,
        guardrail_action=final_guardrail_action,
        guardrail_violations=all_violations,
    )


def _build_system_prompt(req: ChatRequest) -> str:
    """Build a comprehensive system prompt for the store chatbot."""
    categories_text = ", ".join(req.store_categories[:10]) if req.store_categories else "variados"

    catalog_lines = []
    for item in req.catalog_summary[:15]:
        title = item.get("title", "Produto")
        price = item.get("price", "consulte")
        catalog_lines.append(f"  - {title} — {price} Kz")
    catalog_text = "\n".join(catalog_lines) if catalog_lines else "  Catálogo disponível na loja."

    custom_instructions = req.ai_config.get("system_instructions", "")

    return f"""És o assistente virtual da loja "{req.store_name}" em Angola.
O teu papel é ajudar visitantes a conhecer os produtos, tirar dúvidas, e guiá-los para uma compra ou contacto com a equipa de vendas.

INSTRUÇÕES DA LOJA:
{custom_instructions or 'Sê cordial, profissional e acolhedor. Responde sempre em português.'}

SOBRE A LOJA:
{req.store_description or f'{req.store_name} é uma loja no marketplace PUVO Angola.'}

CATEGORIAS: {categories_text}

CATÁLOGO EM DESTAQUE:
{catalog_text}

REGRAS IMPORTANTES:
1. Responde SEMPRE em português (variante angolana é preferível)
2. Sê breve e direto — máximo 3-4 frases por resposta
3. Menciona produtos específicos do catálogo quando relevante
4. Se o visitante pedir preço, indica o preço do catálogo
5. Se o visitante quiser comprar, sugere que entre em contacto ou faça a encomenda na plataforma
6. Se o visitante mostrar interesse sério (pedir contacto, preço, disponibilidade), sinalize como lead potencial
7. NUNCA inventa produtos ou preços que não estejam no catálogo
8. Localização de entrega padrão: {req.visitor_province}, Angola
"""


def _fallback_reply(req: ChatRequest) -> str:
    """Contextual fallback reply when AI is unavailable."""
    store_name = req.store_name or "a nossa loja"
    return (
        f"Olá! 👋 Obrigado pelo interesse em {store_name}. "
        f"A nossa equipa está a preparar a melhor resposta para si. "
        f"Enquanto isso, pode explorar o nosso catálogo completo na página da loja. "
        f"Se preferir, deixe o seu contacto e entraremos em contacto consigo em breve!"
    )


def _detect_lead_conversion(message: str, history: list[dict]) -> tuple[bool, str]:
    """Detect if the visitor shows buying intent and should be converted to a CRM lead."""
    msg_lower = message.lower()
    all_messages = " ".join([m.get("content", "") for m in history] + [message]).lower()

    # Strong buying signals
    strong_signals = [
        "quero comprar", "quero encomendar", "como pago", "forma de pagamento",
        "entrega", "quanto custa", "tem disponível", "ainda tem", "reservar",
        "meu contacto", "meu número", "meu telefone", "meu whatsapp",
        "onde entregam", "entregam em", "posso pagar", "multicaixa",
        "enviar para", "quero este", "quero aquele", "vou levar",
    ]

    for signal in strong_signals:
        if signal in msg_lower:
            return True, f"Intenção de compra detectada: '{signal}'"

    # Check if they shared contact info (phone patterns)
    import re
    phone_pattern = re.compile(r'9\d{8}')
    if phone_pattern.search(message):
        return True, "Visitante partilhou número de telefone"

    # Check conversation depth (>4 messages = engaged visitor)
    if len(history) >= 4:
        return True, "Visitante altamente engajado (4+ mensagens)"

    return False, ""


def _find_relevant_products(message: str, catalog: list[dict]) -> list[dict]:
    """Find products from catalog that match the visitor's message."""
    if not catalog:
        return []

    msg_lower = message.lower()
    scored: list[tuple[float, dict]] = []

    for item in catalog:
        title = item.get("title", "").lower()
        category = item.get("category", "").lower()
        score = 0.0

        # Simple keyword matching
        title_words = title.split()
        msg_words = msg_lower.split()

        for word in msg_words:
            if len(word) < 3:
                continue
            if word in title:
                score += 0.3
            if word in category:
                score += 0.2

        if score > 0:
            scored.append((score, item))

    # Sort by relevance
    scored.sort(key=lambda x: -x[0])
    return [item for _, item in scored[:3]]
