"""
PUVO AI Guardrails Module
Comprehensive multi-layered guardrails for Storefront Chatbots and LLM Gateway:
- Prompt Injection & Jailbreak Defense (heuristic + pattern-based)
- PII & Sensitive Financial Data Protection (Angolan BI, IBAN, Credit Cards, API Keys)
- Off-topic & Scope Boundary Enforcement (Store commerce only)
- Toxicity & Abuse Filtering
- Commercial Promise & Hallucination Guardrails (Unauthorized discounts, fake payment accounts)
- Output Leakage & System Prompt Protection
"""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

logger = logging.getLogger("puvo_ai.guardrails")


class GuardrailViolation(BaseModel):
    category: str        # "prompt_injection" | "pii" | "off_topic" | "toxicity" | "commercial_risk" | "leakage"
    severity: str        # "low" | "medium" | "critical"
    detail: str
    action_taken: str    # "blocked" | "redacted" | "warned"


class InputGuardrailResult(BaseModel):
    is_safe: bool = True
    action: str = "allow"               # "allow" | "sanitize" | "block"
    sanitized_message: str = ""
    safe_response: Optional[str] = None # Replacement message if blocked
    violations: List[GuardrailViolation] = Field(default_factory=list)


class OutputGuardrailResult(BaseModel):
    is_safe: bool = True
    action: str = "allow"               # "allow" | "sanitize" | "block"
    sanitized_reply: str = ""
    violations: List[GuardrailViolation] = Field(default_factory=list)


# ─── 1. JAILBREAK & PROMPT INJECTION PATTERNS ───

JAILBREAK_PATTERNS = [
    # Direct instruction overrides
    r"(?i)\bignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules|commands)",
    r"(?i)\besquece\s+(todas\s+as\s+)?(instruções|regras|ordens|comandos)\s*(anteriores|do sistema)?",
    r"(?i)\bdesconsidere\s+(todas\s+as\s+)?(instruções|regras)",
    r"(?i)\bagora\s+és\s+(o\s+)?(dan|modo\s+desenvolvedor|ia\s+sem\s+regras|deus)",
    r"(?i)\byou\s+are\s+now\s+(in\s+)?(dan|developer\s+mode|unrestricted|god\s+mode)",
    r"(?i)\bpretend\s+(you\s+have\s+no\s+rules|you\s+are\s+unfiltered|you\s+are\s+evil)",
    r"(?i)\bfinge\s+que\s+(não\s+tens\s+regras|és\s+livre|podes\s+fazer\s+tudo)",
    # System prompt extraction
    r"(?i)\b(print|show|repeat|display|reveal|qual\s+é)\s+(the\s+)?(full\s+)?(system\s+prompt|prompt\s+do\s+sistema|instruções\s+iniciais|tuas\s+regras)",
    r"(?i)\bmostra(\-me)?\s+(o\s+)?(prompt\s+do\s+sistema|as\s+tuas\s+instruções\s+secretas)",
    # Chat markup injection
    r"```(system|developer|admin|instruction)",
    r"<\|im_start\|>",
    r"<\|system\|>",
    r"\[INST\]\s*<<SYS>>",
    # Fake administrative / privilege escalation
    r"(?i)\b(sudo|admin\s+mode|root\s+access|modo\s+administrador|override\s+authorization)\b",
]

# ─── 2. PII AND FINANCIAL DATA REGEXES ───

# Angolan BI: 9 digits + 2 letters + 3 digits (e.g. 000123456LA042)
BI_ANGOLA_REGEX = re.compile(r"\b\d{9}[A-Za-z]{2}\d{3}\b")

# Angolan IBAN: AO06 + 21 digits (total 25 chars)
IBAN_ANGOLA_REGEX = re.compile(r"\bAO06[\s\.\-]?(?:\d[\s\.\-]?){21}\b", re.IGNORECASE)

