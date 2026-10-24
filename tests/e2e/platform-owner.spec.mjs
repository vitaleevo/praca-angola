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

test('proprietário global: bootstrap único, áreas de administração e isolamento', async ({ browser }) => {
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

    await ownerPage.setViewportSize({ width: 1440, height: 1000 });
    await ownerPage.goto('/admin');
    await expect(ownerPage.getByRole('heading', { name: 'Painel global' })).toBeVisible();
    await expect(ownerPage.getByRole('heading', { name: 'Estado geral' })).toBeVisible();
    await expect(ownerPage.getByRole('link', { name: /Painel global/ })).toBeVisible();
    await expect(ownerPage.getByRole('link', { name: /Publicidade/ })).toHaveAttribute('href', '/admin/publicidade');
    await ownerPage.screenshot({ path: 'output/playwright/platform-owner-1440.png', fullPage: true });

    await ownerPage.setViewportSize({ width: 320, height: 900 });
    await ownerPage.reload();
    await expect(ownerPage.getByRole('heading', { name: 'Estado geral' })).toBeVisible();
    const dimensions = await ownerPage.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await ownerPage.screenshot({ path: 'output/playwright/platform-owner-320.png', fullPage: true });
    await ownerPage.getByRole('button', { name: 'Abrir navegação' }).click();
    await expect(ownerPage.getByRole('link', { name: 'Painel global' })).toBeVisible();

    buyerContext = await context(browser, buyer);
    for (const path of paths) {
      const response = await buyerContext.request.get(path);
      expect(response.status(), path).toBe(403);
    }
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto('/admin');
    await expect(buyerPage.locator('.platform-owner-error')).toContainText('Acesso reservado ao proprietário global');
  } finally {
    await ownerContext?.close();
    await buyerContext?.close();
    await cleanup();
  }
});
