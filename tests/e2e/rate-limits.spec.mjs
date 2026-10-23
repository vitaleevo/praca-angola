import { test, expect } from "@playwright/test";
import {
  account,
  context,
  cleanup,
  db,
  json,
  listingSettings,
  storeSettings,
} from "./fixtures.mjs";

test("message rate limit returns 429 after 30 messages", async ({ browser }) => {
  const seller = await account("Rate Seller");
  const buyer = await account("Rate Buyer");
  const otherBuyer = await account("Rate Other Buyer");
  const sellerCtx = await context(browser, seller);
  const buyerCtx = await context(browser, buyer);
  const otherCtx = await context(browser, otherBuyer);

  await json(
    await sellerCtx.request.put("/api/v1/seller/profile", {
      data: storeSettings("Loja Rate E2E"),
    }),
  );
  const listing = await json(
    await sellerCtx.request.post("/api/v1/seller/listings", {
      data: listingSettings("Produto Rate Limit E2E"),
    }),
  );
  await db.query("UPDATE listings SET status = 'published' WHERE id = $1", [listing.id]);

  const conversation = await json(
    await buyerCtx.request.post("/api/v1/conversations", {
      data: { listingId: listing.id, body: "Olá" },
    }),
  );

  for (let i = 0; i < 30; i++) {
    const response = await buyerCtx.request.post(
      `/api/v1/conversations/${conversation.conversationId}/messages`,
      { data: { body: `Mensagem ${i}` } },
    );
    expect(response.status()).toBe(201);
  }

  const blocked = await buyerCtx.request.post(
    `/api/v1/conversations/${conversation.conversationId}/messages`,
    { data: { body: "Mensagem bloqueada" } },
  );
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeDefined();
  await expect(blocked.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });

  const otherConversation = await json(
    await otherCtx.request.post("/api/v1/conversations", {
      data: { listingId: listing.id, body: "Olá" },
    }),
  );
  const otherMessage = await otherCtx.request.post(
    `/api/v1/conversations/${otherConversation.conversationId}/messages`,
    { data: { body: "Mensagem de outro utilizador" } },
  );
  expect(otherMessage.status()).toBe(201);

  await Promise.all([sellerCtx.close(), buyerCtx.close(), otherCtx.close()]);
  await cleanup();
});
