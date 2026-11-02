import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmService } from "./crm.service";
import { encryptPrivateValue } from "../auth/auth.crypto";
import { MetaGraphService } from "./meta-graph.service";

const priorKey = process.env.APP_ENCRYPTION_KEY;
afterEach(() => {
  vi.unstubAllGlobals();
  if (priorKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = priorKey;
});

describe("WhatsApp templates", () => {
  it("uses only the connected WABA of the signed-in workspace", async () => {
    process.env.APP_ENCRYPTION_KEY = "whatsapp-template-test-key-long-enough";
    const database = { query: vi.fn().mockResolvedValue({ rows: [{
      meta_waba_id: "123456789012", credentials_ciphertext: encryptPrivateValue(JSON.stringify({ accessToken: "private-token" })),
    }] }) };
    const graph = { createWhatsAppUtilityTemplate: vi.fn().mockResolvedValue({ id: "template-1", status: "PENDING" }) };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);

    const result = await service.createWhatsAppUtilityTemplate("workspace-a", "channel-a", {
      name: "confirmacao_encomenda", language: "pt_PT", body: "A tua encomenda foi confirmada.",
    });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining("workspace_id = $2 AND channel_type = 'whatsapp_cloud'"), ["channel-a", "workspace-a"]);
    expect(graph.createWhatsAppUtilityTemplate).toHaveBeenCalledWith("123456789012", "private-token", "confirmacao_encomenda", "pt_PT", "A tua encomenda foi confirmada.");
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("rejects missing or manually linked WABAs before contacting Meta", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [{ meta_waba_id: null, credentials_ciphertext: "unused" }] }) };
    const graph = { createWhatsAppUtilityTemplate: vi.fn() };
    const service = new CrmService(database as never, {} as never, {} as never, graph as never);
    await expect(service.createWhatsAppUtilityTemplate("workspace-a", "channel-a", {
      name: "confirmacao_encomenda", language: "pt_PT", body: "Encomenda confirmada.",
    })).rejects.toMatchObject({ status: 400 });
    expect(graph.createWhatsAppUtilityTemplate).not.toHaveBeenCalled();
  });

  it("rejects variable placeholders without examples", async () => {
    const database = { query: vi.fn() };
    const service = new CrmService(database as never, {} as never, {} as never, {} as never);
    await expect(service.createWhatsAppUtilityTemplate("workspace-a", "channel-a", {
      name: "confirmacao_encomenda", language: "pt_PT", body: "Olá {{1}}",
    })).rejects.toMatchObject({ status: 400 });
    expect(database.query).not.toHaveBeenCalled();
  });

  it("posts a utility template to the WABA with bearer auth and requires a Meta ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "template-1", status: "PENDING" }) });
    vi.stubGlobal("fetch", fetchMock);
    const graph = new MetaGraphService();
    await expect(graph.createWhatsAppUtilityTemplate("123456789012", "private-token", "confirmacao_encomenda", "pt_PT", "Encomenda confirmada."))
      .resolves.toMatchObject({ id: "template-1", status: "PENDING" });
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/123456789012/message_templates");
    expect(String(url)).not.toContain("private-token");
    expect(request.headers.Authorization).toBe("Bearer private-token");
    expect(JSON.parse(request.body)).toEqual({
      name: "confirmacao_encomenda", language: "pt_PT", category: "UTILITY", allow_category_change: false,
      components: [{ type: "BODY", text: "Encomenda confirmada." }],
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "PENDING" }) });
    await expect(graph.createWhatsAppUtilityTemplate("123456789012", "private-token", "novo_template", "pt_PT", "Texto"))
      .rejects.toMatchObject({ status: 502 });
  });
});
