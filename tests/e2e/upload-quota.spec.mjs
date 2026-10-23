import { test, expect } from "@playwright/test";
import { account, context, cleanup, db, validPng } from "./fixtures.mjs";

test("upload quota rejects the request after the asset limit", async ({ browser }) => {
  const user = await account("Quota E2E");
  const ctx = await context(browser, user);
  const request = ctx.request;

  for (let i = 0; i < 99; i++) {
    await db.query(
      `INSERT INTO media_assets (owner_user_id, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, 'image/webp', 1)`,
      [user.id, `quota-${user.id}-${i}.webp`],
    );
  }

  const upload = () =>
    request.post("/api/v1/media", {
      data: validPng,
      headers: { "Content-Type": "image/png" },
    });

  const first = await upload();
  expect(first.status()).toBe(201);

  const second = await upload();
  expect(second.status()).toBe(413);
  await expect(second.json()).resolves.toMatchObject({ code: "MEDIA_QUOTA_EXCEEDED" });

  await ctx.close();
  await cleanup();
});

test("concurrent uploads at the boundary do not exceed the quota", async ({ browser }) => {
  const user = await account("Quota Concurrent E2E");
  const ctx = await context(browser, user);
  const request = ctx.request;

  for (let i = 0; i < 99; i++) {
    await db.query(
      `INSERT INTO media_assets (owner_user_id, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, 'image/webp', 1)`,
      [user.id, `quota-c-${user.id}-${i}.webp`],
    );
  }

  const upload = () =>
    request.post("/api/v1/media", {
      data: validPng,
      headers: { "Content-Type": "image/png" },
    });
  const responses = await Promise.all([upload(), upload()]);
  expect(responses.map((r) => r.status()).sort()).toEqual([201, 413]);

  await ctx.close();
  await cleanup();
});
