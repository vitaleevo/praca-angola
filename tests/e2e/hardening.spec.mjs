import { test, expect } from "@playwright/test";

test("readiness is healthy", async ({ request }) => {
  const response = await request.get("/api/v1/health/ready");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    checks: { db: "ok", media: "ok" },
  });
});

test("security headers are present", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
});

test("csp report endpoint accepts reports", async ({ request }) => {
  const response = await request.post("/api/v1/csp-report", {
    data: { "csp-report": { "violated-directive": "script-src" } },
  });
  expect(response.status()).toBe(204);
});
