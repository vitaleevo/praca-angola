import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmService } from "./crm.service";
import { decryptPrivateValue, encryptPrivateValue } from "../auth/auth.crypto";

const originalKey = process.env.APP_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = originalKey;
});

describe("CRM store isolation", () => {
  it("resolves the workspace from the active store and assigns a new workspace to the store owner", async () => {
    const client = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: "workspace-b", owner_user_id: "owner-b", seller_profile_id: "store-b",
        professional_profile_id: null, name: "CRM B", settings: {}, created_at: new Date(),
      }] })
      .mockResolvedValueOnce({ rows: [{ id: "pipeline-b" }] })
      .mockResolvedValue({ rows: [] }) };
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "store-b", display_name: "Loja B", owner_user_id: "owner-b" }] })
        .mockResolvedValueOnce({ rows: [] }),
      transaction: vi.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)),
    };
    const service = new CrmService(database as never, {} as never, { fireTrigger: vi.fn() } as never, {} as never);

    const workspace = await service.resolveWorkspaceForUser("member-a", "store-b");

    expect(workspace.seller_profile_id).toBe("store-b");
    expect(database.query).toHaveBeenNthCalledWith(1, expect.stringContaining("$2::uuid"), ["member-a", "store-b"]);
    expect(client.query.mock.calls[0][1]).toEqual(["owner-b", "store-b", expect.any(String)]);
  });

  it("reads active payment methods from seller_payment_methods before sending payment details", async () => {
    process.env.APP_ENCRYPTION_KEY = "crm-payment-test-key-with-at-least-32-characters";
    const name = encryptPrivateValue("Titular Teste");
    const identifier = encryptPrivateValue("AO06000600000123456789012");
    const provider = encryptPrivateValue("Banco Teste");
    const database = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ seller_profile_id: "store-1" }] })
      .mockResolvedValueOnce({ rows: [{
        method: "manual_bank_transfer",
        recipient_name_ciphertext: name,
        recipient_identifier_ciphertext: identifier,
        provider_name_ciphertext: provider,
      }] }) };
    const service = new CrmService(database as never, {} as never, { fireTrigger: vi.fn() } as never, {} as never);
    const send = vi.spyOn(service, "sendMessage").mockResolvedValue({ id: "message-1" } as never);

    await service.sendPaymentDetails("workspace-1", "conversation-1", "user-1");

    expect(database.query.mock.calls[1][0]).toContain("FROM seller_payment_methods");
    expect(database.query.mock.calls[1][0]).not.toContain("seller_payment_destinations");
    expect(send).toHaveBeenCalledWith("workspace-1", "conversation-1", "user-1", expect.objectContaining({
      messageType: "payment_request",
      content: expect.stringContaining("AO06000600000123456789012"),
    }));
    expect(decryptPrivateValue(name)).toBe("Titular Teste");
  });
});
