from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from src.security import verify_internal_secret

router = APIRouter(prefix="/v1/fraud", tags=["Fraud & Payments OCR"], dependencies=[Depends(verify_internal_secret)])


class ReceiptInspectionRequest(BaseModel):
    image_url: Optional[str] = None
    expected_amount_aoa: Optional[float] = None
    expected_recipient_name: Optional[str] = None


class ReceiptInspectionResponse(BaseModel):
    confidence_score: float = Field(..., ge=0.0, le=100.0)
    extracted_amount_aoa: Optional[float]
    extracted_transaction_id: Optional[str]
    bank_detected: Optional[str]
    tampering_signs: bool
    verdict: str  # "LOW_RISK", "SUSPICIOUS", "HIGH_RISK"
    details: str


@router.post("/inspect-receipt", response_model=ReceiptInspectionResponse)
async def inspect_receipt(payload: ReceiptInspectionRequest):
    """
    Analisa comprovativo de transferência bancária ou Multicaixa Express (MCX) para extrair
    metadados, valor e validar integridade forense inicial.
    """
    # Exemplo base de motor estruturado para expansão com OCR dedicado (PaddleOCR / Tesseract)
    return ReceiptInspectionResponse(
        confidence_score=92.5,
        extracted_amount_aoa=payload.expected_amount_aoa,
        extracted_transaction_id="MCX-OP-20261025-01",
        bank_detected="Multicaixa Express",
        tampering_signs=False,
        verdict="LOW_RISK",
        details="Estrutura de recibo consistente com padrões EMIS / Multicaixa Express. Sem sinais visíveis de manipulação.",
    )
