import logging
import os
import httpx
from urllib.parse import urlsplit
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from src.security import verify_internal_secret

logger = logging.getLogger("puvo_ai.llm_gateway")

router = APIRouter(prefix="/v1/llm", tags=["LLM Gateway"])


def allowed_custom_endpoint(endpoint: str) -> str | None:
    """Only administrators can enable HTTPS custom AI hosts via environment config."""
    allowed_hosts = {host.strip().lower() for host in os.getenv("CUSTOM_AI_ALLOWED_HOSTS", "").split(",") if host.strip()}
    try:
        parsed = urlsplit(endpoint)
        host = parsed.hostname.lower() if parsed.hostname else ""
        if parsed.scheme != "https" or host not in allowed_hosts or parsed.username or parsed.password or parsed.fragment:
            return None
        if parsed.port not in (None, 443):
            return None
        if not parsed.netloc or parsed.path not in ("", "/", "/chat/completions") or parsed.query:
            return None
        return f"https://{host}{'/chat/completions' if parsed.path in ('', '/') else parsed.path}"
    except ValueError:
        return None


class ChatMessage(BaseModel):
    role: str = Field(description="Role: user, assistant, system")
    content: str = Field(description="Message text content")


class LLMGenerateRequest(BaseModel):
    provider: str = Field(default="gemini", description="Provider: gemini, openai, claude, openrouter, custom")
    model_name: str = Field(default="gemini-1.5-flash", description="Model identifier")
    api_key: Optional[str] = Field(default=None, description="Decrypted API key of the user/store")
    custom_endpoint_url: Optional[str] = Field(default=None, description="Custom endpoint for openrouter or custom/vps")
    system_prompt: str = Field(default="És o assistente virtual de vendas desta loja em Angola.", description="Base system instructions")
    knowledge_context: Optional[str] = Field(default="", description="Knowledge base fed by the user/store (FAQ, policies, catalog)")
    messages: List[ChatMessage] = Field(description="Conversation history")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)


class LLMGenerateResponse(BaseModel):
    generated_text: str
    provider_used: str
    model_used: str
    is_fallback: bool = False
    tokens_used: Optional[int] = None


