from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from src.security import verify_internal_secret

router = APIRouter(prefix="/v1/catalog", tags=["Catalog Assist"], dependencies=[Depends(verify_internal_secret)])


class SuggestionRequest(BaseModel):
    image_urls: List[str] = Field(default_factory=list, description="Lista de URLs ou nomes de ficheiros de imagens já enviadas")
    raw_prompt: Optional[str] = Field(None, description="Descrição rápida ou palavras-chave do vendedor")
    province: Optional[str] = Field("Luanda", description="Província de localização")
    municipality: Optional[str] = Field("Luanda", description="Município de localização")


class SuggestionResponse(BaseModel):
    title: str
    description: str
    suggested_price_aoa: float
    category_slug: str
    condition: str  # "new", "used", "refurbished"
    confidence: float
    tags: List[str]


@router.post("/suggest", response_model=SuggestionResponse)
async def suggest_listing(payload: SuggestionRequest):
    """
    Analisa características fornecidas e sugere título comercial, descrição atrativa em português angolano,
    categoria correta do PUVO e estimativa de preço competitivo em Kwanzas (Kz).
    """
    prompt_lower = (payload.raw_prompt or "").lower()
    
    # Heurística inicial inteligente baseada no mercado angolano
    if any(k in prompt_lower for k in ["sofa", "sofá", "sala", "mesa", "cadeira", "móvel", "movel"]):
        category = "casa-mobiliario"
        title = "Sofá Conforto Clássico para Sala" if "sofa" in prompt_lower or "sofá" in prompt_lower else "Mobiliário Elegante para Casa"
        desc = "Excelente peça de mobiliário com acabamento de alta qualidade. Ideal para salas de estar ou escritórios em Luanda. Estrutura sólida, tecido resistente e muito confortável."
        price = 280000.0
    elif any(k in prompt_lower for k in ["iphone", "samsung", "telemovel", "telemóvel", "telefone", "smartphone"]):
        category = "telemoveis-tecnologia"
        title = "Smartphone Moderno com Alto Desempenho"
        desc = "Aparelho em excelente estado de funcionamento, bateria com boa autonomia e câmara de alta resolução. Acompanha acessórios essenciais. Pronto a usar com redes nacionais (Unitel / Africell / Movicel)."
        price = 150000.0
    elif any(k in prompt_lower for k in ["roupa", "vestido", "camisa", "calca", "calça", "sapato", "tenis", "ténis"]):
        category = "moda-acessorios"
        title = "Artigo de Moda com Estilo e Conforto"
        desc = "Peça elegante e versátil, perfeita para o dia a dia ou ocasiões especiais. Tecido fresco e durável, com excelente caimento."
        price = 25000.0
    else:
        category = "outros"
        title = payload.raw_prompt.capitalize() if payload.raw_prompt else "Produto de Qualidade PUVO"
        desc = "Artigo em ótimo estado de conservação, disponível para entrega ou levantamento imediato. Vendedor verificado na plataforma PUVO."
        price = 45000.0

    return SuggestionResponse(
        title=title,
        description=desc,
        suggested_price_aoa=price,
        category_slug=category,
        condition="new" if "novo" in prompt_lower else "used",
        confidence=0.88,
        tags=["qualidade", "luanda", "entrega-rapida"],
    )
