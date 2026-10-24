"use client";

import { useState } from "react";

type SellerPaymentMethod = {
  method: "manual_multicaixa_express_transfer" | "manual_bank_transfer";
  enabled: boolean;
  configured: boolean;
  recipientName: string | null;
  providerName: string | null;
  maskedIdentifier: string;
};

type Props = {
  paymentMethods: SellerPaymentMethod[];
  hasPaymentDestination: boolean;
  maskedPhone?: string | null;
  mcxEnabled: boolean;
  setMcxEnabled: (enabled: boolean) => void;
  bankTransferEnabled: boolean;
  setBankTransferEnabled: (enabled: boolean) => void;
};

export function SellerPaymentSettingsFields({
  paymentMethods,
  hasPaymentDestination,
  maskedPhone,
  mcxEnabled,
  setMcxEnabled,
  bankTransferEnabled,
  setBankTransferEnabled,
}: Props) {
  const [clearMcx, setClearMcx] = useState(false);
  const [clearBank, setClearBank] = useState(false);
  const mcx = paymentMethods.find((method) => method.method === "manual_multicaixa_express_transfer");
  const bank = paymentMethods.find((method) => method.method === "manual_bank_transfer");
  const mcxConfigured = Boolean(mcx?.configured || hasPaymentDestination);

  return (
    <fieldset className="store-settings-group form-span">
      <legend>Métodos de pagamento</legend>
      <p>Ativa apenas os métodos que a loja consegue receber. Os dados ficam privados e são mostrados ao comprador depois da encomenda.</p>

      <label className="checkbox-label">
        <input
          type="checkbox"
          name="mcxEnabled"
          checked={mcxEnabled}
          onChange={(event) => {
            setMcxEnabled(event.target.checked);
            if (event.target.checked) setClearMcx(false);
          }}
        />
        Aceitar Multicaixa Express
      </label>
      <label>Nome do destinatário
        <input
          name="mcxRecipientName"
          autoComplete="off"
          maxLength={100}
          required={mcxEnabled && !mcxConfigured}
          placeholder={mcxConfigured ? `Guardado: ${mcx?.recipientName ?? "nome configurado"} · deixa vazio para manter` : "Nome registado no Multicaixa Express"}
        />
      </label>
      <label>Número Multicaixa Express
        <input
          name="mcxPhone"
          autoComplete="off"
          inputMode="tel"
          pattern="(\+244)?9[0-9]{8}"
          required={mcxEnabled && !mcxConfigured}
          placeholder={hasPaymentDestination ? maskedPhone ?? "•••• · deixa vazio para manter" : "9xxxxxxxx ou +2449xxxxxxxx"}
        />
      </label>
      {hasPaymentDestination && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="clearPaymentDestination"
            checked={clearMcx}
            onChange={(event) => {
              setClearMcx(event.target.checked);
              if (event.target.checked) setMcxEnabled(false);
            }}
          />
          Apagar os dados Multicaixa Express guardados
        </label>
      )}

      <hr />

      <label className="checkbox-label">
        <input
          type="checkbox"
          name="bankTransferEnabled"
          checked={bankTransferEnabled}
          onChange={(event) => {
            setBankTransferEnabled(event.target.checked);
            if (event.target.checked) setClearBank(false);
          }}
        />
        Aceitar transferência bancária
      </label>
      <label>Banco
        <input
          name="bankName"
          autoComplete="off"
          maxLength={100}
          required={bankTransferEnabled && !bank?.configured}
          placeholder={bank?.configured ? `Guardado: ${bank.providerName ?? "banco configurado"} · deixa vazio para manter` : "Nome do banco"}
        />
      </label>
      <label>Titular da conta
        <input
          name="bankAccountHolder"
          autoComplete="off"
          maxLength={100}
          required={bankTransferEnabled && !bank?.configured}
          placeholder={bank?.configured ? `Guardado: ${bank.recipientName ?? "titular configurado"} · deixa vazio para manter` : "Nome registado na conta bancária"}
        />
      </label>
      <label>IBAN ou número da conta
        <input
          name="bankAccountIdentifier"
          autoComplete="off"
          maxLength={64}
          minLength={5}
          required={bankTransferEnabled && !bank?.configured}
          placeholder={bank?.configured ? `Guardado: ${bank.maskedIdentifier} · deixa vazio para manter` : "Indica o IBAN ou número de conta"}
        />
      </label>
      {bank?.configured && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="clearBankTransfer"
            checked={clearBank}
            onChange={(event) => {
              setClearBank(event.target.checked);
              if (event.target.checked) setBankTransferEnabled(false);
            }}
          />
          Apagar os dados bancários guardados
        </label>
      )}
      <small>Os dados bancários são cifrados. A PUVO não recebe nem guarda o valor da transferência.</small>
    </fieldset>
  );
}
