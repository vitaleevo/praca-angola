import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { CrmWebhooksController } from "./crm-webhooks.controller";

const originalSecret = process.env.META_APP_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = originalSecret;
});

describe("Meta webhook authentication", () => {
  const controller = new CrmWebhooksController({} as never, {} as never);
  const rawBody = Buffer.from('{"entry":[]}');

  it("fails closed when the app secret is not configured", async () => {
    delete process.env.META_APP_SECRET;
    await expect(controller.handleMetaWebhook({}, { rawBody, header: () => undefined } as never))
      .rejects.toMatchObject({ status: 503 });
  });

  it("rejects missing and invalid signatures", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    await expect(controller.handleMetaWebhook({}, { rawBody, header: () => undefined } as never))
      .rejects.toMatchObject({ status: 403 });
    await expect(controller.handleMetaWebhook({}, { rawBody, header: () => `sha256=${"0".repeat(64)}` } as never))
      .rejects.toMatchObject({ status: 403 });
  });

  it("accepts a signature over the exact request body", async () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const signature = createHmac("sha256", process.env.META_APP_SECRET).update(rawBody).digest("hex");
    const response = await controller.handleMetaWebhook({ entry: [] }, {
      rawBody,
      header: () => `sha256=${signature}`,
    } as never);
    expect(response).toEqual({ status: "ignored" });
  });
});