# Credit / Debit Cards (13 to 19 digits)
CREDIT_CARD_REGEX = re.compile(r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b")

# API Keys and Secret Tokens
API_KEY_REGEX = re.compile(r"\b(?:sk-[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z-_]{35}|ghp_[a-zA-Z0-9]{36}|bearer\s+[a-zA-Z0-9\._\-]{30,})\b", re.IGNORECASE)

# Passwords in plain text
PASSWORD_IN_TEXT_REGEX = re.compile(r"(?i)\b(senha|password|palavra-passe|pin\s+do\s+banco)\s*[:=]\s*\S+")


# ─── 3. OFF-TOPIC AND OUT-OF-BOUNDS CONTENT ───

OFF_TOPIC_PATTERNS = [
    # Hacking / Cyberattacks
    (
        r"(?i)\b(como\s+(hackear|invadir|fazer\s+ddos|roubar\s+conta|burlar)|sql\s+injection|exploit|xss\s+payload)\b",
        "Tentativa de assistência a ataques informáticos ou burlas.",
    ),
    # Illegal Drugs / Weapons
    (
        r"(?i)\b(comprar\s+(arma|droga|liamba|cocaína|heroína|revolver|pistola|munições|bala))\b",
        "Artigos estritamente proibidos e ilegais pela legislação angolana.",
    ),
    # Coding assistant requests (Chatbot is not ChatGPT for code)
    (
        r"(?i)\b(escreve\s+um\s+(código|script|programa|algoritmo)\s+(em|python|javascript|c\+\+|html|php)|write\s+code\s+for)\b",
        "Pedido fora de âmbito (geração de código técnico geral).",
    ),
    # Partisan Political debates or sensitive religious disputes
    (
        r"(?i)\b(qual\s+partido\s+é\s+melhor|quem\s+deve\s+ganhar\s+as\s+eleições|mpla\s+vs\s+unita|votar\s+em\s+quem)\b",
        "Debates partidários fora de âmbito do comércio da loja.",
    ),
]


# ─── 4. COMMERCIAL RISK & UNAUTHORIZED COMMITMENTS ───

UNAUTHORIZED_DISCOUNT_PATTERNS = [
    r"(?i)\b(dou(\-te)?|faço\s+por|desconto\s+de)\s+(50|60|70|80|90|95)\s*%",
    r"(?i)\b(leva\s+de\s+graça|é\s+completamente\s+grátis|não\s+precisas\s+de\s+pagar\s+nada)\b",
    r"(?i)\b(podes\s+pagar\s+só\s+metade|garanto\s+preço\s+zero)\b",
]

SUSPICIOUS_PAYMENT_DEFLECTION_PATTERNS = [
    r"(?i)\b(deposita\s+na\s+minha\s+conta\s+pessoal|manda\s+no\s+meu\s+express\s+privado|não\s+uses\s+a\s+plataforma)\b",
    r"(?i)\b(paga\s+fora\s+do\s+puvo|transfere\s+por\s+fora|vamos\s+evitar\s+o\s+site)\b",
]


class StorefrontGuardrails:
    """Multi-tiered Guardrails Engine for the PUVO E-commerce Chatbots."""

    @classmethod
    def inspect_input(
        cls,
        visitor_message: str,
        store_name: str = "Loja",
        visitor_province: str = "Luanda",
    ) -> InputGuardrailResult:
        """
        Runs complete input checks before sending prompt to the LLM.
        Returns InputGuardrailResult with action (allow, sanitize, block).
        """
        violations: List[GuardrailViolation] = []
        raw = visitor_message.strip()

        # 0. Size guard
        if len(raw) > 2000:
            return InputGuardrailResult(
                is_safe=False,
                action="block",
                safe_response="A sua mensagem é demasiado longa. Por favor, seja mais breve para podermos ajudar.",
                violations=[
                    GuardrailViolation(
                        category="flood",
                        severity="medium",
                        detail="Mensagem excede o limite máximo permitido de 2000 caracteres.",
                        action_taken="blocked",
                    )
                ],
            )

        # 1. Jailbreak & Prompt Injection Check
        for pattern in JAILBREAK_PATTERNS:
            if re.search(pattern, raw):
                violations.append(
                    GuardrailViolation(
                        category="prompt_injection",
                        severity="critical",
                        detail=f"Padrão suspeito de jailbreak/injeção detectado: '{pattern}'",
                        action_taken="blocked",
                    )
                )
                safe_rep = (
                    f"Olá! Sou o assistente virtual da {store_name} no PUVO Angola. "
                    f"Estou configurado exclusivamente para tirar dúvidas sobre os nossos produtos, "
                    f"preços e entregas na província de {visitor_province}. "
                    f"Como posso ajudar relativamente às suas compras?"
                )
                return InputGuardrailResult(
                    is_safe=False,
                    action="block",
                    safe_response=safe_rep,
                    violations=violations,
                )

        # 2. Off-Topic & Scope Check
        for pattern, reason in OFF_TOPIC_PATTERNS:
            if re.search(pattern, raw):
                violations.append(
                    GuardrailViolation(
                        category="off_topic",
                        severity="medium",
                        detail=reason,
                        action_taken="blocked",
                    )
                )
                safe_rep = (
                    f"Como assistente oficial da {store_name}, o meu âmbito está restrito ao "
                    f"atendimento comercial da nossa loja e produtos disponíveis no PUVO. "
                    f"Tem alguma dúvida sobre artigos, preços ou opções de entrega?"
                )
                return InputGuardrailResult(
                    is_safe=False,
                    action="block",
                    safe_response=safe_rep,
                    violations=violations,
                )

        # 3. PII & Financial Redaction
        sanitized = raw
        has_pii = False

        if BI_ANGOLA_REGEX.search(sanitized):
            sanitized = BI_ANGOLA_REGEX.sub("[BI_ANGOLA_PROTEGIDO]", sanitized)
            violations.append(
                GuardrailViolation(
                    category="pii",
                    severity="high",
                    detail="Número de Bilhete de Identidade (BI) angolano detectado e mascarado para segurança.",
                    action_taken="redacted",
                )
            )
            has_pii = True

        if IBAN_ANGOLA_REGEX.search(sanitized):
            sanitized = IBAN_ANGOLA_REGEX.sub("[IBAN_PROTEGIDO]", sanitized)
            violations.append(
                GuardrailViolation(
                    category="pii",
                    severity="high",
                    detail="IBAN bancário detectado e mascarado.",
                    action_taken="redacted",
                )
            )
            has_pii = True

        if CREDIT_CARD_REGEX.search(sanitized):
            sanitized = CREDIT_CARD_REGEX.sub("[CARTAO_PROTEGIDO]", sanitized)
            violations.append(
                GuardrailViolation(
                    category="pii",
                    severity="critical",
                    detail="Número de cartão de pagamento detectado e mascarado.",
                    action_taken="redacted",
                )
            )
            has_pii = True

        if API_KEY_REGEX.search(sanitized):
            sanitized = API_KEY_REGEX.sub("[CHAVE_API_PROTEGIDA]", sanitized)
            violations.append(
                GuardrailViolation(
                    category="pii",
                    severity="critical",
                    detail="Chave ou token de API detectado e mascarado.",
                    action_taken="redacted",
                )
            )
            has_pii = True

        if PASSWORD_IN_TEXT_REGEX.search(sanitized):
            sanitized = PASSWORD_IN_TEXT_REGEX.sub("[SENHA_OCULTADA]", sanitized)
            violations.append(
                GuardrailViolation(
                    category="pii",
                    severity="critical",
                    detail="Credencial ou senha detectada no texto.",
                    action_taken="redacted",
                )
            )
            has_pii = True

        action = "sanitize" if has_pii else "allow"
        return InputGuardrailResult(
            is_safe=True,
            action=action,
            sanitized_message=sanitized,
            safe_response=None,
            violations=violations,
        )

    @classmethod
    def inspect_output(
        cls,
        ai_reply: str,
        store_name: str = "Loja",
        catalog_summary: Optional[List[Dict[str, Any]]] = None,
    ) -> OutputGuardrailResult:
        """
        Validates LLM generated response before sending to visitor.
        Catches unauthorized promises, system prompt leaks, or payment deflections.
        """
        violations: List[GuardrailViolation] = []
        sanitized = ai_reply.strip()

        # 1. System Prompt Leak Check
        leak_indicators = [
            "És o assistente virtual da loja",
            "INSTRUÇÕES DA LOJA:",
            "CATÁLOGO EM DESTAQUE:",
            "BASE DE CONHECIMENTO DA LOJA (DADOS REAIS",
            "--- FIM DA BASE DE CONHECIMENTO ---",
            "REGRAS IMPORTANTES:",
            "X-AI-Internal-Secret",
        ]
        for indicator in leak_indicators:
            if indicator.lower() in sanitized.lower():
                violations.append(
                    GuardrailViolation(
                        category="leakage",
                        severity="critical",
                        detail=f"Vazamento acidental de instrução interna/sistema: '{indicator}'",
                        action_taken="blocked",
                    )
                )
                safe_fallback = (
                    f"Olá! O catálogo da {store_name} está disponível com os preços oficiais. "
                    f"Em que produto tem interesse para eu poder ajudar?"
                )
                return OutputGuardrailResult(
                    is_safe=False,
                    action="block",
                    sanitized_reply=safe_fallback,
                    violations=violations,
                )

        # 2. Unauthorized Outrageous Discount Checks
        for pattern in UNAUTHORIZED_DISCOUNT_PATTERNS:
            if re.search(pattern, sanitized):
                violations.append(
                    GuardrailViolation(
                        category="commercial_risk",
                        severity="high",
                        detail=f"Promessa de desconto não autorizado pelo vendedor: '{pattern}'",
                        action_taken="sanitize",
                    )
                )
                # Soften promise to confirm with seller
                sanitized = re.sub(
                    pattern,
                    "possíveis condições promocionais sob consulta com o vendedor",
                    sanitized,
                )

        # 3. Off-platform Payment Deflection in AI output
        for pattern in SUSPICIOUS_PAYMENT_DEFLECTION_PATTERNS:
            if re.search(pattern, sanitized):
                violations.append(
                    GuardrailViolation(
                        category="commercial_risk",
                        severity="critical",
                        detail="Tentativa do modelo sugerir pagamentos desprotegidos fora da plataforma.",
                        action_taken="blocked",
                    )
                )
                safe_fallback = (
                    f"Para sua segurança e garantia, todas as compras na {store_name} são geridas "
                    f"através do PUVO Angola com Multicaixa Express ou transferência bancária confirmada. "
                    f"Deseja apoio para encomendar este artigo?"
                )
                return OutputGuardrailResult(
                    is_safe=False,
                    action="block",
                    sanitized_reply=safe_fallback,
                    violations=violations,
                )

        # 4. Check for leaked API Keys in output
        if API_KEY_REGEX.search(sanitized):
            sanitized = API_KEY_REGEX.sub("[TOKEN_REMOVIDO]", sanitized)
            violations.append(
                GuardrailViolation(
                    category="leakage",
                    severity="critical",
                    detail="Chave de API presente na resposta gerada pelo modelo.",
                    action_taken="redacted",
                )
            )

        return OutputGuardrailResult(
            is_safe=len(violations) == 0 or all(v.severity != "critical" for v in violations),
            action="sanitize" if violations else "allow",
            sanitized_reply=sanitized,
            violations=violations,
        )
