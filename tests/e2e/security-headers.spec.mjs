import { test, expect } from "@playwright/test";

test("security headers are present on the web app", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
});

test("csp reports are accepted", async ({ request }) => {
  const response = await request.post("/api/v1/csp-report", {
    data: { "csp-report": { "violated-directive": "script-src" } },
  });
  expect(response.status()).toBe(204);
});
