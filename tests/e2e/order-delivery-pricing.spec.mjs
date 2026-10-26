import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { account, context, db, json, storeSettings, listingSettings, cleanup } from './fixtures.mjs';

test.afterEach(async () => { await cleanup(); });

test('visitante consegue entrar a partir do carrinho', async ({ page }) => {
  await page.addInitScript((listingId) => localStorage.setItem('praca-cart', JSON.stringify([
    { listingId, slug: 'produto-temporario', title: 'Produto temporário', price: '15000.00', quantity: 1 },
  ])), randomUUID());
  await page.goto('/carrinho');
  const login = page.getByRole('button', { name: 'Entrar para pagar' });
  await expect(login).toBeEnabled();
  await login.click();
  await expect(page).toHaveURL(/\/entrar\?next=/);
});

test('frete de duas lojas é cotado, cobrado e guardado em cada encomenda', async ({ browser }) => {
  const ownerA = await account('Loja A E2E');
  const ownerB = await account('Loja B E2E');
  const buyer = await account('Comprador frete E2E');
  const moderator = await account('Moderador frete E2E', 'moderator');
  const a = await context(browser, ownerA);
  const b = await context(browser, ownerB);
  const customer = await context(browser, buyer);
  const admin = await context(browser, moderator);
  try {
    await json(await a.request.put('/api/v1/seller/profile', { data: storeSettings(`Frete A ${randomUUID()}`) }));
    await json(await b.request.put('/api/v1/seller/profile', { data: storeSettings(`Frete B ${randomUUID()}`) }));
    const first = await json(await a.request.post('/api/v1/seller/listings', { data: listingSettings(`Produto A ${randomUUID()}`) }));
    const second = await json(await b.request.post('/api/v1/seller/listings', { data: listingSettings(`Produto B ${randomUUID()}`) }));
    await json(await admin.request.patch(`/api/v1/admin/listings/${first.id}`, { data: { action: 'approved' } }));
    await json(await admin.request.patch(`/api/v1/admin/listings/${second.id}`, { data: { action: 'approved' } }));
    const items = [{ listingId: first.id, quantity: 1 }, { listingId: second.id, quantity: 1 }];
    const delivery = { mode: 'courier', province: 'Luanda', municipality: 'Talatona', address: 'Rua E2E, casa 3', recipientName: 'Comprador E2E', recipientPhone: '923111222' };
    const quote = await json(await customer.request.post('/api/v1/orders/freight-quote', { data: { items, delivery } }));
    expect(quote.shops).toHaveLength(2);
    expect(quote.shippingFee).toBe('4000.00');
    expect(quote.totalAmount).toBe('34000.00');
    const page = await customer.newPage();
    await page.addInitScript((cart) => localStorage.setItem('praca-cart', JSON.stringify(cart)), [
      { listingId: first.id, slug: first.slug, title: 'Produto A', price: '15000.00', quantity: 1 },
      { listingId: second.id, slug: second.slug, title: 'Produto B', price: '15000.00', quantity: 1 },
    ]);
    await page.goto('/carrinho');
    await expect(page.locator('.summary-total')).toContainText(/34[\s\u00a0.]?000/);
    await page.close();
    expect((await customer.request.post('/api/v1/orders/freight-quote', { data: { items, delivery: { ...delivery, municipality: 'Município inexistente' } } })).status()).toBe(400);
    expect((await customer.request.post('/api/v1/orders', { data: { items, delivery, expectedTotal: '30000.00' } })).status()).toBe(409);
    const created = await json(await customer.request.post('/api/v1/orders', { data: { items, delivery, expectedTotal: quote.totalAmount } }));
    expect(created.orders).toHaveLength(2);
    for (const order of created.orders) {
      expect(order.totalAmount).toBe('17000.00');
      expect(order.shippingFee).toBe('2000.00');
      const stored = (await db.query('SELECT total_amount::text, shipping_fee::text, delivery_mode, delivery_details_ciphertext FROM orders WHERE id=$1', [order.id])).rows[0];
      expect(stored.total_amount).toBe('17000.00');
      expect(stored.shipping_fee).toBe('2000.00');
      expect(stored.delivery_mode).toBe('courier');
      expect(stored.delivery_details_ciphertext).not.toContain('Rua E2E');
      const visible = await json(await customer.request.get(`/api/v1/orders/${order.id}`));
      expect(visible.order.delivery.address).toBe(delivery.address);
    }
  } finally {
    await a.close(); await b.close(); await customer.close(); await admin.close();
  }
});
