import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { account, cleanup, context, db } from './fixtures.mjs';

const bootstrapScript = fileURLToPath(new URL('../../apps/api/scripts/bootstrap-platform-owner.mjs', import.meta.url));

function bootstrap(email, confirm = true) {
  return spawnSync(process.execPath, [bootstrapScript, email, ...(confirm ? ['--confirm-once'] : [])], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://praca:praca_local_dev@localhost:5432/praca_angola' },
    encoding: 'utf8',
    timeout: 15000,
  });
}

test('proprietário global: bootstrap único, páginas públicas sem administração e isolamento da API', async ({ browser }) => {
  const owner = await account('Proprietário E2E');
  const buyer = await account('Cliente E2E');
  let ownerContext;
  let buyerContext;
  try {
    const unconfirmedCommand = bootstrap(owner.email, false);
    expect(unconfirmedCommand.status).toBe(2);

    await db.query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [owner.id]);
    const unverifiedAttempt = bootstrap(owner.email);
    expect(unverifiedAttempt.status).not.toBe(0);
    expect(unverifiedAttempt.stderr).toContain('verified email');

    await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [owner.id]);
    const grant = bootstrap(owner.email);
    expect(grant.status).toBe(0);
    expect(grant.stdout).toContain('Platform owner access granted');
    expect(grant.stdout + grant.stderr).not.toContain(owner.email);

    const replay = bootstrap(buyer.email);
    expect(replay.status).not.toBe(0);
    expect(replay.stderr).toContain('already completed');

    const roles = await db.query("SELECT user_id FROM user_roles WHERE role = 'platform_owner'");
    expect(roles.rows).toEqual([{ user_id: owner.id }]);
    const audit = await db.query("SELECT action, details FROM audit_events WHERE entity_type='user' AND entity_id=$1", [owner.id]);
    expect(audit.rows).toEqual([{ action: 'platform_owner.bootstrap_cli', details: { source: 'one_time_cli', verifiedAccount: true } }]);

    ownerContext = await context(browser, owner);
    const ownerPage = await ownerContext.newPage();
    const paths = [
      '/api/v1/platform-owner/overview',
      '/api/v1/admin/listings',
      '/api/v1/ads/manage',
      '/api/v1/services/moderation',
      '/api/v1/services/reports/moderation',
    ];
    for (const path of paths) {
      const response = await ownerPage.request.get(path);
      expect(response.status(), path).toBe(200);
    }

    for (const path of ['/admin', '/admin/moderacao', '/admin/profissionais', '/admin/denuncias-servicos', '/admin/publicidade']) {
      const response = await ownerPage.goto(path);
      expect(response?.status(), path).toBe(404);
    }
    await ownerPage.goto('/');
    await expect(ownerPage.getByRole('link', { name: /Painel global|Produtos e denúncias|Publicidade/ })).toHaveCount(0);

    buyerContext = await context(browser, buyer);
    for (const path of paths) {
      const response = await buyerContext.request.get(path);
      expect(response.status(), path).toBe(403);
    }
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto('/');
    await expect(buyerPage.getByRole('link', { name: /Painel global|Produtos e denúncias|Publicidade/ })).toHaveCount(0);
  } finally {
    await ownerContext?.close();
    await buyerContext?.close();
    await cleanup();
  }
});