@router.post("/generate", response_model=LLMGenerateResponse)
async def generate_response(
    req: LLMGenerateRequest,
    authenticated: bool = Depends(verify_internal_secret),
):
    provider = req.provider.lower().strip()
    full_system_prompt = req.system_prompt
    if req.knowledge_context and req.knowledge_context.strip():
        full_system_prompt += (
            f"\n\n--- BASE DE CONHECIMENTO DA LOJA (DADOS REAIS E OFICIAIS) ---\n"
            f"{req.knowledge_context.strip()}\n"
            f"--- FIM DA BASE DE CONHECIMENTO ---\n"
            f"Usa as informações acima com prioridade para responder ao cliente."
        )

    last_user_message = next((m.content for m in reversed(req.messages) if m.role == "user"), "")

    # 1. Google Gemini
    if provider == "gemini" and req.api_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{req.model_name}:generateContent?key={req.api_key}"
            gemini_contents = []
            for m in req.messages:
                role = "user" if m.role == "user" else "model"
                gemini_contents.append({"role": role, "parts": [{"text": m.content}]})

            payload = {
                "system_instruction": {"parts": [{"text": full_system_prompt}]},
                "contents": gemini_contents,
                "generationConfig": {"temperature": req.temperature, "maxOutputTokens": 1024},
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidate = data.get("candidates", [{}])[0]
                    content = candidate.get("content", {})
                    parts = content.get("parts", [{}])
                    generated = parts[0].get("text", "")
                    if generated:
                        return LLMGenerateResponse(
                            generated_text=generated.strip(),
                            provider_used="gemini",
                            model_used=req.model_name,
                        )
                logger.warning(f"Gemini API returned status {res.status_code}: {res.text}")
        except Exception as exc:
            logger.error(f"Error calling Gemini API: {exc}")

    # 2. OpenAI
    elif provider == "openai" and req.api_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {req.api_key}",
                "Content-Type": "application/json",
            }
            openai_msgs = [{"role": "system", "content": full_system_prompt}]
            for m in req.messages:
                openai_msgs.append({"role": m.role, "content": m.content})

            payload = {
                "model": req.model_name,
                "messages": openai_msgs,
                "temperature": req.temperature,
                "max_tokens": 1024,
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [{}])
                    msg = choices[0].get("message", {})
                    text = msg.get("content", "")
                    if text:
                        return LLMGenerateResponse(
                            generated_text=text.strip(),
                            provider_used="openai",
                            model_used=req.model_name,
                            tokens_used=data.get("usage", {}).get("total_tokens"),
                        )
                logger.warning(f"OpenAI API returned status {res.status_code}: {res.text}")
        except Exception as exc:
            logger.error(f"Error calling OpenAI API: {exc}")

    # 3. Anthropic Claude
    elif provider == "claude" and req.api_key:
        try:
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": req.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            claude_msgs = []
            for m in req.messages:
                role = "user" if m.role == "user" else "assistant"
                claude_msgs.append({"role": role, "content": m.content})

            payload = {
                "model": req.model_name,
                "system": full_system_prompt,
                "messages": claude_msgs,
                "max_tokens": 1024,
                "temperature": req.temperature,
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    blocks = data.get("content", [{}])
                    text = blocks[0].get("text", "")
                    if text:
                        return LLMGenerateResponse(
                            generated_text=text.strip(),
                            provider_used="claude",
                            model_used=req.model_name,
                        )
                logger.warning(f"Claude API returned status {res.status_code}: {res.text}")
        except Exception as exc:
            logger.error(f"Error calling Claude API: {exc}")

    # 4. OpenRouter
    elif provider == "openrouter" and req.api_key:
        try:
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {req.api_key}",
                "HTTP-Referer": "https://puvo.ao",
                "X-Title": "PUVO Marketplace Angola",
                "Content-Type": "application/json",
            }
            router_msgs = [{"role": "system", "content": full_system_prompt}]
            for m in req.messages:
                router_msgs.append({"role": m.role, "content": m.content})

            payload = {
                "model": req.model_name,
                "messages": router_msgs,
                "temperature": req.temperature,
                "max_tokens": 1024,
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [{}])
                    msg = choices[0].get("message", {})
                    text = msg.get("content", "")
                    if text:
                        return LLMGenerateResponse(
                            generated_text=text.strip(),
                            provider_used="openrouter",
                            model_used=req.model_name,
                        )
                logger.warning(f"OpenRouter API returned status {res.status_code}: {res.text}")
        except Exception as exc:
            logger.error(f"Error calling OpenRouter API: {exc}")

    # 5. Personalizado / Custom (Ollama, LMStudio, VPS própria)
    elif provider == "custom" and req.custom_endpoint_url:
        try:
            url = allowed_custom_endpoint(req.custom_endpoint_url)
            if not url:
                raise ValueError("Custom AI destination is not allowed")
            headers = {"Content-Type": "application/json"}
            if req.api_key:
                headers["Authorization"] = f"Bearer {req.api_key}"

            custom_msgs = [{"role": "system", "content": full_system_prompt}]
            for m in req.messages:
                custom_msgs.append({"role": m.role, "content": m.content})

            payload = {
                "model": req.model_name,
                "messages": custom_msgs,
                "temperature": req.temperature,
                "max_tokens": 1024,
            }

            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [{}])
                    msg = choices[0].get("message", {})
                    text = msg.get("content", "")
                    if text:
                        return LLMGenerateResponse(
                            generated_text=text.strip(),
                            provider_used="custom",
                            model_used=req.model_name,
                        )
                logger.warning(f"Custom endpoint returned status {res.status_code}: {res.text}")
        except Exception as exc:
            logger.error(f"Error calling Custom endpoint: {exc}")

    # --- Graceful Contextual Fallback for Angolan Market ---
    # Used when API key is missing, invalid, or external LLM service is offline
    fallback_text = (
        "Olá! Agradecemos o teu contacto. "
        "Recebemos a tua mensagem e estamos aqui para te ajudar com todo o gosto. "
    )

    if req.knowledge_context and req.knowledge_context.strip():
        # Inject matching knowledge snippet if available
        snippet = req.knowledge_context.strip().split("\n")[0][:140]
        fallback_text += f"\n\nInformação da nossa loja: {snippet}...\n"
    
    fallback_text += (
        "Qualquer dúvida sobre entregas em Luanda, províncias ou pagamento por Multicaixa Express, "
        "indica-nos que confirmamos de imediato!"
    )

    return LLMGenerateResponse(
        generated_text=fallback_text,
        provider_used=f"{provider}-fallback",
        model_used=req.model_name,
        is_fallback=True,
    )
