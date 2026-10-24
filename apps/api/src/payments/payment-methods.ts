export const MANUAL_PAYMENT_METHODS = [
  "manual_multicaixa_express_transfer",
  "manual_bank_transfer",
] as const;

export type ManualPaymentMethod = typeof MANUAL_PAYMENT_METHODS[number];

export type PaymentDestinationSnapshot = {
  recipientName: string;
  recipientIdentifier: string;
  providerName: string | null;
};

export function paymentMethodLabel(method: ManualPaymentMethod): string {
  return method === "manual_bank_transfer" ? "Transferência bancária" : "Multicaixa Express";
}

export function maskPaymentIdentifier(value: string): string {
  return `•••• ${value.slice(-4)}`;
}
