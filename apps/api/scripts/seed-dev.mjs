import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { Pool } from "pg";

if (process.env.NODE_ENV !== "development") {
  throw new Error("Development seed is disabled outside NODE_ENV=development");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const seedPassword = "PracaAngola2026!";
const salt = randomBytes(16);
const derived = await new Promise((resolve, reject) => {
  scryptCallback(seedPassword, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
const passwordHash = `scrypt$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      `INSERT INTO users (display_name, email, password_hash, email_verified_at)
       VALUES ('Vendedor de demonstração', 'demo@praca.local', $1, now())
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash,
         email_verified_at = COALESCE(users.email_verified_at, now())
       RETURNING id`,
      [passwordHash],
    );
    const userId = user.rows[0].id;
    await client.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, 'buyer') ON CONFLICT DO NOTHING",
      [userId],
    );
    const profile = await client.query(
      `INSERT INTO seller_profiles (profile_type, owner_user_id, slug, display_name, description, province, municipality)
       VALUES ('business', $1, 'loja-kwanza-home', 'Kwanza Home', 'Conteúdo demonstrativo local para validar a montra pública.', 'Luanda', 'Luanda')
       ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [userId],
    );
    const sellerId = profile.rows[0].id;
    await client.query(
      `INSERT INTO store_memberships (seller_profile_id, user_id, role)
       VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [sellerId, userId],
    );

    const examples = [
      { slug: "ella-7-smartphone-demo", category: "telemoveis-tecnologia", title: "Ella 7 Smartphone", description: "Telemóvel demonstrativo para validar pesquisa, detalhe de produto e cartões do catálogo.", price: 125000, condition: "new", province: "Luanda", municipality: "Maianga" },
      { slug: "sofa-aurora-demo", category: "casa-mobiliario", title: "Sofá Aurora, 3 lugares", description: "Exemplo de anúncio local de mobiliário, usado apenas no ambiente de desenvolvimento.", price: 480000, condition: "used", province: "Luanda", municipality: "Talatona" },
      { slug: "mochila-urbana-demo", category: "moda-acessorios", title: "Mochila urbana", description: "Produto demonstrativo local para testar filtros, localização e navegação pública.", price: 32500, condition: "new", province: "Benguela", municipality: "Benguela" },
      { slug: "conjunto-artesanal-demo", category: "casa-cozinha", title: "Conjunto artesanal", description: "Conteúdo demonstrativo local; não representa uma oferta comercial real.", price: 18000, condition: "new", province: "Huambo", municipality: "Huambo" },
    ];

    for (const item of examples) {
      await client.query(
        `INSERT INTO listings (seller_profile_id, category_id, slug, title, description, price, condition, status, province, municipality, published_at)
         SELECT $1, c.id, $2, $3, $4, $5, $6, 'published', $7, $8, now()
         FROM categories c JOIN marketplaces m ON m.id = c.marketplace_id
         WHERE c.slug = $9 AND m.slug = 'produtos'
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
           price = EXCLUDED.price, status = 'published', updated_at = now()`,
        [sellerId, item.slug, item.title, item.description, item.price, item.condition, item.province, item.municipality, item.category],
      );
    }
    await client.query("COMMIT");
    console.log("Development sample listings are ready.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error("Development seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
