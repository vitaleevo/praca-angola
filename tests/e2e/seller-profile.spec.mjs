import { test, expect } from '@playwright/test';
import { account, cleanup, context, json, validPng } from './fixtures.mjs';

test.afterEach(async () => {
  await cleanup();
});

test('envia um logótipo e guarda a loja com a imagem', async ({ browser }) => {
  const seller = await account('Vendedor com imagem E2E');
  const sellerContext = await context(browser, seller);

  try {
    const page = await sellerContext.newPage();
    await page.goto('/vendedor');
    await expect(page.getByLabel('Nome público')).toBeVisible();
    await page.getByLabel('Nome público').fill('Loja com imagem E2E');
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: validPng });
    await expect(page.getByRole('img', { name: 'Pré-visualização do logótipo' })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar dados da loja' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'A montra foi guardada.' })).toBeVisible();

    const result = await json(await sellerContext.request.get('/api/v1/seller/profile'));
    expect(result.profile.logo_media_asset_id).toBeTruthy();
    expect((await sellerContext.request.get(`/api/v1/media/${result.profile.logo_media_asset_id}`)).status()).toBe(200);
  } finally {
    await sellerContext.close();
  }
});

test('guarda uma loja sem configurar Multicaixa Express', async ({ browser }) => {
  const seller = await account('Vendedor sem MCX E2E');
  const sellerContext = await context(browser, seller);

  try {
    const page = await sellerContext.newPage();
    await page.goto('/vendedor');
    await expect(page.getByLabel('Nome público')).toBeVisible();
    await page.getByLabel('Nome público').fill('Loja sem MCX E2E');
    await page.getByRole('button', { name: 'Guardar dados da loja' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'A montra foi guardada.' })).toBeVisible();
    const result = await json(await sellerContext.request.get('/api/v1/seller/profile'));
    expect(result.profile.display_name).toBe('Loja sem MCX E2E');
    expect(result.profile.has_payment_destination).toBe(false);
  } finally {
    await sellerContext.close();
  }
});
