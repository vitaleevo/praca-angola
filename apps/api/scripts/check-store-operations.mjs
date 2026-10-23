import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

function pngFixture() {
  function chunk(type, data) {
    const content = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, content, checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(512, 0); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(256 * (1 + 512 * 3));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
    const offset = y * 1537 + 1 + x * 3;
    pixels[offset] = x % 256; pixels[offset + 1] = y; pixels[offset + 2] = (x * y) % 256;
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.env.NODE_ENV !== 'development') throw new Error('Run only against the local development stack.');
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const users = [];
let checks = 0;
async function account(verified = true) {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const email = `${id}@store-check.invalid`;
  users.push(id);
  await db.query("INSERT INTO users (id, display_name, email, password_hash, email_verified_at) VALUES ($1, 'Conta fictícia', $2, 'disabled', CASE WHEN $3 THEN now() END)", [id, email, verified]);
  await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'buyer')", [id]);
  await db.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')", [id, createHash('sha256').update(token).digest('hex')]);
  return { id, token, email };
}
async function call(actor, method, path, body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:4000/api/v1${path}`, {
    method, headers: { ...(actor ? { Cookie: `praca_session=${actor.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
try {
  const owner = await account();
  const editor = await account();
  const support = await account();
  const outsider = await account();
  const unverified = await account(false);
  const settings = { profileType: 'business', displayName: 'Loja fictícia de verificação', description: 'Dados temporários para verificar permissões.', province: 'Luanda', municipality: 'Luanda', contactEmail: 'publico@example.invalid', contactEmailPublic: true, contactPhone: '923222222', contactPhonePublic: true, deliveryPolicy: 'Entrega mediante combinação.', returnsPolicy: 'Contactar a loja antes de devolver.', termsPolicy: 'Confirmar disponibilidade.' };
  const saved = await call(owner, 'PUT', '/seller/profile', { ...settings, mcxRecipientName: 'Destinatário privado fictício', mcxPhone: '923111111' });
  assert.equal(saved.profile.role, 'owner');
  assert.equal(saved.profile.profile_type, 'business');
  assert.match(saved.profile.masked_phone, /1111$/);
  const storeId = saved.profile.id;
  const slug = saved.profile.slug;
  const visible = await call(null, 'GET', `/catalog/stores/${slug}`);
  assert.equal(visible.store.contact_phone, settings.contactPhone);
  assert.equal(visible.store.delivery_policy, settings.deliveryPolicy);
  assert.ok(!JSON.stringify(visible).includes('923111111'));
  assert.ok(!JSON.stringify(visible).includes('ciphertext'));
  await call(owner, 'PUT', '/seller/profile', { ...settings, contactEmailPublic: false, contactPhonePublic: false });
  const hidden = await call(null, 'GET', `/catalog/stores/${slug}`);
  assert.equal(hidden.store.contact_phone, null);
  assert.equal(hidden.store.contact_email, null);
  await call(owner, 'POST', '/seller/team', { email: unverified.email, role: 'editor' }, 400);
  const invite = async (member, role) => {
    const created = await call(owner,'POST','/seller/invitations',{email:member.email,role},201);
    return new URL(created.invitationUrl,'http://localhost:3100').searchParams.get('token');
  };
  const unverifiedToken=await invite(unverified,'editor');
  await call(unverified,'POST','/team-invitations/accept',{token:unverifiedToken},403);
  const editorToken=await invite(editor,'editor');
  await call(editor,'POST','/team-invitations/accept',{token:editorToken},201);
  await call(editor,'POST','/team-invitations/accept',{token:editorToken},409);
  const supportToken=await invite(support,'support');
  await call(support,'POST','/team-invitations/accept',{token:supportToken},201);
  await call(support, 'PUT', '/seller/profile', settings, 403);
  await call(editor, 'POST', '/seller/invitations', { email: outsider.email, role: 'editor' }, 403);
  await call(owner, 'DELETE', `/seller/team/${owner.id}`, undefined, 404);
  await call(owner, 'PUT', `/seller/team/${owner.id}`, { role: 'support' }, 404);
  const memberProfile = await call(editor, 'GET', '/seller/profile');
  assert.equal(memberProfile.profile.role, 'editor');
  assert.equal(memberProfile.profile.masked_phone, null);
  const uploaded = await fetch('http://127.0.0.1:4000/api/v1/media', { method: 'POST', headers: { Cookie: `praca_session=${owner.token}`, 'Content-Type': 'image/png' }, body: pngFixture() });
  assert.equal(uploaded.status, 201);
  const { id: image } = await uploaded.json();
  const optimized = await fetch(`http://web:3100/_next/image?url=${encodeURIComponent(`/api/v1/media/${image}`)}&w=64&q=75`, { headers: { Accept: 'image/webp' }, signal: AbortSignal.timeout(20000) });
  assert.equal(optimized.status, 200, await optimized.text());
  assert.match(optimized.headers.get('content-type'), /image\/webp/);
  checks += 2;
  const orderId = randomUUID();
  await db.query("INSERT INTO orders (id, reference, buyer_id, seller_profile_id, total_amount, payment_deadline) VALUES ($1, $2, $3, $4, 1000, now() + interval '1 hour')", [orderId, `CHECK-${orderId}`, outsider.id, storeId]);
  const supportOrder = await call(support, 'GET', `/orders/${orderId}`);
  assert.equal(supportOrder.order.canManage, false);
  assert.equal(supportOrder.order.paymentDestination, null);
  const editorOrder = await call(editor, 'GET', `/orders/${orderId}`);
  assert.equal(editorOrder.order.canManage, true);
  const listing = { title: 'Produto temporário', description: 'Descrição de produto temporário.', categorySlug: 'casa-mobiliario', price: 1000, condition: 'new', availableQuantity: 1, province: 'Luanda', municipality: 'Luanda', imageIds: [image] };
  const created = await call(owner, 'POST', '/seller/listings', listing, 201);
  await call(editor, 'PUT', `/seller/listings/${created.id}`, { ...listing, title: 'Produto editado em equipa' });
  const retained = await db.query('SELECT media_asset_id FROM listing_images WHERE listing_id = $1', [created.id]);
  assert.equal(retained.rows[0].media_asset_id, image);
  await call(support, 'PUT', `/seller/listings/${created.id}`, listing, 403);
  await call(outsider, 'PUT', `/seller/listings/${created.id}`, listing, 403);
  await call(editor, 'PATCH', `/seller/listings/${created.id}/status`, { status: 'published' }, 400);
  await call(owner, 'PUT', `/seller/team/${editor.id}`, { role: 'support' });
  await call(editor, 'PUT', `/seller/listings/${created.id}`, listing, 403);
  await call(owner, 'DELETE', `/seller/team/${editor.id}`);
  const revoked = await call(editor, 'GET', '/seller/listings');
  assert.equal(revoked.items.length, 0);
  const team = await call(owner, 'GET', '/seller/team');
  assert.equal(team.items.length, 2);
  await db.query("UPDATE seller_profiles SET status = 'suspended' WHERE id = $1", [storeId]);
  await call(owner, 'PUT', `/seller/listings/${created.id}`, listing, 403);
  console.log(`PASS: ${checks} HTTP checks; consent, privacy, owner protection, roles, retained images, moderation and revocation.`);
} finally {
  try {
    const assets = await db.query('SELECT storage_key FROM media_assets WHERE owner_user_id = ANY($1::uuid[])', [users]);
    for (const asset of assets.rows) await unlink(join(process.env.MEDIA_DIR, asset.storage_key)).catch(() => undefined);
    await db.query('DELETE FROM audit_events WHERE actor_id = ANY($1::uuid[])', [users]);
    await db.query('DELETE FROM orders WHERE seller_profile_id IN (SELECT id FROM seller_profiles WHERE owner_user_id = ANY($1::uuid[]))', [users]);
    await db.query('DELETE FROM listings WHERE seller_profile_id IN (SELECT id FROM seller_profiles WHERE owner_user_id = ANY($1::uuid[]))', [users]);
    await db.query('DELETE FROM seller_profiles WHERE owner_user_id = ANY($1::uuid[])', [users]);
    await db.query('DELETE FROM media_assets WHERE owner_user_id = ANY($1::uuid[])', [users]);
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    console.log('Temporary fixtures removed.');
  } finally { await db.end(); }
}
